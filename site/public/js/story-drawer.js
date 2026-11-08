/* THE STORY DRAWER ON THE HOME PAGE: say who you are looking for (type it, paste it, drop a photo) and the home map draws the journey
   while a short plan builds beside it, ending in a button that starts the research family.

   Light on purpose: this file is small and loads at once; the Atlas place files and the engine load only when the drawer is first opened,
   and the map gets one line, two pins and a dot, never a layer. Everything is read in the browser from the Atlas's own files; a
   picture stays in this tab, nothing is sent, and the only thing saved is a research family, when the button is pressed. */
(function () {
  "use strict";
  var root = document.getElementById("ra-story");
  if (!root) return;
  var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  function $(s) { return root.querySelector(s); }
  var launch = document.getElementById("ra-story-open");
  /* Live inside the map's frame, so it sits on the map and goes full screen with it. */
  var host = document.getElementById("ra-map");
  if (host) { host.appendChild(root); if (launch) host.appendChild(launch); }
  var SEEN = "ra-story-seen";
  function remember() { try { localStorage.setItem(SEEN, "1"); } catch (e) { /* a private window: the drawer simply opens again next time */ } }
  function seen() { try { return localStorage.getItem(SEEN) === "1"; } catch (e) { return false; } }

  /* The map hands out its keys, wheel and drags to the place it is dragged over: keep ours to ourselves. */
  ["keydown", "keyup", "keypress", "mousedown", "dblclick", "wheel", "touchstart", "contextmenu", "pointerdown", "click"].forEach(function (t) { root.addEventListener(t, function (e) { e.stopPropagation(); }); });
  if (launch) ["mousedown", "dblclick", "wheel", "touchstart", "pointerdown", "click"].forEach(function (t) { launch.addEventListener(t, function (e) { e.stopPropagation(); }); });

  if (launch) launch.hidden = false;
  var started = null, api = null;
  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = ok; s.onerror = function () { fail(new Error(src)); }; document.head.appendChild(s); }); }
  function ensure() {
    if (started) return started;
    started = (window.raAtlasSummary ? Promise.resolve() : loadScript("atlas-summary.js")).then(function () { return window.raStory ? null : loadScript("story-engine.js"); })
      .then(function () { api = init(); return api; }).catch(function (e) { started = null; throw e; });
    return started;
  }

  function open() {
    root.hidden = false; if (launch) launch.hidden = true;
    requestAnimationFrame(function () { root.classList.add("is-open"); });
    remember();
    ensure().then(function () { var t = $(".sd-text"); if (t && !t.value) t.focus({ preventScroll: true }); }).catch(function () { $(".sd-status").textContent = "The Atlas files did not load. Check your connection and open this again."; });
  }
  function close() { root.classList.remove("is-open"); setTimeout(function () { root.hidden = true; if (launch) launch.hidden = false; }, 260); }
  if (launch) launch.addEventListener("click", open);
  $(".sd-x").addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !root.hidden && root.contains(document.activeElement)) close(); });

  /* The first visit, on the plain home page, with nobody's search or view in the address: open once, then only on request. Never in an automated browser, so a test of the map is not met by a panel on top of it. */
  if (!seen() && !navigator.webdriver && !location.search && (!location.hash || location.hash === "#") && window.innerWidth >= 900) setTimeout(open, 900);

  function init() {
    var S = window.raAtlasSummary, E = window.raStory, el = E.el;
    var LD = E.createLoader(BASE), data = null;
    var text = $(".sd-text"), chips = $(".sd-chips"), status = $(".sd-status"), shots = $(".sd-shots"), file = $(".sd-file"), drop = $(".sd-drop");
    var jbox = $(".sd-journey"), planBox = $(".sd-plan"), fam = $(".sd-family"), famOut = $(".sd-fam-out");
    var files = [], override = { from: null, to: null }, lastSig = "", token = 0, shown = Object.create(null), last = null;

    function getMap() {
      return new Promise(function (ok, fail) {
        var n = 0; (function w() { if (window.raHomeMap && window.L) ok({ L: window.L, map: window.raHomeMap }); else if (n++ > 100) fail(new Error("map")); else setTimeout(w, 100); })();
      });
    }
    var J = E.createJourney({ els: { cap: $(".sd-cap"), slider: $(".sd-year"), yearOut: $(".sd-yearout"), play: $(".sd-play"), moments: $(".sd-moments"), time: $(".sd-time"), mapBox: null },
      getMap: getMap, pad: { tl: [(window.innerWidth >= 900 ? 420 : 30), 50], br: [40, (window.innerWidth >= 900 ? 60 : 260)] } });

    function chip(label, cls, key, onclick) {
      var c = el(onclick ? "button" : "span", label, "sd-chip" + (cls ? " " + cls : "")); if (onclick) { c.type = "button"; c.addEventListener("click", onclick); }
      if (!shown[key]) { shown[key] = 1; c.classList.add("pop"); }
      return c;
    }
    function placeLabel(r) { return r.n + (data.countries[r.cc] ? ", " + data.countries[r.cc] : ""); }
    function drawChips(p) {
      chips.textContent = "";
      if (p.rel) chips.append(chip(p.rel.replace(/-/g, " "), "", "rel:" + p.rel));
      if (p.name) chips.append(chip(p.name, "", "nm:" + p.name));
      ["from", "to"].forEach(function (k) {
        var x = p[k];
        if (!x) { if (k === "from" && text.value.trim().length > 12) chips.append(chip("Where did they start? Name the place", "warn", "nof")); return; }
        var more = x.alts && x.alts.length;
        chips.append(chip((k === "from" ? "from " : "to ") + placeLabel(x.row) + (more ? "  ▾" : ""), k === "from" ? "from" : "to", k + ":" + x.row.i, more ? function () {
          var order = [x.row].concat(x.alts), nx = order[1]; override[k] = { row: nx, alts: order.slice(2).concat([x.row]), word: x.word }; lastSig = ""; run();
        } : null));
      });
      if (p.born) chips.append(chip("born about " + p.born, "", "b:" + p.born));
      if (p.left) chips.append(chip("about " + p.left, "", "l:" + p.left));
      if (p.holds !== "story" || files.length) chips.append(chip((E.HOLDS[p.holds] || E.HOLDS.story).t.replace(/^a /, "") + (files.length ? ", kept here" : ""), "warn", "h:" + p.holds));
    }

    function drawPlan(g) {
      planBox.textContent = ""; planBox.hidden = false;
      g.plan.forEach(function (s, i) {
        var d = el("details", null, "sd-step"); d.style.animationDelay = (i * 140) + "ms";
        var sm = el("summary"); sm.append(el("span", String(s.n), "sd-num"), el("span", s.title)); d.append(sm);
        d.append(el("p", s.why, "sd-why"));
        var ul = el("ul"); s.items.forEach(function (it) { var li = el("li"); if (it.href) { var a = el("a", it.text); a.href = it.href; li.append(a); } else li.textContent = it.text; ul.append(li); });
        d.append(ul);
        (s.links || []).forEach(function (l) { var p = el("p"), a = el("a", l.text + " →"); a.href = l.href; p.append(a); d.append(p); });
        if (s.ask) { var q = el("p", null, "sd-ask"); q.append(el("b", "Ask: "), s.ask); d.append(q); }
        if (s.not) { var n = el("p", null, "sd-not"); n.append(el("b", "Do not conclude: "), s.not); d.append(n); }
        planBox.append(d);
      });
      fam.hidden = false; famOut.textContent = "";
      $(".sd-fam-btn").textContent = "Start the " + E.familyName(g.facts) + " research family";
      $(".sd-fam-btn").onclick = function () {
        var P = window.raProgress;
        if (!P) { famOut.textContent = "Your research list did not load on this page. Reload and try again."; return; }
        var r = E.startFamily(P, g.facts, g.plan);
        famOut.textContent = "";
        famOut.append("Started " + r.name + " with " + r.added + " planned. It is now your active line at the top. ");
        var a = el("a", "Open My research"); a.href = BASE + "my-research/"; famOut.append(a);
        try { if (window.raPaintProgress) window.raPaintProgress(); } catch (e) { /* the map repaints on its own next time */ }
      };
    }

    function run() {
      var t = text.value;
      LD.load().then(function (d) {
        data = d;
        var attached = files.length ? "photo" : null;
        var p = E.parseStory(t, { map: d.map, given: d.given, skip: d.skip }, attached);
        if (override.from && p.from && override.from.row.n === p.from.row.n) p.from = override.from; else if (!p.from || !override.from || override.from.word !== p.from.word) override.from = null;
        if (override.to && p.to && override.to.row.n === p.to.row.n) p.to = override.to; else if (!p.to || !override.to || override.to.word !== p.to.word) override.to = null;
        drawChips(p);
        var sig = [p.from && p.from.row.i, p.to && p.to.row.i, p.left, p.born, p.name, p.holds].join("|");
        if (sig === lastSig || !p.from) { if (!p.from && sig !== lastSig) { J.clear(); jbox.hidden = true; planBox.hidden = true; fam.hidden = true; } return; }
        lastSig = sig;
        var my = ++token; status.textContent = "Reading the Atlas…";
        LD.gather(p).then(function (g) {
          if (my !== token) return;
          status.textContent = ""; last = g;
          jbox.hidden = false; J.draw(g.facts, g.mort); drawPlan(g);
        }).catch(function () { status.textContent = "Some Atlas files did not load. Check your connection."; });
      }).catch(function () { status.textContent = "The Atlas files did not load. Check your connection."; });
    }
    var tm = null;
    text.addEventListener("input", function () { clearTimeout(tm); tm = setTimeout(run, 650); });

    /* pictures: dropped, pasted or chosen; kept in this tab only */
    function addFiles(list) {
      [].slice.call(list || []).filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); }).slice(0, 4 - files.length).forEach(function (f) { files.push({ f: f, url: URL.createObjectURL(f) }); });
      drawShots(); lastSig = ""; run();
    }
    function drawShots() {
      shots.textContent = "";
      files.forEach(function (x, i) {
        var w = el("span", null, "sd-shot"), im = el("img"); im.src = x.url; im.alt = "Picture " + (i + 1) + " you added";
        var rm = el("button", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove picture " + (i + 1)); rm.addEventListener("click", function () { URL.revokeObjectURL(x.url); files.splice(i, 1); drawShots(); lastSig = ""; run(); });
        w.append(im, rm); shots.append(w);
      });
      shots.hidden = !files.length; $(".sd-read").hidden = !files.length;
    }
    file.addEventListener("change", function () { addFiles(file.files); file.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("hot"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("hot"); }); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
    text.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });
    $(".sd-clear").addEventListener("click", function () {
      files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; chips.textContent = ""; override = { from: null, to: null }; lastSig = ""; shown = Object.create(null);
      J.clear(); jbox.hidden = true; planBox.hidden = true; fam.hidden = true; status.textContent = ""; text.focus();
    });
    $(".sd-eg").addEventListener("click", function () { text.value = "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo."; run(); });
    window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
    if (text.value) run();
    return { run: run };
  }
})();
