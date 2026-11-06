/* "N people keep a copy online": the one public number from the sync service (GET /v1/count, a total with no identifier in it).
   Shown on Connection & Backup only once it is big enough to be worth saying; below that the page says nothing rather than a small
   number. Nothing is stored and nothing is sent: it is one GET with no cookies, and it fails quietly. */
(function () {
  var MIN = 10;
  var anchor = document.getElementById("sy-intro"); if (!anchor) return;
  var S = window.raResearchSync, base = ((S && S.BASE) || "https://sync.recordatlas.org").replace(/\/$/, "");
  var ctl = new AbortController(), kill = setTimeout(function () { ctl.abort(); }, 4000);
  fetch(base + "/v1/count", { signal: ctl.signal, credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (j) {
      clearTimeout(kill);
      var n = j && Number(j.registrations);
      if (!(n >= MIN)) return;
      var p = document.createElement("p"); p.className = "cap sy-count";
      p.textContent = n.toLocaleString() + " people keep a copy online.";
      anchor.insertAdjacentElement("afterend", p);
    })
    .catch(function () { clearTimeout(kill); });
})();
