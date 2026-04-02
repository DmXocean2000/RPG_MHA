const express = require("express");
const crypto = require("crypto");

const VALID_FACTIONS = new Set(["hero", "villain", "civilian"]);
const VALID_QUIRKS = new Set(["hardening", "half_cold_half_hot", "fiber_master", "quirkless"]);

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
      quirk: "quirkless",
      hp: 20,
      energy: 20,
      inventory: [],
      createdAt: new Date().toISOString(),
    };

    characters.set(characterId, character);
    console.log(`[character:create] id=${characterId} faction=${faction} name="${character.name}"`);

    return res.status(201).json({ characterId, character });
  });

  router.patch("/:characterId/quirk", (req, res) => {
    const { characterId } = req.params;
    const { quirk } = req.body ?? {};

    if (typeof characterId !== "string" || !characterId.trim()) {
      return res.status(400).json(badRequest("characterId is required and must be a string"));
    }

    const character = characters.get(characterId);
    if (!character) {
      return res.status(404).json({ error: "Not Found", message: "Character not found" });
    }

    if (typeof quirk !== "string" || !VALID_QUIRKS.has(quirk)) {
      return res
        .status(400)
        .json(
          badRequest('quirk must be one of: "hardening", "half_cold_half_hot", "fiber_master", "quirkless"')
        );
    }

    character.quirk = quirk;
    characters.set(characterId, character);

    return res.status(200).json({ ok: true, characterId, character });
  });

  return router;
}

module.exports = {
  createCharacterRouter,
};
