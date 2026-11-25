/* THE STORY PAGE, /read/#story. Tell what you know and the whole page fills in as you write: the places on a map with a year slider, the
   person as told, how their names were written, the family, what was going on in those years, a research plan, and the two ways to keep it.
   One column that reads from the top, with a rail on the left to jump about.

   It is the same reader as the home page (story-engine.js); the home page keeps only the box, the map and a short card with a button
   that brings you here (the words are handed over through localStorage, once, for ten minutes). Everything is read in the browser from the
   Atlas's own files. Nothing is sent anywhere until the reader presses "Build my research plan" (story-plan.js) or has a picture read.
   Replaces the four-screen walk-through (story-guide.js). */
(function () {
  "use strict";
  var E = window.raStory, S = window.raAtlasSummary, root = document.getElementById("sp");
  if (!root || !E || !S) return;
  function $(id) { return document.getElementById(id); }
  var el = E.el;
  var BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var LD = E.createLoader(BASE), data = null;
  var reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var text = $("sp-text"), chips = $("sp-chips"), status = $("sp-status"), shots = $("sp-shots"), drop = $("sp-drop");
  var files = [], ov = Object.create(null), lastSig = "", parsed = null, token = 0, shown = Object.create(null), last = null, stopItems = [], lastPlan = null;
  var HINT = "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo.";
  var LEDE0 = ($("sp-lede") && $("sp-lede").textContent) || "";
  var DRAFT = "ra-story-page-draft", HAND = "ra-story-handoff";

  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = ok; s.onerror = function () { fail(new Error("Could not load " + src + ". Check your connection, then try again.")); }; document.head.appendChild(s); }); }
  function tellable(p) { return !!(p && (p.from || (p.kin && p.kin.length) || (p.people || []).some(function (x) { return x.sought; }))); }
  function say(m, bad) { status.textContent = m || ""; status.className = "sp-status" + (bad ? " bad" : ""); }
  /* what a button said it did (a picture read, a failure) stays until the reader types or starts over: the page re-reads the story straight after, and must not wipe it */
  var hold = null;
  function sayDone() { if (hold) say(hold.m, hold.bad); else say(""); }

  /* ---- the sections and the rail --------------------------------------------------------------------------------------------- */
  var rail = $("sp-rail");
  function secShow(id, on) {
    var sec = $(id), a = rail.querySelector('[data-go="' + id + '"]');
    if (sec) sec.hidden = !on; if (a) a.hidden = !on;
  }
  function goTo(id) {
    var t = $(id); if (!t) return;
    t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: t.classList.contains("lf-card") ? "center" : "start" });
    if (t.classList.contains("lf-card")) { t.classList.add("lf-card-hit"); setTimeout(function () { t.classList.remove("lf-card-hit"); }, 1600); }
  }
  rail.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-go]"); if (!a) return;
    e.preventDefault(); goTo(a.getAttribute("data-go"));
    try { history.replaceState(null, "", "#story"); } catch (x) { /* the hash stays */ }
  });
  /* each place of the story gets its own line under "Place by place", so the rail reads like the route */
  function placesRail() {
    [].forEach.call(rail.querySelectorAll("a.sub:not(.psub)"), function (x) { x.remove(); });
    var anchor = rail.querySelector('[data-go="sp-places"]'), prev = anchor, secs = $("sp-stops").querySelectorAll(".lf-stop");
    if (!anchor) return;
    [].forEach.call(secs, function (sec, i) {
      sec.id = "sp-stop-" + (i + 1);
      var h = sec.querySelector("h3"), a = document.createElement("a");
      a.className = "sub"; a.href = "#" + sec.id; a.setAttribute("data-go", sec.id); a.textContent = h ? h.textContent : "Place " + (i + 1);
      prev.after(a); prev = a;
    });
  }
  /* each person of the family, by name, under "The family": a tap goes to the box and lights it for a moment. Only the people the story named. */
  function peopleRail() {
    [].forEach.call(rail.querySelectorAll("a.psub"), function (x) { x.remove(); });
    var anchor = rail.querySelector('[data-go="sp-family"]'), prev = anchor, cards = $("sp-tree").querySelectorAll(".lf-card[data-person]");
    if (!anchor) return;
    [].forEach.call(cards, function (c, i) {
      c.id = "sp-person-" + (i + 1);
      var role = c.querySelector(".lf-card-role"), a = document.createElement("a"), r = document.createElement("span");
      a.className = "sub psub"; a.href = "#" + c.id; a.setAttribute("data-go", c.id); a.textContent = c.getAttribute("data-person");
      r.className = "psub-r"; r.textContent = role ? role.textContent.replace(/^your /i, "").toLowerCase() : ""; if (r.textContent) a.append(r);
      prev.after(a); prev = a;
    });
  }
  /* the rail marks where you are */
  var spy = null;
  function watch() {
    if (!("IntersectionObserver" in window)) return;
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { [].forEach.call(rail.querySelectorAll("a"), function (a) { a.classList.toggle("on", a.getAttribute("data-go") === en.target.id); }); } });
    }, { rootMargin: "-10% 0px -70% 0px" });
    [].forEach.call(rail.querySelectorAll("a[data-go]"), function (a) { var s = $(a.getAttribute("data-go")); if (s && !s.hidden) spy.observe(s); });
  }

  /* ---- what the page understood, as chips ------------------------------------------------------------------------------------ */
  function chip(label, cls, key, onclick) {
    var c = el(onclick ? "button" : "span", label, "sp-chip" + (cls ? " " + cls : "")); if (onclick) { c.type = "button"; c.addEventListener("click", onclick); }
    if (!shown[key]) { shown[key] = 1; c.classList.add("pop"); }
    return c;
  }
  function placeLabel(r) { var n = r.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(r.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }), c = data.countries[r.cc]; return n + (c && S.fold(c) !== S.fold(n) ? ", " + c : ""); }
  /* "Brisban" is no place the Atlas holds: offered, never used. A tap changes the word in the box, which is the reader's own edit. */
  function drawDid(p) {
    var box = $("sp-did"); box.textContent = "";
    var sg = p.suggest || []; box.hidden = !sg.length; if (!sg.length) return;
    sg.forEach(function (x, i) {
      var d = el("span", null, "sp-did-i");
      d.append(document.createTextNode((i ? " " : "") + "“" + x.typed + "” " + (x.kind === "partial" ? "is part of several place names, and was not used. Did you mean " : "is not a place the Atlas knows, and was not used. Did you mean ")));
      x.options.forEach(function (o) {
        var b = el("button", o.n + (o.cn ? ", " + o.cn : "")); b.type = "button";
        b.addEventListener("click", function () { text.value = text.value.split(x.typed).join(o.n); text.dispatchEvent(new Event("input", { bubbles: true })); });
        d.append(b);
      });
      d.append(document.createTextNode("?")); box.append(d);
    });
  }
  /* What the page understood is shown where it belongs (the family tree's cards, the place cards), not as a row of pills. What is left here is
     only what needs a person: a place the Atlas could read two ways, a missing starting place, a picture still unread. */
  function drawChips(p) {
    drawDid(p); chips.textContent = "";
    var stopsShown = p.stops && p.stops.length ? p.stops : [p.from && Object.assign({ role: "origin" }, p.from), p.to && Object.assign({ role: "move" }, p.to)].filter(Boolean);
    stopsShown.forEach(function (st) {
      var more = st.alts && st.alts.length, lab = placeLabel(st.row);
      if (!more) return;
      chips.append(chip(lab + (st.yearTold ? ", " + st.year : "") + "  ▾  (not this one? tap to try " + placeLabel(st.alts[0]) + ")", "to", "s:" + st.row.i + st.role, function () {
        ov[st.word] = { row: st.alts[0], alts: st.alts.slice(1).concat([st.row]) }; lastSig = ""; run();
      }));
    });
    if (p.holds !== "story" || files.length) chips.append(chip((E.HOLDS[p.holds] || E.HOLDS.story).t.replace(/^a /, "") + (files.length ? ", kept here" : ""), "warn", "h:" + p.holds));
    var unread = files.filter(function (x) { return !x.r; }).length;
    if (unread) chips.append(chip("Read " + (unread === 1 ? "the picture" : unread + " pictures") + " with Claude", "warn", "readpics", function () { readPics(); }));
    drawGaps(p);
  }

  /* WHAT IS STILL MISSING, ASKED AS YOU TYPE (story-gaps.js). Three at a time, the ones that unlock the most records first. A tap adds the start of a sentence
     to the box for the reader to finish; nothing is filled in for them. The box redraws on the same pause as the reading, so it follows what they have typed. */
  var gapsAll = false, gapActive = "", gapTok = "", gapOpt = "", clueSeen = Object.create(null), clueOpen = null, clueNews = [];
  /* A NEW STORY STARTS A NEW HUNT: what was found in the last one is not found in this. */
  function clueReset() { clueSeen = Object.create(null); clueOpen = null; clueNews = []; gapsAll = false; gapActive = ""; gapTok = ""; gapOpt = ""; }
  /* THE GAPS, AS A SMALL HUNT. David: «i feel like we can make this section more fun». What is still missing is a clue to find, not a form to fill: the count of those
     found so far, a small answer box on each (type it, press Enter, and it is added to the story as a sentence), and a word of thanks when one is found. The numbers
     are honest: a clue counts only once it has been open in this story, so «2 of 5» grows when the story shows a new gap and never claims a clue that was never asked. */
  /* the highlight layer behind the textarea: the same words, the recognised ones wrapped in <mark>. The text itself is drawn by the textarea on top. */
  var mirrorToks = [], mirrorKnown = Object.create(null), mirrorEl = $("sp-mirror"), editEl = $("sp-edit");
  function mirrorDraw() {
    if (!mirrorEl) return;
    /* a long story gives the textarea a scrollbar, which narrows its lines: the layer behind it takes the same width, or every mark slides off its word */
    mirrorEl.style.paddingRight = Math.max(0, text.offsetWidth - text.clientWidth) + "px";
    var raw = text.value, pos = 0, frag = document.createDocumentFragment(), now = Object.create(null);
    mirrorToks.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (k) {
      if (k.start < pos || k.end > raw.length) return;
      if (k.start > pos) frag.append(document.createTextNode(raw.slice(pos, k.start)));
      var mk = k.kind + ":" + raw.slice(k.start, k.end).toLowerCase(); now[mk] = 1;
      var m = document.createElement("mark"); m.className = "sp-mk-" + k.kind + (gapTok === k.kind + ":" + k.name.toLowerCase() ? " is-on" : "") + (mirrorKnown[mk] ? "" : " is-new"); m.textContent = raw.slice(k.start, k.end); frag.append(m); pos = k.end;
    });
    frag.append(document.createTextNode(raw.slice(pos) + (/\n$/.test(raw) ? " " : "")));
    mirrorKnown = now; mirrorEl.textContent = ""; mirrorEl.append(frag); mirrorEl.scrollTop = text.scrollTop;
    if (editEl) editEl.classList.toggle("has-toks", mirrorToks.length > 0);
  }
  /* while typing, the marks follow the words: what lies before the edit stays, what lies after it moves by the change, what the edit touched goes until the page reads again */
  var mirrorPrev = "";
  function mirrorShift() {
    var a = mirrorPrev, b = text.value, pl = 0, sl = 0;
    while (pl < a.length && pl < b.length && a[pl] === b[pl]) pl++;
    while (sl < a.length - pl && sl < b.length - pl && a[a.length - 1 - sl] === b[b.length - 1 - sl]) sl++;
    var d = b.length - a.length;
    mirrorToks = mirrorToks.filter(function (k) { return k.end <= pl || k.start >= a.length - sl; }).map(function (k) { return k.start >= a.length - sl && d ? Object.assign({}, k, { start: k.start + d, end: k.end + d }) : k; });
    mirrorPrev = b; mirrorDraw();
  }
  function drawGaps(p) {
    var box = $("sp-gaps"), G = window.raStoryGaps; if (!box || !G) return;
    box.textContent = "";
    var t = (readingNow || readingText(text.value)).trim();
    mirrorPrev = text.value;
    if (t.length < 8) { box.hidden = true; clueReset(); mirrorToks = []; mirrorDraw(); return; }
    var list = G.gaps(p, t, { files: files.length, place: function (w) { return !!(data && data.map && data.map[S.fold(w)]); } }), PERSONAL = /^(?:name|given|surname|rel|maiden)$/, rest = list.filter(function (g) { return !PERSONAL.test(g.id); }), top = gapsAll ? rest : rest.slice(0, 3);
    box.hidden = false;
    var nowOpen = Object.create(null); list.forEach(function (g) { nowOpen[g.id] = 1; clueSeen[g.id] = 1; });
    if (clueOpen) Object.keys(clueOpen).forEach(function (id) { if (!nowOpen[id]) clueNews.push(id); });
    clueOpen = nowOpen;
    var seenN = Object.keys(clueSeen).length, found = seenN - list.length;
    /* THE CLUES ARE PART OF THE PARAGRAPH, NOT A FORM BELOW IT. David: «is there a better way to integrate the clues with the paragraph? bold tappable pills ... one experience».
       They sit inside the story box, under the words: a pill for each clue still open. Tap one and a single answer line opens right there, with the question; answer it and
       the words go into the story as a sentence, the pill is ticked off, and the next clue's pill is waiting. */
    var STICKER = { from: "\ud83c\udfe1", village: "\ud83c\udfe1", name: "\ud83d\udd0e", given: "\ud83d\udcac", surname: "\ud83c\udff7\ufe0f", to: "\ud83e\udded", when: "\u23f3", rel: "\ud83d\udc6a", holds: "\ud83d\udcf7", maiden: "\ud83c\udf38", faith: "\u26ea", family: "\ud83d\udc8d", ship: "\ud83d\udea2", end: "\ud83d\udd6f\ufe0f" };
    /* THE STORY, READ BACK WITH ITS NAMES AND PLACES AS PILLS. David: «"my fathers name was ivan", can we flash/pill "ivan" and on tap show some things to ask? e.g. add his
       year of birth, death, etc.» The words are the ones typed; a recognised person or place is a bold pill. Tap it and what can be added about it opens underneath; answer, and
       the sentence goes into the story, in that person's name. */
    var raw = text.value, toks = G.tokens ? G.tokens(raw, p) : [], keyOf = function (k) { return k.kind + ":" + k.name.toLowerCase(); };
    /* ONE BOX. David: «do we really need two areas for the same text? or would it happen smartly in the same box im typing?» The words stay where they are typed; a name or a
       place the page recognised is marked IN them (a soft highlight drawn behind the text), and a tap on it opens what can be added, underneath. */
    mirrorToks = toks; mirrorDraw();
    if (toks.length) {
      box.append(el("span", gapTok ? "" : "Tap a highlighted name or place to add to it", "sp-gaps-h"));
      if (!gapTok) { var kb = el("div", null, "sp-toks-kb"); toks.forEach(function (k) { var kbtn = el("button", "Add to " + k.name, "sp-ghost"); kbtn.type = "button"; kbtn.addEventListener("click", function () { gapActive = ""; gapOpt = ""; gapTok = keyOf(k); drawGaps(p); }); kb.append(kbtn); }); box.append(kb); }
      var tk = toks.filter(function (k) { return gapTok === keyOf(k); })[0];
      if (tk) {
        var panel = el("div", null, "sp-gap sp-about"), ttl = el("div", null, "sp-gap-q");
        ttl.append(el("b", "About " + tk.name + (tk.label ? " \u00b7 " + tk.label : "")), el("span", tk.kind === "person" ? "Tap what you know; the words go into the story. A tick means the story already says it." : "What do you know about it?", "sp-gap-why"));
        var opts = el("div", null, "sp-pills");
        /* WHAT THE STORY ALREADY TELLS is shown as told: a tick, another colour, and the year where there is one. It stays tappable, to add more. */
        var told = G.known ? G.known(tk.kind, tk, p, raw) : {}, nTold = 0;
        G.about(tk.kind).forEach(function (o) {
          var isTold = Object.prototype.hasOwnProperty.call(told, o.id); if (isTold) nTold++;
          var ob = el("button", null, "sp-pill sp-pill-sm" + (isTold ? " is-told" : "") + (gapOpt === o.id ? " is-on" : "")); ob.type = "button";
          if (isTold) {
            var ck = el("span", "\u2713", "sp-pill-ck"); ck.setAttribute("aria-hidden", "true");
            ob.append(ck, el("span", o.label + (told[o.id] ? " " + told[o.id] : "")));
            ob.title = "Already in your story" + (told[o.id] ? ": " + told[o.id] : "") + ". Tap to add more.";
            ob.setAttribute("aria-label", o.label + ", already in your story" + (told[o.id] ? " (" + told[o.id] + ")" : ""));
          } else ob.append(el("span", o.label));
          ob.addEventListener("click", function () { gapOpt = gapOpt === o.id ? "" : o.id; drawGaps(p); var i2 = box.querySelector(".sp-about .sp-gap-in"); if (i2) i2.focus(); });
          opts.append(ob);
        });
        panel.append(ttl, opts);
        var oo = G.about(tk.kind).filter(function (o) { return o.id === gapOpt; })[0];
        if (oo) {
          var f2 = el("form", null, "sp-gap-row"), i3 = el("input", null, "sp-gap-in"), g3 = el("button", "Add", "sp-gap-go");
          i3.type = "text"; i3.placeholder = oo.ph; i3.maxLength = 160; i3.autocomplete = "off"; i3.setAttribute("aria-label", oo.label + ": " + tk.name); g3.type = "submit";
          f2.addEventListener("submit", function (ev) {
            ev.preventDefault(); var sn = G.sentence(tk.kind, (oo.id === "father" || oo.id === "mother") && tk.name && tk.kind === "person" ? tk.name : (tk.ref || tk.name), oo.id, i3.value); if (!sn) return;
            gapOpt = ""; text.value = G.append(text.value, " " + sn).slice(0, 8000); grow(); text.focus();
            try { text.setSelectionRange(text.value.length, text.value.length); } catch (e) { /* the caret stays */ }
            try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* none */ }
            clearTimeout(tm); tm = setTimeout(run, 650);
          });
          f2.append(i3, g3); panel.append(f2);
        }
        box.append(panel);
      }
    }
    /* with a name or a place in the story the pills in the words are the whole experience: no second row of clues, no count (David: «stick to the pill ... tap ivan, show religion») */
    if (toks.length) return;
    var head = el("div", null, "sp-gaps-top");
    head.append(el("span", list.length ? (toks.length ? "Also missing" : "Add a clue") : "Every clue found", "sp-gaps-h"));
    var dots = el("span", null, "sp-dots"); dots.setAttribute("role", "img"); dots.setAttribute("aria-label", found + " of " + seenN + " clues found");
    for (var d = 0; d < seenN; d++) dots.append(el("i", null, d < found ? "on" : ""));
    head.append(dots, el("span", found + " of " + seenN, "sp-gaps-n"));
    box.append(head);
    var news = clueNews.splice(0, 2);
    if (news.length) box.append(el("p", "Found: " + news.map(function (id) { return G.clue(id)[0].toLowerCase(); }).join(" and ") + ". That points to more records.", "sp-gaps-yes"));
    if (!list.length) { box.append(el("p", "Nothing obvious is missing now. The plan below is built from what you told us; add more at any time.", "sp-gaps-ok")); return; }
    var add = function (g, value) {
      gapActive = "";
      text.value = (value ? G.answer(text.value, g.add, value) : G.append(text.value, g.add)).slice(0, 8000); grow(); text.focus();
      try { text.setSelectionRange(text.value.length, text.value.length); } catch (e) { /* the caret stays */ }
      try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* none */ }
      clearTimeout(tm); tm = setTimeout(run, 650);
    };
    if (gapActive && !list.some(function (g) { return g.id === gapActive; })) gapActive = "";
    var pills = el("div", null, "sp-pills"); pills.setAttribute("role", "group"); pills.setAttribute("aria-label", "Clues to add to the story");
    top.forEach(function (g) {
      var cl = G.clue(g.id), pill = el("button", null, "sp-pill" + (gapActive === g.id ? " is-on" : "")); pill.type = "button"; pill.title = g.ask + " " + g.why;
      var ic = el("span", STICKER[g.id] || "\u2728", "sp-pill-ico"); ic.setAttribute("aria-hidden", "true"); pill.append(ic, el("span", cl[0]), el("span", "+", "sp-pill-plus"));
      pill.setAttribute("aria-expanded", gapActive === g.id ? "true" : "false");
      pill.addEventListener("click", function () {
        if (g.action === "photo") { var f = $("sp-file"); if (f) f.click(); return; }
        gapActive = gapActive === g.id ? "" : g.id; drawGaps(p);
        if (gapActive) { var inp = box.querySelector(".sp-gap-in"); if (inp) inp.focus(); }
      });
      pills.append(pill);
    });
    if (rest.length > top.length) { var more = el("button", "+" + (rest.length - top.length) + " more", "sp-pill sp-pill-more"); more.type = "button"; more.addEventListener("click", function () { gapsAll = true; drawGaps(p); }); pills.append(more); }
    box.append(pills);
    var act = list.filter(function (g) { return g.id === gapActive && g.action !== "photo"; })[0];
    if (act) {
      var cl2 = G.clue(act.id), card = el("form", null, "sp-gap");
      var q = el("div", null, "sp-gap-q"); q.append(el("b", act.ask), el("span", act.why, "sp-gap-why"));
      var inp2 = el("input", null, "sp-gap-in"), go = el("button", "Add", "sp-gap-go"), own = el("button", "write it myself", "sp-gap-own");
      inp2.type = "text"; inp2.placeholder = cl2[1] || "your words"; inp2.maxLength = 160; inp2.autocomplete = "off"; inp2.setAttribute("aria-label", act.ask);
      go.type = "submit"; own.type = "button"; own.title = "Put the start of the sentence in the story and finish it there";
      card.addEventListener("submit", function (ev) { ev.preventDefault(); add(act, inp2.value); });
      own.addEventListener("click", function () { add(act, ""); });
      var row = el("div", null, "sp-gap-row"); row.append(inp2, go, own);
      card.append(q, row); box.append(card);
    }
  }

  /* ---- the journey: map, years, who held the ground ------------------------------------------------------------------------- */
  var map = null;
  function getMap() {
    return S.loadLeaflet().then(function (L) {
      if (!map) { map = L.map($("sp-map"), { scrollWheelZoom: false }); L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(map); }
      map.invalidateSize({ animate: false });
      return { L: L, map: map };
    });
  }
  var J = E.createJourney({ els: { cap: $("sp-cap"), slider: $("sp-year"), yearOut: $("sp-yearout"), play: $("sp-play"), moments: $("sp-moments"), time: $("sp-time"), mapBox: $("sp-map") }, getMap: getMap, askBox: $("sp-ask"), onBorn: function (y) { setBorn(y); } });
  /* THE JOURNEY PLAYS ONCE, THE FIRST TIME IT IS SEEN. David: «the map doesn't play». It did, but behind a button under the family tree, and nothing said so. Now the map is the
     first thing under the words, and the first time it comes into view with a timeline it plays through by itself, once for the page and never when the visitor has asked
     their device for less motion. Pressing Pause stops it; typing redraws it without playing again. */
  var played = false, watcher = null;
  function playOnce() {
    if (played || reduce || !("IntersectionObserver" in window)) return;
    var map = $("sp-map"), btn = $("sp-play"); if (!map || !btn || $("sp-time").hidden) return;
    if (watcher) watcher.disconnect();
    watcher = new IntersectionObserver(function (ents) {
      if (played || !ents.some(function (en) { return en.isIntersecting; })) return;
      played = true; watcher.disconnect();
      setTimeout(function () { if (!$("sp-time").hidden && /Play/.test(btn.textContent)) btn.click(); }, 700);
    }, { threshold: 0.5 });
    watcher.observe(map);
  }
  function setBorn(y) {
    if (!parsed) return;
    parsed.born = y; (parsed.route || []).forEach(function (st) { if (st.age != null) st.year = y + st.age; });
    say("Reading the Atlas…");
    LD.gather(parsed).then(function (g) { sayDone(); last = g; drawAll(g); }).catch(function () { say("Some Atlas files did not load. Check your connection.", true); });
  }
  function lede(f) {
    var bits = (f.route || []).filter(function (x) { return x.info; }).map(function (x, i) {
      var a = x.age > 0 ? (x.approx ? " at about age " : " at age ") + x.age : "";   /* an age of 0 is "no age told", not a newborn */
      return (i === 0 ? (x.role === "born" ? "born in " : "from ") : i === f.route.length - 1 ? "arriving in " : "then ") + x.info.name + (i ? a : "");
    });
    return bits.length ? bits.join(", ") + ". Change the words below and everything on this page follows." : "";
  }
  /* "What was going on" is matched to years. With ages only there is nothing to match yet: say so, and say what fills it. */
  function settingNote(g) {
    var m = $("sp-moments"); if (!m || m.children.length) return;
    var f = g.facts, haveYear = f.born != null || f.left != null || (f.route || []).some(function (x) { return x.year != null; });
    if (haveYear) { m.append(el("p", "The Atlas holds no epidemic, famine, war or mass-death event whose area covers these places in the years they were there. That is what the Atlas holds, not proof that nothing happened.", "sp-sublede")); return; }
    m.append(el("p", "This fills in once the Atlas knows the years. The story gave ages but no dates. Add the year they were born and it shows the epidemics, famines, wars and leaders of the years they were at each place, and who held the ground.", "sp-sublede"));
  }
  /* ---- the boxes of the family tree, filled in by hand --------------------------------------------------------------------- */
  /* What is typed in a box is written into the story as plain sentences (the story stays the one source: read it, change it, and the page follows).
     A box edited twice replaces its own earlier sentences instead of piling up. */
  var edits = Object.create(null);
  function cap1(x) { return x.charAt(0).toUpperCase() + x.slice(1); }
  function box2sentences(slot, v) {
    var R = cap1(slot.ref), me = slot.kind === "self" && slot.me, out = [], yr = function (y) { return /^\d{3,4}$/.test(y) ? y : ""; };
    function when(y, at) { var b = []; if (yr(y)) b.push("in " + y); else if (y) b.push("about " + y); if (at) b.push("in " + at); return b.join(" "); }
    if (slot.kind === "spouse") {
      if (!v.name) { if (v.note) out.push(v.note); }
      else out.push(R + " married " + v.name + (when(v.married, v.marriedAt) ? " " + when(v.married, v.marriedAt) : "") + ".");
      if (v.name && v.note) out.push(v.note);
      return out;
    }
    if (v.name && !me) out.push(R + " was named " + v.name + ".");
    if (v.born || v.bornAt) out.push(R + (me ? " was" : " was") + " born " + when(v.born, v.bornAt) + ".");
    if (v.died || v.diedAt) out.push(R + " died " + when(v.died, v.diedAt) + ".");
    if (v.lived) out.push(R + (me ? " live in " : " lived in ") + v.lived + ".");
    if (v.work) out.push(R + (me ? " work as " : " worked as ") + (/^(?:an?|the)\s/i.test(v.work) ? "" : /^[aeiou]/i.test(v.work) ? "an " : "a ") + v.work + ".");
    if (v.note) out.push(/[.!?]$/.test(v.note) ? v.note : v.note + ".");
    return out;
  }
  function editBox(slot, v) {
    var key = slot.kind + "|" + slot.ref, prev = edits[key], all = Object.assign({}, prev && prev.v);
    Object.keys(v).forEach(function (k) { if (v[k]) all[k] = v[k]; });   /* what is typed now is added to what the box already had, and replaces the same field */
    var add = box2sentences(slot, all).join(" ");
    if (!add) return;
    var t = text.value;
    if (prev && t.indexOf(prev.text) > -1) t = t.replace(prev.text, "").replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
    edits[key] = { v: all, text: add };
    text.value = (t ? t.replace(/\s+$/, "") + "\n" : "") + add; grow();
    try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* none */ }
    lastSig = ""; run();
  }
  function drawAll(g) {
    var f = g.facts;
    $("sp-title").textContent = f.name ? f.name + "’s story" : "Their story";
    $("sp-lede").textContent = lede(f) || LEDE0;   /* never the last story's route when this one tells none */
    rail.hidden = false;
    secShow("sp-places", true);
    var sb = J.stops(f, g.mort); stopItems = sb.items; var st = $("sp-stops"); st.textContent = ""; st.append(sb); placesRail();
    var lb = E.lifeBlock(g.life, g.mort), lbox = $("sp-lifebox"); lbox.textContent = ""; secShow("sp-life", !!lb); if (lb) lbox.append(lb);
    var nb = E.namesBlock(g.names, BASE), nbox = $("sp-namesbox"); nbox.textContent = ""; secShow("sp-names", !!nb);
    if (nb) { nbox.append(nb); [].forEach.call(nb.querySelectorAll("details"), function (d) { d.open = true; }); }
    var tr = E.treeBlock(g.people, f.rel, { onEdit: editBox, kin: f.kin, base: BASE, siblings: f.siblings }), ob = E.othersBlock(g.others, f.siblings), tbox = $("sp-tree"); tbox.textContent = ""; secShow("sp-family", !!(tr || ob)); if (tr) tbox.append(tr); if (ob) tbox.append(ob); peopleRail();
    secShow("sp-setting", true);
    secShow("sp-plan", true); drawSteps(g); drawTodo(g);
    secShow("sp-keep", true); drawKeep(g);
    J.draw(f, g.mort).then(function () { settingNote(g); playOnce(); }, function () { settingNote(g); });
    watch();
  }
  function clearReport() {
    if ($("sp-doubt")) { $("sp-doubt").hidden = true; $("sp-doubt").textContent = ""; }
    J.clear(); last = null; lastPlan = null; if (todoOut) { todoOut.textContent = ""; todoTok++; } rail.hidden = true; [].forEach.call(rail.querySelectorAll("a.sub:not(.psub)"), function (x) { x.remove(); });
    ["sp-places", "sp-life", "sp-names", "sp-family", "sp-setting", "sp-plan", "sp-keep"].forEach(function (id) { secShow(id, false); });
    $("sp-ai-out").hidden = true; $("sp-ai-out").textContent = ""; $("sp-title").textContent = "Tell us what you know";
  }

  /* ---- the first steps (from the Atlas's own plan) ------------------------------------------------------------------------- */
  function drawSteps(g) {
    var box = $("sp-steps"); box.textContent = "";
    g.plan.forEach(function (s, i) {
      var d = el("section", null, "sp-pstep"); d.style.animationDelay = (i * 100) + "ms";
      var h = el("h3"); h.append(el("span", String(s.n), "sp-num"), " " + s.title); d.append(h, el("p", s.why, "sp-why"));
      var ul = el("ul"); s.items.forEach(function (it) { var li = el("li"); if (it.href) { var a = el("a", it.text); a.href = it.href; li.append(a); } else li.textContent = it.text; ul.append(li); });
      d.append(ul);
      (s.links || []).forEach(function (l) { var p = el("p"), a = el("a", l.text + " →"); a.href = l.href; p.append(a); d.append(p); });
      if (s.ask) { var q = el("p", null, "sp-ask"); q.append(el("b", "Ask: "), s.ask); d.append(q); }
      if (s.not) { var n = el("p", null, "sp-not"); n.append(el("b", "Do not conclude: "), s.not); d.append(n); }
      box.append(d);
    });
  }

  /* ---- the plan, place by place: computed here from the Atlas's own files (story-todo.js); nothing is sent anywhere ----------------------------------- */
  var todoOut = $("sp-todo"), todoTok = 0, fileMemo = Object.create(null);
  function fetchFile(name) { return fileMemo[name] || (fileMemo[name] = fetch(BASE + name).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })); }
  function drawTodo(g) {
    if (!todoOut) return;
    var tok = ++todoTok; todoOut.textContent = ""; todoOut.append(el("p", "Working out where to start…", "sp-fine"));
    Promise.all([window.raStoryTodo ? null : loadScript("story-todo.js"), fetchFile("archives-near.json"), fetchFile("regions.json"), fetchFile("providers.json")]).then(function (r) {
      if (tok !== todoTok) return;
      var an = r[1] && r[1].rows ? r[1].rows.map(function (x) { return { id: x[0], name: x[1], kind: x[2], access: x[3], cc: x[4], lat: x[5], lon: x[6], url: x[7], email: x[8], post: x[9], tel: x[10] }; }) : [];
      var pv = r[3] && (r[3].providers || r[3]) || [], byId = Object.create(null); an.forEach(function (a) { byId[a.id] = a; }); pv.forEach(function (p) { byId[p.id] = byId[p.id] || p; });
      var deps = { base: BASE, countries: data && data.countries, rows: data && data.rows, archives: an, regions: r[2], provById: byId, mort: g.mort, cemeteries: null };
      var T = window.raStoryTodo; T.render(T.build(g, deps), todoOut);
      /* the cemetery files are large (about 5 MB between them), so they come after the plan is already on the page */
      return Promise.all([fetchFile("cemeteries-osm.json"), fetchFile("cemeteries-wikidata.json")]).then(function (c) {
        if (tok !== todoTok) return;
        deps.cemeteries = { osm: (c[0] && c[0].features) || [], wd: (c[1] && c[1].features) || [] };
        T.render(T.build(g, deps), todoOut);
      });
    }).then(null, function () { if (tok === todoTok) { todoOut.textContent = ""; todoOut.append(el("p", "The plan could not be worked out just now. The steps below still apply.", "sp-fine")); } });
  }

  /* ---- the research plan, by Claude Haiku, on request ----------------------------------------------------------------------- */
  var aiBtn = $("sp-ai-btn"), aiOut = $("sp-ai-out"), aiStat = $("sp-ai-status");
  aiBtn.addEventListener("click", function () {
    if (!last) return;
    var g = last; aiBtn.disabled = true; aiStat.textContent = "Asking Claude Haiku… this takes up to half a minute."; aiStat.className = "sp-status";
    Promise.all([window.raStoryRead && window.raStoryRead.call ? null : loadScript("story-read.js"), window.raStoryPlan ? null : loadScript("story-plan.js")]).then(function () {
      var body = window.raStoryPlan.payload(g, data && data.countries, BASE);
      if (!body.facts.route.length) throw new Error("The plan needs a place the Atlas knows. None in your story matched yet: add where it happened with the country (for example “Gallignana, Croatia”), and the plan will have somewhere to start.");
      return window.raStoryRead.call("plan", body);
    }).then(function (j) {
      lastPlan = j.result || null; aiOut.hidden = false; window.raStoryPlan.render(lastPlan, aiOut); aiStat.textContent = "";
      aiBtn.textContent = "Build it again";
      var foot = el("p", null, "sp-ai-foot"), b = el("button", "Save this plan with your story"); b.type = "button"; b.addEventListener("click", function () { save(true); }); foot.append(b); aiOut.append(foot);
      aiOut.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    }).then(null, function (e) { aiStat.textContent = (e && e.message) || "The plan could not be built just now."; aiStat.className = "sp-status bad"; }).then(function () { aiBtn.disabled = false; });
  });

  /* ---- A SAVED STORY, CONTINUED ----------------------------------------------------------------------------------------------
     David: «the my story tab, isn't this the same as /read/#story? I don't think we need another.» There is one story tool, this one, and a story
     saved from it is listed in My research with its dated log. /read/?story=<id>#story brings one back here to add to: the words of the story (the
     pieces of kind «story») fill the box; documents, photos, notes and plans already saved stay in it, untouched. Saving then ADDS what was written
     after the saved words as a new, dated piece; if the saved words were changed, they are replaced by the new version (also a dated piece). A story
     too long for the box (8,000 characters) opens empty and whatever is written is added to the end. /read/?family=<slug> starts a new story for that
     family. A first save also makes the story «current», so a second press changes it instead of saving a copy. */
  var QS = new URLSearchParams(location.search), CUR = null, PEND_FAM = QS.get("family") || "", CHUNK = 5800;
  function storyWords(st) { return (st && st.pieces || []).filter(function (p) { return p.kind === "story" && p.text; }).map(function (p) { return p.text; }).join("\n\n"); }
  function chunked(t) {
    t = String(t).trim(); if (t.length <= CHUNK) return t ? [t] : [];
    var out = [], rest = t;
    while (rest.length > CHUNK) {
      var cut = rest.lastIndexOf("\n\n", CHUNK); if (cut < CHUNK * 0.5) cut = rest.lastIndexOf(". ", CHUNK); if (cut < CHUNK * 0.5) cut = CHUNK;
      out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }
  function saveLabel() {
    var b = $("sp-save-btn"); if (b) b.textContent = CUR ? "Save to this story" : "Save the story only";
    var n = $("sp-cont"); if (!n) { n = el("p", null, "sp-cont"); n.id = "sp-cont"; drop.parentNode.insertBefore(n, drop); }
    n.textContent = "";
    if (CUR) {
      n.append("Continuing \u201C" + CUR.name + "\u201D" + (CUR.appendOnly ? " (it is long, so what you write here is added to the end)" : "") + ". Save adds what you write to it. ");
      var nb = el("button", "Start a new story instead"); nb.type = "button"; nb.className = "sp-linkbtn";
      nb.addEventListener("click", function () { CUR = null; saveLabel(); saveOut.textContent = ""; try { history.replaceState(null, "", location.pathname + "#story"); } catch (e) { /* none */ } });
      n.append(nb);
    }
    n.hidden = !CUR;
  }
  function openSaved(id) {
    return (window.raStories ? Promise.resolve() : loadScript("stories.js")).then(function () {
      var st = window.raStories.get(id); if (!st) { say("That story is not in this browser. It may have been deleted, or saved on another device that has not synced yet."); return false; }
      var words = storyWords(st), append = words.length > text.maxLength;
      CUR = { id: id, name: st.name, base: append ? "" : words, appendOnly: append };
      if (st.line) PEND_FAM = st.line;
      text.value = append ? "" : words; grow(); saveLabel();
      return true;
    }).catch(function () { return false; });
  }
  var saveOut = $("sp-save-out");

  /* ---- keep it: a research family, or just the words ------------------------------------------------------------------------ */
  function drawKeep(g) {
    var P0 = window.raProgress, selL = $("sp-fa-line"), nameIn = $("sp-fa-name"), btn = $("sp-fa-btn"), want = selL.value || PEND_FAM, out = $("sp-fa-out");
    out.textContent = "";
    selL.textContent = "";
    /* a research family is named for a surname; with none in the story the place is no family's name, so the box is left to be filled */
    var surn = String(g.facts.name || "").trim().split(/\s+/).filter(Boolean).length > 1;
    var o0 = el("option", "A new family" + (surn ? ": " + E.familyName(g.facts) : " (name it)")); o0.value = ""; selL.append(o0);
    (P0 ? P0.lines() : []).slice().sort(function (x, y) { return x.name.localeCompare(y.name); }).forEach(function (l) { var o = el("option", "Add to " + l.name + (l.where ? " of " + l.where : "")); o.value = l.slug; selL.append(o); });
    if (want && [].some.call(selL.options, function (o) { return o.value === want; })) selL.value = want;
    if (document.activeElement !== nameIn && (!nameIn.value || nameIn.getAttribute("data-auto") === "1")) { nameIn.value = surn ? E.familyName(g.facts) : ""; nameIn.placeholder = surn ? "Name it" : "A surname" + (g.facts.from ? ", or leave blank for " + g.facts.from.name : ""); nameIn.setAttribute("data-auto", "1"); }
    function sync() { var ex = !!selL.value; nameIn.hidden = ex; btn.textContent = ex ? "Add this story to " + (selL.options[selL.selectedIndex].text.replace(/^Add to /, "")) : "Add this family to your research"; }
    if (!selL.__wired) { selL.__wired = true; selL.addEventListener("change", sync); nameIn.addEventListener("input", function () { nameIn.setAttribute("data-auto", "0"); }); }
    sync();
    btn.onclick = function () {
      var P = window.raProgress;
      if (!P) { out.textContent = "Your research list did not load on this page. Reload and try again."; return; }
      var r = E.startFamily(P, g.facts, g.plan.concat([{ items: stopItems }]), { name: nameIn.value, line: selL.value || null });
      out.textContent = ""; out.append((selL.value ? "Added to " : "Started ") + r.name + ": " + r.added + " registers and sources planned, for every place. It is now your active family. ");
      var a = el("a", "Open My research"); a.href = BASE + "my-research/"; out.append(a);
      try { if (window.raPaintProgress) window.raPaintProgress(); } catch (e) { /* the map repaints on its own next time */ }
    };
  }
  /* keep the words: the story (and the names of any photos) go to My research, where more can be added; the plan too when it was built */
  function save(withPlan) {
    var t = text.value.trim();
    if (!t && !files.length) { saveOut.textContent = "Tell the story first, then save it."; return; }
    (window.raStories ? Promise.resolve() : loadScript("stories.js")).then(function () { return files.length && !window.raStoryPics ? loadScript("story-pics.js") : null; }).then(function () {
      var ST = window.raStories, f = last && last.facts, id, how = "Saved";
      if (CUR && ST.get(CUR.id)) {
        id = CUR.id;
        var prior = CUR.appendOnly ? "" : CUR.base, now = new Date(), tag = now.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][now.getMonth()] + " " + now.getFullYear();
        if (!CUR.appendOnly && t === prior && !files.length && !lastPlan) { saveOut.textContent = "Nothing new to save: the words are as they were."; return; }
        if (t && (CUR.appendOnly || (prior && t.indexOf(prior) === 0))) {
          var added = CUR.appendOnly ? t : t.slice(prior.length).trim();
          chunked(added).forEach(function (c, i) { ST.addPiece(id, { kind: "story", label: i ? "Added " + tag + " (continued)" : "Added " + tag, text: c }); });
          how = added ? "Added to the story" : "Saved";
        } else if (t) {
          ST.get(id).pieces.filter(function (p) { return p.kind === "story"; }).forEach(function (p) { ST.removePiece(id, p.id); });
          chunked(t).forEach(function (c, i) { ST.addPiece(id, { kind: "story", label: i ? "The family story (revised " + tag + ", continued)" : "The family story (revised " + tag + ")", text: c }); });
          how = "Saved the new version of the story";
        }
      } else {
        id = ST.create({ name: f && f.name ? f.name + "'s story" : "", text: t.slice(0, CHUNK) });
        if (!id) { saveOut.textContent = "This browser would not keep it. Storage may be full or blocked."; return; }
        if (t.length > CHUNK) ST.addPiece(id, { kind: "story", label: "The family story (continued)", text: t.slice(CHUNK, CHUNK * 2) });
      }
      if (lastPlan && window.raStoryPlan) { var pt = window.raStoryPlan.asText(lastPlan); if (pt) ST.addPiece(id, { kind: "note", label: "Research plan (a draft by Claude Haiku)", text: pt }); }
      var kept = 0, lost = 0;
      var keeps = files.map(function (x) {
        var label = (x.r && x.r.label ? x.r.label + " (" + String(x.f.name || "").replace(/\.[a-z0-9]+$/i, "") + ")" : String(x.f.name || "Photo").replace(/\.[a-z0-9]+$/i, "")).slice(0, 80);
        var pid = ST.addPiece(id, { kind: x.r ? "document" : "photo", label: label, text: "" });
        return Promise.resolve(x.shot || window.raStoryPics.shrink(x.f)).then(function (shot) { return window.raStoryPics.put(id + "/" + pid, shot.blob); }).then(function () { kept++; }, function () { lost++; });
      });
      if (parsed && parsed.born != null) ST.setBorn(id, parsed.born);
      var pick = $("sp-fa-line"); if (pick && pick.value && ST.setLine) ST.setLine(id, pick.value);
      try { localStorage.setItem("ra-story-current", id); } catch (e) { /* the page still opens it by address */ }
      /* now saved: the next press changes THIS story, instead of saving a copy */
      var st2 = ST.get(id); CUR = { id: id, name: st2 ? st2.name : "", base: CUR && CUR.appendOnly ? "" : t, appendOnly: !!(CUR && CUR.appendOnly) };
      if (CUR.appendOnly) { text.value = ""; grow(); }
      saveLabel();
      try { history.replaceState(null, "", location.pathname + "?story=" + encodeURIComponent(id) + "#story"); } catch (e) { /* none */ }
      Promise.all(keeps).then(function () {
        saveOut.textContent = how + (withPlan && lastPlan ? " with the plan" : "") + (kept ? " with " + kept + " picture" + (kept === 1 ? "" : "s") + ", kept in this browser only (the words travel with the story, the pictures do not)" : "") + (lost ? ". " + lost + " picture" + (lost === 1 ? " was" : "s were") + " not kept: this browser would not store them" : "") + ". ";
        var a = el("a", "See it in My research, with its log"); a.href = BASE + "my-research/#story"; saveOut.append(a, document.createTextNode("."));
      });
      $("sp-save-btn").disabled = true; setTimeout(function () { $("sp-save-btn").disabled = false; }, 2500);
    }).catch(function () { saveOut.textContent = "Could not save here. Open My research and look for the story there."; });
  }
  $("sp-save-btn").addEventListener("click", function () { save(false); });

  /* ---- reading the words ----------------------------------------------------------------------------------------------------- */
  function signature(p) {
    return JSON.stringify([(p.route || []).map(function (x) { return x.row.i + ":" + x.age; }), p.left, p.born, p.name, (p.people || []).map(function (x) { return x.role + x.name + (x.occupation || "") + JSON.stringify((x.events || []).map(function (e) { return [e.type, e.year, e.place]; })) + (x.place && x.place.word || ""); }), p.holds,
      p.life && p.life.groups.map(function (g) { return g.items; }), p.life && p.life.illness, p.life && p.life.died, (p.siblings || []).map(function (x) { return x.name; }), (p.kin || []).length]);
  }
  /* ---- A STORY IN ANOTHER LANGUAGE (story-lang.js) --------------------------------------------------------------------------------
     David: «this isnt a croatian site, its supposed to be global... we need a ai language detect and translation built in». The reader understands English, so a story in
     any other language is read into English first and THAT is what is parsed; the box keeps the writer's own words. The language is found here, on the device, as they type.
     Where the browser can translate on the device it does, by itself; where it needs a small language pack it asks first; where it cannot, the reader can have Claude do it,
     behind a tick that says the text is sent. The English is shown, with a note of any name that did not come through, and can be put in the box. */
  var LG = window.raStoryLang, lang = { seen: "", det: null, src: "", english: "", via: "", lost: [], status: "", busy: false, pct: 0, ok: false, err: "", skip: Object.create(null), tok: 0 };
  function readingText(raw) { return lang.english && lang.src === raw ? lang.english : raw; }
  function langReset() { lang.seen = ""; lang.det = null; lang.src = ""; lang.english = ""; lang.via = ""; lang.lost = []; lang.status = ""; lang.busy = false; lang.pct = 0; lang.err = ""; lang.tok++; var b = $("sp-lang"); if (b) { b.hidden = true; b.textContent = ""; } }
  function checkLang(raw) {
    var box = $("sp-lang"); if (!box || !LG) return;
    if (raw.trim().length < 25) { if (lang.det || lang.english) langReset(); return; }
    if (lang.seen === raw) return;
    var had = lang.det && lang.det.code, d = LG.detect(raw);
    lang.seen = raw;
    if (d.english || !d.code || lang.skip[d.code]) { var wasShown = !!lang.det; lang.det = null; lang.english = ""; lang.src = ""; if (wasShown) { box.hidden = true; box.textContent = ""; } return; }
    if (!d.sure) { LG.detectBest(raw).then(function (b) { if (lang.seen !== raw || !b || b.english || !b.code || lang.skip[b.code]) return; settle(raw, b); }); return; }
    settle(raw, d, had);
  }
  /* the language is known: if the text changed under a translation it is stale, then ask what the browser can do */
  function settle(raw, d) {
    lang.det = d; if (lang.src !== raw) { lang.english = ""; lang.src = ""; lang.lost = []; lang.via = ""; }
    lang.err = ""; var my = ++lang.tok; drawLang();
    LG.deviceStatus(d.code).then(function (st) {
      if (my !== lang.tok) return; lang.status = st;
      if (st === "available" && !lang.english) return viaDevice(raw, d);   /* nothing to download: it just works */
      drawLang();
    });
  }
  function done(raw, english, via) {
    lang.english = english; lang.src = raw; lang.via = via; lang.busy = false; lang.err = "";
    lang.lost = LG.lostNames(raw, english); lastSig = ""; drawLang(); run();
  }
  function viaDevice(raw, d) {
    var my = lang.tok; lang.busy = true; lang.pct = 0; lang.err = ""; drawLang();
    return LG.deviceTranslate(raw, d.code, function (f) { lang.pct = f; drawLang(); }).then(function (en) { if (my !== lang.tok || text.value !== raw) return; done(raw, en, "device"); })
      .catch(function (e) { if (my !== lang.tok) return; lang.busy = false; lang.status = "unavailable"; lang.err = "This browser could not translate it on the device."; drawLang(); });
  }
  function viaClaude(raw) {
    var my = lang.tok; lang.busy = true; lang.err = ""; drawLang();
    (window.raStoryRead && window.raStoryRead.call ? Promise.resolve() : loadScript("story-read.js")).then(function () { return window.raStoryRead.call("english", { text: raw.slice(0, 8000) }); }).then(function (j) {
      if (my !== lang.tok || text.value !== raw) return;
      var r = j && j.result; if (!r || r.unparsed || !r.text) throw new Error("Claude's answer could not be laid out.");
      if (r.lang === "en") { lang.skip[lang.det && lang.det.code] = 1; lang.busy = false; langReset(); lastSig = ""; return run(); }
      if (r.lang && lang.det && r.lang !== lang.det.code) lang.det = { code: r.lang, name: r.language || LG.names[r.lang] || r.lang, confidence: 1, sure: true };
      done(raw, r.text, "claude"); if (r.added && r.added.length) { lang.err = "The English holds numbers that are not in your words: " + r.added.join(", ") + ". Check it before you rely on it."; drawLang(); }
    }).catch(function (e) { if (my !== lang.tok) return; lang.busy = false; lang.err = (e && e.message) || "Claude could not translate it just now."; drawLang(); });
  }
  function drawLang() {
    var box = $("sp-lang"), d = lang.det; if (!box) return;
    if (!d) { box.hidden = true; box.textContent = ""; return; }
    var raw = text.value, have = lang.english && lang.src === raw, nm = d.note || d.name;
    box.hidden = false; box.textContent = "";
    var h = el("p", null, "sp-lang-h");
    h.append(el("b", have ? "Read from " + nm : "This looks like " + nm));
    if (have) h.append(el("span", lang.via === "claude" ? "Translated by Claude" : "Translated on this device", "sp-lang-via"));
    box.append(h);
    if (lang.busy) {
      box.append(el("p", lang.pct && lang.pct < 1 ? "Getting the " + d.name + " language pack… " + Math.round(lang.pct * 100) + "%" : "Translating…", "sp-lang-note"));
      if (lang.pct && lang.pct < 1) { var bar = el("div", null, "sp-lang-bar"), fill = el("i"); fill.style.width = Math.round(lang.pct * 100) + "%"; bar.append(fill); box.append(bar); }
    } else if (have) {
      box.append(el("p", "The page reads it in English; your own words stay in the box.", "sp-lang-note"));
      if (lang.lost.length) box.append(el("p", "Check these names in the English, they may have changed: " + lang.lost.join(", ") + ".", "sp-lang-warn"));
      var det = el("details"); det.append(el("summary", "How it reads in English"), el("p", lang.english, "sp-lang-en"));
      var row0 = el("p", null, "sp-lang-row"), use = el("button", "Put the English in the box", "sp-ghost");
      use.type = "button"; use.addEventListener("click", function () { var en = lang.english; lang.skip[d.code] = 1; langReset(); text.value = en; grow(); lastSig = ""; try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* none */ } run(); });
      row0.append(use); det.append(row0); box.append(det);
    } else if (lang.status === "available") {
      box.append(el("p", "Reading it in English on this device…", "sp-lang-note"));
    } else if (lang.status === "downloadable" || lang.status === "downloading") {
      box.append(el("p", "The page reads English. Your browser can translate " + d.name + " on this device, free and private, after a one-time download of a small language pack.", "sp-lang-note"));
      var r1 = el("p", null, "sp-lang-row"), go1 = el("button", "Translate on this device", "sp-add"); go1.type = "button";
      go1.addEventListener("click", function () { viaDevice(raw, d); }); r1.append(go1); box.append(r1);
    }
    if (!have && !lang.busy && lang.status !== "available") {
      if (lang.status !== "downloadable" && lang.status !== "downloading") box.append(el("p", "The page reads English, so this needs translating first. Your own words stay as they are.", "sp-lang-note"));
      var lab = el("label", null, "sp-lang-ok"), cb = el("input"); cb.type = "checkbox"; cb.checked = lang.ok;
      lab.append(cb, el("span", "Send this text to Claude once, to be translated into English. It goes through ai.recordatlas.org, which keeps no text and no names, only counts. Nothing is sent until I press the button."));
      var r2 = el("p", null, "sp-lang-row"), go2 = el("button", "Translate with Claude", lang.status === "downloadable" ? "sp-ghost" : "sp-add"); go2.type = "button"; go2.disabled = !lang.ok;
      cb.addEventListener("change", function () { lang.ok = cb.checked; go2.disabled = !lang.ok; });
      go2.addEventListener("click", function () { if (lang.ok) viaClaude(raw); });
      r2.append(go2); box.append(lab, r2);
    }
    if (lang.err) box.append(el("p", lang.err, "sp-lang-warn"));
    var own = el("button", "It is not " + (d.note ? d.name : nm) + " — read it as it is", "sp-lang-own"); own.type = "button";
    own.addEventListener("click", function () { lang.skip[d.code] = 1; langReset(); lastSig = ""; run(); });
    box.append(own);
  }

  function run() {
    var raw = text.value, t = readingText(raw), rw = null; checkLang(raw);
    $("sp-clear").hidden = !t.trim() && !files.length; $("sp-link").hidden = !t.trim();
    if (t.trim().length > 12) say("Reading your story…");
    /* WHO IS WHOSE PARENT is made explicit first (story-kin.js), once the given names are loaded, so «born in 1951 to ivan and hedviga» is two parents and not a journey to a
       village called Ivan. The page shows how it read the words. */
    return LD.load().then(function (d0) {
      var K = window.raStoryKin; if (K) { rw = K.rewrite(t, function (w) { return !!(d0 && d0.given && d0.given[S.fold(w)]); }); if (rw.changed) t = rw.text; }
      readingNow = t; drawRead(rw, raw);
      return LD.resolveMissing(t);
    }).catch(function () { return LD.load(); }).then(function (d) {
      data = d;
      var attached = files.length ? "photo" : null;
      var p = E.parseStory(t, { map: d.map, given: d.given, skip: d.skip, countries: d.countries }, attached);
      (p.stops || []).forEach(function (st) { var o2 = ov[st.word]; if (o2) { st.row = o2.row; st.alts = o2.alts; } });
      if (p.route && p.route.length) {
        var r0 = p.route[0], rl = p.route[p.route.length - 1];
        p.from = { row: r0.row, alts: r0.alts, word: r0.word }; p.to = p.route.length > 1 ? { row: rl.row, alts: rl.alts, word: rl.word } : null;
      }
      parsed = p; drawChips(p); doubt(t, p, d);
      var sig = signature(p);
      if (sig === lastSig || !tellable(p)) {
        if (status.textContent === "Reading your story…") sayDone();
        if (!tellable(p) && sig !== lastSig) { lastSig = ""; clearReport(); }
        return;
      }
      lastSig = sig;
      var my = ++token; say("Reading the Atlas…");
      return LD.gather(p).then(function (g) {
        if (my !== token) return;
        sayDone(); last = g; lastPlan = null; aiOut.hidden = true; aiOut.textContent = ""; aiBtn.textContent = "Build my research plan";
        drawAll(g);
      }).catch(function (e) { if (window.console) console.error("story draw", e); say("Some Atlas files did not load. Check your connection.", true); });
    }).catch(function (e) { if (window.console) console.error("story read", e); say("The Atlas files did not load. Check your connection.", true); });
  }
  /* IS THE READING TRUSTWORTHY? (story-check.js) Every reading is tested against its own words: is anything the writer said missing, is anything shown that they never said,
     is it consistent. When it is not sure, one calm line says so, in plain words, and offers the careful reader. Nothing is sent: the button only opens the Tidy panel, where
     the writer still presses Send. A reading the check is happy with shows nothing at all. */
  function doubt(t, p, d) {
    var box = $("sp-doubt"); if (!box) return;
    var r = null;
    try {
      var C = window.raStoryCheck, cn = {}; Object.keys(d.countries || {}).forEach(function (k) { cn[S.fold(d.countries[k])] = 1; });
      if (C && tellable(p)) r = C.check(t, p, { countries: d.countries, isPlace: function (k) { return !!(d.map[k] && d.map[k].length) || !!cn[k]; }, isGiven: function (k) { return !!(d.given && d.given[k]); } });
    } catch (e) { r = null; }
    var first = r && r.confidence === "low" ? r.problems.filter(function (x) { return x.severity !== "info"; })[0] : null;
    box.textContent = "";
    if (!first) { box.hidden = true; return; }
    var m = document.createElement("p"); m.className = "sp-doubt-t";
    m.textContent = "I’m not sure I read this right: " + first.what.replace(/^(?!I[\s\u2019']).|^(?=I$)/, function (c) { return c.toLowerCase(); }).replace(/[.\s]+$/, "") + ". Check the places and the family below against your words, or let the careful reader have a go.";
    var b = document.createElement("button"); b.type = "button"; b.className = "sp-doubt-b"; b.textContent = "Tidy with AI";
    b.addEventListener("click", function () { var t2 = $("sp-tidy"); if (t2) t2.click(); });
    box.append(m, b); box.hidden = false;
  }
  /* how the words were read, when they were rewritten into plain who-is-whose sentences */
  var readingNow = "";
  function drawRead(rw, raw) {
    var box = $("sp-rewrite"); if (!box) return;
    if (!rw || !rw.changed) { box.hidden = true; box.textContent = ""; return; }
    box.hidden = false; box.textContent = "";
    box.append(el("summary", "How the page read your words"));
    box.append(el("p", rw.text, "sp-read-t"));
    var ul = el("ul"); rw.notes.forEach(function (n) { ul.append(el("li", n)); }); box.append(ul);
  }
  var tm = null;
  function grow() { text.style.height = "auto"; text.style.height = Math.min(Math.max(text.scrollHeight, 110), 420) + "px"; }
  text.addEventListener("input", function () {
    hold = null;
    grow(); mirrorShift(); try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* a private window: the draft is just not kept */ }
    clearTimeout(tm); tm = setTimeout(run, 650);
  });
  text.addEventListener("scroll", function () { if (mirrorEl) mirrorEl.scrollTop = text.scrollTop; });
  if (window.ResizeObserver && mirrorEl) new ResizeObserver(function () { mirrorDraw(); }).observe(text);   /* the box was resized, or a scrollbar came or went */
  /* a tap (or click) with the caret inside a marked word opens that word's panel; a tap elsewhere in the words closes it. Typing never opens anything. */
  text.addEventListener("click", function () {
    if (text.selectionStart !== text.selectionEnd || !parsed || !mirrorToks.length) return;
    var c = text.selectionStart, hit = mirrorToks.filter(function (k) { return c >= k.start && c <= k.end; })[0], key = hit ? hit.kind + ":" + hit.name.toLowerCase() : "";
    if (key === gapTok) return;
    gapActive = ""; gapOpt = ""; gapTok = key; drawGaps(parsed);
  });
  $("sp-eg").addEventListener("click", function () { text.value = HINT; grow(); run(); });
  $("sp-clear").addEventListener("click", function () {
    files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; grow(); chips.textContent = ""; $("sp-did").hidden = true;
    ov = Object.create(null); parsed = null; shown = Object.create(null); lastSig = ""; clearReport(); hold = null; say("");
    try { sessionStorage.removeItem(DRAFT); } catch (e) { /* none */ }
    $("sp-clear").hidden = true; $("sp-link").hidden = true; $("sp-gaps").hidden = true; clueReset(); langReset(); lang.skip = Object.create(null); readingNow = ""; drawRead(null); text.focus();
  });
  /* A LINK THAT CARRIES THE WORDS, for sending to somebody who asked for help in a group. The words ride after the # and are never sent to a server (story-link.js). */
  $("sp-link").addEventListener("click", function () {
    var L = window.raStoryLink, t = text.value.trim(); if (!L || !t) return;
    var h = L.hashFor(t), u = location.origin + location.pathname + h.hash;
    var done = function (ok) { say(ok ? "Link copied. Whoever opens it sees this page with your words in it; they stay in the link and are not sent anywhere." + (h.cut ? " Only the first " + L.MAX + " characters fit." : "") : "Copy this address: " + u); };
    try { navigator.clipboard.writeText(u).then(function () { done(true); }, function () { done(false); }); } catch (e) { done(false); }
  });

  /* ---- pictures: dropped, pasted or chosen; kept in this tab only ------------------------------------------------------------ */
  function addFiles(list) {
    [].slice.call(list || []).filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); }).slice(0, 4 - files.length).forEach(function (f) { files.push({ f: f, url: URL.createObjectURL(f) }); });
    drawShots(); lastSig = ""; run();
  }
  function drawShots() {
    shots.textContent = "";
    files.forEach(function (x, i) {
      var w = el("span", null, "sp-shot"), im = el("img"); im.src = x.url; im.alt = "Picture " + (i + 1) + " you added";
      var rm = el("button", "×"); rm.type = "button"; rm.setAttribute("aria-label", "Remove picture " + (i + 1)); rm.addEventListener("click", function () { URL.revokeObjectURL(x.url); files.splice(i, 1); drawShots(); lastSig = ""; run(); });
      w.append(im, rm); shots.append(w);
    });
    shots.hidden = !files.length; $("sp-read").hidden = !files.length || files.every(function (x) { return x.r; });
  }
  $("sp-file").addEventListener("change", function () { addFiles(this.files); this.value = ""; });
  ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("hot"); }); });
  ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("hot"); }); });
  drop.addEventListener("drop", function (e) { e.preventDefault(); addFiles(e.dataTransfer && e.dataTransfer.files); });
  text.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });
  /* READ THE PICTURES: on the press, each is read as a document by Claude, and what it says about the people with the story's surnames is added to the story's words */
  function readPics() {
    var btn = $("sp-read"); if (!files.length) return;
    hold = null; btn.disabled = true; var btnWas = btn.textContent; btn.textContent = "Reading…"; say("Reading the picture. This can take up to half a minute.");
    var keys = []; ((parsed && parsed.people) || []).forEach(function (pe) { if (pe.surname && keys.indexOf(pe.surname) < 0) keys.push(pe.surname); }); if (parsed && parsed.surname && keys.indexOf(parsed.surname) < 0) keys.push(parsed.surname);
    Promise.all([window.raStoryPics ? null : loadScript("story-pics.js"), window.raStoryRead && window.raStoryRead.read ? null : loadScript("story-read.js")]).then(function () {
      return window.raStoryRead.read(files, keys, function (m) { say(m); });
    }).then(function (res) {
      var R = window.raStoryRead, base = R.stripBlocks(text.value), blocks = [];
      files.forEach(function (x, i) { if (x.r) blocks.push(R.block(i + 1, x.f.name || "picture", x.r)); });
      text.value = (base + (blocks.length ? "\n\n" + blocks.join("\n\n") : "")).slice(0, 8000); grow();
      var nf = files.filter(function (x) { return x.r && !x.r.found; }).length;
      hold = { bad: !!res.failed, m: res.failed ? "Read " + res.got + " of " + files.length + ", then it stopped: " + (res.failed.message || "something went wrong.")
        : "Read " + res.got + " picture" + (res.got === 1 ? "" : "s") + ". What they say is now in your story above." + (nf ? " " + nf + " had nobody with a matching surname on it." : "") };
      say(hold.m, hold.bad);
      drawShots(); lastSig = ""; run();
    }).catch(function (e) { hold = { m: (e && e.message) || "The pictures could not be read.", bad: true }; say(hold.m, true); }).then(function () { btn.disabled = false; btn.textContent = btnWas; });
  }
  $("sp-read").addEventListener("click", readPics);

  /* WHAT THE PAGE HAS UNDERSTOOD, offered to story-ai.js ("AI ready" and "Paste a forum post"), which needs the places the reader found in order to
     pick the Atlas records a draft reply may point at. Read only: nothing here changes the page. */
  window.raStoryPage = { graph: function () { return last; }, countries: function () { return data && data.countries; }, base: BASE };

  /* ---- starting: the words handed over from the home page, or a draft kept in this tab ---------------------------------------- */
  function takeAddress() {
    var hw = window.raStoryLink ? window.raStoryLink.textFromHash(location.hash) : "";
    if (!hw) return false;
    text.value = hw; try { sessionStorage.setItem(DRAFT, hw); } catch (e) { /* none */ }
    try { history.replaceState(null, "", location.pathname + location.search + "#story"); } catch (e) { /* the address keeps them */ }
    ov = Object.create(null); lastSig = ""; clueReset(); grow(); $("sp-clear").hidden = false; run(); return true;
  }
  /* a link pasted into a tab that already has the page open changes only the part after the #, which does not reload it */
  window.addEventListener("hashchange", takeAddress);
  (function boot() {
    var h = null; try { h = JSON.parse(localStorage.getItem(HAND) || "null"); localStorage.removeItem(HAND); } catch (e) { h = null; }
    var draft = ""; try { draft = sessionStorage.getItem(DRAFT) || ""; } catch (e) { draft = ""; }
    var sid = QS.get("story");
    /* WORDS IN THE ADDRESS (#story=...), or an old /looking-for/ link turned into a sentence: they win over a kept draft, and are taken off the address once read */
    if (!sid && takeAddress()) return;
    if (sid) {
      openSaved(sid).then(function (ok) { if (ok) { $("sp-clear").hidden = false; run(); } else if (draft) { text.value = draft; grow(); run(); } });
      return;
    }
    if (h && h.text && Date.now() - (h.t || 0) < 600000) {
      text.value = String(h.text).slice(0, 8000);
      if (h.pics) say("You had " + h.pics + " picture" + (h.pics === 1 ? "" : "s") + " on the map page. Add " + (h.pics === 1 ? "it" : "them") + " here to read " + (h.pics === 1 ? "it" : "them") + ".");
    } else if (draft) text.value = draft;
    if (text.value.trim()) { grow(); $("sp-clear").hidden = false; run(); }
  })();
  window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
})();
