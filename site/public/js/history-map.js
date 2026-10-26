/* /history/ — the second room. All the playing lives in history-theatre.js (loaded just before
   this); this only mounts it on the page's own map. */
(function () {
  var root = document.getElementById("hm");
  if (!root || !window.HistoryTheatre) return;
  window.HistoryTheatre.create({ base: root.getAttribute("data-base") || "/" });
  var fold = document.getElementById("hm-list-fold"), w = document.getElementById("hm-listw");
  if (w && window.matchMedia && window.matchMedia("(max-width: 760px)").matches) { w.classList.add("fold"); if (fold) fold.setAttribute("aria-expanded", "false"); }
  if (fold && w) fold.addEventListener("click", function () {
    var f = w.classList.toggle("fold"); fold.setAttribute("aria-expanded", f ? "false" : "true");
  });
})();
