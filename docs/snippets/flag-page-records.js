/* RECORDS FOR THIS PERIOD — the block that goes inside a Flag History era card.
 *
 * Drop-in for daviddef.github.io/Flag-History. It fetches Record Atlas's feed
 * and, for each era card already on the page, appends what the atlas holds for
 * that ground in those years. Nothing here parses Record Atlas's HTML and
 * nothing in Record Atlas parses this page: one JSON contract, each side
 * owning its own data.
 *
 *   <script src="flag-page-records.js" data-cc="HR" defer></script>
 *
 * Reads the era cards by their published contract — `.entry` divs with
 * id="era-<startyear>" — and needs no other coupling.
 *
 * THE ONE RULE THAT MATTERS. Ninety per cent of Record Atlas is `unsurveyed`:
 * 19,416 of 21,473 places are correctly placed ground nobody has walked. So
 * this never renders a bare count. It renders "N places on this ground, M
 * surveyed", and where M is nought it says so in words. A card that implied
 * records exist for 1200 would be lying in a way a reader cannot check — no
 * parish registers exist anywhere before Trent required them in 1563.
 */
(function () {
  var FEED = "https://daviddef.github.io/TheMap/eras.json";
  var self = document.currentScript;
  var CC = (self && self.dataset.cc) || document.documentElement.dataset.cc;
  if (!CC) return;

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  fetch(FEED).then(function (r) { return r.json(); }).then(function (feed) {
    var mine = (feed.eras || []).filter(function (e) { return e.cc === CC; });
    var fallback = (feed.countries || []).filter(function (c) { return c.cc === CC; })[0];
    if (!mine.length && !fallback) return;

    /* MY ERA BOUNDARIES ARE NOT THEIR ERA BOUNDARIES, and that is not a bug on
       either side. A flag year is the year a flag changed; Record Atlas's is the
       year a FILING system changed. Istria's 1805 and 1815 are both Napoleonic
       and the parish books continue unbroken across both. So an atlas era is
       attached to a card when their year spans OVERLAP — which can be more than
       one card, and showing it on each is right, because the same ground really
       was under that filing system across both. */
    document.querySelectorAll('.entry[id^="era-"]').forEach(function (card, i, all) {
      var id = card.id.replace(/^era-/, "");
      var bce = /bce$/.test(id);
      var from = bce ? -parseInt(id, 10) : parseInt(id, 10);
      if (isNaN(from)) return;
      /* No structured end year on the card, so the next card's start is the end.
         The newest card runs to now. Cards are in descending year order on these
         pages, so "next" is the one BEFORE this in the DOM. */
      var prev = all[i - 1];
      var to = prev ? (parseInt(prev.id.replace(/^era-|bce$/g, ""), 10) || 9999)
                    : new Date().getFullYear();

      var hits = mine.filter(function (e) {
        return e.from <= to && (e.to == null || e.to >= from);
      });
      if (!hits.length) return;

      var rows = hits.map(function (e) {
        var n = e.answeringThisPeriod;
        var what = n > 0
          ? "<b>" + n + "</b> place" + (n === 1 ? "" : "s") +
            " with records covering these years"
          /* Nought is a real answer and the commonest one. Say which kind of
             nothing it is: ground we hold and nobody has walked. */
          : "<b>no</b> records for these years yet — " +
            e.unsurveyed + " place" + (e.unsurveyed === 1 ? "" : "s") +
            " on this ground, unwalked";
        var filed = (e.filedUnder || []).length
          ? '<span class="ra-filed">filed under ' +
            e.filedUnder.map(esc).join(" · ") + "</span>"
          : "";
        return '<li><span class="ra-reg">' + esc(e.regionLabel) + "</span> " +
               what + " " + filed +
               ' <a href="' + esc(e.map) + '" rel="noopener">open the map ↗</a>' +
               "</li>";
      }).join("");

      var box = document.createElement("div");
      box.className = "ra-records";
      box.innerHTML =
        '<h4>Records for this period</h4><ul>' + rows + "</ul>" +
        '<p class="ra-credit">From <a href="https://daviddef.github.io/TheMap/" ' +
        'rel="noopener">Record Atlas</a> (CC BY 4.0) — a map of genealogical ' +
        "sources. Counts are places on this ground, not records held: most of " +
        "the atlas is ground nobody has surveyed yet.</p>";
      card.appendChild(box);
    });
  }).catch(function () {
    /* A flag page is a flag page without this. Fail silently rather than put an
       error where a reader expected history. */
  });
})();
