const express = require("express");
const crypto = require("crypto");
const { createOpeningResponse } = require("../prompts/openingScenes");

const ALLOWED_FACTIONS = new Set(["hero", "villain", "civilian"]);
const ALLOWED_DMS = new Set(["aizawa", "iida", "bakugo", "midoriya"]);
const ALLOWED_QUIRKS = new Set(["hardening", "half_cold_half_hot", "fiber_master", "quirkless"]);
const HERO_ROSTER = ["aizawa", "iida", "bakugo", "midoriya"];
const DISPLAY_NAME = {
  aizawa: "Aizawa",
  iida: "Iida",
  bakugo: "Bakugo",
  midoriya: "Midoriya",
};

function unauthorized(message) {
  return { error: "Unauthorized", message };
}

function badRequest(message) {
  return { error: "Bad Request", message };
}

function notFound(message) {
  return { error: "Not Found", message };
}

function parsePassword(req) {
  const fromBody = req.body?.password;
  const fromHeader = req.headers["x-dev-password"];
  if (typeof fromBody === "string") return fromBody;
  if (typeof fromHeader === "string") return fromHeader;
  return "";
}

function requireDevPassword(req, res, next) {
  const expected = process.env.DEV_MODE_PASSWORD;
  if (!expected) {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "DEV_MODE_PASSWORD is not configured.",
    });
  }

  const provided = parsePassword(req);
  if (!provided || provided !== expected) {
    return res.status(401).json(unauthorized("Invalid developer password."));
  }

  return next();
}

function normalizeInventory(value) {
  if (!Array.isArray(value)) return [];
  const aggregate = new Map();

  for (const item of value) {
    if (typeof item === "string") {
      const raw = item.trim().toLowerCase();
      if (!raw) continue;
      const leadingCount = raw.match(/^(\d+)\s+(.+)$/);
      const trailingCount = raw.match(/^(.+?)\s*x\s*(\d+)$/i);
      let name = raw;
      let quantity = 1;
      if (leadingCount) {
        quantity = Number(leadingCount[1]);
        name = leadingCount[2].trim();
      } else if (trailingCount) {
        name = trailingCount[1].trim();
        quantity = Number(trailingCount[2]);
      }
      if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
      aggregate.set(name, (aggregate.get(name) || 0) + quantity);
      continue;
    }

    if (item && typeof item === "object") {
      const name = typeof item.name === "string" ? item.name.trim().toLowerCase() : "";
      const quantity = Number(item.quantity);
      if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;
      aggregate.set(name, (aggregate.get(name) || 0) + quantity);
    }
  }

  return Array.from(aggregate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => ({ name, quantity }));
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
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
      midoriya: { trust: 46, treatment: "Wary but fair", status: "Trying to understand your intent" },
      iida: { trust: 38, treatment: "Strictly guarded", status: "Monitoring for rule violations" },
      aizawa: { trust: 42, treatment: "Cold and cautious", status: "Prepared to intervene instantly" },
      bakugo: { trust: 35, treatment: "Openly hostile", status: "Looking for your weak spots" },
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

function createDevRouter({ games, turnHistoryByGame }) {
  const router = express.Router();

  router.post("/verify", requireDevPassword, (req, res) => {
    return res.status(200).json({ ok: true });
  });

  router.post("/game/:gameId", requireDevPassword, (req, res) => {
    const { gameId } = req.params;
    const gameState = games.get(gameId);
    if (!gameState) {
      return res.status(404).json(notFound("Game not found"));
    }

    const turnHistory = turnHistoryByGame.get(gameId) || [];
    return res.status(200).json({ gameState, turnHistory });
  });

  router.post("/game", requireDevPassword, (req, res) => {
    const settings = req.body?.settings || {};
    const playerName =
      typeof settings.playerName === "string" && settings.playerName.trim() ? settings.playerName.trim() : "DevPlayer";
    const faction =
      typeof settings.faction === "string" && ALLOWED_FACTIONS.has(settings.faction) ? settings.faction : "hero";
    const dmChoice = typeof settings.dmChoice === "string" && ALLOWED_DMS.has(settings.dmChoice) ? settings.dmChoice : "aizawa";
    const quirk =
      typeof settings.quirk === "string" && ALLOWED_QUIRKS.has(settings.quirk) ? settings.quirk : "quirkless";

    const gameId = generateId("game");
    const gameState = {
      gameId,
      player: {
        name: playerName,
        faction,
        quirk,
        hp: 20,
        energy: 20,
        inventory: [],
      },
      campaign: {
        type: "hero",
        dm: dmChoice,
        companions: getCompanionIdsForDm(dmChoice),
      },
      location: "beach",
      coconuts: 0,
      storyFlags: {},
      companionStatus: createCompanionStatus(faction, dmChoice),
    };

    const openingResponse = createOpeningResponse({
      dmName: dmChoice,
      playerName,
      faction,
      quirk,
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

    return res.status(201).json({ gameId, gameState, openingResponse });
  });

  router.patch("/game/:gameId", requireDevPassword, (req, res) => {
    const { gameId } = req.params;
    const gameState = games.get(gameId);
    if (!gameState) {
      return res.status(404).json(notFound("Game not found"));
    }

    const updates = req.body?.updates;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json(badRequest("updates object is required"));
    }

    if (updates.player && typeof updates.player === "object") {
      if (typeof updates.player.name === "string" && updates.player.name.trim()) {
        gameState.player.name = updates.player.name.trim();
      }
      if (typeof updates.player.faction === "string" && ALLOWED_FACTIONS.has(updates.player.faction)) {
        gameState.player.faction = updates.player.faction;
      }
      if (typeof updates.player.quirk === "string" && ALLOWED_QUIRKS.has(updates.player.quirk)) {
        gameState.player.quirk = updates.player.quirk;
      }
      if (Number.isFinite(Number(updates.player.hp))) {
        gameState.player.hp = Number(updates.player.hp);
      }
      if (Number.isFinite(Number(updates.player.energy))) {
        gameState.player.energy = Number(updates.player.energy);
      }
      if (Array.isArray(updates.player.inventory)) {
        gameState.player.inventory = normalizeInventory(updates.player.inventory);
      }
    }

    if (typeof updates.location === "string" && updates.location.trim()) {
      gameState.location = updates.location.trim();
    }
    if (Number.isFinite(Number(updates.coconuts))) {
      gameState.coconuts = Number(updates.coconuts);
    }
    if (updates.storyFlags && typeof updates.storyFlags === "object") {
      gameState.storyFlags = updates.storyFlags;
    }

    if (Array.isArray(updates.companionStatus)) {
      gameState.companionStatus = updates.companionStatus.map((entry) => ({
        name: typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : "Companion",
        trust: Number.isFinite(Number(entry?.trust)) ? Number(entry.trust) : 50,
        hp: Number.isFinite(Number(entry?.hp)) ? Number(entry.hp) : 20,
        energy: Number.isFinite(Number(entry?.energy)) ? Number(entry.energy) : 20,
        treatment:
          typeof entry?.treatment === "string" && entry.treatment.trim() ? entry.treatment.trim() : "Neutral",
        status: typeof entry?.status === "string" && entry.status.trim() ? entry.status.trim() : "Unknown",
      }));
    }

    games.set(gameId, gameState);
    return res.status(200).json({ ok: true, gameState });
  });

  return router;
}

module.exports = {
  createDevRouter,
};
