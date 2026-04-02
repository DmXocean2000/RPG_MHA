const express = require("express");
const { generateTurnResponse } = require("../services/grokService");

function badRequest(message) {
  return { error: "Bad Request", message };
}

function notFound(message) {
  return { error: "Not Found", message };
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
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

  const unclampedDelta = baseDelta + diceAdjustment;
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
    appliedDelta,
    before,
    after,
    effort: typeof energyChange?.effort === "string" ? energyChange.effort : "unknown",
    reason: diceReason ? `${baseReason} ${diceReason}` : baseReason,
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
      ensureCompanionVitals(gameState);

      if (typeof action !== "string" || !action.trim()) {
        return res.status(400).json(badRequest("action is required and must be a non-empty string"));
      }

      const { response, source, meta } = await generateTurnResponse({
        gameState,
        action: action.trim(),
      });
      const energyChange = applyEnergyChangesFromModel(gameState, {
        ...(response?.energy_change || {}),
        dice_roll: response?.dice_roll,
      });
      response.energy_change = energyChange;
      const trustChanges = applyTrustChangesFromModel(gameState, response?.trust_changes || []);

      const history = turnHistoryByGame.get(gameId) ?? [];
      history.push({
        turn: history.length + 1,
        action: action.trim(),
        response,
        source,
        meta: {
          ...(meta || {}),
          energyChange,
          trustChanges,
        },
        timestamp: new Date().toISOString(),
      });
      turnHistoryByGame.set(gameId, history);

      console.log(
        `[game:turn] gameId=${gameId} action="${action.trim()}" source=${source} energyChange=${JSON.stringify(
          energyChange
        )} trustChanges=${JSON.stringify(trustChanges)}`
      );
      return res.status(200).json({
        response,
        updatedState: gameState,
        meta: {
          ...(meta || {}),
          energyChange,
          trustChanges,
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
