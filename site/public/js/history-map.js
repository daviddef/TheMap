/* /history/ — the second room. All the playing lives in history-theatre.js (loaded just before
   this); this only mounts it on the page's own map. */
(function () {
  var root = document.getElementById("hm");
  if (!root || !window.HistoryTheatre) return;
  window.HistoryTheatre.create({ base: root.getAttribute("data-base") || "/" });
})();
