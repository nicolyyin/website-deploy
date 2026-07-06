const STORAGE_KEY = "jingjingStatsAdminKey";
const els = {};
let adminKey = "";

 document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();

  adminKey = sessionStorage.getItem(STORAGE_KEY) || "";
  if (adminKey) {
    loadStats();
  } else {
    showLogin();
  }
});

function cacheElements() {
  Object.assign(els, {
    loginPanel: document.querySelector("#loginPanel"),
    loginForm: document.querySelector("#loginForm"),
    adminKey: document.querySelector("#adminKey"),
    loadMessage: document.querySelector("#loadMessage"),
    dashboard: document.querySelector("#dashboard"),
    statsActions: document.querySelector("#statsActions"),
    periodSelect: document.querySelector("#periodSelect"),
    refreshButton: document.querySelector("#refreshButton"),
    logoutButton: document.querySelector("#logoutButton"),
    summaryGrid: document.querySelector("#summaryGrid"),
    customerDetailList: document.querySelector("#customerDetailList"),
    propertyList: document.querySelector("#propertyList"),
    customerRows: document.querySelector("#customerRows"),
    recentList: document.querySelector("#recentList"),
  });
}

function bindEvents() {
  els.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    adminKey = els.adminKey.value.trim();
    if (!adminKey) return;
    sessionStorage.setItem(STORAGE_KEY, adminKey);
    loadStats();
  });

  els.refreshButton.addEventListener("click", loadStats);
  els.periodSelect.addEventListener("change", loadStats);
  els.logoutButton.addEventListener("click", () => {
    sessionStorage.removeItem(STORAGE_KEY);
    adminKey = "";
    els.adminKey.value = "";
    showLogin();
  });
}

async function loadStats() {
  if (!adminKey) {
    showLogin();
    return;
  }

  showLoading("讀取統計中...");

  try {
    const days = els.periodSelect.value || "30";
    const response = await fetch(`/api/stats?days=${encodeURIComponent(days)}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${adminKey}`,
      },
    });
    const json = await response.json().catch(() => ({}));

    if (response.status === 401) {
      sessionStorage.removeItem(STORAGE_KEY);
      adminKey = "";
      throw new Error(json.message || "後台密碼不正確。");
    }

    if (!response.ok) {
      throw new Error(json.message || "無法讀取統計");
    }

    els.loginPanel.hidden = true;
    els.dashboard.hidden = false;
    els.statsActions.hidden = false;
    els.loadMessage.hidden = true;
    renderStats(json);
  } catch (error) {
    els.dashboard.hidden = true;
    els.statsActions.hidden = true;
    els.loginPanel.hidden = false;
    els.loadMessage.hidden = false;
    els.loadMessage.textContent = error.message || "無法讀取統計";
    els.adminKey.focus();
  }
}

function showLogin() {
  els.loginPanel.hidden = false;
  els.dashboard.hidden = true;
  els.statsActions.hidden = true;
  els.loadMessage.hidden = true;
  window.setTimeout(() => els.adminKey.focus(), 0);
}

function showLoading(message) {
  els.loginPanel.hidden = true;
  els.dashboard.hidden = true;
  els.statsActions.hidden = true;
  els.loadMessage.hidden = false;
  els.loadMessage.textContent = message;
}

function renderStats(data) {
  renderSummary(data.totals || {});
  renderCustomerDetails(data.customers || []);
  renderProperties(data.properties || []);
  renderCustomers(data.customers || []);
  renderRecent(data.recent || []);
}

function renderSummary(totals) {
  const cards = [
    ["客戶提案", totals.customers || 0],
    ["提案開啟", totals.pageViews || 0],
    ["物件點擊", totals.propertyClicks || 0],
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

function renderCustomerDetails(customers) {
  if (!customers.length) {
    els.customerDetailList.innerHTML = `<p class="empty-state">目前期間內還沒有客戶點擊紀錄。</p>`;
    return;
  }

  els.customerDetailList.innerHTML = customers
    .map((customer) => {
      const properties = customer.properties || [];
      return `
        <details class="customer-detail-card" open>
          <summary>
            <div>
              <span class="customer-name">${escapeHtml(customer.customerName)}</span>
              <small>${escapeHtml(customer.summary || "未填需求摘要")}</small>
            </div>
            <div class="customer-summary-counts">
              <span>開啟 ${escapeHtml(customer.pageViews || 0)}</span>
              <span>物件點擊 ${escapeHtml(customer.propertyClicks || 0)}</span>
              <span>最近 ${escapeHtml(formatDate(customer.lastAt))}</span>
            </div>
          </summary>
          <div class="customer-property-list">
            ${
              properties.length
                ? properties
                    .map(
                      (property) => `
                        <article class="customer-property-row">
                          <div>
                            ${
                              property.url
                                ? `<a href="${escapeAttr(property.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(property.title)}</a>`
                                : `<strong>${escapeHtml(property.title)}</strong>`
                            }
                            <small>${escapeHtml(
                              [property.district, property.community, property.price, property.layout]
                                .filter(Boolean)
                                .join(" · "),
                            )}</small>
                          </div>
                          <div class="customer-property-counts">
                            <span>點擊 ${escapeHtml(property.propertyClicks || 0)}</span>
                            <span>喜歡 ${escapeHtml(property.likes || 0)}</span>
                            <small>${escapeHtml(formatDate(property.lastAt))}</small>
                          </div>
                        </article>
                      `,
                    )
                    .join("")
                : `<p class="empty-state">客人已開啟提案，但尚未點擊任何物件網址。</p>`
            }
          </div>
        </details>
      `;
    })
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
            <h3>
              ${
                property.url
                  ? `<a href="${escapeAttr(property.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(property.title)}</a>`
                  : escapeHtml(property.title)
              }
            </h3>
            <div class="property-meta">
              ${property.district ? `<span>${escapeHtml(property.district)}</span>` : ""}
              ${property.community ? `<span>${escapeHtml(property.community)}</span>` : ""}
              ${property.price ? `<span>${escapeHtml(property.price)}</span>` : ""}
              ${property.layout ? `<span>${escapeHtml(property.layout)}</span>` : ""}
              ${property.customers?.length ? `<span>客戶：${escapeHtml(property.customers.join("、"))}</span>` : ""}
            </div>
          </div>
          <div class="property-counts">
            <span>點擊 ${escapeHtml(property.propertyClicks || 0)}</span>
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
    els.customerRows.innerHTML = `<tr><td colspan="8">還沒有客戶互動紀錄。</td></tr>`;
    return;
  }

  els.customerRows.innerHTML = customers
    .map(
      (customer) => `
        <tr>
          <td><strong>${escapeHtml(customer.customerName)}</strong></td>
          <td>${escapeHtml(customer.summary || "")}</td>
          <td>${escapeHtml(customer.pageViews || 0)}</td>
          <td>${escapeHtml(customer.propertyClicks || 0)}</td>
          <td>${escapeHtml(customer.likes || 0)}</td>
          <td>${escapeHtml(customer.phoneClicks || 0)}</td>
          <td>${escapeHtml(customer.lineClicks || 0)}</td>
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
            <small>${escapeHtml(
              [event.propertyDistrict, event.propertyCommunity, event.propertyPrice].filter(Boolean).join(" · "),
            )}</small>
          </p>
          <small>${escapeHtml(formatDate(event.timestamp))}</small>
        </article>
      `,
    )
    .join("");
}

function eventLabel(type) {
  const labels = {
    page_view: "開啟提案",
    property_click: "點擊物件",
    property_like: "喜歡物件",
    phone_click: "點電話",
    line_click: "點 LINE",
  };
  return labels[type] || type;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
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
