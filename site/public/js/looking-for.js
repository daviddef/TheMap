/* TELL US WHO YOU'RE LOOKING FOR: the plain sentence page. A sentence with blanks, then the same journey and plan the home page's
   drawer and the guided Ask on /read/ give, all from story-engine.js (which must load first). Nothing is sent or saved except a
   research family, which stays in this browser and only when the visitor presses the button. */
(function () {
  "use strict";
  var S = window.raAtlasSummary, E = window.raStory;
  if (!S || !E) return;
  function $(id) { return document.getElementById(id); }
  var el = E.el;

  function boot() {
    var form = $("lf-form");
    if (!form) return;
    var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
    var LD = E.createLoader(BASE), data = null, chosen = { from: null, to: null };

    function picker(key, input, list) {
      var shown = [], at = -1;
      function close() { list.hidden = true; list.textContent = ""; input.setAttribute("aria-expanded", "false"); at = -1; input.removeAttribute("aria-activedescendant"); }
      function choose(s) { chosen[key] = s.r; input.value = s.r.n + (data.countries[s.r.cc] ? ", " + data.countries[s.r.cc] : ""); input.classList.add("is-set"); close(); }
      function mark() { [].forEach.call(list.children, function (li, i) { li.setAttribute("aria-selected", i === at ? "true" : "false"); }); if (at > -1) input.setAttribute("aria-activedescendant", list.children[at].id); }
      function open() {
        if (!data) return;
        shown = E.suggest(data.rows, input.value, 8); list.textContent = "";
        if (!shown.length) { close(); return; }
        shown.forEach(function (s, i) {
          var li = el("li", null, "lf-opt"); li.id = list.id + "-" + i; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
          li.append(el("b", s.r.n), el("span", (data.countries[s.r.cc] || s.r.cc || "") + (s.via ? " · also " + s.via : "")));
          li.addEventListener("mousedown", function (e) { e.preventDefault(); choose(s); });
          list.append(li);
        });
        list.hidden = false; input.setAttribute("aria-expanded", "true");
      }
      function ready() { return LD.load().then(function (d) { data = d; return d; }); }
      input.addEventListener("focus", function () { ready().then(function () { if (input.value) open(); }).catch(function () {}); });
      input.addEventListener("input", function () { chosen[key] = null; input.classList.remove("is-set"); ready().then(open).catch(function () { $("lf-status").textContent = "The place list did not load. Check your connection and try again."; }); });
      input.addEventListener("keydown", function (e) {
        if (list.hidden) return;
        if (e.key === "ArrowDown") { at = Math.min(shown.length - 1, at + 1); mark(); e.preventDefault(); }
        else if (e.key === "ArrowUp") { at = Math.max(0, at - 1); mark(); e.preventDefault(); }
        else if (e.key === "Enter" && at > -1) { choose(shown[at]); e.preventDefault(); }
        else if (e.key === "Escape") close();
      });
      input.addEventListener("blur", function () { setTimeout(close, 120); });
    }
    picker("from", $("lf-from"), $("lf-from-list")); picker("to", $("lf-to"), $("lf-to-list"));

    function resolve(key, input) {
      if (chosen[key]) return chosen[key];
      var t = S.fold(input.value.split(",")[0]);
      if (!t) return null;
      var hits = E.suggest(data.rows, t, 8).filter(function (s) { return S.fold(s.r.n) === t || s.via === t; });
      return hits.length === 1 ? hits[0].r : null;
    }

    var map = null, L = null;
    function getMap() {
      return S.loadLeaflet().then(function (LL) {
        L = LL;
        if (!map) { map = L.map($("lf-map"), { scrollWheelZoom: false }); L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(map); }
        return { L: L, map: map };
      });
    }
    var J = E.createJourney({ els: { cap: $("lf-cap"), slider: $("lf-year"), yearOut: $("lf-yearout"), play: $("lf-play"), moments: $("lf-moments"), time: $("lf-time"), mapBox: $("lf-map") }, getMap: getMap });

    $("lf-go").addEventListener("click", function (ev) {
      ev.preventDefault();
      var say = $("lf-status"); say.textContent = ""; say.className = "lf-status";
      function bad(m) { say.textContent = m; say.className = "lf-status lf-bad"; }
      var left = E.toYear($("lf-left").value), born = E.toYear($("lf-born").value);
      if ($("lf-left").value.trim() && left == null) return bad("Type the year as four digits, for example 1905, or leave it empty.");
      if ($("lf-born").value.trim() && born == null) return bad("Type the birth year as four digits, or leave it empty.");
      if (born != null && left != null && left < born) return bad("They cannot leave before they are born. Check the two years.");
      say.textContent = "Reading the Atlas…";
      LD.load().then(function (d) {
        data = d;
        var fromRow = resolve("from", $("lf-from")), toRow = resolve("to", $("lf-to"));
        if (!fromRow && $("lf-from").value.trim()) { bad("The Atlas did not recognise \"" + $("lf-from").value.trim() + "\" as one place. Pick one from the list that appears as you type, or try an older name."); throw new Error("stop"); }
        var parsed = { rel: $("lf-rel").value, name: $("lf-name").value.trim().slice(0, 80), given: ($("lf-name").value.trim().split(/\s+/)[0] || ""), givenWord: ($("lf-name").value.trim().split(/\s+/)[0] || ""),
          holds: form.elements["holds"].value || "story", left: left, born: born, from: fromRow ? { row: fromRow } : null, to: toRow ? { row: toRow } : null };
        return LD.gather(parsed);
      }).then(function (g) {
        $("lf-out").hidden = false; $("lf-journey").hidden = false;
        J.draw(g.facts, g.mort);
        var ol = $("lf-plan"); ol.textContent = "";
        g.plan.forEach(function (s) {
          var li = el("li", null, "lf-step"); li.id = "lf-s-" + s.id;
          var head = el("h3"); head.append(el("span", String(s.n), "lf-num"), " " + s.title);
          li.append(head, el("p", s.why, "lf-why"));
          var ul = el("ul", null, "lf-items");
          s.items.forEach(function (it) { var x = el("li"); if (it.href) x.append(el("a", it.text)), x.firstChild.href = it.href; else x.textContent = it.text; ul.append(x); });
          li.append(ul);
          (s.links || []).forEach(function (l) { var p = el("p"), a = el("a", l.text + " →"); a.href = l.href; p.append(a); li.append(p); });
          if (s.ask) { var a2 = el("p", null, "lf-ask"); a2.append(el("b", "Ask: "), s.ask); li.append(a2); }
          if (s.not) { var n = el("p", null, "lf-not"); n.append(el("b", "Do not conclude: "), s.not); li.append(n); }
          ol.append(li);
        });
        var fam = $("lf-family"), out = $("lf-family-out");
        fam.hidden = false; out.textContent = "";
        $("lf-family-btn").onclick = function () {
          var P = window.raProgress;
          if (!P) { out.textContent = "Your research list did not load on this page. Open My research to start one."; return; }
          var r = E.startFamily(P, g.facts, g.plan);
          out.textContent = "";
          out.append("Started " + r.name + " with " + r.added + " planned. ");
          var a = el("a", "Open My research"); a.href = BASE + "my-research/"; out.append(a);
        };
        say.textContent = "";
        $("lf-out").scrollIntoView({ behavior: window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }).catch(function (e) { if (e && e.message !== "stop") bad("Something did not load. Check your connection and try again."); });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
