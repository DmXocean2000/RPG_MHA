const HERO_ROSTER = ["aizawa", "iida", "bakugo", "midoriya"];
const DISPLAY_NAME = {
  aizawa: "Aizawa",
  iida: "Iida",
  bakugo: "Bakugo",
  midoriya: "Midoriya",
};

const COMPANION_BASELINES_BY_FACTION = {
  hero: {
    midoriya: { trust: 74, treatment: "Supportive", status: "Focused and optimistic" },
    iida: { trust: 70, treatment: "Formal respect", status: "Coordinating party protocol" },
    aizawa: { trust: 62, treatment: "Pragmatic tolerance", status: "Watching for threats" },
    bakugo: { trust: 58, treatment: "Competitive respect", status: "Ready for action" },
  },
  villain: {
    midoriya: { trust: 46, treatment: "Wary compliance", status: "Following orders while staying cautious" },
    iida: { trust: 38, treatment: "Strict compliance", status: "Cooperating under protest and monitoring conduct" },
    aizawa: { trust: 42, treatment: "Cold compliance", status: "Executing tasks pragmatically with guarded distance" },
    bakugo: { trust: 35, treatment: "Resentful compliance", status: "Following orders while openly annoyed" },
  },
  civilian: {
    midoriya: { trust: 72, treatment: "Encouraging", status: "Prioritizing your safety" },
    iida: { trust: 67, treatment: "Protective and orderly", status: "Assigning safe roles" },
    aizawa: { trust: 58, treatment: "Protective but blunt", status: "Keeping the route secure" },
    bakugo: { trust: 52, treatment: "Tough but protective", status: "Guarding the perimeter" },
  },
};

function getCompanionIdsForDm(dmChoice) {
  return HERO_ROSTER.filter((id) => id !== dmChoice);
}

function createCompanionStatus(faction, dmChoice) {
  const companionIds = getCompanionIdsForDm(dmChoice);
  const baselineByFaction = COMPANION_BASELINES_BY_FACTION[faction] || COMPANION_BASELINES_BY_FACTION.hero;

  return companionIds.map((id) => ({
    name: DISPLAY_NAME[id] || id,
    trust: baselineByFaction[id].trust,
    hp: 20,
    energy: 20,
    treatment: baselineByFaction[id].treatment,
    status: baselineByFaction[id].status,
  }));
}

module.exports = {
  HERO_ROSTER,
  DISPLAY_NAME,
  getCompanionIdsForDm,
  createCompanionStatus,
};
