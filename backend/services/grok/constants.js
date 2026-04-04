const XAI_API_URL = process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const XAI_DEBUG = process.env.XAI_DEBUG === "true";
const XAI_LOG_REQUEST = process.env.XAI_LOG_REQUEST === "true";
const AI_MAX_TOKENS = Number.isFinite(Number(process.env.AI_MAX_TOKENS))
  ? Number(process.env.AI_MAX_TOKENS)
  : 40000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_REPAIR_ENABLED = process.env.OPENAI_REPAIR_ENABLED !== "false";
const OPENAI_REPAIR_MODEL = process.env.OPENAI_REPAIR_MODEL || "gpt-5-mini";
const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";

const TURN_RESPONSE_SCHEMA = `turn_response:
  dm_narration: string
  companions_pre:
    - name: string
      text: string
  companions_post:
    - name: string
      text: string
  dice_roll: null | { type: string, dc: number, result: number }
  trust_changes:
    - name: string
      delta: number
      reason: string
  health_changes:
    - target: player|companion
      name: optional-string
      delta: number
      reason: string
  companion_energy_changes:
    - name: string
      delta: number
      reason: string
  energy_change:
    delta: number
    effort: low|medium|high
    reason: string
  item_changes:
    - name: string
      delta: number
      reason: string`;

const mockTurnResponse = {
  dm_narration: "Test narration from DM",
  companions_pre: [
    { name: "companion1", text: "Test reaction 1" },
    { name: "companion2", text: "Test reaction 2" },
    { name: "companion3", text: "Test reaction 3" },
  ],
  dice_roll: { type: "survival", dc: 13, result: 10 },
  energy_change: {
    delta: -3,
    effort: "medium",
    reason: "Scavenging and movement required moderate stamina.",
  },
  health_changes: [],
  companion_energy_changes: [],
  item_changes: [{ name: "wood", delta: 3, reason: "You collected driftwood from the beach." }],
  companions_post: [
    { name: "companion1", text: "Post reaction 1" },
    { name: "companion2", text: "Post reaction 2" },
    { name: "companion3", text: "Post reaction 3" },
  ],
};

module.exports = {
  XAI_API_URL,
  XAI_MODEL,
  XAI_DEBUG,
  XAI_LOG_REQUEST,
  AI_MAX_TOKENS,
  OPENAI_API_KEY,
  OPENAI_REPAIR_ENABLED,
  OPENAI_REPAIR_MODEL,
  OPENAI_API_URL,
  TURN_RESPONSE_SCHEMA,
  mockTurnResponse,
};
