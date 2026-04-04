const express = require("express");
const { generateTurnResponse } = require("../services/grokService");
const { badRequest, notFound } = require("../utils/routeHelpers");
const MAX_ACTION_LENGTH = 1000;

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function isVillainPlayer(gameState) {
  return String(gameState?.player?.faction || "").toLowerCase().trim() === "villain";
}

function normalizeLocation(value) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "beach";
  return raw;
}

function cleanLocationPhrase(rawPhrase) {
  if (!rawPhrase) return null;
  const trimmed = rawPhrase
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, "")
    .split(/[,.!?;:]/)[0]
    .replace(/\s+(and|but|so|then|because|while|lets|let's|we|i)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || trimmed.length < 2) return null;
  return normalizeLocation(trimmed.replace(/^(the|a|an)\s+/, ""));
}

function extractMovementLocation(text) {
  const source = String(text || "").toLowerCase();
  if (!source) return null;

  const patterns = [
    /\b(?:go|head|move|travel|trek|walk|run|climb|return|backtrack|reach|enter|descend|ascend)\b(?:\s+\w+){0,5}\s+(?:to|toward|towards|into|inside|onto|on|in)\s+(?:the\s+)?([a-z][a-z0-9'\-\s]{2,70})/,
    /\b(?:up|down|back)\s+to\s+(?:the\s+)?([a-z][a-z0-9'\-\s]{2,70})/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const cleaned = cleanLocationPhrase(match?.[1] || "");
    if (cleaned) return cleaned;
  }
  return null;
}

function extractContextLocation(text) {
  const source = String(text || "").toLowerCase();
  if (!source) return null;
  const patterns = [
    /\bwhile at\s+(?:the\s+)?([a-z][a-z0-9'\-\s]{2,70})/,
    /\bat\s+(?:the\s+)?([a-z][a-z0-9'\-\s]{2,70})/,
    /\bin\s+(?:the\s+)?([a-z][a-z0-9'\-\s]{2,70})/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const cleaned = cleanLocationPhrase(match?.[1] || "");
    if (cleaned) return cleaned;
  }
  return null;
}

function inferLocationFromText(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .trim();
  if (!normalized) return null;
  const explicit = extractContextLocation(normalized) || extractMovementLocation(normalized);
  if (explicit) return explicit;
  if (/\bbeach|shore|shoreline|coast|seaside|sand\b/.test(normalized)) return "beach";
  if (/\bvolcano|lava|ravine|crater|ash|magma\b/.test(normalized)) return "volcano";
  if (/\bjungle\b/.test(normalized)) return "jungle";
  if (/\bruin|ruins|temple\b/.test(normalized)) return "ruins";
  if (/\bcave|tunnel\b/.test(normalized)) return "cave";
  return null;
}

function actionIndicatesMovement(actionText) {
  const normalized = String(actionText || "").toLowerCase();
  if (!normalized) return false;
  return /\b(go|head|move|travel|trek|walk|run|climb|return|back|toward|towards|to|into|up|down|leave|reach)\b/.test(
    normalized
  );
}

function inferNextLocation({ currentLocation, actionText, narrationText }) {
  const fromActionMovement = extractMovementLocation(actionText);
  const fromActionContext = extractContextLocation(actionText);
  const fromNarration = inferLocationFromText(narrationText);
  const movement = actionIndicatesMovement(actionText);

  if (fromActionMovement) return fromActionMovement;
  if (fromActionContext) return fromActionContext;
  if (fromNarration && movement) return fromNarration;
  return currentLocation;
}

function enforceLocationContinuity(response, expectedLocation) {
  if (!response || typeof response !== "object") return;
  const narration = typeof response.dm_narration === "string" ? response.dm_narration : "";
  if (!narration.trim()) return;

  const continuityLine = `Continuity: Current location is ${expectedLocation}.`;
  if (!response.dm_narration.includes("Continuity:")) {
    response.dm_narration = `${response.dm_narration}\n\n${continuityLine}`;
  }
}

function clamp0to20(value, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(20, numeric));
}

function ensureCompanionVitals(gameState) {
  if (!Array.isArray(gameState?.companionStatus)) return;
  gameState.companionStatus = gameState.companionStatus.map((entry) => ({
    ...entry,
    hp: clamp0to20(entry?.hp, 20),
    energy: clamp0to20(entry?.energy, 20),
  }));
}

function ensurePlayerVitals(gameState) {
  if (!gameState?.player || typeof gameState.player !== "object") return;
  gameState.player.hp = clamp0to20(gameState.player.hp, 20);
  gameState.player.energy = clamp0to20(gameState.player.energy, 20);
}

function getGameOverState(gameState) {
  const playerHp = clamp0to20(gameState?.player?.hp, 20);
  if (playerHp <= 0) {
    return {
      isOver: true,
      reason: "player_dead",
      message: "Your injuries are fatal. ...The story ends here.",
    };
  }

  const companions = Array.isArray(gameState?.companionStatus) ? gameState.companionStatus : [];
  if (companions.length > 0 && companions.every((companion) => clamp0to20(companion?.hp, 20) <= 0)) {
    return {
      isOver: true,
      reason: "party_wiped",
      message: "All companions have fallen. ...The party is wiped out. The story ends here.",
    };
  }

  return { isOver: false, reason: null, message: "" };
}

function markGameOver(gameState, gameOverState) {
  if (!gameState || typeof gameState !== "object") return;
  const storyFlags = gameState.storyFlags && typeof gameState.storyFlags === "object" ? gameState.storyFlags : {};
  gameState.storyFlags = {
    ...storyFlags,
    gameOver: true,
    gameOverReason: gameOverState.reason,
    gameOverAt: storyFlags.gameOverAt || new Date().toISOString(),
  };
}

function buildGameOverResponse(gameOverState) {
  return {
    dm_narration: gameOverState.message,
    companions_pre: [],
    companions_post: [],
    dice_roll: null,
    trust_changes: [],
    health_changes: [],
    companion_energy_changes: [],
    item_changes: [],
    energy_change: {
      delta: 0,
      effort: "low",
      reason: "Game over state: no further actions can be taken.",
    },
  };
}

function applyTrustChangesFromModel(gameState, trustChanges) {
  if (!Array.isArray(gameState?.companionStatus) || !Array.isArray(trustChanges)) return [];

  const changeByName = new Map();
  for (const item of trustChanges) {
    const key = normalizeKey(item?.name);
    const delta = Number(item?.delta);
    if (!key || !Number.isFinite(delta) || delta === 0) continue;
    changeByName.set(key, (changeByName.get(key) || 0) + delta);
  }

  const applied = [];
  gameState.companionStatus = gameState.companionStatus.map((companion) => {
    const key = normalizeKey(companion?.name);
    const delta = changeByName.get(key) || 0;
    if (!delta) return companion;

    const current = Number.isFinite(Number(companion?.trust)) ? Number(companion.trust) : 50;
    const nextTrust = Math.max(0, Math.min(100, current + delta));
    applied.push({ name: companion.name, delta, from: current, to: nextTrust });
    return {
      ...companion,
      trust: nextTrust,
    };
  });

  return applied;
}

function applyHealthChangesFromModel(gameState, healthChanges) {
  const parsedChanges = Array.isArray(healthChanges) ? healthChanges : [];
  const applied = [];

  for (const change of parsedChanges) {
    const target = String(change?.target || "").toLowerCase().trim();
    const delta = Number(change?.delta);
    if (!Number.isFinite(delta) || delta === 0) continue;
    const reason = typeof change?.reason === "string" ? change.reason : "";

    if (target === "player" && gameState?.player) {
      const before = clamp0to20(gameState.player.hp, 20);
      let effectiveDelta = delta;
      let factionReason = "";
      if (isVillainPlayer(gameState) && delta < 0) {
        const mitigation = Math.max(1, Math.round(Math.abs(delta) * 0.25));
        effectiveDelta = Math.min(0, delta + mitigation);
        if (effectiveDelta !== delta) {
          factionReason = " Villain resilience reduced incoming damage.";
        }
      }

      const after = clamp0to20(before + effectiveDelta, 20);
      gameState.player.hp = after;
      applied.push({
        target: "player",
        name: gameState.player?.name || "Player",
        delta: after - before,
        requestedDelta: delta,
        factionAdjustment: effectiveDelta - delta,
        before,
        after,
        reason: `${reason || ""}${factionReason}`.trim(),
      });
      continue;
    }

    if (target === "companion" && Array.isArray(gameState?.companionStatus)) {
      const targetKey = normalizeKey(change?.name);
      if (!targetKey) continue;
      const idx = gameState.companionStatus.findIndex((entry) => normalizeKey(entry?.name) === targetKey);
      if (idx < 0) continue;

      const companion = gameState.companionStatus[idx];
      const before = clamp0to20(companion?.hp, 20);
      const after = clamp0to20(before + delta, 20);
      gameState.companionStatus[idx] = { ...companion, hp: after };
      applied.push({
        target: "companion",
        name: companion?.name || "Companion",
        delta: after - before,
        requestedDelta: delta,
        before,
        after,
        reason,
      });
    }
  }

  return applied;
}

function applyCompanionEnergyChangesFromModel(gameState, companionEnergyChanges) {
  const parsedChanges = Array.isArray(companionEnergyChanges) ? companionEnergyChanges : [];
  if (!Array.isArray(gameState?.companionStatus)) return [];
  const applied = [];

  for (const change of parsedChanges) {
    const targetKey = normalizeKey(change?.name);
    const delta = Number(change?.delta);
    if (!targetKey || !Number.isFinite(delta) || delta === 0) continue;
    const idx = gameState.companionStatus.findIndex((entry) => normalizeKey(entry?.name) === targetKey);
    if (idx < 0) continue;

    const companion = gameState.companionStatus[idx];
    const before = clamp0to20(companion?.energy, 20);
    const after = clamp0to20(before + delta, 20);
    gameState.companionStatus[idx] = { ...companion, energy: after };
    applied.push({
      name: companion?.name || "Companion",
      delta: after - before,
      requestedDelta: delta,
      before,
      after,
      reason: typeof change?.reason === "string" ? change.reason : "",
    });
  }

  return applied;
}

function normalizeItemName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeInventoryToMap(inventory) {
  const map = new Map();
  if (!Array.isArray(inventory)) return map;

  for (const entry of inventory) {
    if (typeof entry === "string") {
      const key = normalizeItemName(entry);
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
      continue;
    }
    if (entry && typeof entry === "object") {
      const key = normalizeItemName(entry.name);
      const quantity = Number(entry.quantity);
      if (!key || !Number.isFinite(quantity) || quantity <= 0) continue;
      map.set(key, (map.get(key) || 0) + quantity);
    }
  }

  return map;
}

function inventoryMapToArray(inventoryMap) {
  return Array.from(inventoryMap.entries())
    .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, quantity]) => ({ name, quantity }));
}

function applyItemChangesFromModel(gameState, itemChanges) {
  if (!gameState?.player || typeof gameState.player !== "object") return [];
  const parsedChanges = Array.isArray(itemChanges) ? itemChanges : [];
  const inventoryMap = normalizeInventoryToMap(gameState.player.inventory);
  const applied = [];

  for (const change of parsedChanges) {
    const name = normalizeItemName(change?.name);
    const delta = Number(change?.delta);
    if (!name || !Number.isFinite(delta) || delta === 0) continue;

    const before = inventoryMap.get(name) || 0;
    const after = Math.max(0, before + delta);
    inventoryMap.set(name, after);
    applied.push({
      name,
      delta: after - before,
      requestedDelta: delta,
      before,
      after,
      reason: typeof change?.reason === "string" ? change.reason : "",
    });
  }

  gameState.player.inventory = inventoryMapToArray(inventoryMap);
  return applied;
}

function applyEnergyChangesFromModel(gameState, energyChange) {
  if (!gameState?.player || typeof gameState.player !== "object") {
    return {
      baseDelta: 0,
      diceAdjustment: 0,
      appliedDelta: 0,
      before: 20,
      after: 20,
      reason: "No valid player state for energy update.",
    };
  }

  const before = Number.isFinite(Number(gameState.player.energy)) ? Number(gameState.player.energy) : 20;
  const requestedBaseDelta = Number(energyChange?.delta);
  const baseDelta = Number.isFinite(requestedBaseDelta) ? requestedBaseDelta : 0;

  const dice = energyChange?.dice_roll;
  const dc = Number(dice?.dc);
  const result = Number(dice?.result);
  const hasRoll = Number.isFinite(dc) && Number.isFinite(result);
  const success = hasRoll ? result >= dc : null;

  let diceAdjustment = 0;
  let diceReason = "";
  if (hasRoll && baseDelta !== 0) {
    if (baseDelta < 0) {
      diceAdjustment = success ? 2 : -2;
      diceReason = success
        ? "Dice success reduced energy loss."
        : "Dice failure increased energy loss.";
    } else {
      diceAdjustment = success ? 1 : -1;
      diceReason = success
        ? "Dice success slightly increased energy recovery."
        : "Dice failure reduced energy recovery.";
    }
  }

  let factionAdjustment = 0;
  let factionReason = "";
  if (isVillainPlayer(gameState) && baseDelta < 0) {
    const effort = String(energyChange?.effort || "").toLowerCase().trim();
    factionAdjustment = effort === "high" ? 3 : effort === "medium" ? 2 : 1;
    factionReason = "Villain endurance reduced energy loss.";
  }

  const unclampedDelta = baseDelta + diceAdjustment + factionAdjustment;
  const unclampedAfter = before + unclampedDelta;
  const after = Math.max(0, Math.min(20, unclampedAfter));
  const appliedDelta = after - before;
  gameState.player.energy = after;

  const baseReason =
    typeof energyChange?.reason === "string" && energyChange.reason.trim()
      ? energyChange.reason.trim()
      : "No energy reason provided by model.";

  return {
    baseDelta,
    diceAdjustment,
    factionAdjustment,
    appliedDelta,
    before,
    after,
    effort: typeof energyChange?.effort === "string" ? energyChange.effort : "unknown",
    reason: `${baseReason}${diceReason ? ` ${diceReason}` : ""}${factionReason ? ` ${factionReason}` : ""}`.trim(),
  };
}

function createGameRouter({ games, turnHistoryByGame }) {
  const router = express.Router();

  router.get("/:gameId", (req, res) => {
    const { gameId } = req.params;
    const gameState = games.get(gameId);

    if (!gameState) {
      return res.status(404).json(notFound("Game not found"));
    }
    ensurePlayerVitals(gameState);
    ensureCompanionVitals(gameState);

    const turnHistory = turnHistoryByGame.get(gameId) ?? [];
    return res.status(200).json({ gameState, turnHistory });
  });

  router.post("/:gameId/turn", async (req, res, next) => {
    try {
      const { gameId } = req.params;
      const { action } = req.body ?? {};

      const gameState = games.get(gameId);
      if (!gameState) {
        return res.status(404).json(notFound("Game not found"));
      }
      ensurePlayerVitals(gameState);
      ensureCompanionVitals(gameState);
      const preTurnGameOver = getGameOverState(gameState);
      if (preTurnGameOver.isOver) {
        markGameOver(gameState, preTurnGameOver);
        const response = buildGameOverResponse(preTurnGameOver);
        return res.status(200).json({
          response,
          updatedState: gameState,
          meta: {
            source: "system_game_over_locked",
            gameOver: true,
            gameOverReason: preTurnGameOver.reason,
          },
        });
      }

      if (typeof action !== "string" || !action.trim()) {
        return res.status(400).json(badRequest("action is required and must be a non-empty string"));
      }
      if (action.trim().length > MAX_ACTION_LENGTH) {
        return res.status(400).json(badRequest(`action exceeds ${MAX_ACTION_LENGTH} characters`));
      }

      const { response, source, meta } = await generateTurnResponse({
        gameState,
        action: action.trim(),
      });
      const currentLocation = normalizeLocation(gameState.location);
      const nextLocation = inferNextLocation({
        currentLocation,
        actionText: action.trim(),
        narrationText: response?.dm_narration || "",
      });
      gameState.location = nextLocation;
      enforceLocationContinuity(response, nextLocation);
      const energyChange = applyEnergyChangesFromModel(gameState, {
        ...(response?.energy_change || {}),
        dice_roll: response?.dice_roll,
      });
      const healthChanges = applyHealthChangesFromModel(gameState, response?.health_changes || []);
      const companionEnergyChanges = applyCompanionEnergyChangesFromModel(
        gameState,
        response?.companion_energy_changes || []
      );
      const itemChanges = applyItemChangesFromModel(gameState, response?.item_changes || []);
      response.energy_change = energyChange;
      response.health_changes = healthChanges;
      response.companion_energy_changes = companionEnergyChanges;
      response.item_changes = itemChanges;
      const trustChanges = applyTrustChangesFromModel(gameState, response?.trust_changes || []);
      response.trust_changes = trustChanges;
      const postTurnGameOver = getGameOverState(gameState);
      if (postTurnGameOver.isOver) {
        markGameOver(gameState, postTurnGameOver);
        response.dm_narration = `${response.dm_narration}\n\n${postTurnGameOver.message}`;
      }

      const history = turnHistoryByGame.get(gameId) ?? [];
      history.push({
        turn: history.length + 1,
        action: action.trim(),
        response,
        source,
        meta: {
          ...(meta || {}),
          energyChange,
          healthChanges,
          companionEnergyChanges,
          itemChanges,
          trustChanges,
          location: gameState.location,
          gameOver: postTurnGameOver.isOver,
          gameOverReason: postTurnGameOver.reason,
        },
        timestamp: new Date().toISOString(),
      });
      turnHistoryByGame.set(gameId, history);

      console.log(
        `[game:turn] gameId=${gameId} action="${action.trim()}" source=${source} energyChange=${JSON.stringify(
          energyChange
        )} location=${gameState.location} healthChanges=${JSON.stringify(healthChanges)} companionEnergyChanges=${JSON.stringify(
          companionEnergyChanges
        )} itemChanges=${JSON.stringify(itemChanges)} trustChanges=${JSON.stringify(trustChanges)}`
      );
      return res.status(200).json({
        response,
        updatedState: gameState,
        meta: {
          ...(meta || {}),
          energyChange,
          healthChanges,
          companionEnergyChanges,
          itemChanges,
          trustChanges,
          location: gameState.location,
          gameOver: postTurnGameOver.isOver,
          gameOverReason: postTurnGameOver.reason,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createGameRouter,
};
