/* THE GUIDED START ON /read/: four screens, one at a time. What do you have? Tell us what you know. Their journey. Your first steps.
   The same engine as the home page's drawer (story-engine.js), as a full-width walk-through for someone who wants to be led.

   Pictures stay in this tab. Nothing is sent from these four screens. To have Claude read the writing on a picture, the button hands the
   pictures to the existing Ask card below (ask-claude.js), which sends only when its own button is pressed. */
(function () {
  "use strict";
  var E = window.raStory, S = window.raAtlasSummary;
  var sg = document.getElementById("sg");
  if (!sg || !E || !S) return;
  function $(id) { return document.getElementById(id); }
  var el = E.el;
  var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var LD = E.createLoader(BASE), data = null;
  var stage = $("sg-stage"), steps = [].slice.call(sg.querySelectorAll(".sg-step")), dots = [].slice.call($("sg-dots").children);
  var text = $("sg-text"), chips = $("sg-chips"), status = $("sg-status"), shots = $("sg-shots"), drop = $("sg-drop");
  var holds = "story", files = [], override = { from: null, to: null }, parsed = null, gathered = null, shown = Object.create(null), at = 0;
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  var HINT = {
    photo: "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo.",
    document: "My grandmother Maria was born in Fiume in 1890 and arrived in Buenos Aires in 1923. I have her passport.",
    letter: "A letter from my great-uncle Josip in Trieste to his brother in Chicago, written about 1912.",
    story: "The family says my grandfather Luka left Senj for Melbourne around 1950."
  };

  function go(n) {
    if (n === at) return;
    function swap() {
      steps.forEach(function (s, i) { s.hidden = i !== n; });
      dots.forEach(function (d, i) { d.classList.toggle("on", i <= n); });
      at = n; stage.classList.remove("out");
      var h = steps[n].querySelector(".sg-h"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
      sg.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      if (n === 1) text.focus({ preventScroll: true });
      if (n === 2) drawJourney();
      if (n === 3) drawPlan();
    }
    if (reduce) swap(); else { stage.classList.add("out"); setTimeout(swap, 260); }
  }
  dots[0].classList.add("on");
  sg.addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) go(Number(b.getAttribute("data-go"))); });

  /* 1 · what do you have */
  [].forEach.call(sg.querySelectorAll(".sg-tile"), function (t) {
    t.addEventListener("click", function () {
      holds = t.getAttribute("data-holds"); text.placeholder = HINT[holds] || HINT.story;
      $("sg-sub1").textContent = holds === "story" ? "Type it, paste it, or say it your own way. Names, places and years are all we need."
        : "Add a picture below if you like, then tell us what you know about it. Names, places and years are all we need.";
      go(1);
      if (holds === "photo" || holds === "document" || holds === "letter") setTimeout(function () { $("sg-file").closest("label").classList.add("sg-nudge"); }, 400);
    });
  });

  /* 2 · tell us */
  function chip(label, cls, key, onclick) {
    var c = el(onclick ? "button" : "span", label, "sg-chip" + (cls ? " " + cls : "")); if (onclick) { c.type = "button"; c.addEventListener("click", onclick); }
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
        var order = [x.row].concat(x.alts); override[k] = { row: order[1], alts: order.slice(2).concat([x.row]), word: x.word }; parse();
      } : null));
    });
    if (p.born) chips.append(chip("born about " + p.born, "", "b:" + p.born));
    if (p.left) chips.append(chip("about " + p.left, "", "l:" + p.left));
    var h = files.length ? "photo" : p.holds;
    if (h !== "story" || files.length) chips.append(chip((E.HOLDS[h] || E.HOLDS.story).t.replace(/^a /, "") + (files.length ? ", kept here" : ""), "warn", "h:" + h));
  }
  function parse() {
    return LD.load().then(function (d) {
      data = d;
      var p = E.parseStory(text.value, { map: d.map, given: d.given, skip: d.skip }, files.length ? "photo" : (holds !== "story" ? holds : null));
      if (override.from && p.from && override.from.row.n === p.from.row.n) p.from = override.from; else if (!p.from || !override.from || override.from.word !== p.from.word) override.from = null;
      if (override.to && p.to && override.to.row.n === p.to.row.n) p.to = override.to; else if (!p.to || !override.to || override.to.word !== p.to.word) override.to = null;
      parsed = p; drawChips(p); status.textContent = ""; status.className = "sg-status";
      return p;
    });
  }
  var tm = null;
  text.addEventListener("input", function () { clearTimeout(tm); gathered = null; tm = setTimeout(function () { parse().catch(function () {}); }, 500); });
  $("sg-eg").addEventListener("click", function () { text.value = HINT.photo; gathered = null; parse().catch(function () {}); });

  function addFiles(list) {
    [].slice.call(list || []).filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); }).slice(0, 4 - files.length).forEach(function (f) { files.push({ f: f, url: URL.createObjectURL(f) }); });
    drawShots(); gathered = null; parse().catch(function () {});
  }
  function drawShots() {
    shots.textContent = "";
    files.forEach(function (x, i) {
      var w = el("span", null, "sg-shot"), im = el("img"); im.src = x.url; im.alt = "Picture " + (i + 1) + " you added";
      var rm = el("button", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove picture " + (i + 1)); rm.addEventListener("click", function () { URL.revokeObjectURL(x.url); files.splice(i, 1); drawShots(); gathered = null; parse().catch(function () {}); });
      w.append(im, rm); shots.append(w);
    });
    shots.hidden = !files.length; $("sg-read").hidden = !files.length;
  }
  $("sg-file").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("hot"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("hot"); }); });
  drop.addEventListener("drop", function (e) { e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
  text.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });

  /* Hand the pictures to the existing Ask card, which reads them only when its own button is pressed. */
  $("sg-read").addEventListener("click", function () {
    var input = document.getElementById("ask-photo"), box = $("sg-readbox");
    if (!input) return;
    try {
      var dt = new DataTransfer(); files.forEach(function (x) { dt.items.add(x.f); });
      input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) { /* an older browser: the card's own Add pictures button still works */ }
    box.open = true;
    var card = document.getElementById("ask"); if (card) card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  $("sg-next1").addEventListener("click", function () {
    parse().then(function (p) {
      if (!p.from) { status.textContent = "Say where they started, for example \"from Gallignana\". An old name works too."; status.className = "sg-status bad"; text.focus(); return; }
      status.textContent = "Reading the Atlas…";
      return LD.gather(p).then(function (g) { gathered = g; status.textContent = ""; go(2); });
    }).catch(function () { status.textContent = "The Atlas files did not load. Check your connection and try again."; status.className = "sg-status bad"; });
  });

  /* 3 · the journey */
  var map = null, J = null;
  function getMap() {
    return S.loadLeaflet().then(function (L) {
      if (!map) { map = L.map($("sg-map"), { scrollWheelZoom: false }); L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(map); }
      return { L: L, map: map };
    });
  }
  function drawJourney() {
    if (!gathered) return;
    if (!J) J = E.createJourney({ els: { cap: $("sg-cap"), slider: $("sg-year"), yearOut: $("sg-yearout"), play: $("sg-play"), moments: $("sg-moments"), time: $("sg-time"), mapBox: $("sg-map") }, getMap: getMap });
    J.draw(gathered.facts, gathered.mort).then(function () { if (!reduce && $("sg-play") && !$("sg-time").hidden) setTimeout(function () { if (at === 2) $("sg-play").click(); }, 900); });
  }

  /* 4 · the plan */
  function drawPlan() {
    if (!gathered) return;
    var box = $("sg-plan"); box.textContent = "";
    gathered.plan.forEach(function (s, i) {
      var d = el("section", null, "sg-pstep"); d.style.animationDelay = (i * 120) + "ms";
      var h = el("h3"); h.append(el("span", String(s.n), "sg-num"), " " + s.title); d.append(h, el("p", s.why, "sg-why"));
      var ul = el("ul"); s.items.forEach(function (it) { var li = el("li"); if (it.href) { var a = el("a", it.text); a.href = it.href; li.append(a); } else li.textContent = it.text; ul.append(li); });
      d.append(ul);
      (s.links || []).forEach(function (l) { var p = el("p"), a = el("a", l.text + " →"); a.href = l.href; p.append(a); d.append(p); });
      if (s.ask) { var q = el("p", null, "sg-ask"); q.append(el("b", "Ask: "), s.ask); d.append(q); }
      if (s.not) { var n = el("p", null, "sg-not"); n.append(el("b", "Do not conclude: "), s.not); d.append(n); }
      box.append(d);
    });
    var f = gathered.facts;
    $("sg-fam-btn").textContent = "Start the " + E.familyName(f) + " research family"; $("sg-fam-out").textContent = "";
    $("sg-fam-btn").onclick = function () {
      var P = window.raProgress, out = $("sg-fam-out");
      if (!P) { out.textContent = "Your research list did not load on this page. Reload and try again."; return; }
      var r = E.startFamily(P, f, gathered.plan);
      out.textContent = ""; out.append("Started " + r.name + " with " + r.added + " planned. It is now your active line. ");
      var a = el("a", "Open My research"); a.href = BASE + "my-research/"; out.append(a);
    };
  }

  $("sg-again").addEventListener("click", function () {
    files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; chips.textContent = ""; override = { from: null, to: null }; parsed = null; gathered = null; shown = Object.create(null);
    if (J) J.clear(); go(0);
  });
  window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
})();
