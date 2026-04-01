const express = require("express");
const { generateTurnResponse } = require("../services/grokService");

function badRequest(message) {
  return { error: "Bad Request", message };
}

function notFound(message) {
  return { error: "Not Found", message };
}

function createGameRouter({ games, turnHistoryByGame }) {
  const router = express.Router();

  router.get("/:gameId", (req, res) => {
    const { gameId } = req.params;
    const gameState = games.get(gameId);

    if (!gameState) {
      return res.status(404).json(notFound("Game not found"));
    }

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

      if (typeof action !== "string" || !action.trim()) {
        return res.status(400).json(badRequest("action is required and must be a non-empty string"));
      }

      const { response, source } = await generateTurnResponse({
        gameState,
        action: action.trim(),
      });

      const history = turnHistoryByGame.get(gameId) ?? [];
      history.push({
        turn: history.length + 1,
        action: action.trim(),
        response,
        source,
        timestamp: new Date().toISOString(),
      });
      turnHistoryByGame.set(gameId, history);

      console.log(`[game:turn] gameId=${gameId} action="${action.trim()}" source=${source}`);
      return res.status(200).json({ response, updatedState: gameState });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createGameRouter,
};
