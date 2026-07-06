document.addEventListener(
  "click",
  function (event) {
    var link = event.target.closest(".share-category-chip");
    if (!link) return;

    var href = link.getAttribute("href") || "";
    if (href.charAt(0) !== "#") return;

    var target = document.getElementById(href.slice(1));
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", location.pathname + href);
  },
  true,
);
