const { getDmSystemPrompt } = require("../prompts/characters");

const XAI_API_URL = process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const XAI_DEBUG = process.env.XAI_DEBUG === "true";
const XAI_LOG_REQUEST = process.env.XAI_LOG_REQUEST === "true";

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
  health_changes: [],
  companion_energy_changes: [],
  item_changes: [{ name: "wood", delta: 3, reason: "You collected driftwood from the beach." }],
  companions_post: [
    { name: "companion1", text: "Post reaction 1" },
    { name: "companion2", text: "Post reaction 2" },
    { name: "companion3", text: "Post reaction 3" },
  ],
};

function extractFirstJsonObject(rawText) {
  if (typeof rawText !== "string") return { parsed: null, parseError: "content_not_string" };
  const candidates = [];
  const text = rawText.trim();
  const tryParseJson = (jsonText) => {
    try {
      return JSON.parse(jsonText);
    } catch {
      return null;
    }
  };
  const attemptCommonJsonRepairs = (jsonText) => {
    const variants = new Set();
    variants.add(jsonText);

    // Common malformed pattern from model output:
    // {"name":"X","text":"..."]  -> missing closing object brace before ].
    variants.add(
      jsonText.replace(/("text"\s*:\s*"(?:(?:\\.)|[^"\\])*")\s*(\])/g, "$1}$2")
    );

    // Missing opening object after comma inside arrays:
    // ...},{"name":"A"...  (valid) vs ...},"name":"A"... (invalid)
    variants.add(jsonText.replace(/}\s*,\s*"name"\s*:/g, '},{"name":'));
    variants.add(jsonText.replace(/}\s*"name"\s*:/g, '},{"name":'));

    // Remove trailing commas before object/array close.
    variants.add(jsonText.replace(/,\s*([}\]])/g, "$1"));

    // Combined pass.
    variants.add(
      jsonText
        .replace(/("text"\s*:\s*"(?:(?:\\.)|[^"\\])*")\s*(\])/g, "$1}$2")
        .replace(/}\s*,\s*"name"\s*:/g, '},{"name":')
        .replace(/}\s*"name"\s*:/g, '},{"name":')
        .replace(/,\s*([}\]])/g, "$1")
    );

    for (const variant of variants) {
      const parsed = tryParseJson(variant);
      if (parsed) return parsed;
    }
    return null;
  };
  const scoreCandidate = (obj) => {
    if (!obj || typeof obj !== "object") return 0;
    const nested = obj.response && typeof obj.response === "object" ? obj.response : {};
    const merged = { ...obj, ...nested };
    let score = 0;
    if (typeof merged.dm_narration === "string" || typeof merged.dmNarration === "string") score += 3;
    if (Array.isArray(merged.companions_pre) || Array.isArray(merged.companionsPre)) score += 2;
    if (Array.isArray(merged.companions_post) || Array.isArray(merged.companionsPost)) score += 2;
    if (Array.isArray(merged.trust_changes) || Array.isArray(merged.trustChanges)) score += 1;
    if (
      (merged.energy_change && typeof merged.energy_change === "object") ||
      (merged.energyChange && typeof merged.energyChange === "object")
    ) {
      score += 1;
    }
    if (Array.isArray(merged.item_changes) || Array.isArray(merged.itemChanges)) score += 1;
    if (Object.prototype.hasOwnProperty.call(merged, "dice_roll") || Object.prototype.hasOwnProperty.call(merged, "diceRoll")) {
      score += 1;
    }
    if (merged.response && typeof merged.response === "object") score += 1;
    return score;
  };

  // Robust parse path: scan for balanced JSON objects and try each candidate.
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const chunk = text.slice(i, j + 1);
          try {
            const parsed = JSON.parse(chunk);
            candidates.push({ parsed, score: scoreCandidate(parsed), length: chunk.length, start: i });
          } catch {
            const repairedChunk = attemptCommonJsonRepairs(chunk);
            if (repairedChunk) {
              candidates.push({
                parsed: repairedChunk,
                score: scoreCandidate(repairedChunk),
                length: chunk.length,
                start: i,
              });
            }
          }
          break;
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || b.length - a.length || b.start - a.start);
    return { parsed: candidates[0].parsed, parseError: null };
  }

  // Legacy fallback for odd payloads that still contain one parseable object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return { parsed: null, parseError: "json_braces_not_found" };
  const sliced = text.slice(start, end + 1);
  const direct = tryParseJson(sliced);
  if (direct) return { parsed: direct, parseError: null };

  const repaired = attemptCommonJsonRepairs(sliced);
  if (repaired) return { parsed: repaired, parseError: "json_repaired_common_pattern" };

  try {
    return { parsed: JSON.parse(sliced), parseError: null };
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

function normalizeItemChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.trim().toLowerCase() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.name && entry.delta !== 0);
}

function normalizeHealthChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const targetRaw = typeof entry.target === "string" ? entry.target.trim().toLowerCase() : "";
      const target = targetRaw === "player" || targetRaw === "companion" ? targetRaw : "player";
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { target, name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.delta !== 0 && (entry.target === "player" || entry.name));
}

function normalizeCompanionEnergyChanges(list) {
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
    reason: reason || "No significant energy change.",
  };
}

function normalizeTurnResponse(candidate, rawContent) {
  const errors = [];
  const base = candidate && typeof candidate === "object" ? candidate : {};
  const nested = base.response && typeof base.response === "object" ? base.response : {};
  const data = { ...base, ...nested };
  const contentText = typeof rawContent === "string" ? rawContent.trim() : "";

  const narration =
    typeof data.dm_narration === "string" && data.dm_narration.trim()
      ? data.dm_narration.trim()
      : typeof data.dmNarration === "string" && data.dmNarration.trim()
      ? data.dmNarration.trim()
      : contentText || "The DM pauses, waiting for your next move.";

  if (!((typeof data.dm_narration === "string" && data.dm_narration.trim()) || (typeof data.dmNarration === "string" && data.dmNarration.trim()))) {
    errors.push("dm_narration_missing_or_empty");
  }

  const companionsPre = normalizeCompanionArray(data.companions_pre || data.companionsPre);
  const companionsPost = normalizeCompanionArray(data.companions_post || data.companionsPost);
  const trustChanges = normalizeTrustChanges(data.trust_changes || data.trustChanges);
  const healthChanges = normalizeHealthChanges(data.health_changes || data.healthChanges);
  const companionEnergyChanges = normalizeCompanionEnergyChanges(
    data.companion_energy_changes || data.companionEnergyChanges
  );
  const itemChanges = normalizeItemChanges(data.item_changes || data.itemChanges);
  const energyChange = normalizeEnergyChange(data.energy_change || data.energyChange);

  let diceRoll = null;
  const diceCandidate = data.dice_roll && typeof data.dice_roll === "object" ? data.dice_roll : data.diceRoll;
  if (diceCandidate && typeof diceCandidate === "object") {
    const type = typeof diceCandidate.type === "string" && diceCandidate.type.trim() ? diceCandidate.type : "check";
    const dc = toFiniteNumber(diceCandidate.dc);
    const result = toFiniteNumber(diceCandidate.result);

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
    dice_roll: diceRoll,
    trust_changes: trustChanges,
    health_changes: healthChanges,
    companion_energy_changes: companionEnergyChanges,
    item_changes: itemChanges,
    energy_change: energyChange,
  };

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
  const isVillainFaction = String(gameState?.player?.faction || "").toLowerCase().trim() === "villain";
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
      const refusalStyle = isVillainFaction
        ? trust >= 40
          ? "If refusing, be calm/direct but still mostly comply with orders unless collapse risk is high."
          : "If refusing, be resentful or rude, but still usually comply unless collapse risk is high."
        : trust >= 80
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
      const villainComplianceRule = isVillainFaction
        ? "Villain leadership rule: companions generally comply with direct orders, even with low trust, but tone should be resentful when trust is low."
        : "";
      return `- ${name}: trust=${trust} (${behavior.tier}), hp=${hp}/20, energy=${energy}/20 -> ${behavior.instruction} ${criticalRule} ${refusalStyle} ${villainComplianceRule}`.trim();
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

function buildCompanionCapabilityGuidance(gameState) {
  const companions = Array.isArray(gameState?.companionStatus) ? gameState.companionStatus : [];
  if (companions.length === 0) {
    return "No companion capability data available.";
  }

  const profiles = {
    bakugo: {
      strengths: ["cooking", "combat/hunting", "heavy lifting and obstacle breaking"],
      weaknesses: ["diplomacy", "patience", "teamwork (especially with Midoriya)"],
    },
    midoriya: {
      strengths: ["problem-solving", "crisis management", "high quirk power potential"],
      weaknesses: ["cooking (high failure/food poisoning risk)", "quirk overuse self-injury risk", "lower durability"],
    },
    iida: {
      strengths: ["speed", "perception", "scouting/recon"],
      weaknesses: ["direct heavy combat", "flexibility in rule-bending scenarios", "improvisation under chaos"],
    },
    aizawa: {
      strengths: ["tactics/strategy", "survival expertise", "erasure utility vs quirk threats"],
      weaknesses: ["speed", "raw lifting strength", "energy stamina (fatigues faster)"],
    },
  };

  return companions
    .map((companion) => {
      const key = String(companion?.name || "").toLowerCase().trim();
      const profile = profiles[key] || { strengths: ["general support"], weaknesses: ["no special profile"] };
      return `- ${companion.name}: strengths=${profile.strengths.join(", ")}; weaknesses=${profile.weaknesses.join(", ")}`;
    })
    .join("\n");
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
  const companionCapabilityGuidance = buildCompanionCapabilityGuidance(gameState);
  const playerQuirkGuidance = buildPlayerQuirkGuidance(gameState);
  const playerQuirk = String(gameState?.player?.quirk || "quirkless");
  const playerFaction = String(gameState?.player?.faction || "hero");
  const currentEnergy = Number.isFinite(Number(gameState?.player?.energy)) ? Number(gameState.player.energy) : 20;
  const userPrompt = [
    "Return ONLY JSON. Always include ALL keys exactly in this schema (never omit keys):",
    "{ dm_narration: string, companions_pre: [{name,text}], companions_post: [{name,text}], dice_roll: { type, dc, result } | null, trust_changes: [{ name, delta, reason }], health_changes: [{ target: 'player'|'companion', name?: string, delta: number, reason: string }], companion_energy_changes: [{ name: string, delta: number, reason: string }], energy_change: { delta: number, effort: 'low'|'medium'|'high', reason: string }, item_changes: [{ name, delta, reason }] }",
    "If no roll is needed, set dice_roll to null.",
    "If no trust/health/item changes, return empty arrays for those fields.",
    "If companions do meaningful work (scouting, combat, gathering, carrying), include companion_energy_changes with signed deltas per companion.",
    "If no energy change, return energy_change with delta 0, effort 'low', and clear reason.",
    "If dice_roll is used, it must be: { type: string, dc: number, result: number }.",
    "Use companion entries shaped as: { name: string, text: string }.",
    "trust_changes format: [{ name: string, delta: number, reason: string }].",
    "health_changes format: [{ target: 'player'|'companion', name?: string, delta: number, reason: string }].",
    "For companion health changes, include companion name.",
    "companion_energy_changes format: [{ name: string, delta: number, reason: string }].",
    "Use negative deltas for fatigue/spending effort, positive deltas for recovery.",
    "item_changes format: [{ name: string, delta: number, reason: string }].",
    "Use positive item delta for gains (example: +3 wood) and negative for usage/loss (example: -3 wood).",
    "Only include item_changes when item quantities actually change this turn.",
    "Whenever item_changes is non-empty, explain each change clearly: what was used/gained/lost, how it was used, and why it changed now.",
    "Each item_changes.reason must be specific and actionable (not vague text like 'used item').",
    "If item usage affects scene continuity, briefly mention that usage in dm_narration so the transition makes sense.",
    "delta should be small (usually between -10 and +10).",
    "Only include trust_changes for companions whose trust should change this turn.",
    "energy_change format: { delta: number, effort: 'low'|'medium'|'high', reason: string }.",
    "Use negative delta for energy spent (example: building a tent often costs about -5).",
    "Use positive delta only for meaningful recovery actions (for example resting).",
    "For actions with physical effort, include energy_change and give a concrete reason.",
    "When dice_roll is present, still provide base energy_change; the server may adjust final cost by roll outcome.",
    "For injuries or healing, include health_changes with signed deltas.",
    "When the action crafts/uses resources (like fire-making), include the item usage in item_changes.",
    "Companion capability mechanics (must apply in outcomes and narration):",
    "- Bakugo excels at hunting/combat/cooking/heavy tasks; poor diplomacy/patience; teamwork friction with Midoriya when stressed.",
    "- Midoriya excels at analysis and crisis planning; poor cooking (serious failure/food poisoning risk), quirk overuse can self-injure.",
    "- Iida excels at scouting/speed/perception; weaker at brute-force combat and chaotic improvisation.",
    "- Aizawa excels at tactics/survival/threat control; lower speed and stamina for prolonged heavy tasks.",
    "Task difficulty adjustment rule:",
    "- If assigned companion task matches strengths, resolve more favorably (roughly easier by one difficulty step).",
    "- If task matches weaknesses, resolve less favorably (roughly harder by one difficulty step).",
    "Synergy/conflict rule:",
    "- Bakugo + Midoriya on the same precision/teamwork task should add friction unless both trust levels are high.",
    "- Midoriya cooking attempts should usually be risky unless tightly supervised by a better cook.",
    "Faction mechanic rules:",
    "- If player faction is villain: reflect resilience and endurance (slightly less severe stamina/injury outcomes where sensible).",
    "- If player faction is villain: companions should generally obey direct orders unless obeying would likely make them pass out now.",
    "- Villain companion compliance can be resentful, cold, or rude, but still cooperative in execution.",
    "- For villain intimidation/deception attempts, lean toward stronger outcomes when plausible.",
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
    "Campaign objective (always prioritize in scene progression): Explore a creepy volcanic island full of hidden treasure, dangerous traps, and hostile monsters.",
    "Story direction rule: keep introducing discoveries, threats, and clues that pull the party deeper into volcano-island exploration rather than random wandering.",
    "Progression rule: when appropriate, present meaningful leads toward treasure sites, trap zones, monster lairs, ancient ruins, and the volcano interior.",
    `Player faction: ${playerFaction}`,
    `Player quirk: ${playerQuirk}`,
    `Current player energy: ${currentEnergy}/20`,
    "Player quirk guidance (must follow):",
    playerQuirkGuidance,
    "Companion trust guidance for current state:",
    companionTrustGuidance,
    "Companion capability guidance for current state:",
    companionCapabilityGuidance,
    `Player action: ${action}`,
    `Current game state: ${JSON.stringify(gameState)}`,
  ].join("\n");

  const payload = {
    model: XAI_MODEL,
    temperature: 0.7,
    "max_output_tokens": 453101,
    // input character limit if needed example max_tokens: 8192
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (XAI_LOG_REQUEST) {
    console.log("[grok:request]", JSON.stringify(payload));
  }

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
          dice_roll: null,
          trust_changes: [],
          health_changes: [],
          companion_energy_changes: [],
          energy_change: { delta: 0, effort: "low", reason: "No significant energy change." },
          item_changes: [],
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
