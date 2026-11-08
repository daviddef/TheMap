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
  var dock = document.getElementById("ra-journey");
  function $(s) { return root.querySelector(s) || (dock && dock.querySelector(s)); }
  var launch = document.getElementById("ra-story-open");
  /* Live inside the map's frame, so it sits on the map and goes full screen with it. */
  var host = document.getElementById("ra-map");
  if (host) { host.appendChild(root); if (dock) host.appendChild(dock); if (launch) host.appendChild(launch); }
  var SEEN = "ra-story-seen";
  function remember() { try { localStorage.setItem(SEEN, "1"); } catch (e) { /* a private window: the drawer simply opens again next time */ } }
  function seen() { try { return localStorage.getItem(SEEN) === "1"; } catch (e) { return false; } }

  /* The map hands out its keys, wheel and drags to the place it is dragged over: keep ours to ourselves. */
  [root, dock].forEach(function (box) { if (box) ["keydown", "keyup", "keypress", "mousedown", "dblclick", "wheel", "touchstart", "contextmenu", "pointerdown", "click"].forEach(function (t) { box.addEventListener(t, function (e) { e.stopPropagation(); }); }); });
  if (launch) ["mousedown", "dblclick", "wheel", "touchstart", "pointerdown", "click"].forEach(function (t) { launch.addEventListener(t, function (e) { e.stopPropagation(); }); });

  if (launch) launch.hidden = false;
  var started = null, api = null;
  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = ok; s.onerror = function () { fail(new Error(src)); }; document.head.appendChild(s); }); }
  function ensure() {
    if (started) return started;
    started = (window.raAtlasSummary ? Promise.resolve() : loadScript("atlas-summary.js")).then(function () { return window.raShardKey ? null : loadScript("shard-key.js").catch(function () {}); }).then(function () { return window.raStory ? null : loadScript("story-engine.js"); })
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
    var planBox = $(".sd-plan"), fam = $(".sd-family"), famOut = $(".sd-fam-out");
    /* the dock: shown when a journey is drawn, tabs for what sits in it, the map gives it room */
    function dockSize() { if (host) host.style.setProperty("--sdk-h", (dock.hidden ? 0 : dock.offsetHeight) + "px"); }
    function showDock(on) {
      if (host) host.classList.toggle("has-dock", on);
      root.classList.toggle("is-compact", on);
      if (on) { dock.hidden = false; requestAnimationFrame(function () { dock.classList.add("is-open"); dockSize(); }); }
      else { dock.classList.remove("is-open"); dock.hidden = true; dockSize(); }
    }
    function pickTab(name) {
      [].forEach.call(dock.querySelectorAll(".sdk-tab"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false"); });
      [].forEach.call(dock.querySelectorAll(".sdk-panel"), function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
      dock.removeAttribute("data-collapsed"); setTimeout(dockSize, 30);
    }
    function tabShow(name, on) { var b = dock.querySelector('.sdk-tab[data-tab="' + name + '"]'); if (b) b.hidden = !on; }
    [].forEach.call(dock.querySelectorAll(".sdk-tab"), function (b) {
      b.addEventListener("click", function () {
        if (b.getAttribute("aria-selected") === "true") { if (dock.hasAttribute("data-collapsed")) dock.removeAttribute("data-collapsed"); else dock.setAttribute("data-collapsed", ""); setTimeout(dockSize, 30); return; }
        pickTab(b.getAttribute("data-tab"));
      });
    });
    dock.querySelector(".sdk-x").addEventListener("click", function () { showDock(false); });
    window.addEventListener("resize", dockSize);
    var files = [], ov = Object.create(null), lastSig = "", parsedNow = null, token = 0, shown = Object.create(null), last = null;

    function getMap() {
      return new Promise(function (ok, fail) {
        var n = 0; (function w() { if (window.raHomeMap && window.L) ok({ L: window.L, map: window.raHomeMap }); else if (n++ > 100) fail(new Error("map")); else setTimeout(w, 100); })();
      });
    }
    var J = E.createJourney({ els: { cap: $(".sd-cap"), slider: $(".sd-year"), yearOut: $(".sd-yearout"), play: $(".sd-play"), moments: $(".sd-moments"), time: $(".sd-time"), mapBox: null },
      getMap: getMap, onBorn: function (y) { setBorn(y); }, pad: { tl: [(window.innerWidth >= 900 ? 430 : 30), 50], br: [60, (window.innerWidth >= 900 ? 300 : 330)] } });

    function chip(label, cls, key, onclick) {
      var c = el(onclick ? "button" : "span", label, "sd-chip" + (cls ? " " + cls : "")); if (onclick) { c.type = "button"; c.addEventListener("click", onclick); }
      if (!shown[key]) { shown[key] = 1; c.classList.add("pop"); }
      return c;
    }
    function placeLabel(r) { var n = r.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(r.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }), c = data.countries[r.cc]; return n + (c && S.fold(c) !== S.fold(n) ? ", " + c : ""); }
    function drawChips(p) {
      chips.textContent = "";
      if (p.rel) chips.append(chip(p.rel.replace(/-/g, " "), "", "rel:" + p.rel));
      if (p.name) chips.append(chip(p.name, "", "nm:" + p.name));
      if (p.people) p.people.forEach(function (pe) { if (pe.role !== "self" && pe.name) chips.append(chip("his " + pe.role + " " + pe.name, "", "pe:" + pe.role + pe.name)); });
      var stopsShown = p.stops && p.stops.length ? p.stops : [p.from && Object.assign({ role: "origin" }, p.from), p.to && Object.assign({ role: "move" }, p.to)].filter(Boolean);
      if (!stopsShown.length && text.value.trim().length > 12) chips.append(chip("Where did they start? Name the place", "warn", "nof"));
      stopsShown.forEach(function (st) {
        var more = st.alts && st.alts.length, lab = placeLabel(st.row);
        var pre = st.role === "born" ? "born in " : st.role === "origin" ? "from " : st.role === "father-from" ? "his father from " : st.role === "mother-from" ? "his mother from " : st.age != null ? (st.approx ? "about age " : "age ") + st.age + ": " : st.role === "lived" ? "in " : "to ";
        chips.append(chip(pre + lab + (more ? "  ▾" : ""), st.role === "born" || st.role === "origin" ? "from" : "to", "s:" + st.row.i + st.role, more ? function () {
          ov[st.word] = { row: st.alts[0], alts: st.alts.slice(1).concat([st.row]) }; lastSig = ""; run();
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
        (p.stops || []).forEach(function (st) { var o2 = ov[st.word]; if (o2) { st.row = o2.row; st.alts = o2.alts; } });
        if (p.route && p.route.length) {
          var r0 = p.route[0], rl = p.route[p.route.length - 1];
          p.from = { row: r0.row, alts: r0.alts, word: r0.word }; p.to = p.route.length > 1 ? { row: rl.row, alts: rl.alts, word: rl.word } : null;
        }
        parsedNow = p;
        drawChips(p);
        var sig = [(p.route || []).map(function (x) { return x.row.i + ":" + x.age; }).join(","), p.left, p.born, p.name, (p.people || []).map(function (x) { return x.name; }).join(","), p.holds].join("|");
        if (sig === lastSig || !p.from) { if (!p.from && sig !== lastSig) { J.clear(); showDock(false); planBox.hidden = true; fam.hidden = true; } return; }
        lastSig = sig;
        var my = ++token; status.textContent = "Reading the Atlas…";
        LD.gather(p).then(function (g) {
          if (my !== token) return;
          status.textContent = ""; last = g;
          showDock(true); pickTab("journey"); $(".sdk-title").textContent = g.facts.name ? g.facts.name + "'s journey" : "Their journey"; J.draw(g.facts, g.mort); drawFamily(g); drawNames(g); drawPlan(g); setTimeout(dockSize, 60);
        }).catch(function () { status.textContent = "Some Atlas files did not load. Check your connection."; });
      }).catch(function () { status.textContent = "The Atlas files did not load. Check your connection."; });
    }
    function drawFamily(g) {
      var box = $(".sd-tree"), tr = E.treeBlock(g.people, g.facts.rel);
      box.textContent = ""; tabShow("family", !!tr); if (tr) box.append(tr);
    }
    /* The story gave ages, not dates: with a birth year the same journey is drawn again with the years. */
    function setBorn(y) {
      if (!parsedNow) return;
      parsedNow.born = y; (parsedNow.route || []).forEach(function (st) { if (st.age != null) st.year = y + st.age; });
      status.textContent = "Reading the Atlas…";
      LD.gather(parsedNow).then(function (g) { status.textContent = ""; last = g; J.draw(g.facts, g.mort); drawFamily(g); drawNames(g); drawPlan(g); }).catch(function () { status.textContent = "Some Atlas files did not load. Check your connection."; });
    }
    function drawNames(g) {
      var box = $(".sd-names"), nb = E.namesBlock(g.names, BASE);
      box.textContent = ""; tabShow("names", !!nb); if (nb) { box.append(nb); [].forEach.call(nb.querySelectorAll("details"), function (d) { d.open = true; }); }
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
      files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; chips.textContent = ""; ov = Object.create(null); parsedNow = null; lastSig = ""; shown = Object.create(null);
      J.clear(); showDock(false); planBox.hidden = true; fam.hidden = true; status.textContent = ""; text.focus();
    });
    $(".sd-eg").addEventListener("click", function () { text.value = "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo."; run(); });
    window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
    if (text.value) run();
    return { run: run };
  }
})();
