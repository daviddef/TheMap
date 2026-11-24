/* THE LIVE TOUR: the Atlas shown by using the Atlas. David: «the story is long, a bit separate ... bring it into the canvas, do a full walkthrough of the scenarios
   we can accommodate, using the dark theme, but make it really work as though we're doing it ... less Croatia, more global ... include research, connectivity,
   sources.» The old tour (start-tour.js) is a film drawn in its own scenes; this one types into the real search box and opens the real cards on the real map.

   FOUR STORIES, EACH ABOUT A DIFFERENT THING THE ATLAS DOES, ALL OVER THE WORLD:
     1 the ground changed hands   Cape Town (Dutch, then British, then a union), Lviv (Polish, Austrian, Soviet, Ukrainian): whose archive holds the paper
     2 paper that is not a register   Sydney, Trove (a source found from the one box), the family-tree sites every card offers, who holds the paper
     3 a name that travelled   Kowalski: its spellings and where it was, and when
     4 keep it, take it with you   a family, books put on a list, a plain letter, six words that keep it, the Record Reader and the Tree Canvas

   HOW IT DRIVES THE MAP. Typing is for show: the characters really go into the box (so the suggestions drop down as they would). Landing is exact: a typed search is
   ambiguous («Lviv» is also Lemberge in Belgium), so each beat then asks window.raTourApi (RecordMap.astro) for the place, country or source it means, which is what
   a click on that row does. Era tabs, folds and the + are clicked for real. Every beat sets up its own starting point, so Back and the story chips just run the beat.

   NOTHING THE TOUR DOES IS KEPT, AND NOTHING OF THE READER'S IS LOST. On opening, the research stored in this browser is copied aside (memory and sessionStorage), the
   keys are cleared, and a demo family is made. window.raDemo stops the always-on sync from saving the demo online. On closing, the demo is thrown away and the copy
   put back. If the page is closed mid-tour, the gate (start-tour-gate.js) puts the copy back on the next page it loads.

   A classic script, loaded only when the tour opens. DOM is built with textContent; no innerHTML. */
(function () {
  "use strict";
  var d = document, w = window;
  if (w.raLiveTour) return;
  var root = d.documentElement, BASE = (root.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  /* what the research keeps, copied aside while the demo runs (the keys sync-auto.js watches, and the few the map reads) */
  var KEYS = ["ra-progress-v1", "ra-fix-decisions-v1", "ra-areas-v1", "ra-gedcom-names-v1", "ra-stories-v1", "ra-canvas-v1", "ra-errands-v1", "ra-settings-v1",
              "ra-synopsis-scope", "ra-rc", "ra-check", "ra-shelf", "ra-sessions-lines", "ra-sessions-arch", "ra-areas-off"];
  var BACKUP = "ra-tour-backup";

  function el(tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function api() { return w.raTourApi; }
  function panel() { return d.querySelector(".at-panel"); }

  /* ---- the throwaway copy of the research --------------------------------------------------------------------------------------- */
  var snap = null, prevTheme = null;
  function takeSnap() {
    var s = {}; try { KEYS.forEach(function (k) { var v = w.localStorage.getItem(k); if (v != null) s[k] = v; }); } catch (e) { return false; }
    snap = s;
    try { w.sessionStorage.setItem(BACKUP, JSON.stringify(s)); } catch (e) { /* the copy in memory still serves */ }
    return true;
  }
  function clearKeys() { try { KEYS.forEach(function (k) { w.localStorage.removeItem(k); }); } catch (e) { /* nothing to clear */ } }
  function putBack() {
    if (!snap) return;
    try { KEYS.forEach(function (k) { w.localStorage.removeItem(k); }); Object.keys(snap).forEach(function (k) { w.localStorage.setItem(k, snap[k]); }); } catch (e) { /* storage blocked */ }
    try { w.sessionStorage.removeItem(BACKUP); } catch (e) { /* none */ }
    snap = null;
  }

  /* ---- the tour's own furniture ------------------------------------------------------------------------------------------------- */
  var CSS = [
    ".lt-bar{position:fixed;z-index:2147483000;right:14px;bottom:14px;width:min(430px,calc(100vw - 28px));background:#0b1620;color:#e6edf2;border:1px solid #2a3d4b;border-radius:14px;padding:12px 14px 12px;font:14px/1.5 var(--sans,system-ui,sans-serif)}",
    ".lt-bar *{box-sizing:border-box}",
    ".lt-demo{display:flex;align-items:center;gap:8px;font:10.5px/1 var(--mono,ui-monospace,monospace);letter-spacing:.06em;text-transform:uppercase;color:#e0a24a}",
    ".lt-demo i{width:7px;height:7px;border-radius:50%;background:#e0a24a;animation:ltp 1.6s ease-in-out infinite}",
    "@keyframes ltp{50%{opacity:.35}}",
    ".lt-x{margin-left:auto;background:transparent;border:1px solid #34506a;color:#b9ccd8;border-radius:8px;padding:3px 9px;font:12px var(--sans,system-ui,sans-serif);cursor:pointer}",
    ".lt-x kbd{font:10px var(--mono,monospace);border:1px solid #34506a;border-radius:4px;padding:0 4px;margin-left:5px;color:#8fa5b3}",
    ".lt-sc{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 8px}",
    ".lt-sc button{background:transparent;color:#9fb3c0;border:1px solid #2a3d4b;border-radius:999px;padding:3px 11px;font:12px var(--sans,system-ui,sans-serif);cursor:pointer}",
    ".lt-sc button[aria-current=true]{background:#7cc4d6;border-color:#7cc4d6;color:#06222b}",
    ".lt-k{display:block;color:#7cc4d6;font:10.5px/1.2 var(--mono,ui-monospace,monospace);letter-spacing:.07em;text-transform:uppercase;margin-bottom:3px}",
    ".lt-t{margin:0;font-size:15px;line-height:1.5;color:#f2f5f7;min-height:3em}",
    ".lt-row{display:flex;align-items:center;gap:8px;margin-top:10px}",
    ".lt-dots{display:flex;gap:4px;flex:1}.lt-dots i{flex:1;height:3px;border-radius:2px;background:#24384a}.lt-dots i.on{background:#7cc4d6}",
    ".lt-b{background:transparent;color:#e6edf2;border:1px solid #34506a;border-radius:8px;padding:6px 13px;font:13px var(--sans,system-ui,sans-serif);cursor:pointer}",
    ".lt-b.p{background:#7cc4d6;border-color:#7cc4d6;color:#06222b;font-weight:500}",
    ".lt-b[hidden]{display:none}",
    ".lt-spot{position:fixed;z-index:2147482999;pointer-events:none;border:2px solid #e0a24a;border-radius:10px;transition:all .25s ease;opacity:0}",
    ".lt-spot.on{opacity:1;animation:ltr 1.8s ease-in-out infinite}",
    "@keyframes ltr{50%{box-shadow:0 0 0 6px rgba(224,162,74,.22)}}",
    ".lt-sheet{position:fixed;z-index:2147482998;right:70px;top:84px;width:min(440px,calc(100vw - 28px));max-height:calc(100vh - 330px);overflow:auto;background:#f4f1ea;color:#1b2a33;border:1px solid #c9c2b2;border-radius:12px;padding:16px 18px;font:13px/1.55 var(--sans,system-ui,sans-serif)}",
    ".lt-sheet h4{margin:0 0 2px;font:500 15px var(--sans,system-ui,sans-serif)}.lt-sheet .s{color:#5b6b75;font-size:12px;margin-bottom:10px}",
    ".lt-sheet pre{white-space:pre-wrap;font:12.5px/1.55 var(--sans,system-ui,sans-serif);margin:0}",
    ".lt-sheet mark{background:#f3d98b;color:#1b2a33;border-radius:2px;padding:0 2px}",
    ".lt-sheet .a{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px;font-size:12px}.lt-sheet .a span{border:1px solid #c9c2b2;border-radius:8px;padding:4px 10px;color:#3a4a54}",
    ".lt-sheet[hidden]{display:none}",
    "@media (max-width:640px){.lt-bar{left:10px;right:10px;width:auto;bottom:10px}}"
  ].join("\n");

  var ui = null, spot = null, sheet = null, S = null;
  var run = { tok: 0, si: 0, bi: 0, open: false }, scrollY0 = 0;

  function build() {
    var st = el("style"); st.id = "lt-style"; st.textContent = CSS; d.head.appendChild(st);
    spot = el("div", "lt-spot"); spot.setAttribute("aria-hidden", "true"); d.body.appendChild(spot);
    sheet = el("div", "lt-sheet"); sheet.hidden = true; d.body.appendChild(sheet);
    var bar = el("div", "lt-bar"); bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "A live tour of the Atlas");
    var top = el("div", "lt-demo"); top.append(el("i"), el("span", null, "Demo · nothing here is saved"));
    var x = el("button", "lt-x", "Skip"); x.type = "button"; x.append(el("kbd", null, "Esc")); x.addEventListener("click", close); top.append(x);
    var sc = el("div", "lt-sc"); sc.setAttribute("role", "group"); sc.setAttribute("aria-label", "Stories");
    var cap = el("div"); var k = el("span", "lt-k"), t = el("p", "lt-t"); t.setAttribute("aria-live", "polite"); cap.append(k, t);
    var row = el("div", "lt-row"), dots = el("div", "lt-dots");
    var back = el("button", "lt-b", "Back"), next = el("button", "lt-b p", "Next"); back.type = next.type = "button";
    back.addEventListener("click", function () { go(run.si, run.bi - 1); });
    next.addEventListener("click", forward);
    row.append(dots, back, next);
    bar.append(top, sc, cap, row); d.body.appendChild(bar);
    ui = { bar: bar, sc: sc, k: k, t: t, dots: dots, back: back, next: next };
  }

  function paintChips() {
    ui.sc.textContent = "";
    S.forEach(function (s, i) {
      var b = el("button", null, s.label); b.type = "button"; b.setAttribute("aria-current", i === run.si ? "true" : "false");
      b.addEventListener("click", function () { go(i, 0); });
      ui.sc.append(b);
    });
  }
  function paintDots() {
    ui.dots.textContent = "";
    S[run.si].beats.forEach(function (_, i) { ui.dots.append(el("i", i <= run.bi ? "on" : "")); });
    ui.back.hidden = run.si === 0 && run.bi === 0;
    var last = run.bi === S[run.si].beats.length - 1, lastStory = run.si === S.length - 1;
    ui.next.textContent = last ? (lastStory ? "Try it yourself" : "Next story") : "Next";
  }

  /* ---- spotlight: a ring that follows an element for as long as it is the subject ----------------------------------------------- */
  var spotEl = null, spotTick = 0;
  function follow() {
    cancelAnimationFrame(spotTick);
    (function f() {
      if (!spotEl || !spotEl.isConnected) { spot.classList.remove("on"); return; }
      var r = spotEl.getBoundingClientRect();
      if (!r.width && !r.height) { spot.classList.remove("on"); }
      else { spot.style.left = (r.left - 5) + "px"; spot.style.top = (r.top - 5) + "px"; spot.style.width = (r.width + 10) + "px"; spot.style.height = (r.height + 10) + "px"; spot.classList.add("on"); }
      spotTick = requestAnimationFrame(f);
    })();
  }
  function spotOn(target) {
    var e = typeof target === "string" ? d.querySelector(target) : target;
    spotEl = e || null;
    if (e) { reveal(e); follow(); } else spot.classList.remove("on");
  }
  /* bring an element into view by scrolling the card that holds it, never the page: the map is laid out for the page to stay where it is */
  function reveal(e) {
    var p = e.parentNode;
    while (p && p !== d.body) {
      var cs = w.getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 2) {
        var pr = p.getBoundingClientRect(), er = e.getBoundingClientRect();
        if (er.top < pr.top + 8 || er.bottom > pr.bottom - 8) p.scrollTop += (er.top - pr.top) - (pr.height - er.height) / 2;
        return;
      }
      p = p.parentNode;
    }
  }
  function spotOff() { spotEl = null; spot.classList.remove("on"); }

  /* ---- the beat's helpers: each stops quietly when the viewer has moved on --------------------------------------------------- */
  function ctx(tok) {
    var dead = function () { return tok !== run.tok || !run.open; };
    var wait = function (ms) { return sleep(ms).then(function () { if (dead()) throw "gone"; }); };
    var c = {
      wait: wait,
      say: function (k, t) { ui.k.textContent = k; ui.t.textContent = t; },
      /* the characters really go into the real box, so the suggestions drop down as they would for anyone */
      type: async function (text) {
        var b = api().box; sheet.hidden = true; b.focus(); b.value = "";
        for (var i = 0; i < text.length; i++) { b.value = text.slice(0, i + 1); b.dispatchEvent(new Event("input", { bubbles: true })); await wait(text.length > 12 ? 40 : 70); }
        await wait(650);
      },
      /* a real search, run as typing would, then the box let go so its suggestions fold away and the answer is not under them */
      search: async function (term) { api().search(term); await wait(900); api().box.blur(); await wait(1800); },
      place: async function (id, name) { await api().place(id, name); await wait(2300); },
      source: async function (id) { api().source(id); await wait(900); },
      /* a segment of the card's era band, by a word in its title: the click the reader would make */
      era: async function (word) {
        var seg = [].filter.call((panel() || d).querySelectorAll(".ra-tl-seg"), function (s) { return (s.title || "").indexOf(word) > -1; })[0];
        if (!seg) return false; spotOn(seg); await wait(700); seg.click(); await wait(1200); return true;
      },
      /* a fold of the card, by its heading: opened as the reader would, and left as the subject */
      fold: async function (word) {
        var sum = [].filter.call((panel() || d).querySelectorAll("details > summary"), function (s) { return s.textContent.toLowerCase().indexOf(word) > -1; })[0];
        if (!sum) return false;
        var det = sum.parentNode; if (!det.open) sum.click();
        await wait(500); spotOn(det);
        await wait(500); return true;
      },
      spot: function (t) { spotOn(t); },
      unspot: spotOff,
      sheet: function (title, sub, text, actions) {
        sheet.textContent = "";
        sheet.append(el("h4", null, title), el("div", "s", sub));
        var a = el("div", "a"); (actions || []).forEach(function (x) { a.append(el("span", null, x)); }); sheet.append(a);
        var pre = el("pre");
        String(text).split(/(\[[^\]\n]{1,80}\])/).forEach(function (part) { if (/^\[[^\]\n]{1,80}\]$/.test(part)) pre.append(el("mark", null, part)); else pre.append(d.createTextNode(part)); });
        sheet.append(pre);
        sheet.hidden = false;
      },
      hideSheet: function () { sheet.hidden = true; },
      dead: dead
    };
    return c;
  }

  /* ---- the four stories --------------------------------------------------------------------------------------------------------- */
  S = [
    { label: "The ground changed hands", beats: [
      { k: "Start with a place", t: "Type where the record says. The card opens: the books on the shelf, and who holds the paper.",
        run: async function (c) { await c.type("Cape Town"); await c.place("cape-town", "Cape Town"); c.spot(".at-panel .at-h"); } },
      { k: "Whose ground it was", t: "Pick an era. In 1700 the Cape was run from the Netherlands, so the paper may be there too.",
        run: async function (c) { await c.place("cape-town", "Cape Town"); await c.era("Dutch East India"); } },
      { k: "Then it changed hands", t: "1806: the British. 1910: a union. Each change moves the paper to another country's archive.",
        run: async function (c) { await c.place("cape-town", "Cape Town"); await c.era("Cape Colony"); await c.wait(1400); await c.era("Union of South Africa"); } },
      { k: "The same, everywhere", t: "Lviv: Polish, then Austrian, then Soviet, now Ukrainian. One city, four sets of paper.",
        run: async function (c) { await c.type("Lviv"); await c.place("lviv", "Lviv"); await c.era("Austria"); } }
    ] },
    { label: "Paper that is not a register", beats: [
      { k: "Not always a register", t: "In Australia the record is often a newspaper, a muster or a ship's list. The card says which sources reach here.",
        run: async function (c) { await c.type("Sydney"); await c.place("sydney", "Sydney"); await c.fold("sources that cover all of"); } },
      { k: "Sources are in the box too", t: "Search a source by its name, or by what it holds. Trove opens with what it is and what it costs.",
        run: async function (c) { await c.type("Trove"); await c.source("trove"); c.spot(".at-panel .at-h"); } },
      { k: "Always offered", t: "FamilySearch, Ancestry, MyHeritage, Geni: the family-tree sites are on every card, anywhere in the world.",
        run: async function (c) { await c.place("sydney", "Sydney"); await c.fold("family-tree and genealogy"); } },
      { k: "Who holds the paper", t: "Archives, libraries and churches near the place, with an e-mail where we know one.",
        run: async function (c) { await c.place("sydney", "Sydney"); await c.fold("where the paper is"); } }
    ] },
    { label: "A name that travelled", beats: [
      { k: "A surname", t: "Type a surname. The Atlas knows its spellings and where each was recorded.",
        run: async function (c) { await c.type("Kowalski"); api().box.blur(); await c.wait(2800); c.spot(".at-panel .at-h"); } },
      { k: "Where the name was, and when", t: "Countries and decades, drawn like the ground: where it began and where it went.",
        run: async function (c) { await c.search("Kowalski"); c.spot(".at-panel .ra-tw"); } },
      { k: "Spelt as it was heard", t: "Kowalska, Kovalski, Kowalsky: the clerk wrote what he heard, so every form is searched.",
        run: async function (c) { await c.search("Kowalski"); c.spot(".at-panel .at-also"); } }
    ] },
    { label: "Keep it, take it with you", beats: [
      { k: "Name the family", t: "Say who you are researching. Everything you mark is kept with that family, in your browser.",
        run: async function (c) { c.spot(".ra-grp"); await c.wait(300); } },
      { k: "Mark what you search", t: "One press puts a place's books on your list, and the map colours the place.",
        run: async function (c) {
          await c.place("buenos-aires", "Buenos Aires");
          var btn = null; for (var i = 0; i < 10 && !btn; i++) { btn = (panel() || d).querySelector("details.ra-area-solo-l .ra-grp-add:not([hidden]), details.ra-area-cov .ra-grp-add:not([hidden])"); if (!btn) await c.wait(300); }
          if (btn) { c.spot(btn); await c.wait(900); btn.click(); await c.wait(1200); }
        } },
      { k: "A letter, drafted", t: "A pencil beside an archive drafts a plain letter. You finish the brackets and send it from your own e-mail.",
        run: async function (c) {
          await c.place("sydney", "Sydney"); c.unspot();
          var E = await errands();
          var L = E ? E.draft({ inst: "State Archives and Records Authority of New South Wales", family: "Kowalski", where: "Sydney" }) : { subject: "", body: "" };
          c.sheet("To: State Archives and Records Authority of New South Wales", L.subject, L.body, ["Open in my e-mail", "Copy the letter", "Sent by you, never by the Atlas"]);
        } },
      { k: "Take it with you", t: "Six words keep an encrypted copy online, with no account. Open it on any device and carry on.",
        run: async function (c) { c.hideSheet(); c.spot(".ra-live"); await c.wait(300); } },
      { k: "And the rest of the kit", t: "The Record Reader reads old hands and Latin. The Tree Canvas draws your tree and joins it to places.",
        run: async function (c) { c.hideSheet(); c.spot(".ra-reader"); await c.wait(1800); c.spot(".ra-canvas"); } }
    ] }
  ];

  var errandsP = null;
  function errands() {
    if (w.raErrands) return Promise.resolve(w.raErrands);
    if (!errandsP) errandsP = new Promise(function (ok) { var s = d.createElement("script"); s.src = BASE + "js/errands.js"; s.onload = function () { ok(w.raErrands || null); }; s.onerror = function () { ok(null); }; d.head.appendChild(s); });
    return errandsP;
  }

  /* ---- moving through it -------------------------------------------------------------------------------------------------------- */
  async function go(si, bi) {
    if (!run.open) return;
    if (bi < 0) { if (si === 0) return; si -= 1; bi = S[si].beats.length - 1; }
    run.si = si; run.bi = bi; var tok = ++run.tok;
    paintChips(); paintDots();
    var B = S[si].beats[bi], c = ctx(tok);
    c.say(B.k, B.t);
    try { await B.run(c); } catch (e) { if (e !== "gone") { /* a beat that cannot run (data not there) leaves its words and moves on to the next press */ } }
  }
  function forward() {
    var s = S[run.si];
    if (run.bi < s.beats.length - 1) go(run.si, run.bi + 1);
    else if (run.si < S.length - 1) go(run.si + 1, 0);
    else close();
  }
  function onKey(e) {
    if (!run.open) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight" && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) { forward(); }
    else if (e.key === "ArrowLeft" && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) { go(run.si, run.bi - 1); }
  }

  function open() {
    if (run.open) return;
    if (!api() || !w.raProgress) return false;
    if (!takeSnap()) return false;
    run.open = true; w.raDemo = true; scrollY0 = w.pageYOffset || 0;
    prevTheme = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "dark");
    clearKeys(); try { w.raProgress.reload(); } catch (e) { /* an older kit: the demo family is added to the copy in memory */ }
    /* the demo family: made in the throwaway copy, so the + on the cards has somewhere to put things */
    try { var slug = w.raProgress.addLine("The Kowalski family", "Poland to Australia"); w.raProgress.setActive(slug); d.dispatchEvent(new CustomEvent("ra-progress-changed")); } catch (e) { /* the tour still runs */ }
    build(); d.addEventListener("keydown", onKey, true);
    go(0, 0);
    return true;
  }

  function close() {
    if (!run.open) return;
    run.open = false; run.tok++;
    d.removeEventListener("keydown", onKey, true);
    spotOff(); [ui && ui.bar, spot, sheet, d.getElementById("lt-style")].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    ui = null;
    if (prevTheme) root.setAttribute("data-theme", prevTheme); else root.removeAttribute("data-theme");
    w.scrollTo(0, scrollY0); putBack(); try { w.raProgress.reload(); } catch (e) { /* none */ } w.raDemo = false;
    d.dispatchEvent(new CustomEvent("ra-progress-changed"));
    try { api().clear(); } catch (e) { /* none */ }
    try { if (w.raPaintProgress) w.raPaintProgress(); } catch (e) { /* none */ }
  }

  /* loaded by the gate on a page that finds a copy left by a tour that was never closed: put it back */
  (function () {
    try {
      var raw = w.sessionStorage.getItem(BACKUP); if (!raw) return;
      var s = JSON.parse(raw); KEYS.forEach(function (k) { w.localStorage.removeItem(k); }); Object.keys(s).forEach(function (k) { w.localStorage.setItem(k, s[k]); });
      w.sessionStorage.removeItem(BACKUP); if (w.raProgress && w.raProgress.reload) w.raProgress.reload();
    } catch (e) { /* nothing to put back */ }
  })();

  w.raLiveTour = { open: open, close: close, get isOpen() { return run.open; }, stories: function () { return S.map(function (s) { return { label: s.label, beats: s.beats.length }; }); } };
})();
