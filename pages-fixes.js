(() => {
  "use strict";

  // GitHub Pages is static hosting, so use the public metadata service directly.
  window.metadataEndpoints = function metadataEndpointsForPages(url) {
    const encoded = encodeURIComponent(url);
    return [
      `https://api.microlink.io/?url=${encoded}&screenshot=false&audio=false&video=false&iframe=false`,
    ];
  };

  // Disable the local-only analytics endpoint. No customer names, browsing data,
  // IP addresses, or click events are sent to this GitHub Pages site.
  window.trackShareEvent = function trackShareEventDisabled() {};
})();
