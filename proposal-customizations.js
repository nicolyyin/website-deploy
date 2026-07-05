(() => {
  "use strict";

  DEFAULTS.phone = "0910-692046";
  DEFAULTS.instagram = "yin_ching_ching";

  const originalBuildPayload = buildPayload;
  buildPayload = function buildPayloadWithUpdatedContact() {
    const payload = originalBuildPayload();
    const currentPhone = payload.contact?.phone || DEFAULTS.phone;

    return {
      ...payload,
      contact: {
        ...payload.contact,
        phone: currentPhone === "0910-692-946" ? DEFAULTS.phone : currentPhone,
        instagram: DEFAULTS.instagram,
      },
    };
  };

  const originalRenderClientMarkup = renderClientMarkup;
  renderClientMarkup = function renderClientMarkupWithUpdatedFooter(data, options = {}) {
    const normalizedData = {
      ...data,
      contact: {
        ...(data.contact || {}),
        instagram: data.contact?.instagram || DEFAULTS.instagram,
      },
    };

    const html = originalRenderClientMarkup(normalizedData, options);
    const footerCallHref = phoneHref(DEFAULTS.phone);
    const footerLineHref = lineUrl(DEFAULTS.lineId);
    const footerInstagramHref = instagramUrl(DEFAULTS.instagram);

    const footer = `
      <footer class="share-footer">
        <div>
          <span>專屬顧問</span>
          <h2>尹菁菁</h2>
          <p>本資訊以實際物件現況為準，最終以雙方議定條件為憑</p>
        </div>
        <div class="share-footer-contact">
          <a href="${escapeAttr(footerCallHref)}" data-track-event="phone_click">📞 0910-692046</a>
          <a href="${escapeAttr(footerLineHref)}" target="_blank" rel="noopener noreferrer" data-track-event="line_click">💬 LINE：nicolyyin</a>
          <a href="${escapeAttr(footerInstagramHref)}" target="_blank" rel="noopener noreferrer">📷 IG：@yin_ching_ching</a>
        </div>
      </footer>
    `;

    return html.replace(/<footer class="share-footer">[\s\S]*?<\/footer>/, footer);
  };

  const legacyDecodePayload = decodePayload;

  encodePayload = function encodeCompactPayload(payload) {
    const compact = [
      2,
      payload.customerName,
      payload.summary,
      payload.topTag,
      payload.signature,
      [
        payload.contact.agentName,
        payload.contact.licenseNo,
        payload.contact.phone,
        payload.contact.lineId,
        payload.contact.instagram || DEFAULTS.instagram,
      ],
      Date.now(),
      payload.listings.map((listing, index) => [
        listing.url,
        listing.note === defaultNote(index) ? "" : listing.note || "",
      ]),
    ];

    return `v2.${encodeCompactBase64Url(JSON.stringify(compact))}`;
  };

  decodePayload = function decodeCompatiblePayload(token) {
    if (!token.startsWith("v2.")) {
      return legacyDecodePayload(token);
    }

    const compact = JSON.parse(decodeCompactBase64Url(token.slice(3)));
    return expandCompactPayload(compact);
  };

  function expandCompactPayload(compact) {
    if (!Array.isArray(compact) || compact[0] !== 2) {
      throw new Error("不支援的分享連結格式");
    }

    const [, customerName, summary, topTag, signature, contactValues, createdAt, listingValues] = compact;
    const [agentName, licenseNo, phone, lineId, instagram] = contactValues || [];

    return {
      version: 2,
      customerName: customerName || DEFAULTS.customerName,
      summary: summary || DEFAULTS.summary,
      topTag: topTag || DEFAULTS.topTag,
      signature: signature || DEFAULTS.signature,
      createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
      contact: {
        agentName: agentName || DEFAULTS.agentName,
        licenseNo: licenseNo || DEFAULTS.licenseNo,
        phone: phone || DEFAULTS.phone,
        lineId: lineId || DEFAULTS.lineId,
        instagram: instagram || DEFAULTS.instagram,
      },
      listings: (listingValues || []).map(([url, note], index) => ({
        title: deriveTitle(url, index),
        note: note || defaultNote(index),
        url,
        finalUrl: url,
        badge: domainLabel(url),
        image: PROPERTY_PLACEHOLDER.src,
        imageAlt: PROPERTY_PLACEHOLDER.alt,
        details: {},
      })),
    };
  }

  function encodeCompactBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodeCompactBase64Url(token) {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function instagramUrl(instagramId) {
    const value = String(instagramId || "")
      .trim()
      .replace(/^@/, "")
      .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
      .replace(/\/.*$/, "");

    return value ? `https://www.instagram.com/${encodeURIComponent(value)}/` : "#";
  }
})();

(() => {
  "use strict";

  let cachedFingerprint = "";
  let cachedLink = "";
  let pendingSave = null;
  const storedProposalId = proposalIdFromPath();

  if (storedProposalId) {
    document.addEventListener(
      "DOMContentLoaded",
      (event) => {
        event.stopImmediatePropagation();
        renderStoredProposal(storedProposalId);
      },
      true,
    );
  }

  document.addEventListener(
    "submit",
    (event) => {
      if (storedProposalId || event.target?.id !== "generatorForm") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      createAndShowShortLink();
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (storedProposalId) return;
      const button = event.target.closest("#copyButton, #openPageButton");
      if (!button) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (button.id === "copyButton") {
        createAndShowShortLink({ copy: true });
        return;
      }

      const openedWindow = window.open("about:blank", "_blank");
      createAndShowShortLink({ openedWindow });
    },
    true,
  );

  async function createAndShowShortLink(options = {}) {
    if (!allMetadataReady()) {
      showToast("請等物件標題、照片與資料讀取完成");
      if (options.openedWindow) options.openedWindow.close();
      return "";
    }

    setShareButtonsBusy(true);

    try {
      const link = await saveCurrentProposal();
      showShareLink(link);

      if (options.copy) {
        await copyText(link);
        showToast("短連結已複製");
      } else if (options.openedWindow) {
        options.openedWindow.location.href = link;
      } else {
        showToast("短連結已產生");
      }

      return link;
    } catch (error) {
      if (options.openedWindow) options.openedWindow.close();
      showToast(error.message || "短連結產生失敗，請稍後再試");
      return "";
    } finally {
      setShareButtonsBusy(false);
    }
  }

  async function saveCurrentProposal() {
    const payload = {
      ...buildPayload(),
      version: 3,
      createdAt: new Date().toISOString(),
    };
    const fingerprint = JSON.stringify(payload);

    if (fingerprint === cachedFingerprint && cachedLink) return cachedLink;
    if (pendingSave && fingerprint === cachedFingerprint) return pendingSave;

    cachedFingerprint = fingerprint;
    pendingSave = fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: fingerprint,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.message || "短連結產生失敗");
        }
        return `${window.location.origin}${result.path}`;
      })
      .then((link) => {
        cachedLink = link;
        state.lastShareLink = link;
        return link;
      })
      .finally(() => {
        pendingSave = null;
      });

    return pendingSave;
  }

  function showShareLink(link) {
    if (!els.shareBox || !els.shareLink) return;
    els.shareBox.hidden = false;
    els.shareLink.value = link;
    els.shareLink.focus();
    els.shareLink.select();
  }

  function setShareButtonsBusy(busy) {
    [els.generateButton, els.copyButton, els.openPageButton].filter(Boolean).forEach((button) => {
      button.dataset.shortLinkBusy = busy ? "true" : "false";
      button.disabled = busy;
    });
  }

  async function renderStoredProposal(id) {
    document.body.classList.add("client-mode");
    const app = document.querySelector("#app");
    if (!app) return;

    app.innerHTML = `
      <main class="client-shell">
        <div class="empty-preview">
          <h1>正在開啟專屬提案</h1>
          <p>物件資料載入中，請稍候。</p>
        </div>
      </main>
    `;

    try {
      const response = await fetch(`/api/proposals?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "找不到這份提案");

      payload.shareId = id;
      app.innerHTML = `
        <main class="client-shell">
          ${renderClientMarkup(payload)}
        </main>
      `;
      bindShareTracking(payload, { trackView: true });
      activateIcons();
    } catch (error) {
      app.innerHTML = `
        <main class="client-shell">
          <div class="empty-preview">
            <h1>這份提案暫時無法開啟</h1>
            <p>${escapeHtml(error.message || "請稍後再試，或請顧問重新產生連結。")}</p>
            <a class="client-action" href="/home">回到產生器</a>
          </div>
        </main>
      `;
    }
  }

  function proposalIdFromPath() {
    const match = window.location.pathname.match(/\/p\/([A-Za-z0-9_-]{8,20})\/?$/);
    return match ? match[1] : "";
  }
})();
