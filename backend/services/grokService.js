const { getDmSystemPrompt } = require("../prompts/characters");
const {
  XAI_API_URL,
  XAI_MODEL,
  XAI_DEBUG,
  XAI_LOG_REQUEST,
  AI_MAX_TOKENS,
  mockTurnResponse,
} = require("./grok/constants");
const { extractFirstJsonObject, normalizeTurnResponse } = require("./grok/normalization");
const { buildTurnUserPrompt } = require("./grok/promptBuilder");
const { requestJsonRepair, requestOpenAiJsonRepair } = require("./grok/repairClients");
const { buildMeta } = require("./grok/meta");

async function generateTurnResponse({ gameState, action }) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_no_api_key",
      meta: buildMeta("mock_no_api_key"),
    };
  }

  const systemPrompt = getDmSystemPrompt(gameState.campaign.dm);
  const userPrompt = buildTurnUserPrompt({ gameState, action });

  const payload = {
    model: XAI_MODEL,
    temperature: 0.7,
    max_output_tokens: AI_MAX_TOKENS,
    // input character limit if needed example max_tokens: 8192
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (XAI_LOG_REQUEST) {
    console.log("[grok:request]", JSON.stringify(payload));
  }

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
      return {
        response: structuredClone(mockTurnResponse),
        source: "mock_api_error",
        meta: buildMeta("mock_api_error", {
          status: response.status,
          errorPreview: String(errorText || "").slice(0, 500),
        }),
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    console.log("[grok:content]", content);
    const contentTrimmed = typeof content === "string" ? content.trim() : "";

    // Always pass model output through OpenAI normalizer first when available.
    // This makes JSON shape/formatting consistent even when Grok output is already "mostly valid".
    if (contentTrimmed) {
      const openAiPrimaryAttempt = await requestOpenAiJsonRepair({
        systemPrompt,
        invalidContent: contentTrimmed,
      });
      if (openAiPrimaryAttempt.repaired) {
        return {
          response: openAiPrimaryAttempt.repaired,
          source: "openai_normalized",
          meta: buildMeta("openai_normalized", {
            openAiPrimary: true,
            openAiParseError: null,
            openAiMeta: openAiPrimaryAttempt.meta,
          }),
        };
      }
    }

    const { parsed, parseError } = extractFirstJsonObject(content);
    const { normalized, errors: normalizationErrors } = normalizeTurnResponse(parsed, content);

    if (!parseError) {
      const source = normalizationErrors.length > 0 ? "grok_normalized" : "grok";
      return {
        response: normalized,
        source,
        meta: buildMeta(source, {
          parseError: null,
          normalizationErrors,
        }),
      };
    }

    if (contentTrimmed) {
      const repairAttempt = await requestJsonRepair({
        apiKey,
        systemPrompt,
        invalidContent: contentTrimmed,
      });

      if (repairAttempt.repaired) {
        return {
          response: repairAttempt.repaired,
          source: "grok_repaired",
          meta: buildMeta("grok_repaired", {
            parseError,
            repairParseError: null,
            repairMeta: repairAttempt.meta,
          }),
        };
      }

      const openAiRepairAttempt = await requestOpenAiJsonRepair({
        systemPrompt,
        invalidContent: contentTrimmed,
      });
      if (openAiRepairAttempt.repaired) {
        return {
          response: openAiRepairAttempt.repaired,
          source: "openai_repaired",
          meta: buildMeta("openai_repaired", {
            parseError,
            grokRepairParseError: repairAttempt.parseError,
            grokRepairMeta: repairAttempt.meta,
            openAiRepairParseError: null,
            openAiRepairMeta: openAiRepairAttempt.meta,
          }),
        };
      }

      return {
        response: {
          dm_narration: "Aizawa sighs. \"Formatting glitch on my end. Repeat that action and I will resolve it cleanly.\"",
          companions_pre: [],
          companions_post: [],
          dice_roll: null,
          trust_changes: [],
          health_changes: [],
          companion_energy_changes: [],
          energy_change: { delta: 0, effort: "low", reason: "Turn formatting failed; no in-world effort applied." },
          item_changes: [],
        },
        source: "grok_text_fallback",
        meta: buildMeta("grok_text_fallback", {
          parseError,
          grokRepairParseError: repairAttempt.parseError,
          grokRepairMeta: repairAttempt.meta,
          openAiRepairParseError: openAiRepairAttempt.parseError,
          openAiRepairMeta: openAiRepairAttempt.meta,
        }),
      };
    }

    const debugMeta = buildMeta("mock_invalid_payload", {
      parseError,
      normalizationErrors,
      contentPreview: String(content).slice(0, 800),
    });

    if (XAI_DEBUG) {
      console.warn("[grok:warn] Invalid model payload details", debugMeta);
    } else {
      console.warn(
        `[grok:warn] Invalid model payload. parseError=${parseError || "none"} normalizationErrors=${normalizationErrors.join(",") || "none"}`
      );
    }

    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_invalid_payload",
      meta: debugMeta,
    };
  } catch (error) {
    console.error("[grok:exception] Failed to call Grok API", error);
    return {
      response: structuredClone(mockTurnResponse),
      source: "mock_exception",
      meta: buildMeta("mock_exception", {
        errorMessage: error?.message || "unknown_exception",
      }),
    };
  }
}

module.exports = {
  generateTurnResponse,
  mockTurnResponse,
};
