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
