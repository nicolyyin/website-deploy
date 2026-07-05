const crypto = require("crypto");

const MAX_BODY_BYTES = 350_000;
const MAX_LISTINGS = 60;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "POST") {
    await createProposal(req, res);
    return;
  }

  if (req.method === "GET") {
    await readProposal(req, res);
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
};

async function createProposal(req, res) {
  try {
    const payload = parseBody(req.body);
    validatePayload(payload);

    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
      res.status(413).json({ error: "proposal_too_large", message: "提案資料過大，請減少物件數量。" });
      return;
    }

    const { put } = await import("@vercel/blob");
    let id = "";
    let saved = false;
    let lastError;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      id = crypto.randomBytes(7).toString("base64url");
      try {
        await put(`proposals/${id}.json`, serialized, {
          access: "private",
          contentType: "application/json; charset=utf-8",
          addRandomSuffix: false,
          cacheControlMaxAge: 60,
        });
        saved = true;
        break;
      } catch (error) {
        lastError = error;
        if (!isPathConflict(error)) break;
      }
    }

    if (!saved) throw lastError || new Error("proposal_save_failed");

    res.status(200).json({ id, path: `/p/${id}` });
  } catch (error) {
    const notConfigured = /token|credential|store/i.test(String(error?.message || ""));
    res.status(notConfigured ? 503 : 500).json({
      error: notConfigured ? "blob_not_configured" : "proposal_save_failed",
      message: notConfigured
        ? "尚未連接 Vercel Blob 儲存空間。"
        : "提案暫時無法儲存，請稍後再試。",
    });
  }
}

async function readProposal(req, res) {
  const id = String(req.query?.id || "").trim();
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(id)) {
    res.status(400).json({ error: "invalid_proposal_id", message: "提案代碼格式不正確。" });
    return;
  }

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(`proposals/${id}.json`, { access: "private" });

    if (!result || result.statusCode !== 200 || !result.stream) {
      res.status(404).json({ error: "proposal_not_found", message: "找不到這份提案。" });
      return;
    }

    const text = await new Response(result.stream).text();
    const payload = JSON.parse(text);
    res.status(200).json(payload);
  } catch (error) {
    const notFound = /not found|BlobNotFound/i.test(String(error?.name || "") + String(error?.message || ""));
    res.status(notFound ? 404 : 500).json({
      error: notFound ? "proposal_not_found" : "proposal_read_failed",
      message: notFound ? "找不到這份提案。" : "提案暫時無法讀取，請稍後再試。",
    });
  }
}

function parseBody(body) {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8"));
  if (typeof body === "string") return JSON.parse(body);
  throw new Error("invalid_body");
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.listings)) {
    throw new Error("invalid_payload");
  }
  if (!payload.listings.length || payload.listings.length > MAX_LISTINGS) {
    throw new Error("invalid_listing_count");
  }
}

function isPathConflict(error) {
  const message = String(error?.message || "");
  return /already exists|conflict|409/i.test(message);
}
