function buildTargetUrl(req) {
  const backendBase = String(process.env.BACKEND_API_URL || "").trim();
  if (!backendBase) return null;

  const base = backendBase.replace(/\/+$/, "");
  const pathParts = Array.isArray(req.query?.path)
    ? req.query.path
    : typeof req.query?.path === "string"
    ? [req.query.path]
    : [];
  const joinedPath = pathParts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("/");

  const url = new URL(`${base}/${joinedPath}`);
  const params = new URLSearchParams(req.query || {});
  params.delete("path");
  const query = params.toString();
  if (query) url.search = query;
  return url.toString();
}

function buildForwardHeaders(req) {
  const headers = {};
  const blocked = new Set(["host", "connection", "content-length"]);

  Object.entries(req.headers || {}).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    if (blocked.has(lower) || value == null) return;
    headers[key] = Array.isArray(value) ? value.join(",") : String(value);
  });

  return headers;
}

function buildBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.body == null) return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
  return JSON.stringify(req.body);
}

module.exports = async function handler(req, res) {
  const targetUrl = buildTargetUrl(req);
  if (!targetUrl) {
    return res.status(500).json({
      error: "Proxy Misconfigured",
      message: "BACKEND_API_URL is not configured on Vercel.",
    });
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: buildForwardHeaders(req),
      body: buildBody(req),
    });

    const contentType = response.headers.get("content-type") || "application/json";
    res.status(response.status);
    res.setHeader("content-type", contentType);
    const text = await response.text();
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: "Bad Gateway",
      message: "Failed to reach backend service through proxy.",
      detail: error?.message || "unknown_error",
    });
  }
};
