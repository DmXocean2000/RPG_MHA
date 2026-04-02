const express = require("express");
const crypto = require("crypto");
const { createOpeningResponse } = require("../prompts/openingScenes");

const VALID_CAMPAIGNS = new Set(["hero"]);
const VALID_DMS = {
  hero: new Set(["aizawa", "iida", "bakugo", "midoriya"]),
  // villain: new Set(["afo", "shigaraki", "toga", "twice"]),
};
const HERO_ROSTER = ["aizawa", "iida", "bakugo", "midoriya"];
const DISPLAY_NAME = {
  aizawa: "Aizawa",
  iida: "Iida",
  bakugo: "Bakugo",
  midoriya: "Midoriya",
};

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function badRequest(message) {
  return { error: "Bad Request", message };
}

function notFound(message) {
  return { error: "Not Found", message };
}

function getCompanionIdsForDm(dmChoice) {
  return HERO_ROSTER.filter((id) => id !== dmChoice);
}

function createCompanionStatus(faction, dmChoice) {
  const companionIds = getCompanionIdsForDm(dmChoice);
  const byFaction = {
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

  const baseline = byFaction[faction] || byFaction.hero;
  return companionIds.map((id) => ({
    name: DISPLAY_NAME[id] || id,
    trust: baseline[id].trust,
    hp: 20,
    energy: 20,
    treatment: baseline[id].treatment,
    status: baseline[id].status,
  }));
}

function createCampaignRouter({ characters, games, turnHistoryByGame }) {
  const router = express.Router();

  router.post("/select", (req, res) => {
    const { characterId, campaign, dmChoice } = req.body ?? {};

    if (typeof characterId !== "string" || !characterId.trim()) {
      return res.status(400).json(badRequest("characterId is required and must be a string"));
    }

    const character = characters.get(characterId);
    if (!character) {
      return res.status(404).json(notFound("Character not found"));
    }

    if (typeof campaign !== "string" || !VALID_CAMPAIGNS.has(campaign)) {
      return res.status(400).json(badRequest('campaign must be "hero" for now'));
    }

    if (typeof dmChoice !== "string" || !VALID_DMS[campaign].has(dmChoice)) {
      return res
        .status(400)
        .json(badRequest('dmChoice for hero must be one of: "aizawa", "iida", "bakugo", "midoriya"'));
    }

    const gameId = generateId("game");
    const gameState = {
      gameId,
      player: {
        name: character.name,
        faction: character.faction,
        quirk: character.quirk || "quirkless",
        hp: 20,
        energy: 20,
        inventory: [],
      },
      campaign: {
        type: campaign,
        dm: dmChoice,
        companions: getCompanionIdsForDm(dmChoice),
      },
      location: "beach",
      storyFlags: {},
      companionStatus: createCompanionStatus(character.faction, dmChoice),
    };

    const openingResponse = createOpeningResponse({
      dmName: dmChoice,
      playerName: character.name,
      faction: character.faction,
      quirk: character.quirk || "quirkless",
    });

    games.set(gameId, gameState);
    turnHistoryByGame.set(gameId, [
      {
        turn: 0,
        action: "__intro__",
        response: openingResponse,
        source: "system_intro",
        timestamp: new Date().toISOString(),
      },
    ]);
    console.log(`[campaign:select] gameId=${gameId} characterId=${characterId} campaign=${campaign} dm=${dmChoice}`);

    return res.status(201).json({
      gameId,
      gameState,
      openingResponse,
    });
  });

  return router;
}

module.exports = {
  createCampaignRouter,
};
