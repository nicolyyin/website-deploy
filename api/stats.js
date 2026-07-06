const crypto = require("crypto");

const EVENT_PREFIX = "analytics/events/";
const MAX_EVENTS = 5000;
const READ_BATCH_SIZE = 24;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const configuredKey = String(process.env.STATS_ADMIN_KEY || "");
  if (!configuredKey) {
    res.status(503).json({
      error: "stats_key_not_configured",
      message: "尚未設定統計後台密碼 STATS_ADMIN_KEY。",
    });
    return;
  }

  const suppliedKey = readBearerToken(req);
  if (!safeEqual(suppliedKey, configuredKey)) {
    res.status(401).json({
      error: "unauthorized",
      message: "後台密碼不正確。",
    });
    return;
  }

  try {
    const days = normalizeDays(req.query?.days);
    const since = days ? Date.now() - days * 86400000 : 0;
    const blobs = await listEventBlobs();
    const events = (await readEvents(blobs))
      .filter((event) => event && (!since || new Date(event.timestamp).getTime() >= since))
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

    res.status(200).json({
      ...aggregateEvents(events),
      periodDays: days,
      storedEvents: blobs.length,
      truncated: blobs.length >= MAX_EVENTS,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("stats read failed", error);
    res.status(500).json({
      error: "stats_read_failed",
      message: "統計資料暫時無法讀取，請稍後再試。",
    });
  }
};

async function listEventBlobs() {
  const { list } = await import("@vercel/blob");
  const blobs = [];
  let cursor;

  do {
    const result = await list({
      prefix: EVENT_PREFIX,
      limit: Math.min(1000, MAX_EVENTS - blobs.length),
      cursor,
    });

    blobs.push(...(result.blobs || []));
    cursor = result.hasMore && blobs.length < MAX_EVENTS ? result.cursor : undefined;
  } while (cursor && blobs.length < MAX_EVENTS);

  return blobs.slice(-MAX_EVENTS);
}

async function readEvents(blobs) {
  const { get } = await import("@vercel/blob");
  const events = [];

  for (let start = 0; start < blobs.length; start += READ_BATCH_SIZE) {
    const batch = blobs.slice(start, start + READ_BATCH_SIZE);
    const values = await Promise.all(
      batch.map(async (blob) => {
        try {
          const result = await get(blob.pathname, { access: "private" });
          if (!result || result.statusCode !== 200 || !result.stream) return null;
          const text = await new Response(result.stream).text();
          return JSON.parse(text);
        } catch {
          return null;
        }
      }),
    );
    events.push(...values.filter(Boolean));
  }

  return events;
}

function aggregateEvents(events) {
  const totals = {
    events: events.length,
    customers: 0,
    properties: 0,
    pageViews: 0,
    propertyClicks: 0,
    likes: 0,
    phoneClicks: 0,
    lineClicks: 0,
  };
  const propertyMap = new Map();
  const customerMap = new Map();

  events.forEach((event) => {
    incrementTotals(totals, event.type);

    const customerKey = event.shareId || `name:${event.customerName || "未命名客戶"}`;
    if (!customerMap.has(customerKey)) {
      customerMap.set(customerKey, {
        shareId: event.shareId || "",
        customerName: event.customerName || "未命名客戶",
        summary: event.summary || "",
        pageViews: 0,
        propertyClicks: 0,
        likes: 0,
        phoneClicks: 0,
        lineClicks: 0,
        firstAt: event.timestamp,
        lastAt: event.timestamp,
        propertyMap: new Map(),
      });
    }

    const customer = customerMap.get(customerKey);
    customer.customerName = event.customerName || customer.customerName;
    customer.summary = event.summary || customer.summary;
    customer.firstAt = earlierDate(customer.firstAt, event.timestamp);
    customer.lastAt = laterDate(customer.lastAt, event.timestamp);
    incrementTotals(customer, event.type);

    const hasProperty = Boolean(event.propertyUrl || event.propertyTitle);
    if (!hasProperty) return;

    const propertyKey = event.propertyUrl || `title:${event.propertyTitle}`;
    if (!propertyMap.has(propertyKey)) {
      propertyMap.set(propertyKey, createPropertyRecord(event));
    }
    updatePropertyRecord(propertyMap.get(propertyKey), event);

    if (!customer.propertyMap.has(propertyKey)) {
      customer.propertyMap.set(propertyKey, createPropertyRecord(event));
    }
    updatePropertyRecord(customer.propertyMap.get(propertyKey), event);
  });

  const customers = [...customerMap.values()]
    .map((customer) => ({
      shareId: customer.shareId,
      customerName: customer.customerName,
      summary: customer.summary,
      pageViews: customer.pageViews,
      propertyClicks: customer.propertyClicks,
      likes: customer.likes,
      phoneClicks: customer.phoneClicks,
      lineClicks: customer.lineClicks,
      firstAt: customer.firstAt,
      lastAt: customer.lastAt,
      properties: [...customer.propertyMap.values()]
        .filter((property) => property.propertyClicks || property.likes)
        .sort((a, b) => b.propertyClicks - a.propertyClicks || b.likes - a.likes),
    }))
    .sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));

  const properties = [...propertyMap.values()]
    .filter((property) => property.propertyClicks || property.likes)
    .sort((a, b) => b.propertyClicks - a.propertyClicks || b.likes - a.likes);

  totals.customers = customers.length;
  totals.properties = properties.length;

  return {
    totals,
    customers,
    properties,
    recent: events.slice(0, 120),
  };
}

function createPropertyRecord(event) {
  return {
    title: event.propertyTitle || "未命名物件",
    url: event.propertyUrl || "",
    image: event.propertyImage || "",
    district: event.propertyDistrict || "",
    community: event.propertyCommunity || "",
    price: event.propertyPrice || "",
    layout: event.propertyLayout || "",
    propertyClicks: 0,
    likes: 0,
    customers: [],
    firstAt: event.timestamp,
    lastAt: event.timestamp,
  };
}

function updatePropertyRecord(property, event) {
  property.title = event.propertyTitle || property.title;
  property.url = event.propertyUrl || property.url;
  property.image = event.propertyImage || property.image;
  property.district = event.propertyDistrict || property.district;
  property.community = event.propertyCommunity || property.community;
  property.price = event.propertyPrice || property.price;
  property.layout = event.propertyLayout || property.layout;
  property.firstAt = earlierDate(property.firstAt, event.timestamp);
  property.lastAt = laterDate(property.lastAt, event.timestamp);

  if (event.type === "property_click") property.propertyClicks += 1;
  if (event.type === "property_like") property.likes += 1;
  if (event.customerName && !property.customers.includes(event.customerName)) {
    property.customers.push(event.customerName);
  }
}

function incrementTotals(target, type) {
  if (type === "page_view") target.pageViews += 1;
  if (type === "property_click") target.propertyClicks += 1;
  if (type === "property_like") target.likes += 1;
  if (type === "phone_click") target.phoneClicks += 1;
  if (type === "line_click") target.lineClicks += 1;
}

function readBearerToken(req) {
  const header = String(req.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeDays(value) {
  const days = Number(value || 30);
  if (days === 0) return 0;
  return [7, 30, 90, 365].includes(days) ? days : 30;
}

function earlierDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(a) < String(b) ? a : b;
}

function laterDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(a) > String(b) ? a : b;
}
