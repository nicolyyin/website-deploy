(() => {
  "use strict";

  const originalCopyText = copyText;
  let storedLastShareLink = state.lastShareLink || "";

  Object.defineProperty(state, "lastShareLink", {
    configurable: true,
    enumerable: true,
    get() {
      return storedLastShareLink;
    },
    set(value) {
      storedLastShareLink = value;
      if (isShortProposalLink(value)) {
        window.setTimeout(() => showCustomerSharePreview(value), 0);
      }
    },
  });

  copyText = async function copyCustomerShareText(text) {
    if (!isShortProposalLink(text)) {
      return originalCopyText(text);
    }

    const message = buildCustomerShareMessage(text);
    showCustomerSharePreview(text, message);
    return originalCopyText(message);
  };

  function showCustomerSharePreview(link, preparedMessage = "") {
    if (!els.shareBox || !els.shareLink) return;

    const message = preparedMessage || buildCustomerShareMessage(link);
    els.shareBox.hidden = false;
    els.shareLink.value = message;
    els.shareLink.focus();
    els.shareLink.select();
  }

  function buildCustomerShareMessage(link) {
    const payload = buildPayload();
    const customerName = String(payload.customerName || "客戶").trim();
    const summary = String(payload.summary || "歡迎查看菁菁為您整理的物件").trim();
    const listingCount = Array.isArray(payload.listings) ? payload.listings.length : 0;
    const date = formatTaipeiDate(new Date());

    return [
      link,
      "",
      `菁菁・${date}・給 ${customerName} 的 ${listingCount} 戶整理`,
      `找房需求：${summary}`,
    ].join("\n");
  }

  function formatTaipeiDate(date) {
    const parts = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function isShortProposalLink(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return url.origin === window.location.origin && /^\/p\/[A-Za-z0-9_-]{8,20}\/?$/.test(url.pathname);
    } catch {
      return false;
    }
  }
})();
