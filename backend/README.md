# RPG_MHA Backend

Express REST API for the text-based RPG game.

## Structure

```text
backend/
├── server.js
├── routes/
│   ├── character.js
│   ├── campaign.js
│   └── game.js
├── services/
│   └── grokService.js
├── prompts/
│   └── characters.js
├── .env
├── package.json
└── README.md
```

## Setup

```bash
cd backend
npm install
npm start
```

Server runs on `http://localhost:3001`.

## Endpoints

- `POST /api/character/create`
- `POST /api/campaign/select`
- `GET /api/game/:gameId`
- `POST /api/game/:gameId/turn`

## Grok integration

- Set `XAI_API_KEY` in `.env`.
- `POST /api/game/:gameId/turn` attempts an xAI call.
- If xAI is unavailable, the endpoint falls back to the current mock response.
