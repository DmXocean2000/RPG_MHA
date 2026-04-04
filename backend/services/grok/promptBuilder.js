const { TURN_RESPONSE_SCHEMA } = require("./constants");

function trustBehaviorForScore(trustScore) {
  const trust = Number.isFinite(Number(trustScore)) ? Number(trustScore) : 50;
  if (trust >= 80) {
    return {
      tier: "supportive",
      instruction:
        "Be supportive and cooperative. Offer help proactively and coordinate with the team.",
    };
  }
  if (trust >= 40) {
    return {
      tier: "neutral",
      instruction:
        "Be neutral and measured. Cooperate pragmatically without dramatic reactions.",
    };
  }
  if (trust >= 15) {
    return {
      tier: "wary",
      instruction:
        "Be cautious and skeptical. Ask for clarification before committing to risky plans.",
    };
  }
  return {
    tier: "low-trust",
    instruction:
      "Be distant and reluctant. Prefer safer alternatives and limited participation.",
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
          ? "If declining, be calm and direct."
          : "If declining, be brief and guarded."
        : trust >= 80
        ? "If declining, be polite and protective."
        : trust >= 40
        ? "If declining, be calm and direct."
        : trust >= 15
        ? "If declining, be skeptical and blunt."
        : "If declining, be terse and distant.";
      const criticalCondition = hp <= 2 || energy <= 2;
      const criticalRule = criticalCondition
        ? "CRITICAL: They are near exhaustion. If the next action is too demanding, they should decline."
        : "Not currently critical.";
      const villainComplianceRule = isVillainFaction
        ? "Villain route note: companions often cooperate, but tone can remain guarded when trust is low."
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
      "Half-Cold Half-Hot: Versatile fire/ice utility for survival and defense. Tradeoffs include control challenges under stress and environmental side effects.",
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
      weaknesses: ["cooking (high failure risk)", "quirk overuse can cause performance drop", "lower durability"],
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

function buildTurnUserPrompt({ gameState, action }) {
  const companionTrustGuidance = buildCompanionTrustGuidance(gameState);
  const companionCapabilityGuidance = buildCompanionCapabilityGuidance(gameState);
  const playerQuirkGuidance = buildPlayerQuirkGuidance(gameState);
  const playerQuirk = String(gameState?.player?.quirk || "quirkless");
  const playerFaction = String(gameState?.player?.faction || "hero");
  const currentEnergy = Number.isFinite(Number(gameState?.player?.energy)) ? Number(gameState.player.energy) : 20;
  const currentLocation = String(gameState?.location || "beach");

  return [
    "Return ONLY YAML. Include all required sections from this schema:",
    TURN_RESPONSE_SCHEMA,
    "If no roll is needed, set dice_roll: null.",
    "If no trust/health/item changes, return empty arrays for those sections.",
    "If companions do meaningful work (scouting, combat, gathering, carrying), include companion_energy_changes with signed deltas per companion.",
    "If no energy change, return energy_change with delta 0, effort low, and clear reason.",
    "If dice_roll is used, it must be: { type: string, dc: number, result: number }.",
    "Use companion entries shaped as: - name: string, text: string.",
    "trust_changes format: [{ name: string, delta: number, reason: string }].",
    "health_changes format: [{ target: 'player'|'companion', name?: string, delta: number, reason: string }].",
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
    "Use negative delta for effort spent (example: building a tent often costs about -5).",
    "Use positive delta only for meaningful recovery actions (for example resting).",
    "For actions with physical effort, include energy_change and give a concrete reason.",
    "When dice_roll is present, still provide base energy_change; the server may adjust final cost by roll outcome.",
    "For setbacks or recovery, include health_changes with signed deltas.",
    "When the action crafts/uses resources (like fire-making), include the item usage in item_changes.",
    "Companion capability notes (apply in outcomes and narration):",
    "- Bakugo excels at hunting/combat/cooking/heavy tasks; poor diplomacy/patience; teamwork friction with Midoriya when stressed.",
    "- Midoriya excels at analysis and crisis planning; poor cooking under pressure; overuse causes fatigue.",
    "- Iida excels at scouting/speed/perception; weaker at brute-force combat and chaotic improvisation.",
    "- Aizawa excels at tactics/survival/threat control; lower speed and stamina for prolonged heavy tasks.",
    "Task difficulty guidance:",
    "- If assigned companion task matches strengths, resolve more favorably (roughly easier by one difficulty step).",
    "- If task matches weaknesses, resolve less favorably (roughly harder by one difficulty step).",
    "Synergy guidance:",
    "- Bakugo + Midoriya on the same precision/teamwork task should add friction unless both trust levels are high.",
    "- Midoriya cooking attempts should usually be risky unless tightly supervised by a better cook.",
    "Faction guidance:",
    "- If player faction is villain: reflect resilience and endurance (slightly less severe stamina/injury outcomes where sensible).",
    "- If player faction is villain: companions usually cooperate unless too exhausted for the task.",
    "- For villain deception or pressure attempts, allow stronger outcomes when plausible.",
    "Companion trust behavior guidance:",
    "- 80-100: supportive -> helpful, cooperative, and more willing to follow player direction.",
    "- 40-79: neutral -> steady and practical.",
    "- 15-39: wary -> skeptical, cautious, and slower to agree.",
    "- 0-14: low-trust -> distant, reluctant, and less willing to take risks.",
    "Apply these trust rules consistently in companion dialogue and reactions.",
    "Companion low-condition rule:",
    "If a companion has hp <= 2 or energy <= 2 and the requested action is too demanding, they may decline.",
    "Decline tone should reflect trust: high trust = polite/protective, low trust = brief/distant.",
    "Formatting rule: output must be syntactically valid YAML.",
    "Formatting rule: use a single top-level key named turn_response.",
    "Formatting rule: do not wrap YAML in markdown code fences.",
    "Keep language clean and suitable for all ages. No profanity. Avoid graphic content.",
    "Location continuity rule: Treat current location as persistent state. Do not move the party to a different area unless the player action explicitly indicates travel.",
    "Location continuity rule: If the player says they are already at a location (example: 'while at the volcano'), stay there and resolve the action in that location.",
    "Location progression rule: you may introduce new sub-locations when the player travels (example: obsidian tunnel, ruined shrine, lava bridge), but keep continuity with the current location context.",
    "Campaign objective: Explore a volcanic island with hidden treasure, environmental hazards, mysteries, and challenging encounters.",
    "Story direction rule: keep introducing discoveries, obstacles, and clues that pull the party deeper into island exploration.",
    "Progression rule: present meaningful leads toward treasure sites, trap zones, mysterious lairs, ruins, and the volcano interior.",
    `Player faction: ${playerFaction}`,
    `Player quirk: ${playerQuirk}`,
    `Current player energy: ${currentEnergy}/20`,
    `Current location (persistent): ${currentLocation}`,
    "Player quirk guidance (must follow):",
    playerQuirkGuidance,
    "Companion trust guidance for current state:",
    companionTrustGuidance,
    "Companion capability guidance for current state:",
    companionCapabilityGuidance,
    `Player action: ${action}`,
    `Current game state: ${JSON.stringify(gameState)}`,
  ].join("\n");
}

module.exports = {
  buildTurnUserPrompt,
};
