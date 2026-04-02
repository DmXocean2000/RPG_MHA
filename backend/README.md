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
- `POST /api/dev/verify` (dev password required)
- `POST /api/dev/game` (create new in-memory game, dev password required)
- `POST /api/dev/game/:gameId` (dev password required)
- `PATCH /api/dev/game/:gameId` (dev password required)

## Grok integration

- Set `XAI_API_KEY` in `.env`.
- `POST /api/game/:gameId/turn` attempts an xAI call.
- If xAI is unavailable, the endpoint falls back to the current mock response.

## Dev mode

- Set `DEV_MODE_PASSWORD` in `backend/.env`.
- Frontend route: `/dev`
- Use dev mode to edit test state quickly (player profile, inventory, companion trust/treatment/status, etc.).
