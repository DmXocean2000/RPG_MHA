const express = require("express");
const crypto = require("crypto");
const { createOpeningResponse } = require("../prompts/openingScenes");

const VALID_CAMPAIGNS = new Set(["hero"]);
const VALID_DMS = {
  hero: new Set(["aizawa", "iida", "bakugo", "midoriya"]),
  // villain: new Set(["afo", "shigaraki", "toga", "twice"]),
};
const DEFAULT_COMPANIONS = {
  hero: ["companion1", "companion2", "companion3"],
  // villain: ["companion1", "companion2", "companion3"],
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
        hp: 12,
        inventory: [],
      },
      campaign: {
        type: campaign,
        dm: dmChoice,
        companions: DEFAULT_COMPANIONS[campaign],
      },
      location: "beach",
      coconuts: 0,
      storyFlags: {},
    };

    const openingResponse = createOpeningResponse({
      dmName: dmChoice,
      playerName: character.name,
      faction: character.faction,
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
