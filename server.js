const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const propertyMetaHandler = require("./api/property-meta");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/stats") {
    serveStatic("/stats.html", res);
    return;
  }

  if (requestUrl.pathname === "/api/property-meta") {
    await runApiHandler(req, res, requestUrl);
    return;
  }

  // Public deployment deliberately does not collect customer names, clicks,
  // user agents, or IP addresses. Keep the frontend compatible without storage.
  if (requestUrl.pathname === "/api/track-event") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (requestUrl.pathname === "/api/stats") {
    sendJson(res, 200, {
      totals: {
        events: 0,
        pageViews: 0,
        propertyClicks: 0,
        likes: 0,
        phoneClicks: 0,
        lineClicks: 0,
      },
      properties: [],
      customers: [],
      recent: [],
    });
    return;
  }

  serveStatic(requestUrl.pathname, res);
});

server.listen(PORT, () => {
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
        error: error.code || "metadata_api_error",
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

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(message);
}
