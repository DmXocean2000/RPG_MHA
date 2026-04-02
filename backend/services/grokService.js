const { getDmSystemPrompt } = require("../prompts/characters");

const XAI_API_URL = process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const XAI_DEBUG = process.env.XAI_DEBUG === "true";

const mockTurnResponse = {
  dm_narration: "Test narration from DM",
  companions_pre: [
    { name: "companion1", text: "Test reaction 1" },
    { name: "companion2", text: "Test reaction 2" },
    { name: "companion3", text: "Test reaction 3" },
  ],
  dice_roll: { type: "survival", dc: 13, result: 10 },
  energy_change: {
    delta: -3,
    effort: "medium",
    reason: "Scavenging and movement required moderate stamina.",
  },
  companions_post: [
    { name: "companion1", text: "Post reaction 1" },
    { name: "companion2", text: "Post reaction 2" },
    { name: "companion3", text: "Post reaction 3" },
  ],
};

function extractFirstJsonObject(rawText) {
  if (typeof rawText !== "string") return { parsed: null, parseError: "content_not_string" };
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return { parsed: null, parseError: "json_braces_not_found" };
  const possibleJson = rawText.slice(start, end + 1);

  try {
    return { parsed: JSON.parse(possibleJson), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: `json_parse_error:${error?.message || "unknown"}` };
  }
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCompanionArray(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "companion",
      text: typeof entry.text === "string" && entry.text.trim() ? entry.text.trim() : "...",
    }));
}

function normalizeTrustChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.name && entry.delta !== 0);
}

function normalizeEnergyChange(value) {
  if (!value || typeof value !== "object") {
    return {
      delta: 0,
      effort: "low",
      reason: "",
    };
  }

  const delta = toFiniteNumber(value.delta);
  const effortRaw = typeof value.effort === "string" ? value.effort.trim().toLowerCase() : "";
  const effort = ["low", "medium", "high"].includes(effortRaw) ? effortRaw : "medium";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";

  return {
    delta: delta ?? 0,
    effort,
    reason,
  };
}

function normalizeTurnResponse(candidate, rawContent) {
  const errors = [];
  const data = candidate && typeof candidate === "object" ? candidate : {};
  const contentText = typeof rawContent === "string" ? rawContent.trim() : "";

  const narration =
    typeof data.dm_narration === "string" && data.dm_narration.trim()
      ? data.dm_narration.trim()
      : contentText || "The DM pauses, waiting for your next move.";

  if (!(typeof data.dm_narration === "string" && data.dm_narration.trim())) {
    errors.push("dm_narration_missing_or_empty");
  }

  const companionsPre = normalizeCompanionArray(data.companions_pre);
  const companionsPost = normalizeCompanionArray(data.companions_post);
  const trustChanges = normalizeTrustChanges(data.trust_changes);
  const energyChange = normalizeEnergyChange(data.energy_change);

  let diceRoll;
  if (data.dice_roll && typeof data.dice_roll === "object") {
    const type = typeof data.dice_roll.type === "string" && data.dice_roll.type.trim() ? data.dice_roll.type : "check";
    const dc = toFiniteNumber(data.dice_roll.dc);
    const result = toFiniteNumber(data.dice_roll.result);

    if (dc !== null && result !== null) {
      diceRoll = { type, dc, result };
    } else {
      errors.push("dice_roll_invalid_or_non_numeric");
    }
  }

  const normalized = {
    dm_narration: narration,
    companions_pre: companionsPre,
    companions_post: companionsPost,
    trust_changes: trustChanges,
    energy_change: energyChange,
  };
  if (diceRoll) normalized.dice_roll = diceRoll;

  return { normalized, errors };
}

function buildMeta(source, details = {}) {
  return {
    source,
    ...details,
    at: new Date().toISOString(),
  };
}

function trustBehaviorForScore(trustScore) {
  const trust = Number.isFinite(Number(trustScore)) ? Number(trustScore) : 50;
  if (trust >= 80) {
    return {
      tier: "supportive",
      instruction:
        "Be clearly supportive and cooperative. They should trust the player's calls, offer help proactively, and coordinate with the team.",
    };
  }
  if (trust >= 40) {
    return {
      tier: "neutral",
      instruction:
        "Be neutral and measured. They can cooperate, but should not be overly warm or overly hostile without clear reason.",
    };
  }
  if (trust >= 15) {
    return {
      tier: "wary",
      instruction:
        "Be wary and skeptical. They should question plans, hesitate, and require stronger justification before agreeing.",
    };
  }
  return {
    tier: "hostile",
    instruction:
      "Be openly distrustful and hostile. They should resist directions, avoid following orders, and challenge or undermine the player's leadership.",
  };
}

function buildCompanionTrustGuidance(gameState) {
  const companions = Array.isArray(gameState?.companionStatus) ? gameState.companionStatus : [];
  if (companions.length === 0) {
    return "No companion trust data available.";
  }

  return companions
    .map((companion) => {
      const name = typeof companion?.name === "string" && companion.name.trim() ? companion.name.trim() : "Companion";
      const trust = Number.isFinite(Number(companion?.trust)) ? Number(companion.trust) : 50;
      const hp = Number.isFinite(Number(companion?.hp)) ? Number(companion.hp) : 20;
      const energy = Number.isFinite(Number(companion?.energy)) ? Number(companion.energy) : 20;
      const behavior = trustBehaviorForScore(trust);
      const refusalStyle =
        trust >= 80
          ? "If refusing, be polite and protective."
          : trust >= 40
          ? "If refusing, be calm and direct."
          : trust >= 15
          ? "If refusing, be skeptical and blunt."
          : "If refusing, be rude or openly hostile.";
      const criticalCondition = hp <= 2 || energy <= 2;
      const criticalRule = criticalCondition
        ? "CRITICAL: They are near collapse. If the next action would likely make them pass out, they should refuse participation."
        : "Not currently critical.";
      return `- ${name}: trust=${trust} (${behavior.tier}), hp=${hp}/20, energy=${energy}/20 -> ${behavior.instruction} ${criticalRule} ${refusalStyle}`;
    })
    .join("\n");
}

function buildPlayerQuirkGuidance(gameState) {
  const quirk = String(gameState?.player?.quirk || "quirkless").toLowerCase().trim();
  const guidanceByQuirk = {
    hardening:
      "Hardening: Major durability boost against physical danger. Tradeoff is reduced speed/agility and poor fine motor control while active; prolonged use drains stamina.",
    half_cold_half_hot:
      "Half-Cold Half-Hot: Versatile fire/ice utility for survival and combat. Tradeoffs include friendly-fire risk, control challenges under stress, self-injury risk from overuse, and environmental resource damage.",
    fiber_master:
      "Fiber Master: Excellent at crafting/manipulating ropes, nets, bindings, and fiber tools from available materials. Tradeoffs: requires existing fibers, high concentration, and causes fatigue with extended use.",
    quirkless: "Quirkless: No superhuman ability. Resolve actions through planning, skill, and available tools only.",
  };
  return guidanceByQuirk[quirk] || guidanceByQuirk.quirkless;
}

async function generateTurnResponse({ gameState, action }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_no_api_key",
      meta: buildMeta("mock_no_api_key"),
    };
  }

  const systemPrompt = getDmSystemPrompt(gameState.campaign.dm);
  const companionTrustGuidance = buildCompanionTrustGuidance(gameState);
  const playerQuirkGuidance = buildPlayerQuirkGuidance(gameState);
  const playerQuirk = String(gameState?.player?.quirk || "quirkless");
  const currentEnergy = Number.isFinite(Number(gameState?.player?.energy)) ? Number(gameState.player.energy) : 20;
  const userPrompt = [
    "Return ONLY JSON with these keys:",
    "dm_narration, companions_pre, companions_post, OPTIONAL dice_roll, OPTIONAL trust_changes, OPTIONAL energy_change.",
    "Only include dice_roll when a roll is actually required for the action.",
    "If included, dice_roll must be: { type: string, dc: number, result: number }.",
    "Use companion entries shaped as: { name: string, text: string }.",
    "trust_changes format: [{ name: string, delta: number, reason: string }].",
    "delta should be small (usually between -10 and +10).",
    "Only include trust_changes for companions whose trust should change this turn.",
    "energy_change format: { delta: number, effort: 'low'|'medium'|'high', reason: string }.",
    "Use negative delta for energy spent (example: building a tent often costs about -5).",
    "Use positive delta only for meaningful recovery actions (for example resting).",
    "For actions with physical effort, include energy_change and give a concrete reason.",
    "When dice_roll is present, still provide base energy_change; the server may adjust final cost by roll outcome.",
    "Companion trust behavior rules (must follow):",
    "- 80-100: supportive -> helpful, cooperative, and more willing to follow player direction.",
    "- 40-79: neutral -> steady, practical, neither strongly supportive nor hostile.",
    "- 15-39: wary -> skeptical, cautious, and slower to agree.",
    "- 0-14: hostile -> distrustful, resistant, does not reliably follow directions, and may challenge the player.",
    "Apply these trust rules consistently in companion dialogue and reactions.",
    "Companion low-condition refusal rule (must follow):",
    "If a companion has hp <= 2 or energy <= 2 and the requested action would likely make them pass out, they may refuse.",
    "Refusal tone must reflect trust: high trust = polite/protective refusal, low trust = rude/hostile refusal.",
    "Keep language clean and suitable for all ages. No profanity.",
    `Player quirk: ${playerQuirk}`,
    `Current player energy: ${currentEnergy}/20`,
    "Player quirk guidance (must follow):",
    playerQuirkGuidance,
    "Companion trust guidance for current state:",
    companionTrustGuidance,
    `Player action: ${action}`,
    `Current game state: ${JSON.stringify(gameState)}`,
  ].join("\n");

  const payload = {
    model: XAI_MODEL,
    temperature: 0.7,
    
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  try {
    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[grok:error] status=${response.status} body=${errorText}`);
      return {
        response: structuredClone(mockTurnResponse),
        source: "mock_api_error",
        meta: buildMeta("mock_api_error", {
          status: response.status,
          errorPreview: String(errorText || "").slice(0, 500),
        }),
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    console.log("[grok:content]", content);
    const { parsed, parseError } = extractFirstJsonObject(content);
    const { normalized, errors: normalizationErrors } = normalizeTurnResponse(parsed, content);

    if (!parseError) {
      const source = normalizationErrors.length > 0 ? "grok_normalized" : "grok";
      return {
        response: normalized,
        source,
        meta: buildMeta(source, {
          parseError: null,
          normalizationErrors,
        }),
      };
    }

    if (typeof content === "string" && content.trim()) {
      return {
        response: {
          dm_narration: content.trim(),
          companions_pre: [],
          companions_post: [],
        },
        source: "grok_text_fallback",
        meta: buildMeta("grok_text_fallback", {
          parseError,
        }),
      };
    }

    const debugMeta = buildMeta("mock_invalid_payload", {
      parseError,
      normalizationErrors,
      contentPreview: String(content).slice(0, 800),
    });

    if (XAI_DEBUG) {
      console.warn("[grok:warn] Invalid model payload details", debugMeta);
    } else {
      console.warn(
        `[grok:warn] Invalid model payload. parseError=${parseError || "none"} normalizationErrors=${normalizationErrors.join(",") || "none"}`
      );
    }

    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_invalid_payload",
      meta: debugMeta,
    };
  } catch (error) {
    console.error("[grok:exception] Failed to call Grok API", error);
    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_exception",
      meta: buildMeta("mock_exception", {
        errorMessage: error?.message || "unknown_exception",
      }),
    };
  }
}

module.exports = {
  generateTurnResponse,
  mockTurnResponse,
};
