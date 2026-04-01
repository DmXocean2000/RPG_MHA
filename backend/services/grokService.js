const { getDmSystemPrompt } = require("../prompts/characters");

const XAI_API_URL = process.env.XAI_API_URL || "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";

const mockTurnResponse = {
  dm_narration: "Test narration from DM",
  companions_pre: [
    { name: "companion1", text: "Test reaction 1" },
    { name: "companion2", text: "Test reaction 2" },
    { name: "companion3", text: "Test reaction 3" },
  ],
  dice_roll: { type: "survival", dc: 13, result: 10 },
  companions_post: [
    { name: "companion1", text: "Post reaction 1" },
    { name: "companion2", text: "Post reaction 2" },
    { name: "companion3", text: "Post reaction 3" },
  ],
};

function extractFirstJsonObject(rawText) {
  if (typeof rawText !== "string") return null;
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const possibleJson = rawText.slice(start, end + 1);
  try {
    return JSON.parse(possibleJson);
  } catch {
    return null;
  }
}

function isValidTurnResponse(data) {
  return (
    data &&
    typeof data === "object" &&
    typeof data.dm_narration === "string" &&
    Array.isArray(data.companions_pre) &&
    typeof data.dice_roll === "object" &&
    Array.isArray(data.companions_post)
  );
}

async function generateTurnResponse({ gameState, action }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { response: structuredClone(mockTurnResponse), source: "mock_no_api_key" };
  }

  const systemPrompt = getDmSystemPrompt(gameState.campaign.dm);
  const userPrompt = [
    "Return ONLY JSON with these keys:",
    "dm_narration, companions_pre, dice_roll, companions_post.",
    "Use exactly 3 companions in companions_pre and companions_post.",
    "Keep language clean and suitable for all ages. No profanity.",
    `Player action: ${action}`,
    `Current game state: ${JSON.stringify(gameState)}`,
  ].join("\n");

  const payload = {
    model: XAI_MODEL,
    temperature: 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  try {
    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[grok:error] status=${response.status} body=${errorText}`);
      return { response: structuredClone(mockTurnResponse), source: "mock_api_error" };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = extractFirstJsonObject(content);

    if (!isValidTurnResponse(parsed)) {
      console.warn("[grok:warn] Invalid model payload. Using mock response.");
      return { response: structuredClone(mockTurnResponse), source: "mock_invalid_payload" };
    }

    return { response: parsed, source: "grok" };
  } catch (error) {
    console.error("[grok:exception] Failed to call Grok API", error);
    return { response: structuredClone(mockTurnResponse), source: "mock_exception" };
  }
}

module.exports = {
  generateTurnResponse,
  mockTurnResponse,
};
