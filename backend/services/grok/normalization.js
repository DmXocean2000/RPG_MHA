const yaml = require("js-yaml");

function scoreTurnCandidate(obj) {
  if (!obj || typeof obj !== "object") return 0;
  const nested = obj.response && typeof obj.response === "object" ? obj.response : {};
  const merged = { ...obj, ...nested };
  let score = 0;
  if (typeof merged.dm_narration === "string" || typeof merged.dmNarration === "string") score += 3;
  if (Array.isArray(merged.companions_pre) || Array.isArray(merged.companionsPre)) score += 2;
  if (Array.isArray(merged.companions_post) || Array.isArray(merged.companionsPost)) score += 2;
  if (Array.isArray(merged.trust_changes) || Array.isArray(merged.trustChanges)) score += 1;
  if ((merged.energy_change && typeof merged.energy_change === "object") || (merged.energyChange && typeof merged.energyChange === "object")) {
    score += 1;
  }
  if (Array.isArray(merged.item_changes) || Array.isArray(merged.itemChanges)) score += 1;
  if (Object.prototype.hasOwnProperty.call(merged, "dice_roll") || Object.prototype.hasOwnProperty.call(merged, "diceRoll")) score += 1;
  if (merged.response && typeof merged.response === "object") score += 1;
  return score;
}

function decodeXmlEntities(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeXmlText(value) {
  if (typeof value !== "string") return "";
  return decodeXmlEntities(value).replace(/\s+/g, " ").trim();
}

function extractTagText(xml, tag) {
  if (typeof xml !== "string") return "";
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? normalizeXmlText(match[1]) : "";
}

function extractTagBlocks(xml, tag) {
  if (typeof xml !== "string") return [];
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return Array.from(xml.matchAll(regex)).map((entry) => entry[1]);
}

function parseCompanionList(xml, sectionTag) {
  const sectionBlocks = extractTagBlocks(xml, sectionTag);
  if (sectionBlocks.length === 0) return [];
  return sectionBlocks
    .flatMap((section) => extractTagBlocks(section, "companion"))
    .map((companionBlock) => ({
      name: extractTagText(companionBlock, "name"),
      text: extractTagText(companionBlock, "text"),
    }))
    .filter((entry) => entry.name || entry.text);
}

function parseChangeList(xml, sectionTag) {
  const sectionBlocks = extractTagBlocks(xml, sectionTag);
  if (sectionBlocks.length === 0) return [];
  return sectionBlocks
    .flatMap((section) => extractTagBlocks(section, "change"))
    .map((changeBlock) => ({
      target: extractTagText(changeBlock, "target"),
      name: extractTagText(changeBlock, "name"),
      delta: extractTagText(changeBlock, "delta"),
      reason: extractTagText(changeBlock, "reason"),
    }))
    .filter((entry) => entry.name || entry.delta || entry.reason || entry.target);
}

function parseDiceRoll(xml) {
  const diceBlocks = extractTagBlocks(xml, "dice_roll");
  if (diceBlocks.length === 0) return null;
  const block = diceBlocks[0];
  const compact = normalizeXmlText(block).toLowerCase();
  if (!compact || compact === "null") return null;

  return {
    type: extractTagText(block, "type"),
    dc: extractTagText(block, "dc"),
    result: extractTagText(block, "result"),
  };
}

function parseTurnResponseXml(xmlChunk) {
  if (typeof xmlChunk !== "string" || !xmlChunk.trim()) return null;

  const parsed = {
    dm_narration: extractTagText(xmlChunk, "dm_narration"),
    companions_pre: parseCompanionList(xmlChunk, "companions_pre"),
    companions_post: parseCompanionList(xmlChunk, "companions_post"),
    dice_roll: parseDiceRoll(xmlChunk),
    trust_changes: parseChangeList(xmlChunk, "trust_changes").map((entry) => ({
      name: entry.name,
      delta: entry.delta,
      reason: entry.reason,
    })),
    health_changes: parseChangeList(xmlChunk, "health_changes").map((entry) => ({
      target: entry.target,
      name: entry.name,
      delta: entry.delta,
      reason: entry.reason,
    })),
    companion_energy_changes: parseChangeList(xmlChunk, "companion_energy_changes").map((entry) => ({
      name: entry.name,
      delta: entry.delta,
      reason: entry.reason,
    })),
    item_changes: parseChangeList(xmlChunk, "item_changes").map((entry) => ({
      name: entry.name,
      delta: entry.delta,
      reason: entry.reason,
    })),
    energy_change: (() => {
      const energyBlocks = extractTagBlocks(xmlChunk, "energy_change");
      if (energyBlocks.length === 0) return null;
      const block = energyBlocks[0];
      return {
        delta: extractTagText(block, "delta"),
        effort: extractTagText(block, "effort"),
        reason: extractTagText(block, "reason"),
      };
    })(),
  };

  const hasKnownField =
    parsed.dm_narration ||
    parsed.companions_pre.length > 0 ||
    parsed.companions_post.length > 0 ||
    parsed.trust_changes.length > 0 ||
    parsed.health_changes.length > 0 ||
    parsed.companion_energy_changes.length > 0 ||
    parsed.item_changes.length > 0 ||
    parsed.energy_change ||
    parsed.dice_roll;

  return hasKnownField ? parsed : null;
}

function extractFirstXmlObject(rawText) {
  if (typeof rawText !== "string") return { parsed: null, parseError: "content_not_string" };
  const text = rawText.trim();
  const rootMatches = Array.from(text.matchAll(/<turn_response\b[^>]*>[\s\S]*?<\/turn_response>/gi));
  const candidates = rootMatches.map((entry) => entry[0]).filter(Boolean);

  if (candidates.length === 0) {
    return { parsed: null, parseError: "xml_turn_response_not_found" };
  }

  const parsedCandidates = candidates
    .map((chunk) => ({ chunk, parsed: parseTurnResponseXml(chunk) }))
    .filter((entry) => entry.parsed);

  if (parsedCandidates.length === 0) {
    return { parsed: null, parseError: "xml_parse_failed" };
  }

  parsedCandidates.sort((a, b) => b.chunk.length - a.chunk.length);
  return { parsed: parsedCandidates[0].parsed, parseError: null };
}

function extractTurnResponseFromYamlDoc(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (doc.turn_response && typeof doc.turn_response === "object") return doc.turn_response;
  if (doc.response && typeof doc.response === "object") {
    if (doc.response.turn_response && typeof doc.response.turn_response === "object") return doc.response.turn_response;
    return doc.response;
  }
  return doc;
}

function extractFirstYamlObject(rawText) {
  if (typeof rawText !== "string") return { parsed: null, parseError: "content_not_string" };
  const text = rawText.trim();
  if (!text) return { parsed: null, parseError: "yaml_empty_content" };

  const candidates = new Set([text]);
  const fencedMatch = text.match(/```(?:yaml|yml)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) candidates.add(fencedMatch[1].trim());
  const turnIdx = text.toLowerCase().indexOf("turn_response:");
  if (turnIdx >= 0) candidates.add(text.slice(turnIdx).trim());

  const parsedCandidates = [];
  for (const candidateText of candidates) {
    const docs = [];
    try {
      yaml.loadAll(candidateText, (doc) => docs.push(doc));
    } catch {
      continue;
    }
    for (const doc of docs) {
      const parsed = extractTurnResponseFromYamlDoc(doc);
      if (parsed && typeof parsed === "object") {
        parsedCandidates.push({
          parsed,
          score: scoreTurnCandidate(parsed),
          length: candidateText.length,
        });
      }
    }
  }

  if (parsedCandidates.length === 0) {
    return { parsed: null, parseError: "yaml_parse_failed" };
  }

  parsedCandidates.sort((a, b) => b.score - a.score || b.length - a.length);
  return { parsed: parsedCandidates[0].parsed, parseError: null };
}

function extractFirstJsonObject(rawText) {
  if (typeof rawText !== "string") return { parsed: null, parseError: "content_not_string" };
  const yamlAttempt = extractFirstYamlObject(rawText);
  if (!yamlAttempt.parseError) {
    return yamlAttempt;
  }

  const xmlAttempt = extractFirstXmlObject(rawText);
  if (!xmlAttempt.parseError) {
    return xmlAttempt;
  }

  const candidates = [];
  const text = rawText.trim();
  const tryParseJson = (jsonText) => {
    try {
      return JSON.parse(jsonText);
    } catch {
      return null;
    }
  };

  const attemptCommonJsonRepairs = (jsonText) => {
    const variants = new Set();
    variants.add(jsonText);

    variants.add(jsonText.replace(/("text"\s*:\s*"(?:(?:\\.)|[^"\\])*")\s*(\])/g, "$1}$2"));
    variants.add(jsonText.replace(/}\s*,\s*"name"\s*:/g, '},{"name":'));
    variants.add(jsonText.replace(/}\s*"name"\s*:/g, '},{"name":'));
    variants.add(jsonText.replace(/,\s*([}\]])/g, "$1"));
    variants.add(jsonText.replace(/""(?=\s*[}\],])/g, '"'));

    variants.add(
      jsonText
        .replace(/("text"\s*:\s*"(?:(?:\\.)|[^"\\])*")\s*(\])/g, "$1}$2")
        .replace(/}\s*,\s*"name"\s*:/g, '},{"name":')
        .replace(/}\s*"name"\s*:/g, '},{"name":')
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/""(?=\s*[}\],])/g, '"')
    );

    for (const variant of variants) {
      const parsed = tryParseJson(variant);
      if (parsed) return parsed;
    }
    return null;
  };

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < text.length; j += 1) {
      const ch = text[j];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const chunk = text.slice(i, j + 1);
          try {
            const parsed = JSON.parse(chunk);
            candidates.push({ parsed, score: scoreTurnCandidate(parsed), length: chunk.length, start: i });
          } catch {
            const repairedChunk = attemptCommonJsonRepairs(chunk);
            if (repairedChunk) {
              candidates.push({
                parsed: repairedChunk,
                score: scoreTurnCandidate(repairedChunk),
                length: chunk.length,
                start: i,
              });
            }
          }
          break;
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || b.length - a.length || b.start - a.start);
    return { parsed: candidates[0].parsed, parseError: null };
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return { parsed: null, parseError: "json_braces_not_found" };
  const sliced = text.slice(start, end + 1);
  const direct = tryParseJson(sliced);
  if (direct) return { parsed: direct, parseError: null };
  const repaired = attemptCommonJsonRepairs(sliced);
  if (repaired) return { parsed: repaired, parseError: "json_repaired_common_pattern" };

  try {
    return { parsed: JSON.parse(sliced), parseError: null };
  } catch (error) {
    return { parsed: null, parseError: `json_parse_error:${error?.message || "unknown"}` };
  }
}

function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCompanionArray(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => ({
      name: typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : "companion",
      text: typeof entry.text === "string" && entry.text.trim() ? entry.text.trim() : "...",
    }));
}

function normalizeTrustChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.name && entry.delta !== 0);
}

function normalizeItemChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.trim().toLowerCase() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.name && entry.delta !== 0);
}

function normalizeHealthChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const targetRaw = typeof entry.target === "string" ? entry.target.trim().toLowerCase() : "";
      const target = targetRaw === "player" || targetRaw === "companion" ? targetRaw : "player";
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { target, name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.delta !== 0 && (entry.target === "player" || entry.name));
}

function normalizeCompanionEnergyChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const delta = toFiniteNumber(entry.delta);
      const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
      return { name, delta: delta ?? 0, reason };
    })
    .filter((entry) => entry.name && entry.delta !== 0);
}

function normalizeEnergyChange(value) {
  if (!value || typeof value !== "object") {
    return {
      delta: 0,
      effort: "low",
      reason: "",
    };
  }

  const delta = toFiniteNumber(value.delta);
  const effortRaw = typeof value.effort === "string" ? value.effort.trim().toLowerCase() : "";
  const effort = ["low", "medium", "high"].includes(effortRaw) ? effortRaw : "medium";
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";

  return {
    delta: delta ?? 0,
    effort,
    reason: reason || "No significant energy change.",
  };
}

function normalizeTurnResponse(candidate, rawContent) {
  const errors = [];
  const base = candidate && typeof candidate === "object" ? candidate : {};
  const nested = base.response && typeof base.response === "object" ? base.response : {};
  const data = { ...base, ...nested };
  const contentText = typeof rawContent === "string" ? rawContent.trim() : "";

  const narration =
    typeof data.dm_narration === "string" && data.dm_narration.trim()
      ? data.dm_narration.trim()
      : typeof data.dmNarration === "string" && data.dmNarration.trim()
      ? data.dmNarration.trim()
      : contentText || "The DM pauses, waiting for your next move.";

  if (!((typeof data.dm_narration === "string" && data.dm_narration.trim()) || (typeof data.dmNarration === "string" && data.dmNarration.trim()))) {
    errors.push("dm_narration_missing_or_empty");
  }

  const companionsPre = normalizeCompanionArray(data.companions_pre || data.companionsPre);
  const companionsPost = normalizeCompanionArray(data.companions_post || data.companionsPost);
  const trustChanges = normalizeTrustChanges(data.trust_changes || data.trustChanges);
  const healthChanges = normalizeHealthChanges(data.health_changes || data.healthChanges);
  const companionEnergyChanges = normalizeCompanionEnergyChanges(
    data.companion_energy_changes || data.companionEnergyChanges
  );
  const itemChanges = normalizeItemChanges(data.item_changes || data.itemChanges);
  const energyChange = normalizeEnergyChange(data.energy_change || data.energyChange);

  let diceRoll = null;
  const diceCandidate = data.dice_roll && typeof data.dice_roll === "object" ? data.dice_roll : data.diceRoll;
  if (diceCandidate && typeof diceCandidate === "object") {
    const type = typeof diceCandidate.type === "string" && diceCandidate.type.trim() ? diceCandidate.type : "check";
    const dc = toFiniteNumber(diceCandidate.dc);
    const result = toFiniteNumber(diceCandidate.result);

    if (dc !== null && result !== null) {
      diceRoll = { type, dc, result };
    } else {
      errors.push("dice_roll_invalid_or_non_numeric");
    }
  }

  const normalized = {
    dm_narration: narration,
    companions_pre: companionsPre,
    companions_post: companionsPost,
    dice_roll: diceRoll,
    trust_changes: trustChanges,
    health_changes: healthChanges,
    companion_energy_changes: companionEnergyChanges,
    item_changes: itemChanges,
    energy_change: energyChange,
  };

  return { normalized, errors };
}

module.exports = {
  extractFirstJsonObject,
  normalizeTurnResponse,
};
