/* MY STORY, the tab on My research (it starts the way the map's «Who are you looking for?» drawer does: write, add pictures, read them with
   Claude on request, try an example, and see at once what the Atlas understood; and its report has the same sections, with a row of buttons that jump to them): pick a story you have told, add the next piece to it (more writing, a pasted article or document, a photo's
   caption), and watch the Atlas build a bigger journey from everything so far. Every addition is kept in a dated log, newest first, with what
   it added: the places, people and years the Atlas found in it.

   Uses stories.js (the store), story-engine.js (reading a story, drawing the journey, the per-stop cards and the plan) and progress-kit.js
   (research families). A photo is shown here for the session only and never stored: its caption is what is kept, because the Atlas reads words
   and the photograph is the reader's to keep. Every node is built with textContent. */
(function () {
  "use strict";
  var root = document.getElementById("ms-root");
  if (!root || !window.raStories) return;
  var ST = window.raStories, BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var CUR = "ra-story-current";
  var KIND_NAME = { story: "More of the story", document: "An article or document", photo: "A photo", note: "A note" };
  var CHUNK = 5800;

  function $(id) { return document.getElementById(id); }
  function make(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* the page works without it */ } }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function when(iso) { var d = new Date(iso); if (isNaN(d)) return ""; var h = d.getHours(), m = d.getMinutes(); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }
  /* a long article is kept as several pieces, cut at paragraph or sentence ends, so each stays within what one piece may hold */
  function chunks(t) {
    t = String(t).trim(); if (t.length <= CHUNK) return [t];
    var out = [], rest = t;
    while (rest.length > CHUNK) {
      var cut = rest.lastIndexOf("\n\n", CHUNK); if (cut < CHUNK * 0.5) cut = rest.lastIndexOf(". ", CHUNK); if (cut < CHUNK * 0.5) cut = CHUNK;
      out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
    return out;
  }

  var E = null, S = null, LD = null, data = null, started = null, J = null, token = 0, photo = null, kind = "story", editing = null, confirmDel = null, lastG = null, active = false;
  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = ok; s.onerror = function () { fail(new Error(src)); }; document.head.appendChild(s); }); }
  function ensure() {
    if (started) return started;
    started = (window.raAtlasSummary ? Promise.resolve() : loadScript("atlas-summary.js")).then(function () { return window.raShardKey ? null : loadScript("shard-key.js").catch(function () {}); })
      .then(function () { return window.raStory ? null : loadScript("story-engine.js"); })
      .then(function () { E = window.raStory; S = window.raAtlasSummary; LD = E.createLoader(BASE); return LD.load(); })
      .then(function (d) { data = d; }).catch(function (e) { started = null; throw e; });
    return started;
  }

  /* ---- what the Atlas makes of a story ---------------------------------------------------------------------------------- */
  function parse(text, holds, born) {
    var p = E.parseStory(text, { map: data.map, given: data.given, skip: data.skip, countries: data.countries }, holds);
    /* an ordinary word that happens to be a place's name ("Street", "Mill") is not a stop */
    if (p.route) p.route = p.route.filter(function (st) { return !(st.row && notPlace(st, p)); });
    if (p.stops) p.stops = p.stops.filter(function (st) { return !(st.row && notPlace(st, p)); });
    if (p.route && p.route.length) {
      var r0 = p.route[0], rl = p.route[p.route.length - 1];
      p.from = { row: r0.row, alts: r0.alts, word: r0.word }; p.to = p.route.length > 1 ? { row: rl.row, alts: rl.alts, word: rl.word } : null;
    }
    if (born != null && p.born == null) { p.born = born; (p.route || []).forEach(function (st) { if (st.age != null && st.year == null) st.year = born + st.age; }); }
    return p;
  }
  /* what one piece, read alone, names: for the log */
  function found(piece, born) {
    var p = parse(piece.text, null, born), bits = [], seen = Object.create(null);
    (p.stops || []).forEach(function (st) { var n = st.row && st.row.n; if (n && !seen[n] && notPlace(st, p) === false) { seen[n] = 1; bits.push(n); } });
    var out = [];
    if (bits.length) out.push("places: " + bits.slice(0, 6).join(", ") + (bits.length > 6 ? " and " + (bits.length - 6) + " more" : ""));
    var pe = (p.people || []).filter(function (x) { return x.name && x.role !== "self"; }).map(function (x) { return x.name + " (" + x.role + ")"; });
    if (p.name && !pe.length) pe.push(p.name);
    if (pe.length) out.push("people: " + pe.slice(0, 5).join(", "));
    var yrs = []; if (p.born) yrs.push("born about " + p.born); if (p.left) yrs.push("about " + p.left);
    if (yrs.length) out.push(yrs.join(", "));
    return out;
  }

  /* ---- the screen ------------------------------------------------------------------------------------------------------- */
  function current() {
    var list = ST.list(), id = lsGet(CUR);
    var s = list.filter(function (x) { return x.id === id; })[0] || list[0] || null;
    if (s && s.id !== id) lsSet(CUR, s.id);
    return { list: list, story: s };
  }
  function say(msg, bad) { var s = $("ms-status"); s.textContent = msg || ""; s.className = "ms-status" + (bad ? " ms-bad" : ""); }

  function drawPicker(c) {
    var sel = $("ms-pick"); sel.textContent = "";
    c.list.forEach(function (s) { var o = make("option", s.name + " · " + s.pieces.length + (s.pieces.length === 1 ? " piece" : " pieces")); o.value = s.id; if (c.story && s.id === c.story.id) o.selected = true; sel.append(o); });
    $("ms-bar").hidden = !c.list.length;
    $("ms-first").hidden = !!c.list.length;
    $("ms-view").hidden = !c.story;
  }

  function drawComposer(c) {
    var s = c.story, ta = $("ms-text");
    [].forEach.call(root.querySelectorAll(".ms-kind"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-kind") === kind)); });
    $("ms-photo-row").hidden = kind !== "photo";
    $("ms-label-row").hidden = false;
    var hints = {
      story: ["What else do you know? Write the next part, as you would say it.", "Where this came from (optional): who told you, or when"],
      document: ["Paste the article, obituary, certificate wording or letter here.", "Where it came from, for example Hamilton Journal obituary, 1952"],
      photo: ["Who is in it, where and when? Type what is written on the back or in the caption.", "A name for the photo, for example Wedding, Hamilton"],
      note: ["A note to add to the story.", "A short name for the note (optional)"] };
    ta.placeholder = hints[kind][0]; $("ms-label").placeholder = hints[kind][1];
    $("ms-add").textContent = kind === "photo" ? "Add this photo to the story" : "Add to the story";
    $("ms-add-to").textContent = s.name;
  }

  /* a picture kept in this browser for a piece (story-pics.js): a thumbnail that opens it whole */
  function showKept(li, sid, pid) {
    (window.raStoryPics ? Promise.resolve() : loadScript("story-pics.js")).then(function () { return window.raStoryPics.get(sid + "/" + pid); }).then(function (b) {
      if (!b) return;
      var url = URL.createObjectURL(b), a = make("a", null, "ms-thumb"), im = make("img"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.title = "Open the picture";
      im.src = url; im.alt = "The picture kept for this piece"; a.append(im, make("span", "Kept in this browser only", "ms-dim")); li.insertBefore(a, li.querySelector(".ms-acts"));
    }).catch(function () { /* no picture kept here: the piece is just its words */ });
  }
  function drawLog(c) {
    var s = c.story, box = $("ms-log"); box.textContent = "";
    var pieces = s.pieces.slice().reverse();
    $("ms-log-n").textContent = String(pieces.length);
    pieces.forEach(function (p, i) {
      var n = s.pieces.length - i, li = make("li", null, "ms-ent ms-k-" + p.kind);
      var head = make("div", null, "ms-ent-h");
      head.append(make("span", String(n), "ms-ent-n"), make("b", KIND_NAME[p.kind] || p.kind), make("span", when(p.added), "ms-ent-d"));
      li.append(head);
      if (p.label) li.append(make("p", p.label, "ms-ent-l"));
      if (editing === p.id) {
        var ta = make("textarea"); ta.className = "ms-in ms-ent-ta"; ta.value = p.text; ta.rows = 5; ta.maxLength = 6000; ta.setAttribute("aria-label", "Edit this piece");
        var row = make("div", null, "ms-row"), ok = make("button", "Save the change", "ms-btn ms-pri"), no = make("button", "Cancel", "ms-btn");
        ok.type = no.type = "button";
        ok.addEventListener("click", function () { ST.editPiece(s.id, p.id, { text: ta.value }); editing = null; refresh(); });
        no.addEventListener("click", function () { editing = null; refresh(); });
        row.append(ok, no); li.append(ta, row);
      } else {
        if (p.text) {
          var long = p.text.length > 220;
          if (long) { var d = make("details", null, "ms-more"); d.append(make("summary", p.text.slice(0, 200).replace(/\s+\S*$/, "") + "…"), make("p", p.text, "ms-ent-t")); li.append(d); }
          else li.append(make("p", p.text, "ms-ent-t"));
        } else li.append(make("p", p.kind === "document" ? "Its reading is in the story's first piece, which the Atlas reads with this one." : "No caption was typed, so the Atlas has nothing to read in this photo yet.", "ms-ent-t ms-dim"));
        if (p.kind === "photo" || p.kind === "document") showKept(li, s.id, p.id);
        var gets = p.text && data ? found(p, s.born) : [];
        if (p.text) {
          var lab = make("label", null, "ms-route"), cb = make("input"); cb.type = "checkbox"; cb.checked = ST.routeOn(p);
          cb.addEventListener("change", function () { ST.setRoute(s.id, p.id, cb.checked); refresh(); });
          lab.append(cb, document.createTextNode(" Use its places to draw the journey")); li.append(lab);
        }
        li.append(make("p", gets.length ? "The Atlas found " + gets.join(" · ") : p.text ? "The Atlas found no place, person or year in this piece." : "", "ms-ent-f"));
        var acts = make("div", null, "ms-row ms-acts");
        var ed = make("button", "Edit", "ms-link"); ed.type = "button"; ed.addEventListener("click", function () { editing = p.id; confirmDel = null; refresh(); });
        var rm = make("button", confirmDel === p.id ? "Remove it for good" : "Remove", "ms-link" + (confirmDel === p.id ? " ms-danger" : "")); rm.type = "button";
        rm.addEventListener("click", function () { if (confirmDel === p.id) { ST.removePiece(s.id, p.id); if (window.raStoryPics) window.raStoryPics.del(s.id + "/" + p.id).catch(function () {}); confirmDel = null; say("Removed. The story is read again without it."); refresh(); } else { confirmDel = p.id; refresh(); } });
        acts.append(ed, rm); li.append(acts);
      }
      box.append(li);
    });
    var made = make("li", "Story started " + when(s.created) + (s.line ? "" : ""), "ms-ent ms-ent-start");
    box.append(made);
  }

  /* the family research: pick one that exists or name a new one */
  function drawFamily(c, g) {
    var P = window.raProgress, box = $("ms-fam"); box.textContent = "";
    if (!P) { box.append(make("p", "Your research list did not load on this page.", "ms-dim")); return; }
    var s = c.story, lines = P.lines(), f = g && g.facts;
    var sel = make("select"); sel.id = "ms-line"; sel.className = "ms-in"; sel.setAttribute("aria-label", "Which family research this story belongs to");
    var o0 = make("option", "A new family" + (f && E.familyName(f) ? ": " + E.familyName(f) : "")); o0.value = ""; sel.append(o0);
    lines.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (l) { var o = make("option", l.name + (l.where ? " of " + l.where : "")); o.value = l.slug; if (s.line === l.slug) o.selected = true; sel.append(o); });
    var nm = make("input"); nm.type = "text"; nm.id = "ms-famname"; nm.className = "ms-in"; nm.maxLength = 60; nm.setAttribute("aria-label", "Name for the new family research");
    nm.value = f ? E.familyName(f) : ""; nm.placeholder = "Name, for example Kosina";
    var btn = make("button", null, "ms-btn ms-pri"); btn.type = "button";
    function sync() { var ex = sel.value; nm.hidden = !!ex; btn.textContent = ex ? "Add this story's places and registers to that research" : "Add this family to your research"; btn.disabled = !g; }
    sel.addEventListener("change", function () { ST.setLine(s.id, sel.value); sync(); });
    sync();
    btn.addEventListener("click", function () {
      if (!g) return;
      var r = E.startFamily(P, g.facts, g.plan.concat([{ items: lastStopItems }]), { name: nm.value, line: sel.value || null });
      ST.setLine(s.id, r.slug);
      say((sel.value ? "Added to " : "Started ") + r.name + ": " + r.added + " registers and sources planned. It is your active research family.");
      try { if (window.raPaintProgress) window.raPaintProgress(); } catch (e) { /* repaints later */ }
      refresh(true);
    });
    var row = make("div", null, "ms-row"); row.append(sel, nm, btn);
    box.append(row);
    var cur = s.line ? lines.filter(function (l) { return l.slug === s.line; })[0] : null;
    if (cur) box.append(make("p", "This story is filed under " + cur.name + ". Open the Families & places tab to see its marks.", "ms-dim"));
    if (!g) box.append(make("p", "Name where they started and the Atlas can plan the registers for it.", "ms-dim"));
  }

  var lastStopItems = [];
  function drawReport(c) {
    var s = c.story, my = ++token, text = ST.textOf(s, true);
    $("ms-lede").textContent = "";
    if (!text.trim()) { $("ms-out").hidden = true; drawFamily(c, null); return; }
    /* the Atlas files are fetched on first use, which takes a few seconds: say so, so it does not look stuck */
    var READING = "Reading your story\u2026 the Atlas is looking up each place and name.";
    var was = $("ms-status").textContent; say(READING);
    var unsay = function () { if ($("ms-status").textContent === READING) say(was === READING ? "" : was); };
    ensure().then(function () {
      if (my !== token) return;
      var p = parse(text, ST.holdsOf(s), s.born), also = alsoMentioned(s, p);
      var ab = $("ms-also"); ab.textContent = ""; ab.hidden = !also.length;
      if (also.length) {
        ab.append(make("b", "Also mentioned in what you added: "));
        also.forEach(function (x, i) { var a = make("a", x.name); a.href = BASE + "place/" + encodeURIComponent(x.id) + "/"; a.title = "From " + x.from; ab.append(i ? document.createTextNode(", ") : document.createTextNode(""), a); });
        ab.append(make("span", " These are not on the journey. Tick \u201cUse its places to draw the journey\u201d on a log entry to add its places to the route.", "ms-dim"));
      }
      var did = $("ms-did"); did.textContent = ""; did.hidden = !(p.suggest && p.suggest.length);
      (p.suggest || []).forEach(function (x) {
        did.append(make("span", "\u201c" + x.typed + "\u201d was not used" + (x.kind === "partial" ? " (it is part of several place names)" : " (it is not a place the Atlas knows)") + ". Did you mean " + x.options.map(function (o) { return o.n + (o.cn ? ", " + o.cn : ""); }).join(" or ") + "? Correct it in the piece to use it. "));
      });
      if (!p.from) {
        $("ms-out").hidden = true; lastG = null;
        $("ms-lede").textContent = "The Atlas cannot see where they started yet. Add a piece that names the place, and the journey, the registers to search and the names to try appear here.";
        $("ms-out").hidden = false; $("ms-journey").hidden = true; $("ms-rest").hidden = true; drawFamily(c, null); syncNav(); unsay(); return;
      }
      return LD.gather(p).then(function (g) {
        if (my !== token) return;
        lastG = g; var f = g.facts;
        /* a story started without a name takes the person's, once the Atlas has read one */
        if (s.name === "Untitled story" && f.name) { ST.rename(s.id, f.name + "'s story"); $("ms-name").textContent = f.name + "'s story"; $("ms-add-to").textContent = f.name + "'s story"; drawPicker(current()); }
        $("ms-out").hidden = false; $("ms-journey").hidden = false; $("ms-rest").hidden = false;
        var bits = (f.route || []).filter(function (x) { return x.info; }).map(function (x, i) { return (i === 0 ? (x.role === "born" ? "born in " : "from ") : i === f.route.length - 1 ? "arriving in " : "then ") + x.info.name; });
        $("ms-lede").textContent = (f.name ? f.name + ": " : "") + (bits.length ? bits.join(", ") + "." : "") + "  Read from " + s.pieces.length + (s.pieces.length === 1 ? " piece." : " pieces, added over time.");
        var sb = J.stops(f, g.mort); lastStopItems = sb.items;
        var stops = $("ms-stops"); stops.textContent = ""; stops.append(sb);
        J.draw(f, g.mort);
        var lb = E.lifeBlock(g.life, g.mort), lbox = $("ms-life"); lbox.textContent = ""; if (lb) lbox.append(lb); $("ms-life-sec").hidden = !lb;
        var nb = E.namesBlock(g.names, BASE), nbox = $("ms-names"); nbox.textContent = ""; if (nb) nbox.append(nb); $("ms-names-sec").hidden = !nb;
        var tr = E.treeBlock(g.people, f.rel), tbox = $("ms-tree"); tbox.textContent = ""; if (tr) tbox.append(tr); $("ms-tree-sec").hidden = !tr;
        var plan = $("ms-plan"); plan.textContent = "";
        g.plan.forEach(function (st) {
          var d = make("details", null, "ms-step"); d.open = true;
          var sm = make("summary"); sm.append(make("span", String(st.n), "ms-num"), make("span", st.title)); d.append(sm, make("p", st.why, "ms-why"));
          var ul = make("ul"); st.items.forEach(function (it) { var li = make("li"); if (it.href) { var a = make("a", it.text); a.href = it.href; li.append(a); } else li.textContent = it.text; ul.append(li); }); d.append(ul);
          (st.links || []).forEach(function (l) { var pp = make("p"), a = make("a", l.text + " →"); a.href = l.href; pp.append(a); d.append(pp); });
          if (st.ask) { var q = make("p", null, "ms-ask"); q.append(make("b", "Ask: "), st.ask); d.append(q); }
          if (st.not) { var n = make("p", null, "ms-not"); n.append(make("b", "Do not conclude: "), st.not); d.append(n); }
          plan.append(d);
        });
        drawFamily(c, g); syncNav(); unsay();
      });
    }).catch(function () { say("The Atlas files did not load. Check your connection and open this tab again.", true); });
  }

  /* places the pieces that do not draw the journey name, other than those the journey already has; years they give fill what the story lacks */
  function alsoMentioned(s, main) {
    var have = Object.create(null), out = [];
    (main.stops || []).forEach(function (st) { if (st.row) have[st.row.i] = 1; });
    s.pieces.forEach(function (pc, i) {
      if (!pc.text || ST.routeOn(pc)) return;
      var q = parse(pc.text, null, null);
      if (main.born == null && q.born != null) main.born = q.born;
      if (main.left == null && q.left != null) main.left = q.left;
      (q.stops || []).forEach(function (st) {
        if (!st.row || have[st.row.i]) return;
        /* a word that is also a given name in the same piece ("Ivan") or an ordinary noun ("Street", "Mill") is not offered as a place */
        if (notPlace(st, q)) return;
        have[st.row.i] = 1;
        out.push({ id: st.row.i, name: st.row.n, from: (KIND_NAME[pc.kind] || "an addition") + " " + (i + 1) });
      });
    });
    return out.slice(0, 12);
  }
  function notPlace(st, q) {
    var w = S.fold(String(st.row.n).replace(/\s*\(.*$/, ""));
    return GENERIC.test(w) || !!(q.given && S.fold(q.given) === w) || (q.people || []).some(function (x) { return x.given && S.fold(x.given) === w; });
  }
  var GENERIC = /^(street|mill|road|avenue|church|house|home|hospital|school|cemetery|park|square|hall|farm|factory|store|shop|bridge|market|station|court|lane|hill|river|lake|new|old|saint|san|santa)$/;
  var journeyReady = false;
  function makeJourney() {
    if (journeyReady) return;
    journeyReady = true;
    function getMap() {
      return S.loadLeaflet().then(function (L) {
        if (!getMap.map) { getMap.map = L.map($("ms-map"), { scrollWheelZoom: false }); L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, attribution: "Tiles © Esri" }).addTo(getMap.map); }
        return { L: L, map: getMap.map };
      });
    }
    J = E.createJourney({ els: { cap: $("ms-cap"), slider: $("ms-year"), yearOut: $("ms-yearout"), play: $("ms-play"), moments: $("ms-moments"), time: $("ms-time"), mapBox: $("ms-map") },
      getMap: getMap, askBox: $("ms-year-row"), onBorn: function (y) { var c = current(); if (c.story) { ST.setBorn(c.story.id, y); refresh(); } } });
  }

  function refresh(keepReport) {
    var c = current();
    drawPicker(c);
    if (!c.story) return;
    $("ms-name").textContent = c.story.name;
    drawComposer(c); drawLog(c);
    if (!active) return;
    if (keepReport === true) { drawFamily(c, lastG); return; }
    ensure().then(function () { makeJourney(); drawLog(c); drawReport(c); }).catch(function () { say("The Atlas files did not load. Check your connection and open this tab again.", true); });
  }

  /* ---- the start: the same help the map's drawer gives ------------------------------------------------------------------- */
  var firstFiles = [], firstTimer = null, firstParsed = null, EXAMPLE = "My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo.";
  function surnamesOf(p) {
    var keys = []; ((p && p.people) || []).forEach(function (pe) { if (pe.surname && keys.indexOf(pe.surname) < 0) keys.push(pe.surname); });
    if (p && p.surname && keys.indexOf(p.surname) < 0) keys.push(p.surname);
    return keys;
  }
  function placeLabel(r) { var c = data.countries[r.cc], n = r.n.replace(/\s*\(([^)]*)\)/, function (m, x) { return S.fold(x) === S.fold(r.n.replace(/\s*\([^)]*\)/, "")) ? "" : m; }); return n + (c && S.fold(c) !== S.fold(n) ? ", " + c : ""); }
  /* what the Atlas understood, as chips, as the reader types */
  function drawFirstChips(p) {
    var box = $("ms-first-chips"); box.textContent = ""; if (!p) return;
    function chip(t, cls) { box.append(make("span", t, "ms-chip" + (cls ? " " + cls : ""))); }
    if (p.teller) chip("you: " + p.teller);
    if (p.rel) chip(p.rel.replace(/-/g, " "));
    if (p.name) chip(p.name);
    if (p.occupations && p.occupations.length) chip("work: " + p.occupations.join(", "));
    if (p.life && p.life.died) chip("died" + (p.life.died.cause ? (/^(?:murdered|drowned|killed|executed|hanged|shot|perished|taking|succumbed)/.test(p.life.died.cause) ? " " + p.life.died.cause : " of " + p.life.died.cause.replace(/^(?:of|from) /, "")) : "") + (p.life.died.year != null ? ", " + p.life.died.year : ""));
    if (p.life && p.life.married > 1) chip("married " + (p.life.married === 2 ? "twice" : p.life.married + " times"));
    if (p.life && p.life.groups.length) chip("heard " + p.life.groups.reduce(function (a, g) { return a + g.items.length; }, 0) + " things about them, kept as told");
    (p.people || []).forEach(function (pe) { if (pe.role !== "self" && pe.name && pe.name !== p.name) chip((pe.label || pe.role) + " " + pe.name); });
    var stops = (p.stops && p.stops.length ? p.stops : [p.from && Object.assign({ role: "origin" }, p.from), p.to && Object.assign({ role: "move" }, p.to)].filter(Boolean)).filter(function (st) { return st.row && !notPlace(st, p); });
    var ambiguous = false;
    stops.forEach(function (st) {
      var pre = st.role === "born" ? "born in " : st.role === "origin" ? "from " : st.role === "father-from" ? "his father from " : st.role === "mother-from" ? "his mother from " : st.age != null ? (st.approx ? "about age " : "age ") + st.age + ": " : st.role === "lived" ? "in " : "to ";
      if (st.alts && st.alts.length) ambiguous = true;
      var cls = st.role === "born" || st.role === "origin" ? "ms-chip-from" : "ms-chip-to";
      if (st.alts && st.alts.length) {
        /* another place has the name: the chip offers the next one by writing its country after the word, so the words say which place is meant */
        var alt = st.alts[0], b = make("button", pre + placeLabel(st.row) + (st.yearTold ? ", " + st.year : "") + "  \u25be", "ms-chip " + cls); b.type = "button"; b.title = "Or " + placeLabel(alt) + ": press to use that one";
        b.addEventListener("click", function () {
          var ta = $("ms-first-text"), w = st.word, i = ta.value.toLowerCase().indexOf(String(w).toLowerCase());
          if (i < 0) return;
          ta.value = ta.value.slice(0, i + w.length) + ", " + (data.countries[alt.cc] || alt.cc) + ta.value.slice(i + w.length).replace(/^,\s*[^,.;]*(?=[.,;]|$)/, "");
          runFirst();
        });
        box.append(b);
      } else chip(pre + placeLabel(st.row) + (st.yearTold ? ", " + st.year : ""), cls);
    });
    if (p.born) chip("born about " + p.born);
    if (p.left && !stops.some(function (st) { return st.yearTold; })) chip("about " + p.left);
    if (!stops.length && $("ms-first-text").value.trim().length > 12) chip("Where did they start? Name the place", "ms-chip-warn");
    if (firstFiles.length) chip(firstFiles.length + (firstFiles.length === 1 ? " picture" : " pictures") + ", kept here", "ms-chip-warn");
    if (ambiguous) box.append(make("p", "More than one place has a name you wrote. Press the chip with an arrow to use the next one, or write the country after the name.", "ms-dim"));
  }
  function runFirst() {
    var t = $("ms-first-text").value; $("ms-first-clear").hidden = !t.trim() && !firstFiles.length;
    if (!t.trim() && !firstFiles.length) { firstParsed = null; drawFirstChips(null); return; }
    ensure().then(function () { firstParsed = parse(t, firstFiles.length ? "photo" : null, null); drawFirstChips(firstParsed); }).catch(function () { say("The Atlas files did not load. Check your connection.", true); });
  }
  function drawFirstShots() {
    var ul = $("ms-first-shots"); ul.textContent = "";
    firstFiles.forEach(function (x, i) {
      var li = make("li", null, "ms-shot"), im = make("img"), rm = make("button", "×"); im.src = x.url; im.alt = "Picture " + (i + 1) + " you added";
      rm.type = "button"; rm.setAttribute("aria-label", "Remove picture " + (i + 1)); rm.addEventListener("click", function () { URL.revokeObjectURL(x.url); firstFiles.splice(i, 1); drawFirstShots(); runFirst(); });
      li.append(im, rm); ul.append(li);
    });
    ul.hidden = !firstFiles.length;
    $("ms-first-read").hidden = !firstFiles.length || firstFiles.every(function (x) { return x.r; });
  }
  function addFirstFiles(list) {
    var ok = [].slice.call(list || []).filter(function (f) { return /^image\/(jpeg|png|webp)$/.test(f.type); }).slice(0, 4 - firstFiles.length);
    if (!ok.length) return false;
    ok.forEach(function (f) { firstFiles.push({ f: f, url: URL.createObjectURL(f) }); });
    drawFirstShots(); runFirst(); return true;
  }
  /* both readers: load the two scripts, read each picture as a document (sent to Claude only on the press), and hand back what it says about the story's surnames */
  function readWith(items, keys, say2) {
    return Promise.all([window.raStoryPics ? null : loadScript("story-pics.js"), window.raStoryRead && window.raStoryRead.read ? null : loadScript("story-read.js")]).then(function () { return window.raStoryRead.read(items, keys, say2); });
  }
  function readFirst() {
    var btn = $("ms-first-readbtn"), ta = $("ms-first-text"); if (!firstFiles.length) return;
    btn.disabled = true;
    readWith(firstFiles, surnamesOf(firstParsed), function (m) { say(m); }).then(function (res) {
      var R = window.raStoryRead, base = R.stripBlocks(ta.value), blocks = [];
      firstFiles.forEach(function (x, i) { if (x.r) blocks.push(R.block(i + 1, x.f.name || "picture", x.r)); });
      ta.value = (base + (blocks.length ? "\n\n" + blocks.join("\n\n") : "")).slice(0, 6000);
      var nf = firstFiles.filter(function (x) { return x.r && !x.r.found; }).length;
      say(res.failed ? "Read " + res.got + " of " + firstFiles.length + ", then it stopped: " + (res.failed.message || "something went wrong.") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : "")
        : "Read " + res.got + " picture" + (res.got === 1 ? "" : "s") + ". What they say is now in your story, where you can edit it." + (nf ? " " + nf + " had nobody with a matching surname on it." : "") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : ""), !!res.failed);
      drawFirstShots(); runFirst();
    }).catch(function (e) { say((e && e.message) || "The pictures could not be read.", true); }).then(function () { btn.disabled = false; });
  }
  /* a picture is kept in this browser under its piece (the drawer's Save does the same); items are {f, r?, shot?} */
  function keepPicture(sid, pid, x) {
    return (window.raStoryPics ? Promise.resolve() : loadScript("story-pics.js")).then(function () { return x.shot || window.raStoryPics.shrink(x.f); })
      .then(function (shot) { return window.raStoryPics.put(sid + "/" + pid, shot.blob); }).then(null, function () { /* not kept: the words are */ });
  }
  function keepPictures(id, items) {
    return Promise.all(items.map(function (x) {
      var label = (x.r && x.r.label ? x.r.label + " (" + String(x.f.name || "").replace(/\.[a-z0-9]+$/i, "") + ")" : String(x.f.name || "Photo").replace(/\.[a-z0-9]+$/i, "")).slice(0, 80);
      var pid = ST.addPiece(id, { kind: x.r ? "document" : "photo", label: label, text: "" });
      return pid ? keepPicture(id, pid, x) : null;
    }));
  }
  function syncNav() {
    [].forEach.call(document.querySelectorAll("#ms-nav [data-go]"), function (b) {
      var t = $(b.getAttribute("data-go")); b.hidden = !t || t.hidden || !(t.getClientRects && t.getClientRects().length);
    });
  }

  /* ---- adding ----------------------------------------------------------------------------------------------------------- */
  function resetComposer() {
    $("ms-text").value = ""; $("ms-label").value = ""; photo = null; $("ms-photo-prev").textContent = ""; $("ms-photo-prev").hidden = true; $("ms-photo-read").hidden = true;
  }
  function add() {
    var c = current(), s = c.story; if (!s) return;
    var text = $("ms-text").value.trim(), label = $("ms-label").value.trim();
    if (kind === "photo") {
      if (!photo && !text) { say("Choose the photo and type what it shows, or type a caption.", true); return; }
      if (!label && photo) label = photo.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80);
    } else if (!text) { say("Type or paste something to add.", true); return; }
    var parts = text ? chunks(text) : [""];
    if (s.pieces.length + parts.length > 60) { say("A story holds up to 60 pieces. Start another story, or remove one first.", true); return; }
    var ok = true, keep = (kind === "photo" && photo && photo.f) ? { f: photo.f, shot: photo.item && photo.item.shot } : null;
    parts.forEach(function (t, i) {
      var l = label + (parts.length > 1 ? (label ? " " : "") + "(part " + (i + 1) + " of " + parts.length + ")" : "");
      var pid = ST.addPiece(s.id, { kind: kind, label: l, text: t });
      if (!pid) ok = false; else if (i === 0 && keep) keepPicture(s.id, pid, keep).then(function () { refresh(); });
    });
    if (!ok) { say("This browser would not keep that. Storage may be full or blocked.", true); return; }
    resetComposer();
    say("Added" + (parts.length > 1 ? " in " + parts.length + " pieces" : "") + ". The Atlas has read the story again from the start.");
    refresh();
    var lg = $("ms-log-h"); if (lg) lg.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }
  function newStory(name, text, items) {
    var id = ST.create({ name: name, text: text });
    if (!id) { say("This browser would not keep the story. Storage may be full or blocked.", true); return; }
    lsSet(CUR, id); kind = "story"; say("Story started. Add the next piece whenever you find it.");
    if (firstParsed && firstParsed.born != null) ST.setBorn(id, firstParsed.born);
    if (items && items.length) keepPictures(id, items).then(function () { refresh(); });
    refresh();
    return id;
  }

  function wire() {
    $("ms-pick").addEventListener("change", function () { lsSet(CUR, $("ms-pick").value); editing = null; confirmDel = null; photo = null; refresh(); });
    $("ms-new").addEventListener("click", function () { lsSet(CUR, ""); $("ms-bar").hidden = true; $("ms-view").hidden = true; $("ms-first").hidden = false; $("ms-first-name").focus(); });
    $("ms-first-go").addEventListener("click", function () {
      var t = $("ms-first-text").value.trim(); if (!t) { say("Tell the first part of the story, even a sentence.", true); return; }
      var items = firstFiles.slice(); firstFiles = [];
      newStory($("ms-first-name").value.trim(), t.slice(0, 5800), items);
      $("ms-first-text").value = ""; $("ms-first-name").value = ""; $("ms-first-chips").textContent = ""; firstParsed = null; drawFirstShots(); $("ms-first-clear").hidden = true;
    });
    $("ms-rename").addEventListener("click", function () {
      var c = current(); if (!c.story) return;
      var inp = $("ms-rename-in"); inp.value = c.story.name; $("ms-rename-row").hidden = false; inp.focus(); inp.select();
    });
    $("ms-rename-ok").addEventListener("click", function () { var c = current(); if (c.story) ST.rename(c.story.id, $("ms-rename-in").value); $("ms-rename-row").hidden = true; refresh(true); drawPicker(current()); $("ms-name").textContent = current().story.name; });
    $("ms-rename-no").addEventListener("click", function () { $("ms-rename-row").hidden = true; });
    $("ms-rename-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("ms-rename-ok").click(); } else if (e.key === "Escape") $("ms-rename-no").click(); });
    var delAsk = false;
    $("ms-del").addEventListener("click", function () {
      var c = current(); if (!c.story) return;
      if (!delAsk) { delAsk = true; $("ms-del").textContent = "Delete “" + c.story.name.slice(0, 30) + "” for good?"; $("ms-del").classList.add("ms-danger"); setTimeout(function () { delAsk = false; $("ms-del").textContent = "Delete story"; $("ms-del").classList.remove("ms-danger"); }, 5000); return; }
      delAsk = false; $("ms-del").textContent = "Delete story"; $("ms-del").classList.remove("ms-danger");
      ST.remove(c.story.id); if (window.raStoryPics) window.raStoryPics.delStory(c.story.id).catch(function () {}); lsSet(CUR, ""); say("Deleted."); if (J) J.clear(); refresh();
    });
    [].forEach.call(root.querySelectorAll(".ms-kind"), function (b) { b.addEventListener("click", function () { kind = b.getAttribute("data-kind"); drawComposer(current()); $("ms-text").focus(); }); });
    $("ms-add").addEventListener("click", add);
    $("ms-photo-read").addEventListener("click", function () {
      var c = current(); if (!photo || !photo.f || !c.story) return;
      var btn = $("ms-photo-read"), ta = $("ms-text"), item = photo.item || (photo.item = { f: photo.f }); btn.disabled = true;
      ensure().then(function () { return readWith([item], surnamesOf(parse(ST.textOf(c.story, true), ST.holdsOf(c.story), c.story.born)), function (m) { say(m); }); }).then(function (res) {
        var R = window.raStoryRead; if (item.r) { ta.value = (R.stripBlocks(ta.value) + "\n\n" + R.block(1, photo.name, item.r)).trim().slice(0, 6000); if (item.r.label && !$("ms-label").value) $("ms-label").value = item.r.label.slice(0, 80); }
        say(res.failed ? (res.failed.message || "The picture could not be read.") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : "") : "Read. What it says is in the box below, where you can edit it; then press Add." + (item.r && !item.r.found ? " Nobody on it had a surname matching the story." : "") + (typeof res.left === "number" ? " Reads left today: " + res.left + "." : ""), !!res.failed);
      }).catch(function (e) { say((e && e.message) || "The picture could not be read.", true); }).then(function () { btn.disabled = false; });
    });
    /* a photo: chosen, dropped or pasted. Shown here for this visit only; the caption is what is kept. */
    function takePhoto(files) {
      var f = [].slice.call(files || []).filter(function (x) { return /^image\/(jpeg|png|webp|gif)$/.test(x.type); })[0]; if (!f) return false;
      if (photo && photo.url) URL.revokeObjectURL(photo.url);
      photo = { name: f.name || "Photo", url: URL.createObjectURL(f), f: f };
      kind = "photo"; drawComposer(current());
      var prev = $("ms-photo-prev"); prev.textContent = ""; var im = make("img"); im.src = photo.url; im.alt = "The photo you are adding"; prev.append(im, make("span", "Nothing leaves this browser unless you press Read it with Claude. The picture is kept here only, beside what you add.", "ms-dim")); prev.hidden = false;
      $("ms-photo-read").hidden = false;
      return true;
    }
    $("ms-file").addEventListener("change", function () { takePhoto($("ms-file").files); $("ms-file").value = ""; });
    var comp = $("ms-comp");
    ["dragenter", "dragover"].forEach(function (t) { comp.addEventListener(t, function (e) { if (e.dataTransfer && [].some.call(e.dataTransfer.types || [], function (x) { return x === "Files"; })) { e.preventDefault(); comp.classList.add("ms-hot"); } }); });
    ["dragleave", "drop"].forEach(function (t) { comp.addEventListener(t, function () { comp.classList.remove("ms-hot"); }); });
    comp.addEventListener("drop", function (e) { if (takePhoto(e.dataTransfer && e.dataTransfer.files)) e.preventDefault(); });
    $("ms-text").addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length && takePhoto(fs)) e.preventDefault(); });
    window.addEventListener("beforeunload", function () { if (photo && photo.url) URL.revokeObjectURL(photo.url); });
    /* another tab, or the six-word sync, changed the stories */
    window.addEventListener("storage", function (e) { if (e.key === ST.KEY && !root.hidden) refresh(); });
  }

  function wireFirst() {
    var ta = $("ms-first-text"), drop = $("ms-first-drop");
    ta.addEventListener("input", function () { clearTimeout(firstTimer); firstTimer = setTimeout(runFirst, 650); });
    $("ms-first-eg").addEventListener("click", function () { ta.value = EXAMPLE; runFirst(); });
    $("ms-first-clear").addEventListener("click", function () { firstFiles.forEach(function (x) { URL.revokeObjectURL(x.url); }); firstFiles = []; ta.value = ""; drawFirstShots(); runFirst(); ta.focus(); });
    $("ms-first-file").addEventListener("change", function () { addFirstFiles($("ms-first-file").files); $("ms-first-file").value = ""; });
    $("ms-first-readbtn").addEventListener("click", readFirst);
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("ms-hot"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove("ms-hot"); }); });
    drop.addEventListener("drop", function (e) { e.preventDefault(); addFirstFiles(e.dataTransfer && e.dataTransfer.files); });
    ta.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length && addFirstFiles(fs)) e.preventDefault(); });
    window.addEventListener("beforeunload", function () { firstFiles.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
    /* the row of buttons at the top of the report jumps to its sections */
    [].forEach.call(document.querySelectorAll("#ms-nav [data-go]"), function (b) {
      b.addEventListener("click", function () { var t = $(b.getAttribute("data-go")); if (t) t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); });
    });
  }
  wire(); wireFirst();
  window.raStoryTab = { show: function () { active = true; refresh(); }, newStory: newStory, current: current };
  /* a story saved from the home page names itself in the address: #story/<id> */
  var m = /^#story(?:\/([a-z0-9]+))?$/.exec(location.hash || "");
  if (m && m[1] && ST.get(m[1])) lsSet(CUR, m[1]);
  refresh();
})();
