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
  var report = document.getElementById("ra-report");
  function $(s) { return root.querySelector(s) || (dock && dock.querySelector(s)) || (report && report.querySelector(s)); }
  var launch = document.getElementById("ra-story-open");
  /* Live inside the map's frame, so it sits on the map and goes full screen with it. */
  var host = document.getElementById("ra-map");
  if (host) { host.appendChild(root); if (dock) host.appendChild(dock); if (launch) host.appendChild(launch); }
  /* the story itself goes under the map, in the page */
  if (host && report && host.parentNode) host.parentNode.insertAdjacentElement("afterend", report);
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
  /* The one box: the search box on the map (unified-search.js) hands a typed story, pictures or a clear to the same reader the panel uses. */
  window.raStoryBox = {
    start: function (t) { return ensure().then(function (a) { a.setText(t); }); },
    addFiles: function (fl) { return ensure().then(function (a) { a.addFiles(fl); }); },
    clear: function () { return started ? started.then(function (a) { a.clear(); }) : Promise.resolve(); },
    open: function () { open(); },
    ready: function () { return ensure(); },
    state: function () { return api && api.state ? api.state() : { has: false, name: "" }; }
  };

  function open() {
    root.hidden = false; if (launch) launch.hidden = true;
    requestAnimationFrame(function () { root.classList.add("is-open"); });
    setTimeout(function () { if (refit) refit(); }, 350);
    remember();
    ensure().then(function () { var t = $(".sd-text"); if (t && !t.value) t.focus({ preventScroll: true }); }).catch(function () { $(".sd-status").textContent = "The Atlas files did not load. Check your connection and open this again."; });
  }
  /* Something to draw: a starting place, a family's places, or a person being looked for whose parents are named (they may have no place yet). */
  function tellable(p) { return !!(p && (p.from || (p.kin && p.kin.length) || (p.people || []).some(function (x) { return x.sought; }))); }
  var refit = null; /* set once the engine is loaded: draw the journey again so the pins fit the map that is left uncovered */
  /* Closing only hides the panel: the map stays where the reader left it (no refit), and the button now says Edit your story. */
  function close() { root.classList.remove("is-open"); setTimeout(function () { root.hidden = true; if (launch) launch.hidden = false; }, 300); }
  function launchLabel(editing) {
    if (!launch) return;
    var t = editing ? "Edit your story" : "Start with your story", n = launch.lastChild;
    if (n && n.nodeType === 3) n.nodeValue = "\n  " + t + "\n"; else launch.append(t);
    launch.setAttribute("aria-label", t);
  }
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
      launchLabel(on);
      if (host) host.classList.toggle("has-dock", on);
      root.classList.toggle("is-compact", on);
      if (on) { dock.hidden = false; requestAnimationFrame(function () { dock.classList.add("is-open"); dockSize(); }); }
      else { dock.classList.remove("is-open"); dock.hidden = true; dockSize(); }
    }
    /* a section of the story and the button that jumps to it appear only when they hold something */
    function secShow(id, on) {
      var sec = report.querySelector("#" + id), b = report.querySelector('[data-go="' + id + '"]');
      if (sec) sec.hidden = !on; if (b) b.hidden = !on;
    }
    [].forEach.call(report.querySelectorAll("[data-go]"), function (b) {
      b.addEventListener("click", function () { var t = report.querySelector("#" + b.getAttribute("data-go")); if (t) t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
    });
    var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    dock.querySelector(".sdk-more").addEventListener("click", function () { report.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }); });
    dock.querySelector(".sdk-x").addEventListener("click", function () { showDock(false); });
    window.addEventListener("resize", dockSize);
    refit = function () { if (last && !dock.hidden) paint(last); };
    var files = [], ov = Object.create(null), lastSig = "", parsedNow = null, token = 0, shown = Object.create(null), last = null;

    function getMap() {
      return new Promise(function (ok, fail) {
        var n = 0; (function w() { if (window.raHomeMap && window.L) ok({ L: window.L, map: window.raHomeMap }); else if (n++ > 100) fail(new Error("map")); else setTimeout(w, 100); })();
      });
    }
    var J = E.createJourney({ els: { cap: $(".sd-cap"), slider: $(".sd-year"), yearOut: $(".sd-yearout"), play: $(".sd-play"), moments: $(".sd-moments"), time: $(".sd-time"), mapBox: null },
      getMap: getMap, askBox: report.querySelector(".rep-ask"), onBorn: function (y) { setBorn(y); }, pad: { get tl() { var W = host ? host.clientWidth : window.innerWidth; return [root.classList.contains("is-open") && W >= 800 ? 430 : 30, 50]; }, get br() { return [60, 150]; } } });

    /* The flag cards under the map follow the story: only the countries its places are in, and all of them again when the story goes. */
    (function () {
      var draw0 = J.draw, clear0 = J.clear;
      function flagsFor(f) {
        if (!window.raFlagsFor) return;
        if (!f) { window.raFlagsFor(null); return; }
        var seen = Object.create(null), out = [];
        function add(i) { var c = i && i.cc && String(i.cc).toUpperCase(); if (c && !seen[c]) { seen[c] = 1; out.push(c); } }
        (f.route || []).forEach(function (x) { add(x.info); }); add(f.from); add(f.to);
        (f.kin || []).forEach(function (k) { (k.stops || []).forEach(function (x) { add(x.info); }); });
        (f.ancestors || []).forEach(function (x) { add(x.info); });
        window.raFlagsFor(out);
      }
      J.draw = function (f, m, n) { var r = draw0.call(J, f, m, n); flagsFor(f); return r; };
      J.clear = function () { var r = clear0.apply(J, arguments); flagsFor(null); return r; };
    })();

    function chip(label, cls, key, onclick) {
      var c = el(onclick ? "button" : "span", label, "sd-chip" + (cls ? " " + cls : "")); if (onclick) { c.type = "button"; c.addEventListener("click", onclick); }
      if (!shown[key]) { shown[key] = 1; c.classList.add("pop"); }
      return c;
    }
    function placeLabel(r) { var n = r.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(r.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }), c = data.countries[r.cc]; return n + (c && S.fold(c) !== S.fold(n) ? ", " + c : ""); }
    function drawChips(p) {
      chips.textContent = "";
      if (p.teller) chips.append(chip("you: " + p.teller, "", "teller:" + p.teller));
      if (p.rel) chips.append(chip(p.rel.replace(/-/g, " "), "", "rel:" + p.rel));
      if (p.name) chips.append(chip(p.name, "", "nm:" + p.name));
      if (p.people) p.people.forEach(function (pe) {
        if (p.noRoute || p.sought) { if (pe.role !== "self") chips.append(chip((pe.label || pe.role) + (pe.name ? " " + pe.name : ""), "", "pe:" + pe.key + pe.name)); }
        else if (pe.role !== "self" && pe.name) chips.append(chip("his " + (pe.label || pe.role) + " " + pe.name, "", "pe:" + pe.role + pe.name));
      });
      var stopsShown = p.stops && p.stops.length ? p.stops : [p.from && Object.assign({ role: "origin" }, p.from), p.to && Object.assign({ role: "move" }, p.to)].filter(Boolean);
      if (!stopsShown.length && !tellable(p) && text.value.trim().length > 12) chips.append(chip("Where did they start? Name the place", "warn", "nof"));
      stopsShown.forEach(function (st) {
        var more = st.alts && st.alts.length, lab = placeLabel(st.row);
        var pre = st.role === "born" ? "born in " : st.role === "origin" ? "from " : st.role === "father-from" ? "his father from " : st.role === "mother-from" ? "his mother from " : st.age != null ? (st.approx ? "about age " : "age ") + st.age + ": " : st.role === "lived" ? "in " : "to ";
        chips.append(chip(pre + lab + (st.yearTold ? ", " + st.year : "") + (more ? "  ▾" : ""), st.role === "born" || st.role === "origin" ? "from" : "to", "s:" + st.row.i + st.role, more ? function () {
          ov[st.word] = { row: st.alts[0], alts: st.alts.slice(1).concat([st.row]) }; lastSig = ""; run();
        } : null));
      });
      (p.kin || []).forEach(function (k) {
        if (!p.noRoute && !p.sought) return;
        k.stops.forEach(function (st) {
          chips.append(chip((k.label || "family") + (k.name ? " " + k.name : "") + ": " + (st.role === "born" ? "born in " : st.role === "origin" ? "from " : st.role === "married" ? "married in " : "to ") + placeLabel(st.row), st.role === "born" || st.role === "origin" ? "from" : "to", "k:" + k.key + st.row.i + st.role));
        });
      });
      if (p.born) chips.append(chip("born about " + p.born, "", "b:" + p.born));
      if (p.left && !stopsShown.some(function (st) { return st.yearTold; })) chips.append(chip("about " + p.left, "", "l:" + p.left));
      if (p.holds !== "story" || files.length) chips.append(chip((E.HOLDS[p.holds] || E.HOLDS.story).t.replace(/^a /, "") + (files.length ? ", kept here" : ""), "warn", "h:" + p.holds));
      var unread = files.filter(function (x) { return !x.r; }).length;
      if (unread) chips.append(chip("Read " + (unread === 1 ? "the picture" : unread + " pictures") + " with Claude", "warn", "readpics", function () { readPics(); }));
    }

    function drawPlan(g) {
      planBox.textContent = ""; planBox.hidden = false;
      g.plan.forEach(function (s, i) {
        var d = el("details", null, "sd-step"); d.open = true; d.style.animationDelay = (i * 140) + "ms";
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
      var nameIn = $(".sd-fam-name"); if (nameIn && document.activeElement !== nameIn && (!nameIn.value || nameIn.getAttribute("data-auto") === "1")) { nameIn.value = E.familyName(g.facts); nameIn.setAttribute("data-auto", "1"); }
      if (nameIn && !nameIn.__wired) nameIn.__wired = nameIn.addEventListener("input", function () { nameIn.setAttribute("data-auto", "0"); $(".sd-fam-btn").textContent = "Start the " + (nameIn.value.trim() || "research") + " family"; });
      $(".sd-fam-btn").textContent = "Start the " + ((nameIn && nameIn.value.trim()) || E.familyName(g.facts)) + " research family";
      $(".sd-fam-btn").onclick = function () {
        var P = window.raProgress;
        if (!P) { famOut.textContent = "Your research list did not load on this page. Reload and try again."; return; }
        var r = E.startFamily(P, g.facts, g.plan.concat([{ items: stopItems }]), { name: nameIn ? nameIn.value : "" });
        famOut.textContent = "";
        famOut.append("Started " + r.name + " with " + r.added + " planned. It is now your active line at the top. ");
        var a = el("a", "Open My research"); a.href = BASE + "my-research/"; famOut.append(a);
        try { if (window.raPaintProgress) window.raPaintProgress(); } catch (e) { /* the map repaints on its own next time */ }
      };
    }

    function run() {
      var t = text.value;
      var clr = $(".sd-clear"); if (clr) clr.hidden = !t.trim() && !files.length;
      LD.resolveMissing(t).catch(function () { return LD.load(); }).then(function (d) {
        data = d;
        var attached = files.length ? "photo" : null;
        var p = E.parseStory(t, { map: d.map, given: d.given, skip: d.skip, countries: d.countries }, attached);
        (p.stops || []).forEach(function (st) { var o2 = ov[st.word]; if (o2) { st.row = o2.row; st.alts = o2.alts; } });
        if (p.route && p.route.length) {
          var r0 = p.route[0], rl = p.route[p.route.length - 1];
          p.from = { row: r0.row, alts: r0.alts, word: r0.word }; p.to = p.route.length > 1 ? { row: rl.row, alts: rl.alts, word: rl.word } : null;
        }
        parsedNow = p;
        drawChips(p);
        var sig = [(p.route || []).map(function (x) { return x.row.i + ":" + x.age; }).join(","), p.left, p.born, p.name, (p.people || []).map(function (x) { return x.name; }).join(","), p.holds].join("|");
        if (sig === lastSig || !tellable(p)) { if (!tellable(p) && sig !== lastSig) { J.clear(); showDock(false); dropKeyPlaces(); report.hidden = true; planBox.hidden = true; fam.hidden = true; } return; }
        lastSig = sig;
        var my = ++token; status.textContent = "Reading the Atlas…";
        LD.gather(p).then(function (g) {
          if (my !== token) return;
          status.textContent = ""; last = g;
          showDock(true); drawAll(g); setTimeout(dockSize, 60);
        }).catch(function (e) { if (window.console) console.error("story draw", e); status.textContent = "Some Atlas files did not load. Check your connection."; });
      }).catch(function (e) { if (window.console) console.error("story read", e); status.textContent = "The Atlas files did not load. Check your connection."; });
    }
    var stopItems = [];
    /* The map's right-hand pane ("Visiting") is for one place at a time. While a story is on the map it lists the story's own places in
       order instead, each with the nearest archive the Atlas knows, so it answers "where do I go for each step", not "what is near Senj". */
    function hav(a, b, c, d) { var r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r, x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 12742 * Math.asin(Math.sqrt(x)); }
    function keyPlaces(f) {
      var pane = document.getElementById("ra-check"), body = document.getElementById("ra-check-b"), cnt = document.getElementById("ra-check-n");
      if (!pane || !body) return;
      var route = (f.route || []).filter(function (x) { return x.info; }), anc = (f.ancestors || []).filter(function (x) { return x.info; }), n = 0;
      var hood = el("p", null, "ra-hood ra-story-list"); hood.append(el("span", null, "ra-hood-k"), el("span", (f.name ? f.name + "'s" : "The") + " places, in order, with the nearest archive the Atlas knows for each. The story below says where to search."));
      var ul = el("ul");
      function row(info, label) {
        n++;
        var li = el("li", null, "ra-ck-r" + (n % 2 === 0 ? " ra-alt" : "")), main = el("span", null, "ra-ck-main"), a = el("a", info.name); a.href = info.href; a.target = "_blank"; a.rel = "noopener";
        main.append(a); li.append(el("span", String(n), "ra-ck-i"), main);
        var meta = el("span", null, "ra-ck-meta"); meta.append(el("span", label, "ra-ck-n")); li.append(meta); ul.append(li);
        if (info.lat != null) {
          (info.provs || []).filter(function (p) { return p.at && p.at.lat != null; }).map(function (p) { return { p: p, km: hav(info.lat, info.lon, p.at.lat, p.at.lon) }; })
            .filter(function (x) { return x.km <= 120; }).sort(function (x, y) { return x.km - y.km; }).slice(0, 1).forEach(function (x) {
              var l2 = el("li", null, "ra-ck-r ra-ck-nonum"), m2 = el("span", null, "ra-ck-main"), a2 = el("a", x.p.name); a2.href = x.p.url; a2.target = "_blank"; a2.rel = "noopener";
              m2.append(a2, document.createTextNode(" "), el("span", (Math.round(x.km * 10) / 10) + " km", "ra-ck-km")); l2.append(m2); ul.append(l2);
            });
        }
      }
      route.forEach(function (x, i) {
        var first = i === 0, last = i === route.length - 1 && route.length > 1;
        var role = first ? (x.role === "born" ? "Born" : "Starts") : last ? "Arrives" : "Lives";
        row(x.info, role + (x.age != null ? " · " + (x.approx ? "about " : "") + "age " + x.age : ""));
      });
      anc.forEach(function (x) { row(x.info, "His " + x.who + "'s family"); });
      (f.kin || []).forEach(function (k) { k.stops.forEach(function (st) { if (st.info) row(st.info, (((k.label ? k.label + " " : "") + (k.name || "")).trim() || "Family") + (st.role === "born" ? ", born" : "") + (st.year != null ? " " + st.year : "")); }); });
      body.textContent = ""; body.append(hood, ul);
      if (cnt) cnt.textContent = String(n);
      var w = pane.querySelector(".ra-check-w"); if (w) w.textContent = "Key places";
      pane.hidden = false;
      var tg = document.getElementById("ra-check-t"), opened = false; if (tg && !pane.classList.contains("on")) { tg.click(); opened = true; }
      return opened;
    }
    function dropKeyPlaces() { var pane = document.getElementById("ra-check"); if (pane && pane.querySelector(".ra-story-list")) pane.hidden = true; }
    function lede(f) {
      var bits = (f.route || []).filter(function (x) { return x.info; }).map(function (x, i) {
        var a = x.age != null ? (x.approx ? " at about age " : " at age ") + x.age : "";
        return (i === 0 ? (x.role === "born" ? "born in " : "from ") : i === f.route.length - 1 ? "arriving in " : "then ") + x.info.name + (i ? a : "");
      });
      return bits.length ? (f.name ? f.name + ": " : "") + bits.join(", ") + "." : "";
    }
    function drawReport(g) {
      var f = g.facts;
      report.hidden = false;
      report.querySelector(".rep-title").textContent = f.name ? f.name + "'s story" : "Their story";
      dock.querySelector(".sdk-title").textContent = f.name ? f.name : "Their journey";
      report.querySelector(".rep-lede").textContent = lede(f);
      var sb = J.stops(f, g.mort); stopItems = sb.items;
      var stops = report.querySelector(".rep-stops"); stops.textContent = ""; stops.append(sb);
      drawFamily(g); drawNames(g); drawPlan(g);
      return keyPlaces(f);
    }
    /* the right-hand pane may have just opened and narrowed the map: draw the journey once the map has its final size */
    function paint(g) { J.draw(g.facts, g.mort); settingNote(g); }
    function drawAll(g) {
      var wait = drawReport(g);
      if (wait) setTimeout(function () { if (last === g) paint(g); }, 400); else paint(g);
    }
    /* "What was going on" is matched to years. With ages only there is nothing to match yet: say so, and say what fills it. */
    function settingNote(g) {
      var m = report.querySelector(".sd-moments"); if (!m || m.children.length) return;
      var f = g.facts, haveYear = f.born != null || f.left != null || (f.route || []).some(function (x) { return x.year != null; });
      if (haveYear) { m.append(el("p", "The Atlas holds no epidemic, famine, war or mass-death event whose area covers these places in the years they were there. That is what the Atlas holds, not proof that nothing happened.", "rep-intro")); return; }
      m.append(el("p", "This fills in once the Atlas knows the years. The story gave ages but no dates. Add the year they were born and it shows the epidemics, famines, wars and leaders of the years they were at each place, and who held the ground.", "rep-intro"));
      var b = el("button", "Add a birth year"); b.type = "button"; b.className = "sd-fam-btn rep-yearbtn";
      b.addEventListener("click", function () { var box = report.querySelector(".rep-ask"); box.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }); var i = box.querySelector("input"); if (i) i.focus({ preventScroll: true }); });
      m.append(b);
    }
    function drawFamily(g) {
      var box = $(".sd-tree"), tr = E.treeBlock(g.people, g.facts.rel);
      box.textContent = ""; secShow("rep-family", !!tr); if (tr) box.append(tr);
    }
    /* The story gave ages, not dates: with a birth year the same journey is drawn again with the years. */
    function setBorn(y) {
      if (!parsedNow) return;
      parsedNow.born = y; (parsedNow.route || []).forEach(function (st) { if (st.age != null) st.year = y + st.age; });
      status.textContent = "Reading the Atlas…";
      LD.gather(parsedNow).then(function (g) { status.textContent = ""; last = g; drawAll(g); }).catch(function () { status.textContent = "Some Atlas files did not load. Check your connection."; });
    }
    function drawNames(g) {
      var box = $(".sd-names"), nb = E.namesBlock(g.names, BASE);
      box.textContent = ""; secShow("rep-names", !!nb); if (nb) { box.append(nb); [].forEach.call(nb.querySelectorAll("details"), function (d) { d.open = true; }); }
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
      shots.hidden = !files.length; var rd = $(".sd-read"); if (rd) rd.hidden = !files.length || files.every(function (x) { return x.r; });
    }
    /* READ THE PICTURES: on the press, each is read as a document by Claude, and what it says about the people with the story's surnames is
       added to the story's own words (a block per picture, replaced if read again). The pictures are shrunk here and kept for Save. */
    function readPics() {
      var btn = $(".sd-read-btn"); if (!files.length) return;
      btn.disabled = true;
      var keys = []; ((parsedNow && parsedNow.people) || []).forEach(function (pe) { if (pe.surname && keys.indexOf(pe.surname) < 0) keys.push(pe.surname); }); if (parsedNow && parsedNow.surname && keys.indexOf(parsedNow.surname) < 0) keys.push(parsedNow.surname);
      Promise.all([window.raStoryPics ? null : loadScript("story-pics.js"), window.raStoryRead && window.raStoryRead.read ? null : loadScript("story-read.js")]).then(function () {
        return window.raStoryRead.read(files, keys, function (m) { status.textContent = m; });
      }).then(function (res) {
        var R = window.raStoryRead, base = R.stripBlocks(text.value), blocks = [];
        files.forEach(function (x, i) { if (x.r) blocks.push(R.block(i + 1, x.f.name || "picture", x.r)); });
        text.value = (base + (blocks.length ? "\n\n" + blocks.join("\n\n") : "")).slice(0, 8000);
        var nf = files.filter(function (x) { return x.r && !x.r.found; }).length;
        status.textContent = res.failed ? "Read " + res.got + " of " + files.length + ", then it stopped: " + (res.failed.message || "something went wrong.") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : "")
          : "Read " + res.got + " picture" + (res.got === 1 ? "" : "s") + ". What they say is now in your story below." + (nf ? " " + nf + " had nobody with a matching surname on it." : "") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : "");
        drawShots(); lastSig = ""; run();
      }).catch(function (e) { status.textContent = (e && e.message) || "The pictures could not be read."; }).then(function () { btn.disabled = false; });
    }
    $(".sd-read-btn").addEventListener("click", readPics);
    file.addEventListener("change", function () { addFiles(file.files); file.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("hot"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("hot"); }); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
    text.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });
    /* keep the story: the words (and the names of any photos) go to My research, My story, where more can be added */
    $(".sd-save-btn").addEventListener("click", function () {
      var out = $(".sd-save-out"), t = text.value.trim();
      if (!t && !files.length) { out.textContent = "Tell the story first, then save it."; return; }
      (window.raStories ? Promise.resolve() : loadScript("stories.js")).then(function () { return files.length && !window.raStoryPics ? loadScript("story-pics.js") : null; }).then(function () {
        var ST = window.raStories, f = last && last.facts;
        var id = ST.create({ name: f && f.name ? f.name + "'s story" : "", text: t.slice(0, 5800) });
        if (!id) { out.textContent = "This browser would not keep it. Storage may be full or blocked."; return; }
        if (t.length > 5800) ST.addPiece(id, { kind: "story", label: "The family story (continued)", text: t.slice(5800, 11600) });
        /* each picture is a piece of its own, labelled with what it was read as, and its picture is kept in this browser beside it. Its words
           are already in the story piece above, so the piece itself holds none. */
        var kept = 0, lost = 0;
        var keeps = files.map(function (x) {
          var label = (x.r && x.r.label ? x.r.label + " (" + String(x.f.name || "").replace(/\.[a-z0-9]+$/i, "") + ")" : String(x.f.name || "Photo").replace(/\.[a-z0-9]+$/i, "")).slice(0, 80);
          var pid = ST.addPiece(id, { kind: x.r ? "document" : "photo", label: label, text: "" });
          return Promise.resolve(x.shot || window.raStoryPics.shrink(x.f)).then(function (shot) { return window.raStoryPics.put(id + "/" + pid, shot.blob); }).then(function () { kept++; }, function () { lost++; });
        });
        if (parsedNow && parsedNow.born != null) ST.setBorn(id, parsedNow.born);
        try { localStorage.setItem("ra-story-current", id); } catch (e) { /* the page still opens it by address */ }
        Promise.all(keeps).then(function () {
          out.textContent = "Saved" + (kept ? " with " + kept + " picture" + (kept === 1 ? "" : "s") + ", kept in this browser only (the words travel with the story, the pictures do not)" : "") + (lost ? ". " + lost + " picture" + (lost === 1 ? " was" : "s were") + " not kept: this browser would not store them" : "") + ". ";
          var a = el("a", "Open it in My research to add more"); a.href = BASE + "my-research/#story/" + id; out.append(a, document.createTextNode("."));
        });
        $(".sd-save-btn").disabled = true; setTimeout(function () { $(".sd-save-btn").disabled = false; }, 4000);
      }).catch(function () { out.textContent = "Could not save here. Open My research and start the story there."; });
    });
    var announced = false;
    $(".sd-clear").addEventListener("click", function () {
      announced = false;
      files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; chips.textContent = ""; ov = Object.create(null); parsedNow = null; lastSig = ""; shown = Object.create(null);
      J.clear(); showDock(false); dropKeyPlaces(); report.hidden = true; planBox.hidden = true; fam.hidden = true; status.textContent = ""; text.focus();
    });
    $(".sd-eg").addEventListener("click", function () { text.value = "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo."; run(); });
    window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
    if (text.value) run();
    return {
      run: run,
      setText: function (t) { text.value = String(t || "").slice(0, 2000); lastSig = ""; if (!announced) { announced = true; try { document.dispatchEvent(new CustomEvent("ra-story-start")); } catch (e) { /* no document */ } } run(); },
      addFiles: function (fl) { try { document.dispatchEvent(new CustomEvent("ra-story-start")); } catch (e) { /* no document */ } addFiles(fl); },
      clear: function () { $(".sd-clear").click(); },
      state: function () { return { has: !!(parsedNow && ((parsedNow.route && parsedNow.route.length) || parsedNow.from || parsedNow.name || parsedNow.teller || tellable(parsedNow))), name: parsedNow && parsedNow.name || "", files: files.length }; }
    };
  }
})();
