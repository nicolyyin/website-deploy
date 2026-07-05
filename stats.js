const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  loadStats();
});

function cacheElements() {
  Object.assign(els, {
    loadMessage: document.querySelector("#loadMessage"),
    dashboard: document.querySelector("#dashboard"),
    statsActions: document.querySelector("#statsActions"),
    refreshButton: document.querySelector("#refreshButton"),
    summaryGrid: document.querySelector("#summaryGrid"),
    propertyList: document.querySelector("#propertyList"),
    customerRows: document.querySelector("#customerRows"),
    recentList: document.querySelector("#recentList"),
  });
}

function bindEvents() {
  els.refreshButton.addEventListener("click", () => {
    loadStats();
  });
}

async function loadStats() {
  els.loadMessage.hidden = false;
  els.loadMessage.textContent = "讀取統計中...";

  try {
    const response = await fetch("/api/stats");
    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json.message || "無法讀取統計");
    }

    els.dashboard.hidden = false;
    els.loadMessage.hidden = true;
    renderStats(json);
  } catch (error) {
    els.loadMessage.hidden = false;
    els.loadMessage.textContent = error.message || "無法讀取統計";
    els.dashboard.hidden = true;
  }
}

function renderStats(data) {
  renderSummary(data.totals || {});
  renderProperties(data.properties || []);
  renderCustomers(data.customers || []);
  renderRecent(data.recent || []);
}

function renderSummary(totals) {
  const cards = [
    ["頁面開啟", totals.pageViews || 0],
    ["看物件", totals.propertyClicks || 0],
    ["喜歡", totals.likes || 0],
    ["電話", totals.phoneClicks || 0],
    ["LINE", totals.lineClicks || 0],
  ];

  els.summaryGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(label)}</span>
        </article>
      `,
    )
    .join("");
}

function renderProperties(properties) {
  if (!properties.length) {
    els.propertyList.innerHTML = `<p class="empty-state">還沒有物件點擊或喜歡紀錄。</p>`;
    return;
  }

  els.propertyList.innerHTML = properties
    .map(
      (property) => `
        <article class="property-card">
          <img src="${escapeAttr(property.image || "./assets/property-placeholder.svg")}" alt="${escapeAttr(property.title)}" />
          <div>
            <h3>${escapeHtml(property.title)}</h3>
            <div class="property-meta">
              ${property.district ? `<span>${escapeHtml(property.district)}</span>` : ""}
              ${property.community ? `<span>${escapeHtml(property.community)}</span>` : ""}
              ${property.price ? `<span>${escapeHtml(property.price)}</span>` : ""}
              ${property.layout ? `<span>${escapeHtml(property.layout)}</span>` : ""}
              ${property.customers?.length ? `<span>${escapeHtml(property.customers.join("、"))}</span>` : ""}
            </div>
          </div>
          <div class="property-counts">
            <span>看 ${escapeHtml(property.propertyClicks || 0)}</span>
            <span>喜歡 ${escapeHtml(property.likes || 0)}</span>
            <span>${escapeHtml(formatDate(property.lastAt))}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderCustomers(customers) {
  if (!customers.length) {
    els.customerRows.innerHTML = `<tr><td colspan="7">還沒有客戶互動紀錄。</td></tr>`;
    return;
  }

  els.customerRows.innerHTML = customers
    .map(
      (customer) => `
        <tr>
          <td>${escapeHtml(customer.customerName)}</td>
          <td>${escapeHtml(customer.pageViews)}</td>
          <td>${escapeHtml(customer.propertyClicks)}</td>
          <td>${escapeHtml(customer.likes)}</td>
          <td>${escapeHtml(customer.phoneClicks)}</td>
          <td>${escapeHtml(customer.lineClicks)}</td>
          <td>${escapeHtml(formatDate(customer.lastAt))}</td>
        </tr>
      `,
    )
    .join("");
}

function renderRecent(recent) {
  if (!recent.length) {
    els.recentList.innerHTML = `<p class="empty-state">還沒有最近事件。</p>`;
    return;
  }

  els.recentList.innerHTML = recent
    .map(
      (event) => `
        <article class="recent-item">
          <span class="recent-type">${escapeHtml(eventLabel(event.type))}</span>
          <p>
            <strong>${escapeHtml(event.customerName || "未命名客戶")}</strong>
            ${event.propertyTitle ? ` · ${escapeHtml(event.propertyTitle)}` : ""}
            <br />
            <small>${escapeHtml([event.propertyDistrict, event.propertyCommunity, event.propertyPrice].filter(Boolean).join(" · "))}</small>
          </p>
          <small>${escapeHtml(formatDate(event.timestamp))}</small>
        </article>
      `,
    )
    .join("");
}

function eventLabel(type) {
  const labels = {
    page_view: "開啟",
    property_click: "看物件",
    property_like: "喜歡",
    phone_click: "電話",
    line_click: "LINE",
  };

  return labels[type] || type;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
