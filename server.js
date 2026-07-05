const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const propertyMetaHandler = require("./api/property-meta");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const STATS_FILE = path.join(ROOT, ".data", "click-stats.json");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

  if (requestUrl.pathname === "/stats") {
    serveStatic("/stats.html", res);
    return;
  }

  if (requestUrl.pathname === "/api/property-meta") {
    await runApiHandler(req, res, requestUrl);
    return;
  }

  if (requestUrl.pathname === "/api/track-event") {
    await handleTrackEvent(req, res);
    return;
  }

  if (requestUrl.pathname === "/api/stats") {
    await handleStats(req, res);
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`菁菁房地產顧問工具已啟動：http://127.0.0.1:${PORT}/`);
});

async function runApiHandler(req, res, requestUrl) {
  const query = Object.fromEntries(requestUrl.searchParams.entries());
  const apiReq = {
    method: req.method,
    query,
  };
  const apiRes = createApiResponse(res);

  try {
    await propertyMetaHandler(apiReq, apiRes);
  } catch (error) {
    if (!res.headersSent) {
      apiRes.status(error.statusCode || 500).json({
        error: error.code || "local_api_error",
        message: error.message || "讀取物件資料失敗。",
      });
    }
  }
}

function createApiResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
      return this;
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(data) {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(data));
      return this;
    },
    end(data) {
      res.end(data);
      return this;
    },
  };
}

function serveStatic(pathname, res) {
  const normalizedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(ROOT, normalizedPath));

  if (!filePath.startsWith(ROOT)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
    res.end(content);
  });
}

function sendText(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}

async function handleTrackEvent(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const event = normalizeEvent(payload, req);
    const stats = readStatsFile();
    stats.events.push(event);
    writeStatsFile(stats);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, error.statusCode || 400, {
      error: error.code || "track_failed",
      message: error.message || "無法記錄點擊。",
    });
  }
}

async function handleStats(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const stats = readStatsFile();
  sendJson(res, 200, buildStatsSummary(stats.events));
}

function readStatsFile() {
  try {
    const content = fs.readFileSync(STATS_FILE, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.events)) return parsed;
  } catch {
    // First run has no stats file yet.
  }

  return { events: [] };
}

function writeStatsFile(stats) {
  fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

function normalizeEvent(payload, req) {
  const now = new Date().toISOString();
  const type = cleanText(payload.type).slice(0, 40);
  const allowedTypes = new Set(["page_view", "property_click", "property_like", "phone_click", "line_click"]);

  if (!allowedTypes.has(type)) {
    throw httpError(400, "invalid_event", "未知的統計事件。");
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: now,
    type,
    shareId: cleanText(payload.shareId).slice(0, 80),
    customerName: cleanText(payload.customerName).slice(0, 80),
    summary: cleanText(payload.summary).slice(0, 160),
    propertyTitle: cleanText(payload.propertyTitle).slice(0, 180),
    propertyUrl: cleanUrl(payload.propertyUrl),
    propertyImage: cleanUrl(payload.propertyImage),
    propertyDistrict: cleanText(payload.propertyDistrict).slice(0, 40),
    propertyCommunity: cleanText(payload.propertyCommunity).slice(0, 80),
    propertyPrice: cleanText(payload.propertyPrice).slice(0, 60),
    propertyLayout: cleanText(payload.propertyLayout).slice(0, 60),
    pageUrl: cleanText(payload.pageUrl).slice(0, 400),
    userAgent: cleanText(req.headers["user-agent"]).slice(0, 240),
    ip: cleanText(req.headers["x-forwarded-for"] || req.socket.remoteAddress).split(",")[0].slice(0, 80),
  };
}

function buildStatsSummary(events) {
  const totals = {
    events: events.length,
    pageViews: countType(events, "page_view"),
    propertyClicks: countType(events, "property_click"),
    likes: countType(events, "property_like"),
    phoneClicks: countType(events, "phone_click"),
    lineClicks: countType(events, "line_click"),
  };

  return {
    totals,
    properties: aggregateProperties(events),
    customers: aggregateCustomers(events),
    recent: [...events].reverse().slice(0, 80),
  };
}

function aggregateProperties(events) {
  const map = new Map();

  events
    .filter((event) => event.propertyTitle || event.propertyUrl)
    .forEach((event) => {
      const key = event.propertyUrl || event.propertyTitle;
      const item =
        map.get(key) ||
        {
          title: event.propertyTitle || "未命名物件",
          url: event.propertyUrl,
          image: event.propertyImage,
          district: event.propertyDistrict,
          community: event.propertyCommunity,
          price: event.propertyPrice,
          layout: event.propertyLayout,
          propertyClicks: 0,
          likes: 0,
          lastAt: event.timestamp,
          customers: new Set(),
        };

      if (event.type === "property_click") item.propertyClicks += 1;
      if (event.type === "property_like") item.likes += 1;
      if (event.customerName) item.customers.add(event.customerName);
      if (new Date(event.timestamp) > new Date(item.lastAt)) item.lastAt = event.timestamp;
      map.set(key, item);
    });

  return [...map.values()]
    .map((item) => ({
      ...item,
      customers: [...item.customers],
    }))
    .sort((a, b) => b.likes + b.propertyClicks - (a.likes + a.propertyClicks));
}

function aggregateCustomers(events) {
  const map = new Map();

  events.forEach((event) => {
    const key = event.customerName || "未命名客戶";
    const item =
      map.get(key) ||
      {
        customerName: key,
        pageViews: 0,
        propertyClicks: 0,
        likes: 0,
        phoneClicks: 0,
        lineClicks: 0,
        lastAt: event.timestamp,
      };

    if (event.type === "page_view") item.pageViews += 1;
    if (event.type === "property_click") item.propertyClicks += 1;
    if (event.type === "property_like") item.likes += 1;
    if (event.type === "phone_click") item.phoneClicks += 1;
    if (event.type === "line_click") item.lineClicks += 1;
    if (new Date(event.timestamp) > new Date(item.lastAt)) item.lastAt = event.timestamp;
    map.set(key, item);
  });

  return [...map.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
}

function countType(events, type) {
  return events.filter((event) => event.type === type).length;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 200_000) {
        reject(httpError(413, "payload_too_large", "統計資料太大。"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, "invalid_json", "資料格式不正確。"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanUrl(value) {
  const text = cleanText(value);
  if (!text) return "";

  try {
    const parsed = new URL(text);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
