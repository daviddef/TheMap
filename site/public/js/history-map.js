/* /history/ — the second room. All the playing lives in history-theatre.js (loaded just before
   this); this only mounts it on the page's own map. */
(function () {
  var root = document.getElementById("hm");
  if (!root || !window.HistoryTheatre) return;
  window.HistoryTheatre.create({ base: root.getAttribute("data-base") || "/" });
  var fs = document.getElementById("hm-fs");
  function setFull(on) {
    root.classList.toggle("hm-full", on); document.body.classList.toggle("hm-full-on", on);
    if (fs) { fs.setAttribute("aria-pressed", on ? "true" : "false"); fs.setAttribute("aria-label", on ? "Leave full screen" : "Full screen"); }
    window.scrollTo(0, 0);
    setTimeout(function () { window.dispatchEvent(new Event("resize")); }, 60);      // Leaflet re-measures its box on resize
  }
  if (fs) fs.addEventListener("click", function () { setFull(!root.classList.contains("hm-full")); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root.classList.contains("hm-full")) setFull(false); });
  var fold = document.getElementById("hm-list-fold"), w = document.getElementById("hm-listw");
  if (w && window.matchMedia && window.matchMedia("(max-width: 760px)").matches) { w.classList.add("fold"); if (fold) fold.setAttribute("aria-expanded", "false"); }
  if (fold && w) fold.addEventListener("click", function () {
    var f = w.classList.toggle("fold"); fold.setAttribute("aria-expanded", f ? "false" : "true");
  });
})();
