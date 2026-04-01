require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { createCharacterRouter } = require("./routes/character");
const { createCampaignRouter } = require("./routes/campaign");
const { createGameRouter } = require("./routes/game");

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

const store = {
  characters: new Map(),
  games: new Map(),
  turnHistoryByGame: new Map(),
};

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true });
});

app.use("/api/character", createCharacterRouter(store));
app.use("/api/campaign", createCampaignRouter(store));
app.use("/api/game", createGameRouter(store));

app.use((req, res) => {
  res.status(404).json({ error: "Not Found", message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("[server:error]", err);
  res.status(500).json({ error: "Internal Server Error", message: "Something went wrong." });
});

app.listen(port, () => {
  console.log(`RPG API listening on http://localhost:${port}`);
});
