(() => {
  "use strict";

  sessionStorage.setItem("jingjingStatsAdminKey", "public-dashboard");

  const originalFetch = window.fetch.bind(window);
  window.fetch = function openStatsFetch(input, init) {
    if (typeof input === "string" && input.startsWith("/api/stats")) {
      input = input.replace("/api/stats", "/api/public-stats");
    }
    return originalFetch(input, init);
  };
})();
