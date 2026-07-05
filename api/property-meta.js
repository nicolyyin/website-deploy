const MAX_HTML_BYTES = 4_000_000;
const FETCH_TIMEOUT_MS = 12000;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  try {
    const target = normalizeRequestUrl(req.query?.url);
    const htmlResponse = await fetchHtml(target);
    const meta = extractPropertyMeta(htmlResponse.html, htmlResponse.finalUrl);

    if (!isUsablePropertyMeta(meta)) {
      res.status(422).json({
        error: "metadata_not_found",
        message: "無法從此網址讀取完整標題與圖片。",
        finalUrl: htmlResponse.finalUrl,
        title: meta.title || "",
        image: meta.image || "",
      });
      return;
    }

    res.status(200).json({
      title: meta.title,
      image: meta.image,
      images: meta.images,
      details: meta.details,
      finalUrl: htmlResponse.finalUrl,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.code || "metadata_fetch_failed",
      message: error.message || "讀取物件資料失敗。",
    });
  }
};

function normalizeRequestUrl(value) {
  if (!value || typeof value !== "string") {
    throw httpError(400, "missing_url", "缺少網址。");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw httpError(400, "invalid_url", "網址格式不正確。");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw httpError(400, "invalid_protocol", "只支援 http 或 https 網址。");
  }

  return parsed.toString();
}

async function fetchHtml(target) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.6",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw httpError(response.status, "upstream_error", `物件頁回應 ${response.status}。`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw httpError(415, "unsupported_content", "此網址不是可解析的網頁。");
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_BYTES) {
      throw httpError(413, "html_too_large", "物件頁內容太大，無法解析。");
    }

    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) {
      throw httpError(413, "html_too_large", "物件頁內容太大，無法解析。");
    }

    return {
      finalUrl: response.url || target,
      html,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractPropertyMeta(html, finalUrl) {
  const title = cleanTitle(
    firstMetaContent(html, ["og:title", "twitter:title", "title", "name"]) ||
    firstJsonLdValue(html, "name") ||
    firstTitle(html) ||
      "",
  );
  const images = uniqueUrls(
    [
      ...metaImageCandidates(html),
      ...jsonLdImages(html),
      ...linkImageCandidates(html),
    ]
      .map((value) => absolutizeUrl(value, finalUrl))
      .filter(Boolean),
  ).filter((value) => !isBadImageUrl(value));
  const text = pageText(html);

  return {
    title,
    image: images[0] || "",
    images: images.slice(0, 8),
    details: extractPropertyDetails(text, title),
  };
}

function extractPropertyDetails(text, title) {
  const address = extractAddress(text, title);

  return compactObject({
    address,
    district: extractDistrict(address),
    price: labelValue(text, "總價"),
    area: labelValue(text, "建坪"),
    layout: labelValue(text, "格局"),
    type: labelValue(text, "型態"),
    floor: labelValue(text, "樓層"),
    age: labelValue(text, "屋齡"),
    community: labelValue(text, "社區"),
    parking: labelValue(text, "車位"),
    parkingType: labelValue(text, "停車方式"),
    school: joinValues([labelValue(text, "小學學區"), labelValue(text, "國中學區")]),
    description: shortDescription(labelValue(text, "房屋描述")),
  });
}

function extractDistrict(address) {
  const match = String(address || "").match(/[^\s縣市]{1,6}區/);
  return match ? match[0] : "";
}

function extractAddress(text, title) {
  const priceIndex = findLabelIndex(text, "總價", 0);
  if (priceIndex < 0) return "";

  const beforePrice = text.slice(0, priceIndex).trim();
  const withoutPrefix = beforePrice.replace(/^物件分享\s*/, "");
  const afterTitle = title && withoutPrefix.includes(title) ? withoutPrefix.slice(withoutPrefix.indexOf(title) + title.length) : withoutPrefix;

  return afterTitle.replace(/\s+\d{4,}\s*$/, "").trim();
}

const DETAIL_LABELS = [
  "總價",
  "建坪",
  "格局",
  "屋況",
  "單價",
  "登記用途",
  "朝向",
  "型態",
  "樓層",
  "屋齡",
  "社區",
  "車位",
  "停車方式",
  "車位編號",
  "小學學區",
  "國中學區",
  "管理費",
  "停車管理費",
  "謄本資料",
  "建物總坪",
  "土地坪數",
  "登記日期",
  "持有期間",
  "房屋描述",
  "地圖",
];

function labelValue(text, label) {
  const start = findLabelIndex(text, label, 0);
  if (start < 0) return "";

  const valueStart = start + label.length;
  const end = nextLabelIndex(text, valueStart, label);
  return text.slice(valueStart, end < 0 ? undefined : end).trim();
}

function findLabelIndex(text, label, fromIndex) {
  const escaped = escapeRegExp(label);
  const pattern = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g");
  pattern.lastIndex = fromIndex;
  const match = pattern.exec(text);
  if (!match) return -1;
  return match.index + match[1].length;
}

function nextLabelIndex(text, fromIndex, currentLabel) {
  return DETAIL_LABELS.filter((label) => label !== currentLabel).reduce((best, label) => {
    const index = findLabelIndex(text, label, fromIndex);
    if (index < 0) return best;
    return best < 0 || index < best ? index : best;
  }, -1);
}

function shortDescription(value) {
  return String(value || "").trim().slice(0, 120);
}

function joinValues(values) {
  return values.filter(Boolean).join(" / ");
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => Boolean(value)));
}

function isUsablePropertyMeta(meta) {
  return Boolean(meta?.title && meta?.image && !isBadTitle(meta.title) && !isBadImageUrl(meta.image));
}

function isBadTitle(title) {
  return /^(error|access denied|forbidden|not found)\b|request could not be satisfied|temporarily unavailable|just a moment|attention required|cloudfront/i.test(
    String(title || "").trim(),
  );
}

function isBadImageUrl(image) {
  const value = String(image || "").toLowerCase();

  return (
    !value ||
    value.includes("favicon") ||
    value.includes("gstatic.com/favicon") ||
    value.includes("googleusercontent.com/favicon") ||
    /\/logo[^/]*\.(svg|png|jpe?g|webp)(?:\?|$)/i.test(value)
  );
}

function metaImageCandidates(html) {
  const names = [
    "og:image",
    "og:image:url",
    "og:image:secure_url",
    "twitter:image",
    "twitter:image:src",
    "image",
    "thumbnail",
  ];

  return metaTags(html)
    .map((tag) => {
      const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop") || "").toLowerCase();
      if (!names.includes(key)) return "";
      return attr(tag, "content") || "";
    })
    .filter(Boolean);
}

function linkImageCandidates(html) {
  return linkTags(html)
    .map((tag) => {
      const rel = (attr(tag, "rel") || "").toLowerCase();
      const as = (attr(tag, "as") || "").toLowerCase();
      if (!rel.includes("image_src") && !(rel.includes("preload") && as === "image")) return "";
      return attr(tag, "href") || "";
    })
    .filter(Boolean);
}

function firstMetaContent(html, names) {
  const wanted = names.map((name) => name.toLowerCase());

  for (const tag of metaTags(html)) {
    const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop") || "").toLowerCase();
    if (wanted.includes(key)) {
      const value = attr(tag, "content");
      if (value) return decodeHtml(value);
    }
  }

  return "";
}

function firstTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(stripTags(match[1])) : "";
}

function firstJsonLdValue(html, keyName) {
  for (const block of jsonLdBlocks(html)) {
    const value = findJsonLdValue(block, keyName);
    if (typeof value === "string" && value.trim()) return decodeHtml(value.trim());
  }

  return "";
}

function jsonLdImages(html) {
  const images = [];

  for (const block of jsonLdBlocks(html)) {
    collectJsonLdImages(block, images);
  }

  return images;
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    try {
      blocks.push(JSON.parse(decodeHtml(match[1]).trim()));
    } catch {
      // Ignore malformed structured data; Open Graph tags usually cover these pages.
    }
  }

  return blocks;
}

function findJsonLdValue(value, keyName) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdValue(item, keyName);
      if (found) return found;
    }
    return "";
  }

  if (typeof value[keyName] === "string") return value[keyName];

  for (const child of Object.values(value)) {
    const found = findJsonLdValue(child, keyName);
    if (found) return found;
  }

  return "";
}

function collectJsonLdImages(value, images) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdImages(item, images));
    return;
  }

  const image = value.image || value.photo || value.thumbnailUrl;
  if (typeof image === "string") images.push(image);
  if (Array.isArray(image)) image.forEach((item) => collectJsonLdImages({ image: item }, images));
  if (image && typeof image === "object") {
    if (typeof image.url === "string") images.push(image.url);
    if (typeof image.contentUrl === "string") images.push(image.contentUrl);
  }

  Object.values(value).forEach((child) => collectJsonLdImages(child, images));
}

function metaTags(html) {
  return html.match(/<meta\b[^>]*>/gi) || [];
}

function linkTags(html) {
  return html.match(/<link\b[^>]*>/gi) || [];
}

function attr(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  const match = tag.match(pattern);
  return match ? decodeHtml(match[2]) : "";
}

function absolutizeUrl(value, baseUrl) {
  if (!value || typeof value !== "string") return "";

  try {
    const parsed = new URL(value.trim(), baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function uniqueUrls(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanTitle(value) {
  return decodeHtml(stripTags(value))
    .replace(/\s+/g, " ")
    .replace(/\s*[|｜]\s*(永慶房屋|有巢氏房屋|591房屋交易|信義房屋).*$/i, "")
    .trim();
}

function pageText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
