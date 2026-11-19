/* ONE BOX: the search box on the map takes a place, a surname, or a whole story, and a photo or document. A place or a surname is searched as
   it always was. Words that read as a story ("my father is Ivan from Senj, he moved to …") are read AS YOU TYPE: after a short pause the story reader
   (story-drawer.js, window.raStoryBox) draws the people and places on the map, and what it understood forms as pills under the box, each
   one popping in as it is understood and each one tappable. No waiting and no "read this" step; Enter just does it at once. A chip says the
   map is showing a story, with a × that takes it, and the typing, away. The "+" in the box adds a photo or document to the same story.

   Nothing here reads the story itself: this file only decides what a typed line is, and carries it across. Classic script, no libraries. */
(function () {
  "use strict";
  var q = document.getElementById("ra-q"), find = q && q.parentNode;
  if (!q || !find) return;

  /* five words or more, and either a relation or a story verb or simply long: a place name or a surname is never that. */
  function looksLikeStory(v) {
    v = String(v || "").trim();
    var w = v.split(/\s+/).length;
    if (/^(my|our|his|her|their)\s/i.test(v)) return true;   /* nobody searches the map for "my …": it is a story from the first word */
    if (/\b(my|his|her|their|our)\s+(\w+\s+)?(father|mother|dad|mum|mom|grand\w+|uncle|aunt|brother|sister|husband|wife|family|ancestor|name)\b/i.test(v)) return true;
    if (w < 5) return false;
    if (w >= 6 && /\b(born|died|married|moved|emigrated|migrated|came|arrived|left|lived|settled)\b/i.test(v)) return true;
    return v.length >= 70;
  }

  var css = document.createElement("style");
  css.textContent =
    ".ra-q-add{position:absolute;right:34px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:none;color:var(--ink-3,#777);font-size:20px;line-height:1;cursor:pointer;display:grid;place-items:center}" +
    ".ra-q-add:hover,.ra-q-add:focus-visible{color:var(--accent,#1f5c6b);background:var(--accent-wash,rgba(31,92,107,.12));outline:none}" +
    ".ra-find #ra-q,.ra-bar #ra-q,.ra-bar-find #ra-q{padding-right:64px!important;text-overflow:ellipsis}" +
    /* the box: a Story badge and an accent edge say which of the three things the box is doing */
    ".ra-find.ra-story-on #ra-q{border-color:var(--accent,#1f5c6b)!important;box-shadow:0 0 0 3px var(--accent-wash,rgba(31,92,107,.14));padding-right:128px!important}" +
    ".ra-q-badge{position:absolute;right:64px;top:50%;transform:translateY(-50%);font:600 10.5px/1 var(--sans,system-ui,sans-serif);letter-spacing:.07em;text-transform:uppercase;color:var(--accent,#1f5c6b);background:var(--accent-wash,rgba(31,92,107,.12));border-radius:99px;padding:5px 9px;pointer-events:none}" +
    ".ra-q-badge[hidden]{display:none}" +
    /* the empty-box panel: three doors */
    "#ra-doors{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:41;background:var(--panel,#fff);border:1px solid var(--rule-strong,#bbb);border-radius:10px;box-shadow:0 10px 28px rgba(10,20,26,.22);padding:10px}" +
    "#ra-doors[hidden]{display:none}" +
    "#ra-doors .rd-h{font:600 10.5px/1 var(--sans,system-ui,sans-serif);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3,#777);margin:2px 4px 8px}" +
    "#ra-doors .rd-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}" +
    "#ra-doors .rd-d{all:unset;box-sizing:border-box;cursor:pointer;display:grid;gap:3px;align-content:start;border:1px solid var(--rule,#ccc);border-radius:8px;padding:10px 11px;background:var(--panel-2,transparent)}" +
    "#ra-doors .rd-d:hover,#ra-doors .rd-d:focus-visible{border-color:var(--accent,#1f5c6b);background:var(--accent-wash,rgba(31,92,107,.1))}" +
    "#ra-doors .rd-d b{font:600 13.5px/1.2 var(--sans,system-ui,sans-serif);color:var(--ink,#111)}" +
    "#ra-doors .rd-d span{font:400 12px/1.35 var(--sans,system-ui,sans-serif);color:var(--ink-3,#666)}" +
    "#ra-doors .rd-d em{font:italic 400 12.5px/1.3 var(--serif,Georgia,serif);color:var(--ink-2,#444)}" +
    "@media (max-width:640px){#ra-doors .rd-g{grid-template-columns:1fr}}" +
    /* the story card, instead of a pile of pills */
    "#ra-pills{display:block;margin:-2px 0 12px;border:1px solid var(--accent,#1f5c6b);border-radius:12px;background:var(--panel,#fff);overflow:hidden}" +
    "#ra-pills[hidden]{display:none}" +
    "#ra-pills .rs-top{display:flex;align-items:center;gap:10px;padding:9px 10px 9px 14px;cursor:pointer}" +
    "#ra-pills .rs-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--accent,#1f5c6b);box-shadow:0 0 0 4px var(--accent-wash,rgba(31,92,107,.14))}" +
    "#ra-pills .rs-sum{flex:1;min-width:0}" +
    "#ra-pills .rs-sum b{font:600 14.5px/1.25 var(--serif,Georgia,serif);color:var(--ink,#111)}" +
    "#ra-pills .rs-sum small{display:block;font:400 12px/1.3 var(--sans,system-ui,sans-serif);color:var(--ink-3,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#ra-pills .rs-ib{flex:none;font:inherit;font-size:12.5px;border:0;background:none;color:var(--ink-3,#666);padding:6px 9px;border-radius:99px;cursor:pointer}" +
    "#ra-pills .rs-ib:hover,#ra-pills .rs-ib:focus-visible{background:var(--accent-wash,rgba(31,92,107,.12));color:var(--accent,#1f5c6b);outline:none}" +
    "#ra-pills .rs-body{border-top:1px solid var(--rule,#ddd)}" +
    "#ra-pills .rs-body[hidden]{display:none}" +
    "#ra-pills .rs-words{margin:0;padding:10px 14px;font:italic 400 14.5px/1.5 var(--serif,Georgia,serif);color:var(--ink-2,#444);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;cursor:text}" +
    "#ra-pills .rs-words.open{-webkit-line-clamp:unset;display:block}" +
    "#ra-pills .rs-sec{display:grid;grid-template-columns:84px minmax(0,1fr);gap:8px;padding:9px 14px;border-top:1px solid var(--rule,#ddd)}" +
    "#ra-pills .rs-sec h4{margin:3px 0 0;font:600 10.5px/1 var(--sans,system-ui,sans-serif);letter-spacing:.07em;text-transform:uppercase;color:var(--ink-3,#777)}" +
    "#ra-pills .rs-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}" +
    "#ra-pills .ra-pill{font:inherit;font-size:13px;line-height:1.2;padding:4px 10px;border-radius:999px;border:1px solid var(--rule,#ccc);background:var(--panel,#fff);color:var(--ink-2,#444)}" +
    "#ra-pills button.ra-pill{cursor:pointer} #ra-pills button.ra-pill:hover{border-color:var(--accent,#1f5c6b);color:var(--accent,#1f5c6b)}" +
    "#ra-pills .ra-pill.from{border-color:var(--brick,#b3452e);color:var(--brick,#b3452e)} #ra-pills .ra-pill.warn{border-style:dashed}" +
    "#ra-pills .rs-arrow{color:var(--ink-3,#888)}" +
    "#ra-pills .rs-note{font:400 12px/1.4 var(--sans,system-ui,sans-serif);color:var(--ink-3,#666);margin:0;padding:8px 14px 10px;border-top:1px solid var(--rule,#ddd)}" +
    "#ra-pills .rs-act{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--rule,#ddd);background:var(--panel-2,rgba(127,127,127,.06))}" +
    "#ra-pills .rs-act .sp{flex:1}" +
    "#ra-pills .rs-b{font:inherit;font-size:13px;border:1px solid var(--rule,#ccc);background:var(--panel,#fff);color:var(--ink,#111);border-radius:8px;padding:7px 12px;cursor:pointer}" +
    "#ra-pills .rs-b:hover,#ra-pills .rs-b:focus-visible{border-color:var(--accent,#1f5c6b);outline:none}" +
    "#ra-pills .rs-b.p{background:var(--accent,#1f5c6b);border-color:var(--accent,#1f5c6b);color:#fff;font-weight:600}" +
    "#ra-pills .rs-b.g{border-color:transparent;background:none;color:var(--ink-3,#666)}" +
    "#ra-pills .rs-read{height:3px;margin:0;background:linear-gradient(90deg,transparent,var(--accent,#1f5c6b),transparent);background-size:40% 100%;background-repeat:no-repeat;animation:ra-rs-slide 1.1s linear infinite}" +
    "@keyframes ra-rs-slide{from{background-position:-40% 0}to{background-position:140% 0}}" +
    "@keyframes ra-pill-in{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}" +
    "#ra-pills .ra-pill.pop{animation:ra-pill-in .3s ease-out both;animation-delay:var(--d,0ms)}" +
    "@media (max-width:560px){#ra-pills .rs-sec{grid-template-columns:1fr;gap:4px}}" +
    "@media (prefers-reduced-motion:reduce){#ra-pills .ra-pill.pop,#ra-pills .rs-read{animation:none}}";
  document.head.appendChild(css);

  /* the "+" for a photo or a document */
  var add = document.createElement("button"); add.type = "button"; add.className = "ra-q-add"; add.textContent = "+";
  add.setAttribute("aria-label", "Add a photo or document to a story"); add.title = "Add a photo or document to a story";
  var file = document.createElement("input"); file.type = "file"; file.accept = "image/jpeg,image/png,image/webp"; file.multiple = true; file.hidden = true;
  find.append(add, file);
  var badge = document.createElement("span"); badge.className = "ra-q-badge"; badge.textContent = "Story"; badge.hidden = true; find.append(badge);
  add.addEventListener("click", function () { file.click(); });
  file.addEventListener("change", function () { if (file.files && file.files.length) addFiles(file.files); file.value = ""; });
  function addFiles(fl) { if (window.raStoryBox) window.raStoryBox.addFiles(fl).then(show).catch(function () {}); }
  find.addEventListener("dragover", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], "Files") > -1) e.preventDefault(); });
  find.addEventListener("drop", function (e) { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  q.addEventListener("paste", function (e) { var fs = e.clipboardData && e.clipboardData.files; if (fs && fs.length) { e.preventDefault(); addFiles(fs); } });

  /* typing: a story is taken out of the place search and read live; a place or a name goes on exactly as before */
  var fromBox = false, tmr = null, thinking = false, lastRead = 0, storyMode = false;
  /* The place search runs on its own timers for whatever was typed before this turned into a story ("my n", "my na"). Empty the box for one
     beat so the map's own search clears itself, stop its pending timers, and put the story back. */
  function resetSearch() {
    var v = q.value; q.value = "";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    clearTimeout(q._t); clearTimeout(q._tf); clearTimeout(q._r);
    q.value = v;
  }
  function read() {
    clearTimeout(tmr); lastRead = Date.now(); var t = q.value.trim(); if (!t || !window.raStoryBox || !looksLikeStory(t)) return;
    fromBox = true;
    window.raStoryBox.start(t).then(function () { thinking = false; show(); }).catch(function () { thinking = false; show(); });
  }
  q.addEventListener("input", function (e) {
    if (looksLikeStory(q.value)) {
      e.stopImmediatePropagation();
      if (!storyMode) { storyMode = true; resetSearch(); }
      if (compact) compact = false;   /* typing opens the card again */
      doorsSync();
      clearTimeout(q._t); clearTimeout(q._tf); clearTimeout(q._r);
      var sug = document.getElementById("ra-sug"); if (sug) { sug.hidden = true; sug.innerHTML = ""; }
      var rc = document.getElementById("ra-recent"); if (rc) rc.hidden = true;
      if (pills.hidden || !pills.children.length) { thinking = true; mirror(); }   /* "Reading…" at once, before the reader has answered */
      /* a pause of a third of a second reads it; and while the typing keeps going it is read at least every 0.8s, so pills form as you type */
      clearTimeout(tmr); var now = Date.now(); if (!lastRead) lastRead = now;
      tmr = setTimeout(read, now - lastRead > 800 ? 0 : 300);
    } else if (storyMode) {                                                       /* the typing stopped reading as a story: take the story off */
      storyMode = false; fromBox = false; clearTimeout(tmr); thinking = false; lastRead = 0;
      if (window.raStoryBox) window.raStoryBox.clear().then(function () { mirror(); });
    }
  }, true);
  q.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && looksLikeStory(q.value)) { e.preventDefault(); e.stopImmediatePropagation(); compact = false; read(); q.blur(); }
    else if (e.key === "Escape" && storyMode) { e.stopImmediatePropagation(); compact = true; userToggled = true; mirror(); q.blur(); }   /* Esc steps back: the card folds, the typing and the story stay */
  }, true);

  /* the pills: what the reader understood, under the box, mirrored from the panel's own pills so each one still works */
  var pills = document.createElement("div"); pills.id = "ra-pills"; pills.hidden = true; pills.setAttribute("aria-label", "What the story says");
  var barRow = find.closest(".ra-bar-row") || find.parentNode;
  barRow.parentNode.insertBefore(pills, barRow.nextSibling);
  var src = null, mo = null, seenPills = Object.create(null);
  /* The card shows what the reader understood in sections (who, journey, also, work, heard) instead of one wrapped row of pills. Every chip is
     still the panel's own chip: pressing it presses that one, so it still opens the same place picker or the same "heard" list. */
  var compact = false, userToggled = false, wordsOpen = false, blurT = 0;
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function chipOf(c, i) {
    var isBtn = c.tagName === "BUTTON", p = mk(isBtn ? "button" : "span", "ra-pill" + (/\bfrom\b/.test(c.className) ? " from" : "") + (/\bwarn\b/.test(c.className) ? " warn" : ""), c.textContent);
    if (!seenPills[c.textContent]) { seenPills[c.textContent] = 1; p.classList.add("pop"); p.style.setProperty("--d", (Math.min(i, 8) * 40) + "ms"); }
    if (isBtn) { p.type = "button"; p.addEventListener("click", function () { var o = src.children[i]; if (o) o.click(); }); }
    return p;
  }
  function section(title, nodes) {
    if (!nodes.length) return null;
    var sec = mk("div", "rs-sec"), row = mk("div", "rs-row"); sec.append(mk("h4", null, title)); nodes.forEach(function (n) { row.append(n); }); sec.append(row); return sec;
  }
  function mirror() {
    if (!src && !thinking) return;
    var st = src && window.raStoryBox && window.raStoryBox.state ? window.raStoryBox.state() : { has: false };
    pills.textContent = "";
    doorsSync();
    find.classList.toggle("ra-story-on", !!(st.has || st.files > 0 || thinking)); badge.hidden = !(st.has || st.files > 0 || thinking);
    if (!st.has && !(st.files > 0)) {
      seenPills = Object.create(null);
      if (thinking) {
        var tk = mk("div", "rs-top"); tk.append(mk("span", "rs-dot"), (function () { var d = mk("div", "rs-sum"); d.append(mk("b", null, "Reading what you wrote…")); return d; })());
        pills.append(tk, mk("div", "rs-read")); pills.hidden = false;
      } else pills.hidden = true;
      return;
    }
    var who = [], trip = [], also = [], work = [], heard = [], check = [], any = false;
    [].forEach.call(src.children, function (c, i) {
      var tx = c.textContent;
      if (/^Where did they start/.test(tx)) return;   /* a nudge for the panel, noise while typing */
      var ch = chipOf(c, i); if (c.tagName === "BUTTON") any = true;
      if (/\bfrom\b/.test(c.className) || /^from /i.test(tx)) { ch.classList.add("from"); trip.unshift(ch); }
      else if (/^to /i.test(tx)) trip.push(ch);
      else if (/^in /i.test(tx)) also.push(ch);
      else if (/^work:/i.test(tx)) { ch.textContent = tx.replace(/^work:\s*/i, ""); work.push(ch); }
      else if (/^heard /i.test(tx)) heard.push(ch);
      else if (/\bwarn\b/.test(c.className)) check.push(ch);
      else who.push(ch);
    });
    var name = st.name || "", places = trip.length + also.length;
    var summary = [trip.length ? trip.map(function (x) { return x.textContent.replace(/^(?:from|to)\s+/i, "").replace(/,.*$/, ""); }).join(" → ") : "", also.length ? "also " + also.map(function (x) { return x.textContent.replace(/^in\s+/i, "").replace(/,.*$/, ""); }).join(", ") : ""].filter(Boolean).join(" · ") || (places ? "" : "no places read yet");
    var top = mk("div", "rs-top"); top.setAttribute("role", "button"); top.tabIndex = 0; top.setAttribute("aria-expanded", String(!compact));
    var sum = mk("div", "rs-sum"); sum.append(mk("b", null, name ? name + "’s story" : "Story on the map"), mk("small", null, summary || "Reading…"));
    var ed = mk("button", "rs-ib", "Edit"); ed.type = "button"; ed.title = "Edit your story";
    var x = mk("button", "rs-ib", "×"); x.type = "button"; x.setAttribute("aria-label", "Take the story off the map"); x.title = "Take the story off the map"; x.style.fontSize = "18px";
    var tg = mk("button", "rs-ib", compact ? "Details" : "Hide"); tg.type = "button"; tg.title = compact ? "Show what was understood" : "Fold this away";
    top.append(mk("span", "rs-dot"), sum, tg, ed, x); pills.append(top);
    function flip() { compact = !compact; userToggled = true; mirror(); }
    tg.addEventListener("click", flip);
    top.addEventListener("click", function (e) { if (e.target === ed || e.target === x || e.target === tg) return; flip(); });
    top.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === top) { e.preventDefault(); flip(); } });
    ed.addEventListener("click", function () { if (window.raStoryBox) window.raStoryBox.open(); });
    x.addEventListener("click", function () { fromBox = false; storyMode = false; thinking = false; compact = false; userToggled = false; q.value = ""; resetSearch(); if (window.raStoryBox) window.raStoryBox.clear().then(function () { mirror(); }); });
    if (!compact) {
      var body = mk("div", "rs-body");
      if (q.value.trim()) { var w = mk("p", "rs-words" + (wordsOpen ? " open" : ""), q.value.trim()); w.title = "Your words. Click to show all of them."; w.addEventListener("click", function () { wordsOpen = !wordsOpen; w.classList.toggle("open", wordsOpen); }); body.append(w); }
      [["Who", who], ["Journey", trip.reduce(function (a, n, i) { if (i) a.push(mk("span", "rs-arrow", "→")); a.push(n); return a; }, [])], ["Also", also], ["Work", work], ["Told", heard], ["Check", check]].forEach(function (g) { var sec = section(g[0], g[1]); if (sec) body.append(sec); });
      if (any) body.lastChild && body.append(mk("p", "rs-note", "Tap a place to choose a different one. Nothing here is checked: it is kept as you told it."));
      var act = mk("div", "rs-act"), pa = mk("button", "rs-b", "+ Photo or document"); pa.type = "button"; pa.addEventListener("click", function () { file.click(); });
      var go = mk("button", "rs-b g", "Start over"); go.type = "button"; go.addEventListener("click", function () { x.click(); });
      act.append(pa, mk("span", "sp"), go); body.append(act); pills.append(body);
    }
    pills.hidden = false;
  }
  function show() {
    if (!window.raStoryBox) return;
    window.raStoryBox.ready().then(function () {
      if (!src) {
        src = document.querySelector("#ra-story .sd-chips"); if (!src) return;
        mo = new MutationObserver(function () { mirror(); }); mo.observe(src, { childList: true });
      }
      mirror();
    }).catch(function () {});
  }
  /* the panel can also start a story: show its pills here too */
  document.addEventListener("ra-story-start", function () { setTimeout(show, 0); });
  var launch = document.getElementById("ra-story-open");
  if (launch) launch.addEventListener("click", function () { setTimeout(show, 400); });
  /* THREE DOORS, when the box is clicked and empty: so a story and a photo can be found without knowing the trick */
  var doors = document.createElement("div"); doors.id = "ra-doors"; doors.hidden = true; doors.setAttribute("role", "group"); doors.setAttribute("aria-label", "What you can do here");
  doors.innerHTML = '<p class="rd-h">What would you like to do?</p><div class="rd-g">' +
    '<button type="button" class="rd-d" data-d="find"><b>Find a place or surname</b><span>In any spelling it has ever had.</span><em>Gallignana · Žubrinić</em></button>' +
    '<button type="button" class="rd-d" data-d="story"><b>Tell a story</b><span>Write what you know, even a few words. The map fills in as you go.</span><em>“my father was from Senj…”</em></button>' +
    '<button type="button" class="rd-d" data-d="photo"><b>Add a photo or document</b><span>A certificate, a letter, a page of a register.</span><em>JPG, PNG or WebP</em></button></div>';
  find.append(doors);
  var qFoc = false;
  function doorsSync() {
    var st = window.raStoryBox && window.raStoryBox.state ? window.raStoryBox.state() : { has: false };
    var on = qFoc && !q.value.trim() && !st.has && !(st.files > 0) && !thinking;
    doors.hidden = !on;
    if (on) { var rc = document.getElementById("ra-recent"); doors.style.top = rc && !rc.hidden ? "calc(100% + " + (rc.offsetHeight + 12) + "px)" : ""; }
  }
  q.addEventListener("focus", function () { qFoc = true; setTimeout(doorsSync, 30); });
  q.addEventListener("blur", function () { qFoc = false; setTimeout(function () { if (!doors.contains(document.activeElement)) doorsSync(); }, 160); });
  q.addEventListener("input", function () { doorsSync(); });
  doors.addEventListener("mousedown", function (e) { e.preventDefault(); });   /* a press on a door must not take the focus off the box before it lands */
  doors.addEventListener("click", function (e) {
    var d = e.target.closest && e.target.closest(".rd-d"); if (!d) return; var w = d.getAttribute("data-d");
    qFoc = false; doorsSync();
    if (w === "story") { if (window.raStoryBox) window.raStoryBox.open(); }
    else if (w === "photo") file.click();
    else q.focus();
  });
  q.addEventListener("keydown", function (e) { if (e.key === "Escape" && !doors.hidden) { qFoc = false; doorsSync(); } });

  /* the one-box idea in a sentence, for the placeholder */
  var narrow = window.matchMedia && window.matchMedia("(max-width: 560px)");
  function holder() { q.setAttribute("placeholder", narrow && narrow.matches ? "A place, a surname, or your story" : "Find a place or a surname, or tell a story — Gallignana · Žubrinić · my father is Ivan from Senj…"); }
  holder(); if (narrow && narrow.addEventListener) narrow.addEventListener("change", holder);
})();
