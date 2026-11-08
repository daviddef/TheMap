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
    "#ra-q{padding-right:62px}" +
    "#ra-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:-4px 0 12px}" +
    "#ra-pills[hidden]{display:none}" +
    "#ra-pills .ra-pill{font:inherit;font-size:13px;line-height:1.2;padding:5px 11px;border-radius:999px;border:1px solid var(--rule,#ccc);background:var(--panel,#fff);color:var(--ink-2,#444)}" +
    "#ra-pills button.ra-pill{cursor:pointer} #ra-pills button.ra-pill:hover{border-color:var(--accent,#1f5c6b);color:var(--accent,#1f5c6b)}" +
    "#ra-pills .ra-pill.from{border-color:var(--brick,#b3452e);color:var(--brick,#b3452e)} #ra-pills .ra-pill.warn{border-style:dashed}" +
    "#ra-pills .ra-pill-mode{background:var(--accent,#1f5c6b);border-color:var(--accent,#1f5c6b);color:#fff;font-weight:600;display:inline-flex;gap:8px;align-items:center}" +
    "#ra-pills .ra-pill-mode i{font-style:normal;opacity:.85} #ra-pills .ra-pill-edit{border-color:var(--accent,#1f5c6b);color:var(--accent,#1f5c6b);font-weight:600}" +
    "#ra-pills .ra-pill-add{border-style:dashed}" +
    "@keyframes ra-pill-in{0%{opacity:0;transform:translateY(8px) scale(.82)}60%{opacity:1;transform:translateY(-1px) scale(1.04)}100%{opacity:1;transform:none}}" +
    "#ra-pills .ra-pill.pop{animation:ra-pill-in .42s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:var(--d,0ms)}" +
    "@keyframes ra-pill-think{0%,100%{opacity:.45}50%{opacity:1}}" +
    "#ra-pills .ra-pill-think{border-style:dashed;color:var(--ink-3,#777);animation:ra-pill-think 1.1s ease-in-out infinite}" +
    "@media (prefers-reduced-motion:reduce){#ra-pills .ra-pill.pop,#ra-pills .ra-pill-think{animation:none}}";
  document.head.appendChild(css);

  /* the "+" for a photo or a document */
  var add = document.createElement("button"); add.type = "button"; add.className = "ra-q-add"; add.textContent = "+";
  add.setAttribute("aria-label", "Add a photo or document to a story"); add.title = "Add a photo or document to a story";
  var file = document.createElement("input"); file.type = "file"; file.accept = "image/jpeg,image/png,image/webp"; file.multiple = true; file.hidden = true;
  find.append(add, file);
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
    if (e.key === "Enter" && looksLikeStory(q.value)) { e.preventDefault(); e.stopImmediatePropagation(); read(); q.blur(); }
  }, true);

  /* the pills: what the reader understood, under the box, mirrored from the panel's own pills so each one still works */
  var pills = document.createElement("div"); pills.id = "ra-pills"; pills.hidden = true; pills.setAttribute("aria-label", "What the story says");
  var barRow = find.closest(".ra-bar-row") || find.parentNode;
  barRow.parentNode.insertBefore(pills, barRow.nextSibling);
  var src = null, mo = null, seenPills = Object.create(null);
  function mirror() {
    if (!src && !thinking) return;
    var st = src && window.raStoryBox && window.raStoryBox.state ? window.raStoryBox.state() : { has: false };
    pills.textContent = "";
    if (!st.has && !(st.files > 0)) {
      seenPills = Object.create(null);
      if (thinking) { var th = document.createElement("span"); th.className = "ra-pill ra-pill-think"; th.textContent = "Reading what you wrote…"; pills.append(th); pills.hidden = false; }
      else pills.hidden = true;
      return;
    }
    var mode = document.createElement("span"); mode.className = "ra-pill ra-pill-mode";
    mode.append("Story on the map" + (st.name ? " · " + st.name : ""));
    var x = document.createElement("button"); x.type = "button"; x.className = "ra-pill ra-pill-mode"; x.setAttribute("aria-label", "Take the story off the map"); x.title = "Take the story off the map";
    x.textContent = "×"; x.style.padding = "5px 10px";
    x.addEventListener("click", function () { fromBox = false; storyMode = false; thinking = false; q.value = ""; resetSearch(); if (window.raStoryBox) window.raStoryBox.clear().then(function () { mirror(); }); });
    pills.append(mode, x);
    [].forEach.call(src.children, function (c, i) {
      if (/^Where did they start/.test(c.textContent)) return;   /* a nudge for the panel, noise while typing */
      var isBtn = c.tagName === "BUTTON", p = document.createElement(isBtn ? "button" : "span");
      p.className = "ra-pill" + (/\bfrom\b/.test(c.className) ? " from" : "") + (/\bwarn\b/.test(c.className) ? " warn" : ""); p.textContent = c.textContent;
      if (!seenPills[c.textContent]) { seenPills[c.textContent] = 1; p.classList.add("pop"); p.style.setProperty("--d", (Math.min(i, 8) * 60) + "ms"); }
      if (isBtn) { p.type = "button"; p.addEventListener("click", function () { var o = src.children[i]; if (o) o.click(); }); }
      pills.append(p);
    });
    var pa = document.createElement("button"); pa.type = "button"; pa.className = "ra-pill ra-pill-add"; pa.textContent = "+ photo or document";
    pa.addEventListener("click", function () { file.click(); });
    var ed = document.createElement("button"); ed.type = "button"; ed.className = "ra-pill ra-pill-edit"; ed.textContent = "Edit your story";
    ed.addEventListener("click", function () { if (window.raStoryBox) window.raStoryBox.open(); });
    pills.append(pa, ed); pills.hidden = false;
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
  /* the one-box idea in a sentence, for the placeholder */
  var narrow = window.matchMedia && window.matchMedia("(max-width: 560px)");
  function holder() { q.setAttribute("placeholder", narrow && narrow.matches ? "A place, a surname, or your story" : "Find a place or a surname, or tell a story — Gallignana · Žubrinić · my father is Ivan from Senj…"); }
  holder(); if (narrow && narrow.addEventListener) narrow.addEventListener("change", holder);
})();
