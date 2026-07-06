const crypto = require("crypto");

const ALLOWED_TYPES = new Set([
  "page_view",
  "property_click",
  "property_like",
  "phone_click",
  "line_click",
]);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const type = cleanText(body.type, 40);

    if (!ALLOWED_TYPES.has(type)) {
      res.status(400).json({ error: "invalid_event_type" });
      return;
    }

    const event = {
      id: crypto.randomBytes(9).toString("base64url"),
      timestamp: new Date().toISOString(),
      type,
      shareId: cleanText(body.shareId, 40),
      customerName: cleanText(body.customerName, 80) || "未命名客戶",
      summary: cleanText(body.summary, 240),
      propertyTitle: cleanText(body.propertyTitle, 240),
      propertyUrl: cleanUrl(body.propertyUrl),
      propertyImage: cleanUrl(body.propertyImage),
      propertyDistrict: cleanText(body.propertyDistrict, 80),
      propertyCommunity: cleanText(body.propertyCommunity, 120),
      propertyPrice: cleanText(body.propertyPrice, 80),
      propertyLayout: cleanText(body.propertyLayout, 80),
      pageUrl: cleanUrl(body.pageUrl),
    };

    const { put } = await import("@vercel/blob");
    const date = event.timestamp.slice(0, 10);
    const sortableTime = event.timestamp.replace(/[:.]/g, "-");

    await put(
      `analytics/events/${date}/${sortableTime}-${event.id}.json`,
      JSON.stringify(event),
      {
        access: "private",
        contentType: "application/json; charset=utf-8",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
      },
    );

    res.setHeader("Cache-Control", "no-store");
    res.status(204).end();
  } catch (error) {
    console.error("track-event failed", error);
    res.status(500).json({
      error: "event_store_failed",
      message: "互動紀錄暫時無法儲存。",
    });
  }
};

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString("utf8") || "{}");
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text || "{}");
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanUrl(value) {
  const text = String(value || "").trim().slice(0, 2000);
  if (!text) return "";

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}
