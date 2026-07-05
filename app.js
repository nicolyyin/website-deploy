const DEFAULTS = {
  customerName: "黃小姐",
  summary: "北屯三房平車，近捷運與學區",
  topTag: "菁菁精選",
  signature: "尹菁菁",
  agentName: "尹菁菁",
  licenseNo: "115登字第502348號",
  phone: "0910-692-946",
  lineId: "nicolyyin",
};

const PROPERTY_PLACEHOLDER = {
  src: "./assets/property-placeholder.svg",
  alt: "物件照片讀取中",
};

const AGENT_PORTRAIT_SRC = "./assets/jingjing-portrait.png";

const SAMPLE_TEXT = `水湳經貿三房平車
https://x.ychouse.tw/a12B3

十期重劃區採光三房 https://example.com/listing/taichung-1001

潭子車站低總價兩房
https://www.591.com.tw/home/house/detail/2/12345678.html`;

const state = {
  listings: [],
  metaCache: new Map(),
  overrides: new Map(),
  lastShareLink: "",
  shareContext: null,
  shareTrackingBound: false,
  shareViewTracked: false,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  const token = getShareToken();
  if (token) {
    renderShareRoute(token);
    return;
  }

  cacheElements();
  bindEvents();
  syncListings();
  renderPreview();
  activateIcons();
});

function cacheElements() {
  Object.assign(els, {
    app: document.querySelector("#app"),
    form: document.querySelector("#generatorForm"),
    customerName: document.querySelector("#customerName"),
    summary: document.querySelector("#summary"),
    rawListings: document.querySelector("#rawListings"),
    topTag: document.querySelector("#topTag"),
    signature: document.querySelector("#signature"),
    agentName: document.querySelector("#agentName"),
    licenseNo: document.querySelector("#licenseNo"),
    phone: document.querySelector("#phone"),
    lineId: document.querySelector("#lineId"),
    listingEditor: document.querySelector("#listingEditor"),
    listingCount: document.querySelector("#listingCount"),
    previewSurface: document.querySelector("#previewSurface"),
    previewNotesButton: document.querySelector("#previewNotesButton"),
    generateButton: document.querySelector("#generateButton"),
    copyButton: document.querySelector("#copyButton"),
    downloadButton: document.querySelector("#downloadButton"),
    openPageButton: document.querySelector("#openPageButton"),
    shareBox: document.querySelector("#shareBox"),
    shareLink: document.querySelector("#shareLink"),
    sampleButton: document.querySelector("#sampleButton"),
  });
}

function bindEvents() {
  els.rawListings.addEventListener("input", () => {
    syncListings();
    renderPreview();
  });

  [
    els.customerName,
    els.summary,
    els.topTag,
    els.signature,
    els.agentName,
    els.licenseNo,
    els.phone,
    els.lineId,
  ].forEach((input) => input.addEventListener("input", renderPreview));

  els.listingEditor.addEventListener("input", (event) => {
    const row = event.target.closest("[data-url]");
    if (!row) return;

    const override = state.overrides.get(row.dataset.url) || {};
    if (event.target.name === "note") override.note = event.target.value;
    state.overrides.set(row.dataset.url, override);

    const listing = state.listings.find((item) => item.url === row.dataset.url);
    if (listing) {
      listing.note = override.note || "";
    }

    renderPreview();
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    revealShareLink();
  });

  els.copyButton.addEventListener("click", async () => {
    const link = revealShareLink();
    await copyText(link);
    showToast("分享連結已複製");
  });

  els.downloadButton.addEventListener("click", () => {
    const payload = buildPayload();
    const html = buildStandaloneHtml(payload);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(payload.customerName)}-推薦頁.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("HTML 已準備下載");
  });

  els.openPageButton.addEventListener("click", () => {
    const link = revealShareLink();
    window.open(link, "_blank", "noopener,noreferrer");
  });

  els.previewNotesButton.addEventListener("click", () => {
    if (!state.listings.length) {
      els.rawListings.focus();
      return;
    }

    els.listingEditor.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstNote = els.listingEditor.querySelector('textarea[name="note"]');
    if (firstNote) firstNote.focus({ preventScroll: true });
  });

  els.sampleButton.addEventListener("click", () => {
    els.customerName.value = "林先生";
    els.summary.value = "想找台中三房平車，重視採光、生活機能與通勤時間";
    els.topTag.value = "菁菁精選";
    els.signature.value = "尹菁菁";
    els.rawListings.value = SAMPLE_TEXT;
    syncListings();
    renderPreview();
    showToast("範例已載入");
  });
}

function syncListings() {
  state.listings = parseListings(els.rawListings.value).map((listing, index) => {
    const override = state.overrides.get(listing.url) || {};
    const metaKey = canonicalUrl(listing.url);
    const meta = state.metaCache.get(metaKey) || { status: "pending" };
    const hasRealMetadata = Boolean(meta.status === "ready" && meta.title && meta.image);
    const isError = meta.status === "error";

    return {
      ...listing,
      metaKey,
      metadataStatus: meta.status,
      metadataError: meta.error || "",
      hasRealMetadata,
      title: hasRealMetadata ? meta.title : isError ? "無法讀取物件標題" : "讀取物件標題中...",
      note: override.note || "",
      badge: domainLabel(meta.finalUrl || listing.url),
      finalUrl: meta.finalUrl || listing.url,
      image: hasRealMetadata ? meta.image : PROPERTY_PLACEHOLDER.src,
      imageAlt: hasRealMetadata ? `${meta.title} 物件照片` : PROPERTY_PLACEHOLDER.alt,
      details: hasRealMetadata ? meta.details || {} : {},
    };
  });

  renderListingEditor();
  queueMetadataFetches();
  updateControls();
}

function queueMetadataFetches() {
  state.listings.forEach((listing) => {
    if (state.metaCache.has(listing.metaKey)) return;

    state.metaCache.set(listing.metaKey, { status: "pending" });
    fetchListingMetadata(listing.url, listing.metaKey);
  });
}

async function fetchListingMetadata(url, metaKey) {
  try {
    const meta = await requestPropertyMetadata(url);
    if (!isUsableMetadata(meta)) {
      throw new Error("此網址沒有可用的物件標題或圖片。");
    }

    state.metaCache.set(metaKey, {
      status: "ready",
      title: meta.title,
      image: meta.image,
      details: meta.details || {},
      finalUrl: meta.finalUrl || url,
    });
  } catch (error) {
    state.metaCache.set(metaKey, {
      status: "error",
      error: error.message || "讀取失敗，請確認短網址是否可公開開啟。",
    });
  }

  syncListings();
  renderPreview();
}

async function requestPropertyMetadata(url) {
  const endpoints = metadataEndpoints(url);
  const errors = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json.message || `讀取失敗（${response.status}）`);
      }

      const normalized = normalizeMetadataResponse(json);
      if (isUsableMetadata(normalized)) return normalized;
      errors.push("回傳資料不是實際物件標題或照片");
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error(errors.find(Boolean) || "讀取物件資料失敗");
}

function metadataEndpoints(url) {
  const encoded = encodeURIComponent(url);
  const endpoints = [];

  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    endpoints.push(`/api/property-meta?url=${encoded}`);
  }

  endpoints.push(`https://api.microlink.io/?url=${encoded}&screenshot=false&audio=false&video=false&iframe=false`);
  return endpoints;
}

function normalizeMetadataResponse(json) {
  if (json?.data) {
    return {
      title: cleanMetadataText(json.data.title || ""),
      image: json.data.image?.url || "",
      details: {},
      finalUrl: json.data.url || "",
    };
  }

  return {
    title: cleanMetadataText(json.title || ""),
    image: json.image || json.images?.[0] || "",
    details: json.details || {},
    finalUrl: json.finalUrl || "",
  };
}

function isUsableMetadata(meta) {
  return Boolean(meta?.title && meta?.image && !isBadMetadataTitle(meta.title) && !isBadMetadataImage(meta.image));
}

function isBadMetadataTitle(title) {
  return /^(error|access denied|forbidden|not found)\b|request could not be satisfied|temporarily unavailable|just a moment|attention required|cloudfront/i.test(
    String(title || "").trim(),
  );
}

function isBadMetadataImage(image) {
  const value = String(image || "").toLowerCase();

  return (
    !value ||
    value.includes("favicon") ||
    value.includes("gstatic.com/favicon") ||
    value.includes("googleusercontent.com/favicon") ||
    /\/logo[^/]*\.(svg|png|jpe?g|webp)(?:\?|$)/i.test(value)
  );
}

function cleanMetadataText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[|｜]\s*(永慶房屋|有巢氏房屋|591房屋交易|信義房屋).*$/i, "")
    .trim();
}

function parseListings(raw) {
  const lines = raw.split(/\r?\n/);
  const results = [];
  const seen = new Set();
  let pendingTitle = "";
  const urlPattern = /(?:https?:\/\/|www\.|x\.ychouse\.tw\/)[^\s<>"'，,。)）]+/gi;

  lines.forEach((line) => {
    const matches = [...line.matchAll(urlPattern)];
    const cleanLine = line.trim();

    if (!matches.length) {
      if (cleanLine) pendingTitle = cleanLine;
      return;
    }

    matches.forEach((match) => {
      const url = normalizeUrl(match[0]);
      if (!url) return;

      const key = canonicalUrl(url);
      if (seen.has(key)) return;
      seen.add(key);

      const titleFromSameLine = cleanLine
        .replace(match[0], "")
        .replace(/[|｜:：\-–—]+$/g, "")
        .trim();
      const fallbackTitle = titleFromSameLine || pendingTitle || deriveTitle(url, results.length);

      results.push({
        url,
        fallbackTitle,
      });

      pendingTitle = "";
    });
  });

  return results;
}

function normalizeUrl(value) {
  const trimmed = value.trim().replace(/[.。)）]+$/g, "");
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function canonicalUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function deriveTitle(url, index) {
  const label = domainLabel(url);
  return `${label}精選物件 ${String(index + 1).padStart(2, "0")}`;
}

function domainLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("ychouse") || host.includes("ycut")) return "物件連結";
    if (host.includes("591")) return "591";
    if (host.includes("sinyi")) return "信義房屋";
    if (host.includes("rakuya")) return "樂屋網";
    if (host.includes("leju")) return "樂居";
    return host.split(".")[0].toUpperCase();
  } catch {
    return "物件連結";
  }
}

function renderListingEditor() {
  els.listingCount.textContent = listingCountLabel();

  if (!state.listings.length) {
    els.listingEditor.innerHTML = "";
    return;
  }

  els.listingEditor.innerHTML = state.listings
    .map(
      (listing, index) => `
        <div class="listing-edit-row" data-url="${escapeAttr(listing.url)}">
          <div class="listing-index">${index + 1}</div>
          <div class="listing-fields">
            <label class="field">
              <span>物件標題（由網址自動帶入）</span>
              <input name="title" type="text" value="${escapeAttr(listing.title)}" readonly />
            </label>
            <div class="listing-meta-status ${escapeAttr(listing.metadataStatus)}">
              ${escapeHtml(metadataStatusText(listing))}
            </div>
            <label class="field">
              <span>給客戶的備註</span>
              <textarea name="note" rows="3" placeholder="例：這間離捷運站近，格局也比較方正。">${escapeHtml(
                listing.note,
              )}</textarea>
            </label>
            <div class="listing-url">${escapeHtml(listing.url)}</div>
          </div>
        </div>
      `,
    )
    .join("");
}

function listingCountLabel() {
  if (!state.listings.length) return "0 筆物件";
  const readyCount = state.listings.filter((listing) => listing.hasRealMetadata).length;
  const errorCount = state.listings.filter((listing) => listing.metadataStatus === "error").length;
  if (readyCount === state.listings.length) return `${state.listings.length} 筆物件 · 可產生`;
  if (errorCount) return `${state.listings.length} 筆物件 · ${errorCount} 筆未讀取`;
  return `${state.listings.length} 筆物件 · 讀取中`;
}

function metadataStatusText(listing) {
  if (listing.hasRealMetadata) return "已帶入短網址頁面的標題與照片";
  if (listing.metadataStatus === "error") return listing.metadataError || "無法讀取此網址的標題與圖片";
  return "正在讀取短網址頁面的物件標題與照片";
}

function renderPreview() {
  updateControls();

  if (!state.listings.length) {
    els.previewSurface.innerHTML = `
      <div class="empty-preview">
        <span class="empty-icon" aria-hidden="true"></span>
        <h3>貼上物件後會產生預覽</h3>
        <p>左側資料會即時同步到這裡，產生後可複製連結或下載單頁 HTML。</p>
      </div>
    `;
    updateShareLink(false);
    activateIcons();
    return;
  }

  els.previewSurface.innerHTML = renderClientMarkup(buildPayload(), { preview: true });
  updateShareLink(false);
  activateIcons();
}

function updateControls() {
  const hasListings = state.listings.length > 0;
  const canGenerate = hasListings && allMetadataReady();
  els.previewNotesButton.disabled = !hasListings;
  els.generateButton.disabled = !canGenerate;
  els.copyButton.disabled = !canGenerate;
  els.downloadButton.disabled = !canGenerate;
  els.openPageButton.disabled = !canGenerate;
}

function allMetadataReady() {
  return state.listings.length > 0 && state.listings.every((listing) => listing.hasRealMetadata);
}

function buildPayload() {
  return {
    version: 1,
    customerName: readField(els.customerName, DEFAULTS.customerName),
    summary: readField(els.summary, DEFAULTS.summary),
    topTag: readField(els.topTag, DEFAULTS.topTag),
    signature: readField(els.signature, DEFAULTS.signature),
    contact: {
      agentName: readField(els.agentName, DEFAULTS.agentName),
      licenseNo: readField(els.licenseNo, DEFAULTS.licenseNo),
      phone: readField(els.phone, DEFAULTS.phone),
      lineId: readField(els.lineId, DEFAULTS.lineId),
    },
    listings: state.listings.map((listing, index) => ({
      title: isBadMetadataTitle(listing.title) ? "物件資料更新中..." : listing.title || deriveTitle(listing.url, index),
      note: listing.note || defaultNote(index),
      url: listing.url,
      finalUrl: listing.finalUrl,
      badge: listing.badge,
      image: isBadMetadataImage(listing.image) ? PROPERTY_PLACEHOLDER.src : listing.image,
      imageAlt: isBadMetadataImage(listing.image) ? PROPERTY_PLACEHOLDER.alt : listing.imageAlt,
      details: listing.details || {},
    })),
  };
}

function readField(input, fallback) {
  return input.value.trim() || fallback;
}

function defaultNote(index) {
  const notes = [
    "這間已放進清單，建議先看格局、位置與總價帶是否符合你的需求。",
    "可以和前一間一起比較，重點看生活圈、屋況與未來轉手性。",
    "這間適合當備選，若照片與格局喜歡，可以再安排實際帶看。",
  ];

  return notes[index % notes.length];
}

function groupListingsByBadge(listings) {
  const groups = new Map();

  listings.forEach((listing, index) => {
    const name = listing.badge || "菁選物件";
    if (!groups.has(name)) {
      groups.set(name, { name, items: [] });
    }

    groups.get(name).items.push({ listing, index });
  });

  return [...groups.values()];
}

function noteCountFor(listings) {
  return listings.filter((listing, index) => (listing.note || defaultNote(index)).trim()).length;
}

function formatShareDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function propertyDetailItems(listing) {
  const details = listing.details || {};
  const parking = [details.parking, details.parkingType].filter(Boolean).join(" · ");

  return [
    ["總價", details.price],
    ["格局", details.layout],
    ["建坪", details.area],
    ["車位", parking],
    ["社區", details.community],
    ["樓層", details.floor],
    ["地址", details.address],
  ].filter(([, value]) => Boolean(value));
}

function districtForListing(listing) {
  return listing.details?.district || districtFromAddress(listing.details?.address) || "未標示區域";
}

function districtFromAddress(address) {
  const match = String(address || "").match(/[^\s縣市]{1,6}區/);
  return match ? match[0] : "";
}

function communityForListing(listing) {
  return listing.details?.community || "未標示社區";
}

function priceValue(listing) {
  const value = String(listing.details?.price || "").replace(/,/g, "");
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function priceRangeLabel(listings) {
  const prices = listings.map(priceValue).filter((value) => value > 0);
  if (!prices.length) return "";

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const format = (value) => `${Math.round(value).toLocaleString("zh-TW")} 萬`;
  return min === max ? `售價 ${format(min)}` : `售價 ${format(min)} ~ ${format(max)}`;
}

function groupListingsByValue(listings, getValue, prefix) {
  const groups = new Map();

  listings.forEach((listing, index) => {
    const name = getValue(listing) || "未分類";
    if (!groups.has(name)) {
      groups.set(name, {
        name,
        id: anchorId(prefix, name),
        items: [],
      });
    }

    groups.get(name).items.push({ listing, index });
  });

  return [...groups.values()];
}

function anchorId(prefix, value) {
  let hash = 0;
  const text = String(value || prefix);

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return `${prefix}-${hash.toString(36)}`;
}

function renderCategoryPanel(areaGroups, communityGroups) {
  return `
    <nav class="share-category-panel" aria-label="物件分類快速導覽">
      ${renderCategoryRow("🏷️", "區域", areaGroups)}
      ${renderCategoryRow("🏘️", "社區", communityGroups)}
    </nav>
  `;
}

function renderCategoryRow(icon, label, groups) {
  if (!groups.length) return "";

  return `
    <div class="share-category-row">
      <div class="share-category-label">
        <span aria-hidden="true">${icon}</span>
        <strong>${escapeHtml(label)}</strong>
      </div>
      <div class="share-category-chips">
        ${groups
          .map(
            (group) => `
              <a class="share-category-chip" href="#${escapeAttr(group.id)}">
                <span>${escapeHtml(group.name)}</span>
                <strong>${group.items.length}</strong>
              </a>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderPropertyDetails(listing) {
  const items = propertyDetailItems(listing);
  if (!items.length) return "";

  return `
    <dl class="share-detail-grid">
      ${items
        .map(
          ([label, value]) => `
            <div class="${label === "地址" ? "wide" : ""}">
              <dt>${escapeHtml(label)}</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function renderClientMarkup(data, options = {}) {
  const previewClass = options.preview ? "is-preview" : "is-full";
  const shareId = options.shareId || data.shareId || "";
  const callHref = phoneHref(data.contact.phone);
  const lineHref = lineUrl(data.contact.lineId);
  const listings = normalizeClientListings(data.listings || []);
  const areaGroups = groupListingsByValue(listings, districtForListing, "area");
  const communityGroups = groupListingsByValue(listings, communityForListing, "community");
  const listingCount = listings.length;
  const noteCount = noteCountFor(listings);
  const detailListingCount = listings.filter((listing) => propertyDetailItems(listing).length).length;
  const heroListing = listings[0] || {};
  const shareDate = formatShareDate(data.createdAt);
  const priceSummary = priceRangeLabel(listings);

  const sections = renderAreaSections(areaGroups);

  return `
    <article class="client-page client-share-page ${previewClass}" data-share-id="${escapeAttr(shareId)}">
      <section class="share-hero">
        <img class="share-hero-image" src="${escapeAttr(
          heroListing.image || PROPERTY_PLACEHOLDER.src,
        )}" alt="${escapeAttr(heroListing.imageAlt || "菁菁精選物件照片")}" />
        <div class="share-hero-overlay" aria-hidden="true"></div>

        <div class="share-hero-inner">
          <span class="share-kicker">${escapeHtml(data.topTag)} · ${escapeHtml(shareDate)}</span>
          <h1>${listingCount} 戶 房屋物件提案</h1>
          <p class="share-subtitle">給 ${escapeHtml(data.customerName)} 的專屬菁選 · 找房需求：${escapeHtml(data.summary)}</p>
          <p class="share-summary">精選 ${listingCount} 個物件 · ${areaGroups.length} 個區域 · ${communityGroups.length} 個社區${priceSummary ? ` · ${escapeHtml(priceSummary)}` : ""}</p>

          <div class="share-stats" aria-label="提案摘要">
            <div>
              <strong>${listingCount}</strong>
              <span>精選戶數</span>
            </div>
            <div>
              <strong>${areaGroups.length}</strong>
              <span>區域</span>
            </div>
            <div>
              <strong>${communityGroups.length}</strong>
              <span>社區</span>
            </div>
          </div>
        </div>
      </section>

      <section class="share-agent-band" aria-label="專屬顧問">
        <div class="share-agent-inner">
          <img class="share-agent-photo" src="${escapeAttr(AGENT_PORTRAIT_SRC)}" alt="${escapeAttr(data.signature)}人像" />
          <div class="share-agent-copy">
            <span>專屬顧問</span>
            <h2>${escapeHtml(data.signature)}</h2>
            <p>陪您找到心目中的家</p>
          </div>
          <div class="share-agent-actions">
            <a class="share-contact-button" href="${escapeAttr(callHref)}" data-track-event="phone_click">📞 ${escapeHtml(data.contact.phone)}</a>
            <a class="share-contact-button secondary" href="${escapeAttr(lineHref)}" target="_blank" rel="noopener noreferrer" data-track-event="line_click">💬 LINE ${escapeHtml(
              data.contact.lineId,
            )}</a>
          </div>
        </div>
      </section>

      <section class="share-content">
        <div class="share-filter-board" aria-label="提案條件摘要">
          <div>
            <span>需求</span>
            <strong>${escapeHtml(data.summary)}</strong>
          </div>
          <div>
            <span>物件</span>
            <strong>全部 ${listingCount} 戶</strong>
          </div>
          <div>
            <span>提案</span>
            <strong>菁菁整理給您的專屬物件</strong>
          </div>
          <div>
            <span>筆記</span>
            <strong>${noteCount} 則</strong>
          </div>
        </div>

        ${renderCategoryPanel(areaGroups, communityGroups)}

        ${sections}

        <footer class="share-footer">
          <div>
            <span>Prepared by</span>
            <h2>${escapeHtml(data.signature)}</h2>
            <p>${escapeHtml(data.contact.agentName)} · ${escapeHtml(data.contact.licenseNo)}</p>
          </div>
          <div class="share-footer-contact">
            <a href="${escapeAttr(callHref)}" data-track-event="phone_click">📞 ${escapeHtml(data.contact.phone)}</a>
            <a href="${escapeAttr(lineHref)}" target="_blank" rel="noopener noreferrer" data-track-event="line_click">💬 LINE ${escapeHtml(data.contact.lineId)}</a>
          </div>
        </footer>
      </section>
    </article>
  `;
}

function renderAreaSections(areaGroups) {
  return areaGroups
    .map(
      (areaGroup) => `
        <section class="share-section" id="${escapeAttr(areaGroup.id)}" aria-labelledby="${escapeAttr(areaGroup.id)}-title">
          <div class="share-section-header">
            <div>
              <span>Area Picks</span>
              <h2 id="${escapeAttr(areaGroup.id)}-title">${escapeHtml(areaGroup.name)}</h2>
            </div>
            <strong>${areaGroup.items.length} 戶</strong>
          </div>

          ${renderCommunityBlocks(areaGroup.items)}
        </section>
      `,
    )
    .join("");
}

function renderCommunityBlocks(items) {
  const listings = items.map(({ listing }) => listing);
  const communityGroups = groupListingsByValue(listings, communityForListing, "community");

  return communityGroups
    .map((communityGroup) => {
      const cards = communityGroup.items
        .map(({ listing }) => {
          const original = items.find((item) => item.listing === listing);
          return renderPropertyCard(listing, original?.index || 0);
        })
        .join("");

      return `
        <div class="share-community-block" id="${escapeAttr(communityGroup.id)}">
          <div class="share-community-heading">
            <div>
              <span>社區</span>
              <h3>${escapeHtml(communityGroup.name)}</h3>
            </div>
            <strong>${communityGroup.items.length} 戶</strong>
          </div>
          <div class="share-card-grid">
            ${cards}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderPropertyCard(listing, index) {
  const detailHref = safeHref(listing.finalUrl || listing.url);
  const trackingAttrs = propertyTrackingAttrs(listing, index);

  return `
    <article class="share-property-card" id="${escapeAttr(anchorId("property", `${index}-${listing.title}`))}">
      <a class="share-card-image-link" href="${escapeAttr(detailHref)}" target="_blank" rel="noopener noreferrer" aria-label="開啟 ${escapeAttr(
        listing.title,
      )} 完整資訊" data-track-event="property_click" ${trackingAttrs}>
        <img src="${escapeAttr(listing.image)}" alt="${escapeAttr(
          listing.imageAlt || listing.title,
        )}" loading="lazy" />
      </a>
      <div class="share-card-body">
        <div class="share-card-meta">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <small>菁菁整理</small>
        </div>
        <h3>${escapeHtml(listing.title)}</h3>
        ${renderPropertyDetails(listing)}
        <p>${escapeHtml(listing.note || listing.details?.description || defaultNote(index))}</p>
        <div class="share-card-actions">
          <a class="share-card-link" href="${escapeAttr(detailHref)}" target="_blank" rel="noopener noreferrer" data-track-event="property_click" ${trackingAttrs}>
            看完整資訊 與 全部照片 →
          </a>
          <button class="share-like" type="button" data-track-event="property_like" ${trackingAttrs}>♡ 我喜歡</button>
        </div>
      </div>
    </article>
  `;
}

function propertyTrackingAttrs(listing, index) {
  const details = listing.details || {};

  return [
    ["data-property-index", String(index + 1)],
    ["data-property-title", listing.title],
    ["data-property-url", listing.finalUrl || listing.url],
    ["data-property-image", listing.image],
    ["data-property-district", details.district || districtForListing(listing)],
    ["data-property-community", details.community || ""],
    ["data-property-price", details.price || ""],
    ["data-property-layout", details.layout || ""],
  ]
    .map(([name, value]) => `${name}="${escapeAttr(value)}"`)
    .join(" ");
}

function normalizeClientListings(listings) {
  return listings.map((listing, index) => {
    const title = isBadMetadataTitle(listing.title)
      ? "物件資料更新中..."
      : listing.title || deriveTitle(listing.url, index);
    const image = isBadMetadataImage(listing.image) ? PROPERTY_PLACEHOLDER.src : listing.image || PROPERTY_PLACEHOLDER.src;

    return {
      ...listing,
      title,
      image,
      imageAlt: image === PROPERTY_PLACEHOLDER.src ? PROPERTY_PLACEHOLDER.alt : listing.imageAlt || `${title} 物件照片`,
    };
  });
}

async function refreshShareMetadata(payload) {
  if (!payload?.listings?.length) return;

  let changed = false;
  const listings = await Promise.all(
    payload.listings.map(async (listing) => {
      try {
        const meta = await requestPropertyMetadata(listing.finalUrl || listing.url);
        if (!isUsableMetadata(meta)) return listing;

        const finalUrl = meta.finalUrl || listing.finalUrl || listing.url;
        if (meta.title !== listing.title || meta.image !== listing.image || finalUrl !== listing.finalUrl) {
          changed = true;
        }

        return {
          ...listing,
          title: meta.title,
          image: meta.image,
          imageAlt: `${meta.title} 物件照片`,
          finalUrl,
          badge: "",
          details: meta.details || {},
        };
      } catch {
        return listing;
      }
    }),
  );

  if (!changed) return;

  const shell = document.querySelector(".client-shell");
  if (!shell) return;

  shell.innerHTML = renderClientMarkup({
    ...payload,
    listings,
  });
  bindShareTracking({
    ...payload,
    listings,
  });
  activateIcons();
}

function bindShareTracking(payload, options = {}) {
  state.shareContext = payload;

  if (!state.shareTrackingBound) {
    document.addEventListener("click", handleShareTrackingClick);
    state.shareTrackingBound = true;
  }

  if (options.trackView && !state.shareViewTracked) {
    state.shareViewTracked = true;
    trackShareEvent("page_view");
  }
}

function handleShareTrackingClick(event) {
  const target = event.target.closest("[data-track-event]");
  if (!target || !document.querySelector(".client-share-page")) return;

  const type = target.dataset.trackEvent;
  trackShareEvent(type, target.dataset);

  if (type === "property_like") {
    event.preventDefault();
    target.classList.add("liked");
    target.textContent = "♡ 已喜歡";
  }
}

function trackShareEvent(type, dataset = {}) {
  const payload = state.shareContext || {};
  const body = {
    type,
    shareId: payload.shareId || "",
    customerName: payload.customerName || "",
    summary: payload.summary || "",
    propertyTitle: dataset.propertyTitle || "",
    propertyUrl: dataset.propertyUrl || "",
    propertyImage: dataset.propertyImage || "",
    propertyDistrict: dataset.propertyDistrict || "",
    propertyCommunity: dataset.propertyCommunity || "",
    propertyPrice: dataset.propertyPrice || "",
    propertyLayout: dataset.propertyLayout || "",
    pageUrl: window.location.href,
  };
  const json = JSON.stringify(body);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/track-event", new Blob([json], { type: "application/json" }));
    return;
  }

  fetch("/api/track-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json,
    keepalive: true,
  }).catch(() => {});
}

function revealShareLink() {
  if (!allMetadataReady()) {
    showToast("請等物件標題與照片讀取完成");
    return "";
  }

  const link = updateShareLink(true);
  els.shareBox.hidden = false;
  els.shareLink.focus();
  els.shareLink.select();
  return link;
}

function updateShareLink(reveal) {
  if (!state.listings.length) {
    state.lastShareLink = "";
    if (els.shareLink) els.shareLink.value = "";
    if (reveal) showToast("請先貼上至少一個物件網址");
    return "";
  }

  const token = encodePayload(buildPayload());
  const link = `${currentBaseUrl()}#page=${token}`;
  state.lastShareLink = link;

  if (els.shareLink) {
    els.shareLink.value = link;
    if (reveal) els.shareBox.hidden = false;
  }

  return link;
}

function currentBaseUrl() {
  return window.location.href.split("#")[0];
}

function getShareToken() {
  const match = window.location.hash.match(/^#(?:page|share)=([^&]+)/);
  return match ? match[1] : "";
}

function renderShareRoute(token) {
  const app = document.querySelector("#app");
  document.body.classList.add("client-mode");

  try {
    const payload = decodePayload(token);
    payload.shareId = shareIdForToken(token);
    app.innerHTML = `
      <main class="client-shell">
        ${renderClientMarkup(payload)}
      </main>
    `;
    bindShareTracking(payload, { trackView: true });
    refreshShareMetadata(payload);
  } catch {
    app.innerHTML = `
      <main class="client-shell">
        <div class="empty-preview">
          <h1>這個分享連結無法讀取</h1>
          <p>可能是連結被截斷，請回到產生器重新製作。</p>
          <a class="client-action" href="${escapeAttr(currentBaseUrl())}">回到產生器</a>
        </div>
      </main>
    `;
  }

  activateIcons();
}

function shareIdForToken(token) {
  return anchorId("share", token).replace(/^share-/, "");
}

function encodePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(token) {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function buildStandaloneHtml(data) {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(data.customerName)}推薦頁</title>
    <style>${exportCss()}</style>
    <script defer src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"><\/script>
  </head>
  <body>
    ${renderClientMarkup(data)}
    <script>window.lucide && window.lucide.createIcons();<\/script>
  </body>
</html>`;
}

function exportCss() {
  return `
    :root {
      color-scheme: light;
      --ink: #332d2e;
      --muted: #7a6a6e;
      --soft: #fbf6f2;
      --panel: #fffdfb;
      --line: #eaded8;
      --line-strong: #d8c3bd;
      --green: #b56f7a;
      --green-dark: #526657;
      --blue: #786f8f;
      --gold: #a67c52;
      --radius: 8px;
      font-family: Inter, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--soft); color: var(--ink); }
    a { color: inherit; }
    .client-page { min-height: 100vh; background: linear-gradient(180deg, rgba(255, 253, 251, 0.9), rgba(251, 246, 242, 0) 42%), var(--soft); color: var(--ink); }
    .share-hero { position: relative; display: grid; min-height: 540px; overflow: hidden; isolation: isolate; place-items: center; padding: clamp(54px, 8vw, 92px) 18px; color: #fff; text-align: center; }
    .share-hero-image, .share-hero-overlay { position: absolute; inset: 0; z-index: -2; }
    .share-hero-image { width: 100%; height: 100%; filter: blur(13px) saturate(0.92); object-fit: cover; transform: scale(1.08); }
    .share-hero-overlay { z-index: -1; background: linear-gradient(180deg, rgba(63, 46, 49, 0.42), rgba(63, 46, 49, 0.55)), linear-gradient(135deg, rgba(181, 111, 122, 0.54), rgba(82, 102, 87, 0.44)); }
    .share-hero-inner { display: grid; justify-items: center; width: min(900px, 100%); gap: 14px; }
    .share-kicker { display: inline-flex; align-items: center; min-height: 34px; padding: 6px 16px; border: 1px solid rgba(255, 255, 255, 0.34); border-radius: 999px; background: rgba(255, 253, 251, 0.18); backdrop-filter: blur(14px); font-size: 0.88rem; font-weight: 850; }
    .share-hero h1 { margin: 0; font-size: clamp(2.45rem, 7vw, 5.9rem); line-height: 0.98; letter-spacing: 0; }
    .share-subtitle, .share-summary { margin: 0; max-width: 780px; line-height: 1.75; }
    .share-subtitle { font-size: clamp(1.02rem, 2.3vw, 1.36rem); font-weight: 720; }
    .share-summary { color: rgba(255, 255, 255, 0.82); font-size: 0.96rem; }
    .share-stats { display: grid; grid-template-columns: repeat(3, minmax(100px, 1fr)); gap: 10px; width: min(560px, 100%); margin-top: 10px; }
    .share-stats div { display: grid; gap: 2px; min-height: 82px; align-content: center; border: 1px solid rgba(255, 255, 255, 0.22); border-radius: var(--radius); background: rgba(255, 253, 251, 0.14); backdrop-filter: blur(14px); }
    .share-stats strong { font-size: clamp(1.7rem, 4vw, 2.45rem); line-height: 1; }
    .share-stats span { color: rgba(255, 255, 255, 0.8); font-size: 0.82rem; font-weight: 780; }
    .share-agent-band { background: #fffdfb; border-bottom: 1px solid var(--line); }
    .share-agent-inner { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 18px 0; }
    .share-agent-photo { width: 88px; height: 88px; border: 3px solid #fff; border-radius: 50%; background: #fff7f5; box-shadow: 0 0 0 1px rgba(181, 111, 122, 0.2), 0 14px 30px rgba(111, 82, 82, 0.16); object-fit: cover; object-position: 50% 24%; }
    .share-agent-copy { min-width: 0; }
    .share-agent-copy span, .share-filter-board span, .share-section-header span, .share-community-heading span, .share-footer span { color: var(--green); font-size: 0.78rem; font-weight: 900; text-transform: uppercase; }
    .share-agent-copy h2, .share-footer h2 { margin: 3px 0; font-size: clamp(1.55rem, 2.4vw, 2.1rem); line-height: 1.1; letter-spacing: 0; }
    .share-agent-copy p, .share-footer p { margin: 0; color: var(--muted); line-height: 1.6; }
    .share-agent-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .share-contact-button, .share-card-link, .share-like, .share-footer-contact a { display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius); font-weight: 900; text-decoration: none; white-space: nowrap; }
    .share-contact-button { min-height: 48px; padding: 0 18px; background: var(--green); color: #fff; box-shadow: 0 12px 24px rgba(181, 111, 122, 0.18); }
    .share-contact-button.secondary { background: #f4edf1; color: var(--blue); box-shadow: none; }
    .share-content { width: min(1080px, calc(100% - 32px)); margin: 0 auto; padding: 22px 0 44px; }
    .share-filter-board { display: grid; grid-template-columns: minmax(210px, 1.35fr) minmax(130px, 0.7fr) minmax(220px, 1fr) minmax(120px, 0.6fr); gap: 10px; margin-bottom: 22px; }
    .share-filter-board div { display: grid; gap: 5px; min-height: 84px; align-content: center; padding: 13px 14px; border: 1px solid var(--line); border-left: 4px solid rgba(181, 111, 122, 0.7); border-radius: var(--radius); background: rgba(255, 253, 251, 0.92); box-shadow: 0 12px 28px rgba(111, 82, 82, 0.08); }
    .share-filter-board strong { line-height: 1.45; }
    .share-category-panel { display: grid; gap: 14px; margin: 0 0 24px; padding: 18px; border: 1px solid var(--line); border-radius: var(--radius); background: rgba(255, 253, 251, 0.86); box-shadow: 0 14px 30px rgba(111, 82, 82, 0.08); }
    .share-category-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; align-items: start; }
    .share-category-label { display: inline-flex; align-items: center; gap: 8px; min-height: 46px; color: var(--muted); }
    .share-category-label strong { font-size: 1rem; font-weight: 950; }
    .share-category-chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .share-category-chip { display: inline-flex; align-items: center; gap: 12px; min-height: 54px; padding: 0 18px; border: 1px solid var(--line); border-radius: 999px; background: #fffdfb; color: var(--ink); font-size: 1.02rem; font-weight: 930; text-decoration: none; }
    .share-category-chip strong { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; min-height: 34px; padding: 0 10px; border-radius: 999px; background: #d9c5ad; color: #6b5d4d; }
    .share-section { display: grid; gap: 12px; margin-top: 18px; scroll-margin-top: 16px; }
    .share-section-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 15px 18px; border: 1px solid var(--line); border-left: 5px solid var(--green); border-radius: var(--radius); background: linear-gradient(90deg, rgba(247, 232, 231, 0.88), rgba(255, 253, 251, 0.92)), #fffdfb; }
    .share-section-header h2 { margin: 4px 0 0; font-size: clamp(1.35rem, 2.4vw, 2.05rem); letter-spacing: 0; }
    .share-section-header strong { display: inline-flex; align-items: center; min-height: 34px; padding: 0 13px; border-radius: 999px; background: #fff; color: var(--green-dark); }
    .share-community-block { display: grid; gap: 12px; scroll-margin-top: 18px; }
    .share-community-block + .share-community-block { margin-top: 12px; }
    .share-community-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: #fffdfb; }
    .share-community-heading h3 { margin: 3px 0 0; font-size: 1.12rem; letter-spacing: 0; }
    .share-community-heading strong { display: inline-flex; align-items: center; min-height: 30px; padding: 0 11px; border-radius: 999px; background: #f4edf1; color: var(--blue); }
    .share-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .share-property-card { display: grid; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius); background: #fff; box-shadow: 0 16px 36px rgba(111, 82, 82, 0.1); }
    .share-card-image-link { display: block; background: #f2eeee; }
    .share-card-image-link img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
    .share-card-body { display: grid; gap: 10px; padding: 15px; }
    .share-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .share-card-meta span { color: var(--gold); font-size: 1.15rem; font-weight: 950; }
    .share-card-meta small { display: inline-flex; align-items: center; min-height: 24px; padding: 3px 9px; border-radius: 999px; background: #f4edf1; color: var(--blue); font-size: 0.78rem; font-weight: 880; }
    .share-property-card h3 { margin: 0; font-size: 1.17rem; line-height: 1.36; letter-spacing: 0; }
    .share-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; }
    .share-detail-grid div { display: grid; gap: 2px; min-width: 0; padding: 8px 9px; border: 1px solid var(--line); border-radius: var(--radius); background: #fff9f7; }
    .share-detail-grid div.wide { grid-column: 1 / -1; }
    .share-detail-grid dt { color: var(--muted); font-size: 0.74rem; font-weight: 850; }
    .share-detail-grid dd { margin: 0; overflow-wrap: anywhere; font-size: 0.92rem; font-weight: 900; line-height: 1.35; }
    .share-property-card p { margin: 0; color: var(--muted); line-height: 1.66; }
    .share-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding-top: 2px; }
    .share-card-link { min-height: 42px; padding: 0 14px; background: var(--green-dark); color: #fff; }
    .share-like { min-height: 42px; padding: 0 13px; border: 1px solid var(--line-strong); color: var(--green); background: #fffdfb; cursor: pointer; }
    .share-like.liked { border-color: rgba(181, 111, 122, 0.42); background: #f7e8e7; color: var(--green-dark); }
    .share-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 24px; padding: 20px 0 0; border-top: 1px solid var(--line); }
    .share-footer-contact { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
    .share-footer-contact a { min-height: 42px; padding: 0 14px; border: 1px solid var(--line); background: #fff; color: var(--green-dark); }
    @media (max-width: 980px) {
      .share-agent-inner { grid-template-columns: auto minmax(0, 1fr); }
      .share-agent-actions { grid-column: 1 / -1; justify-content: flex-start; }
      .share-filter-board { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .share-category-row { grid-template-columns: 1fr; gap: 8px; }
    }
    @media (max-width: 720px) {
      .share-hero { min-height: 470px; padding: 44px 14px; }
      .share-stats, .share-filter-board, .share-card-grid, .share-detail-grid { grid-template-columns: 1fr; }
      .share-category-label { min-height: auto; }
      .share-category-chip { flex: 1 1 160px; justify-content: space-between; }
      .share-stats div { min-height: 68px; }
      .share-agent-inner, .share-content { width: min(100% - 20px, 1080px); }
      .share-agent-photo { width: 72px; height: 72px; }
      .share-agent-actions, .share-footer-contact { justify-content: stretch; }
      .share-contact-button, .share-footer-contact a { flex: 1 1 160px; }
      .share-section-header, .share-community-heading, .share-footer { display: grid; }
    }
  `;
}

function phoneHref(phone) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned ? `tel:${cleaned}` : "#";
}

function lineUrl(lineId) {
  const value = lineId.trim();
  if (!value) return "#";
  if (/^https?:\/\//i.test(value)) return safeHref(value);
  return `https://line.me/ti/p/~${encodeURIComponent(value.replace(/^@/, ""))}`;
}

function safeHref(url) {
  try {
    const parsed = new URL(url, window.location.href);
    if (!["http:", "https:", "tel:"].includes(parsed.protocol)) return "#";
    return parsed.toString();
  } catch {
    return "#";
  }
}

function safeFileName(value) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 40);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

function activateIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
