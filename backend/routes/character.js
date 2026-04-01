const express = require("express");
const crypto = require("crypto");

const VALID_FACTIONS = new Set(["hero", "villain", "civilian"]);

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function badRequest(message) {
  return { error: "Bad Request", message };
}

function createCharacterRouter({ characters }) {
  const router = express.Router();

  router.post("/create", (req, res) => {
    const { name, faction } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json(badRequest("name is required and must be a non-empty string"));
    }

    if (typeof faction !== "string" || !VALID_FACTIONS.has(faction)) {
      return res.status(400).json(badRequest('faction must be one of: "hero", "villain", "civilian"'));
    }

    const characterId = generateId("char");
    const character = {
      id: characterId,
      name: name.trim(),
      faction,
      hp: 12,
      inventory: [],
      createdAt: new Date().toISOString(),
    };

    characters.set(characterId, character);
    console.log(`[character:create] id=${characterId} faction=${faction} name="${character.name}"`);

    return res.status(201).json({ characterId, character });
  });

  return router;
}

module.exports = {
  createCharacterRouter,
};
