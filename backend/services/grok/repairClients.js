const {
  XAI_API_URL,
  XAI_MODEL,
  AI_MAX_TOKENS,
  OPENAI_API_KEY,
  OPENAI_REPAIR_ENABLED,
  OPENAI_REPAIR_MODEL,
  OPENAI_API_URL,
  TURN_RESPONSE_SCHEMA,
} = require("./constants");
const { extractFirstJsonObject, normalizeTurnResponse } = require("./normalization");

async function requestJsonRepair({ apiKey, systemPrompt, invalidContent }) {
  const repairPayload = {
    model: XAI_MODEL,
    temperature: 0.1,
    max_output_tokens: AI_MAX_TOKENS,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          "You previously returned malformed YAML for a turn response.",
          "Return ONLY valid YAML. No markdown, no prose, no code fences.",
          `Use this exact schema and include all sections: ${TURN_RESPONSE_SCHEMA}`,
          "Preserve the original intent, values, and tone where possible, but fix all syntax and shape issues.",
          `Malformed content to repair:\n${invalidContent}`,
        ].join("\n"),
      },
    ],
  };

  const response = await fetch(XAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(repairPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      repaired: null,
      parseError: `repair_http_${response.status}`,
      meta: { status: response.status, errorPreview: String(errorText || "").slice(0, 500) },
    };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const { parsed, parseError } = extractFirstJsonObject(content);
  const { normalized, errors } = normalizeTurnResponse(parsed, content);
  if (!parseError) {
    return {
      repaired: normalized,
      parseError: null,
      meta: { normalizationErrors: errors },
    };
  }

  return {
    repaired: null,
    parseError,
    meta: { contentPreview: String(content || "").slice(0, 800) },
  };
}

async function requestOpenAiJsonRepair({ systemPrompt, invalidContent }) {
  if (!OPENAI_REPAIR_ENABLED) {
    return { repaired: null, parseError: "openai_repair_disabled", meta: {} };
  }
  if (!OPENAI_API_KEY) {
    return { repaired: null, parseError: "openai_api_key_missing", meta: {} };
  }

  const payload = {
    model: OPENAI_REPAIR_MODEL,
    temperature: 0,
    max_tokens: AI_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: `${systemPrompt}\n\nYou are now a strict YAML repair engine. Return only valid YAML.`,
      },
      {
        role: "user",
        content: [
          "Repair the malformed turn-response YAML below.",
          "DO NOT CHANGE THE TEXT CONTENT. ONLY FIX YAML SYNTAX AND SHAPE.",
          "DO NOT ADD ANY NEW KEYS OR VALUES. ONLY FIX THE SYNTAX AND SHAPE.",
          "DO NOT REMOVE ANY KEYS OR VALUES. ONLY FIX THE SYNTAX AND SHAPE.",
          "DO NOT CHANGE THE ORDER OF THE KEYS OR VALUES. ONLY FIX THE SYNTAX AND SHAPE.",
          "DO NOT CHANGE THE ORDER OF THE ARRAYS. ONLY FIX THE SYNTAX AND SHAPE.",
          "DO NOT CHANGE THE ORDER OF THE OBJECTS. ONLY FIX THE SYNTAX AND SHAPE.",
          "DO NOT CHANGE THE ORDER OF THE ARRAYS. ONLY FIX THE SYNTAX AND SHAPE.",
          "Return ONLY valid YAML. No markdown, no prose, no code fences.",
          `Use this exact schema and include all sections: ${TURN_RESPONSE_SCHEMA}`,
          "Preserve intent, values, and tone while fixing syntax/shape.",
          `Malformed content to repair:\n${invalidContent}`,
        ].join("\n"),
      },
    ],
  };

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      repaired: null,
      parseError: `openai_repair_http_${response.status}`,
      meta: { status: response.status, errorPreview: String(errorText || "").slice(0, 500) },
    };
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  const { parsed, parseError } = extractFirstJsonObject(content);
  const { normalized, errors } = normalizeTurnResponse(parsed, content);

  if (!parseError) {
    return {
      repaired: normalized,
      parseError: null,
      meta: { normalizationErrors: errors },
    };
  }

  return {
    repaired: null,
    parseError,
    meta: { contentPreview: String(content || "").slice(0, 800) },
  };
}

module.exports = {
  requestJsonRepair,
  requestOpenAiJsonRepair,
};
