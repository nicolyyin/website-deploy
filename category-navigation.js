(() => {
  "use strict";

  if (typeof renderCategoryRow === "function") {
    renderCategoryRow = function renderCategoryRowWithinProposal(icon, label, groups) {
      if (!groups.length) return "";

      const currentPage = `${window.location.pathname}${window.location.search}`;

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
                  <a class="share-category-chip" href="${escapeAttr(`${currentPage}#${group.id}`)}">
                    <span>${escapeHtml(group.name)}</span>
                    <strong>${group.items.length}</strong>
                  </a>
                `,
              )
              .join("")}
          </div>
        </div>
      `;
    };
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest(".share-category-chip");
      if (!link) return;

      const hash = link.hash || "";
      if (!hash) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
    },
    true,
  );
})();
