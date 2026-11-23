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

  function loadScript(src) { return new Promise(function (ok, fail) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = ok; s.onerror = function () { fail(new Error(src)); }; document.head.appendChild(s); }); }
  function tellable(p) { return !!(p && (p.from || (p.kin && p.kin.length) || (p.people || []).some(function (x) { return x.sought; }))); }
  function say(m, bad) { status.textContent = m || ""; status.className = "sp-status" + (bad ? " bad" : ""); }

  /* ---- the sections and the rail --------------------------------------------------------------------------------------------- */
  var rail = $("sp-rail");
  function secShow(id, on) {
    var sec = $(id), a = rail.querySelector('[data-go="' + id + '"]');
    if (sec) sec.hidden = !on; if (a) a.hidden = !on;
  }
  function goTo(id) { var t = $(id); if (t) t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
  rail.addEventListener("click", function (e) {
    var a = e.target.closest("a[data-go]"); if (!a) return;
    e.preventDefault(); goTo(a.getAttribute("data-go"));
    try { history.replaceState(null, "", "#story"); } catch (x) { /* the hash stays */ }
  });
  /* each place of the story gets its own line under "Place by place", so the rail reads like the route */
  function placesRail() {
    [].forEach.call(rail.querySelectorAll("a.sub"), function (x) { x.remove(); });
    var anchor = rail.querySelector('[data-go="sp-places"]'), prev = anchor, secs = $("sp-stops").querySelectorAll(".lf-stop");
    if (!anchor) return;
    [].forEach.call(secs, function (sec, i) {
      sec.id = "sp-stop-" + (i + 1);
      var h = sec.querySelector("h3"), a = document.createElement("a");
      a.className = "sub"; a.href = "#" + sec.id; a.setAttribute("data-go", sec.id); a.textContent = h ? h.textContent : "Place " + (i + 1);
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
    if (!stopsShown.length && !tellable(p) && text.value.trim().length > 12) chips.append(chip("Where did they start? Name the place", "warn", "nof"));
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
  function setBorn(y) {
    if (!parsed) return;
    parsed.born = y; (parsed.route || []).forEach(function (st) { if (st.age != null) st.year = y + st.age; });
    say("Reading the Atlas…");
    LD.gather(parsed).then(function (g) { say(""); last = g; drawAll(g); }).catch(function () { say("Some Atlas files did not load. Check your connection.", true); });
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
    var tr = E.treeBlock(g.people, f.rel, { onEdit: editBox, kin: f.kin }), ob = E.othersBlock(g.others), tbox = $("sp-tree"); tbox.textContent = ""; secShow("sp-family", !!(tr || ob)); if (tr) tbox.append(tr); if (ob) tbox.append(ob);
    secShow("sp-setting", true);
    secShow("sp-plan", true); drawSteps(g);
    secShow("sp-keep", true); drawKeep(g);
    J.draw(f, g.mort).then(function () { settingNote(g); }, function () { settingNote(g); });
    watch();
  }
  function clearReport() {
    J.clear(); last = null; lastPlan = null; rail.hidden = true; [].forEach.call(rail.querySelectorAll("a.sub"), function (x) { x.remove(); });
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

  /* ---- keep it: a research family, or just the words ------------------------------------------------------------------------ */
  function drawKeep(g) {
    var P0 = window.raProgress, selL = $("sp-fa-line"), nameIn = $("sp-fa-name"), btn = $("sp-fa-btn"), want = selL.value, out = $("sp-fa-out");
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
  /* keep the words: the story (and the names of any photos) go to My research, My story, where more can be added; the plan too when it was built */
  var saveOut = $("sp-save-out");
  function save(withPlan) {
    var t = text.value.trim();
    if (!t && !files.length) { saveOut.textContent = "Tell the story first, then save it."; return; }
    (window.raStories ? Promise.resolve() : loadScript("stories.js")).then(function () { return files.length && !window.raStoryPics ? loadScript("story-pics.js") : null; }).then(function () {
      var ST = window.raStories, f = last && last.facts;
      var id = ST.create({ name: f && f.name ? f.name + "'s story" : "", text: t.slice(0, 5800) });
      if (!id) { saveOut.textContent = "This browser would not keep it. Storage may be full or blocked."; return; }
      if (t.length > 5800) ST.addPiece(id, { kind: "story", label: "The family story (continued)", text: t.slice(5800, 11600) });
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
      Promise.all(keeps).then(function () {
        saveOut.textContent = "Saved" + (withPlan && lastPlan ? " with the plan" : "") + (kept ? " with " + kept + " picture" + (kept === 1 ? "" : "s") + ", kept in this browser only (the words travel with the story, the pictures do not)" : "") + (lost ? ". " + lost + " picture" + (lost === 1 ? " was" : "s were") + " not kept: this browser would not store them" : "") + ". ";
        var a = el("a", "Open it in My story to add more"); a.href = BASE + "my-research/#story/" + id; saveOut.append(a, document.createTextNode("."));
      });
      $("sp-save-btn").disabled = true; setTimeout(function () { $("sp-save-btn").disabled = false; }, 4000);
    }).catch(function () { saveOut.textContent = "Could not save here. Open My research and start the story there."; });
  }
  $("sp-save-btn").addEventListener("click", function () { save(false); });

  /* ---- reading the words ----------------------------------------------------------------------------------------------------- */
  function signature(p) {
    return JSON.stringify([(p.route || []).map(function (x) { return x.row.i + ":" + x.age; }), p.left, p.born, p.name, (p.people || []).map(function (x) { return x.role + x.name + (x.occupation || "") + JSON.stringify((x.events || []).map(function (e) { return [e.type, e.year, e.place]; })) + (x.place && x.place.word || ""); }), p.holds,
      p.life && p.life.groups.map(function (g) { return g.items; }), p.life && p.life.illness, p.life && p.life.died, (p.siblings || []).map(function (x) { return x.name; }), (p.kin || []).length]);
  }
  function run() {
    var t = text.value;
    $("sp-clear").hidden = !t.trim() && !files.length;
    if (t.trim().length > 12) say("Reading your story…");
    return LD.resolveMissing(t).catch(function () { return LD.load(); }).then(function (d) {
      data = d;
      var attached = files.length ? "photo" : null;
      var p = E.parseStory(t, { map: d.map, given: d.given, skip: d.skip, countries: d.countries }, attached);
      (p.stops || []).forEach(function (st) { var o2 = ov[st.word]; if (o2) { st.row = o2.row; st.alts = o2.alts; } });
      if (p.route && p.route.length) {
        var r0 = p.route[0], rl = p.route[p.route.length - 1];
        p.from = { row: r0.row, alts: r0.alts, word: r0.word }; p.to = p.route.length > 1 ? { row: rl.row, alts: rl.alts, word: rl.word } : null;
      }
      parsed = p; drawChips(p);
      var sig = signature(p);
      if (sig === lastSig || !tellable(p)) {
        if (status.textContent === "Reading your story…") say("");
        if (!tellable(p) && sig !== lastSig) { lastSig = ""; clearReport(); }
        return;
      }
      lastSig = sig;
      var my = ++token; say("Reading the Atlas…");
      return LD.gather(p).then(function (g) {
        if (my !== token) return;
        say(""); last = g; lastPlan = null; aiOut.hidden = true; aiOut.textContent = ""; aiBtn.textContent = "Build my research plan";
        drawAll(g);
      }).catch(function (e) { if (window.console) console.error("story draw", e); say("Some Atlas files did not load. Check your connection.", true); });
    }).catch(function (e) { if (window.console) console.error("story read", e); say("The Atlas files did not load. Check your connection.", true); });
  }
  var tm = null;
  function grow() { text.style.height = "auto"; text.style.height = Math.min(Math.max(text.scrollHeight, 110), 420) + "px"; }
  text.addEventListener("input", function () {
    grow(); try { sessionStorage.setItem(DRAFT, text.value); } catch (e) { /* a private window: the draft is just not kept */ }
    clearTimeout(tm); tm = setTimeout(run, 650);
  });
  $("sp-eg").addEventListener("click", function () { text.value = HINT; grow(); run(); });
  $("sp-clear").addEventListener("click", function () {
    files.forEach(function (x) { URL.revokeObjectURL(x.url); }); files = []; drawShots(); text.value = ""; grow(); chips.textContent = ""; $("sp-did").hidden = true;
    ov = Object.create(null); parsed = null; shown = Object.create(null); lastSig = ""; clearReport(); say("");
    try { sessionStorage.removeItem(DRAFT); } catch (e) { /* none */ }
    $("sp-clear").hidden = true; text.focus();
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
    btn.disabled = true;
    var keys = []; ((parsed && parsed.people) || []).forEach(function (pe) { if (pe.surname && keys.indexOf(pe.surname) < 0) keys.push(pe.surname); }); if (parsed && parsed.surname && keys.indexOf(parsed.surname) < 0) keys.push(parsed.surname);
    Promise.all([window.raStoryPics ? null : loadScript("story-pics.js"), window.raStoryRead && window.raStoryRead.read ? null : loadScript("story-read.js")]).then(function () {
      return window.raStoryRead.read(files, keys, function (m) { say(m); });
    }).then(function (res) {
      var R = window.raStoryRead, base = R.stripBlocks(text.value), blocks = [];
      files.forEach(function (x, i) { if (x.r) blocks.push(R.block(i + 1, x.f.name || "picture", x.r)); });
      text.value = (base + (blocks.length ? "\n\n" + blocks.join("\n\n") : "")).slice(0, 8000); grow();
      var nf = files.filter(function (x) { return x.r && !x.r.found; }).length;
      say(res.failed ? "Read " + res.got + " of " + files.length + ", then it stopped: " + (res.failed.message || "something went wrong.")
        : "Read " + res.got + " picture" + (res.got === 1 ? "" : "s") + ". What they say is now in your story above." + (nf ? " " + nf + " had nobody with a matching surname on it." : ""));
      drawShots(); lastSig = ""; run();
    }).catch(function (e) { say((e && e.message) || "The pictures could not be read.", true); }).then(function () { btn.disabled = false; });
  }
  $("sp-read").addEventListener("click", readPics);

  /* WHAT THE PAGE HAS UNDERSTOOD, offered to story-ai.js ("AI ready" and "Paste a forum post"), which needs the places the reader found in order to
     pick the Atlas records a draft reply may point at. Read only: nothing here changes the page. */
  window.raStoryPage = { graph: function () { return last; }, countries: function () { return data && data.countries; }, base: BASE };

  /* ---- starting: the words handed over from the home page, or a draft kept in this tab ---------------------------------------- */
  (function boot() {
    var h = null; try { h = JSON.parse(localStorage.getItem(HAND) || "null"); localStorage.removeItem(HAND); } catch (e) { h = null; }
    var draft = ""; try { draft = sessionStorage.getItem(DRAFT) || ""; } catch (e) { draft = ""; }
    if (h && h.text && Date.now() - (h.t || 0) < 600000) {
      text.value = String(h.text).slice(0, 8000);
      if (h.pics) say("You had " + h.pics + " picture" + (h.pics === 1 ? "" : "s") + " on the map page. Add " + (h.pics === 1 ? "it" : "them") + " here to read " + (h.pics === 1 ? "it" : "them") + ".");
    } else if (draft) text.value = draft;
    if (text.value.trim()) { grow(); $("sp-clear").hidden = false; run(); }
  })();
  window.addEventListener("beforeunload", function () { files.forEach(function (x) { URL.revokeObjectURL(x.url); }); });
})();
