/* ONE BOX: the search box on the map takes a place, a surname, or a whole story, and a photo or document. A place or a surname is searched as
   it always was. Typed words that read as a story ("my father is Ivan from Senj, he moved to …") offer "Read this as a story" instead of
   place suggestions; Enter or a click hands them to the story reader (story-drawer.js, window.raStoryBox), which draws the people and
   places on the map. What it understood is shown as pills under the box (the same pills the panel shows, each one tappable), with a
   chip saying the map is showing a story and a × to take it away. The "+" in the box adds a photo or document to the same story.

   Nothing here reads the story itself: this file only decides what a typed line is, and carries it across. Classic script, no libraries. */
(function () {
  "use strict";
  var q = document.getElementById("ra-q"), find = q && q.parentNode;
  if (!q || !find) return;

  /* five words or more, and either a relation or a story verb or simply long: a place name or a surname is never that. */
  function looksLikeStory(v) {
    v = String(v || "").trim();
    var w = v.split(/\s+/).length;
    if (w < 5) return false;
    if (/\b(my|his|her|their|our)\s+(\w+\s+)?(father|mother|dad|mum|mom|grand\w+|uncle|aunt|brother|sister|husband|wife|family|ancestor)/i.test(v)) return true;
    if (w >= 6 && /\b(born|died|married|moved|emigrated|migrated|came|arrived|left|lived|settled)\b/i.test(v)) return true;
    return v.length >= 70;
  }

  var css = document.createElement("style");
  css.textContent =
    "#ra-story-hint{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:1101;background:var(--panel,#fff);border:1px solid var(--accent,#1f5c6b);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.28);padding:6px}" +
    "#ra-story-hint[hidden]{display:none}" +
    "#ra-story-hint button{display:flex;width:100%;gap:10px;align-items:baseline;text-align:left;border:0;background:none;color:var(--ink,#16222a);font:inherit;font-size:14px;line-height:1.35;padding:8px 10px;border-radius:4px;cursor:pointer}" +
    "#ra-story-hint button:hover,#ra-story-hint button:focus-visible{background:var(--accent-wash,rgba(31,92,107,.12));outline:none}" +
    "#ra-story-hint b{flex:none;color:var(--accent,#1f5c6b)} #ra-story-hint span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink-2,#555)}" +
    "#ra-story-hint small{display:block;padding:2px 10px 4px;color:var(--ink-3,#777);font-size:12px}" +
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
    "#ra-pills .ra-pill-add{border-style:dashed}";
  document.head.appendChild(css);

  /* the hint under the box */
  var hint = document.createElement("div"); hint.id = "ra-story-hint"; hint.hidden = true; hint.setAttribute("role", "listbox");
  var hbtn = document.createElement("button"); hbtn.type = "button"; hbtn.setAttribute("role", "option");
  var hb = document.createElement("b"), hs = document.createElement("span"), hsm = document.createElement("small");
  hb.textContent = "Read this as a story"; hsm.textContent = "Enter to put them on the map. Nothing is sent anywhere; it is read here from the Atlas's own files.";
  hbtn.append(hb, hs); hint.append(hbtn, hsm); find.appendChild(hint);
  function hideHint() { hint.hidden = true; }

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

  /* typing: a story is taken out of the place search; a place or a name goes on exactly as before */
  function start() {
    var t = q.value.trim(); if (!t || !window.raStoryBox) return;
    hideHint(); q.value = ""; q.blur();
    window.raStoryBox.start(t).then(show).catch(function () { q.value = t; });
  }
  q.addEventListener("input", function (e) {
    if (looksLikeStory(q.value)) {
      e.stopImmediatePropagation();
      var sug = document.getElementById("ra-sug"); if (sug) { sug.hidden = true; sug.innerHTML = ""; }
      var rc = document.getElementById("ra-recent"); if (rc) rc.hidden = true;
      hs.textContent = "“" + q.value.trim().slice(0, 90) + (q.value.trim().length > 90 ? "…" : "") + "”";
      hint.hidden = false;
    } else hideHint();
  }, true);
  q.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && looksLikeStory(q.value)) { e.preventDefault(); e.stopImmediatePropagation(); start(); }
    else if (e.key === "Escape") hideHint();
  }, true);
  hbtn.addEventListener("mousedown", function (e) { e.preventDefault(); start(); });
  hbtn.addEventListener("click", start);
  q.addEventListener("blur", function () { setTimeout(hideHint, 160); });

  /* the pills: what the reader understood, under the box, mirrored from the panel's own pills so each one still works */
  var pills = document.createElement("div"); pills.id = "ra-pills"; pills.hidden = true; pills.setAttribute("aria-label", "What the story says");
  var barRow = find.closest(".ra-bar-row") || find.parentNode;
  barRow.parentNode.insertBefore(pills, barRow.nextSibling);
  var src = null, mo = null;
  function mirror() {
    if (!src) return;
    var st = window.raStoryBox && window.raStoryBox.state ? window.raStoryBox.state() : { has: false };
    pills.textContent = "";
    if (!st.has && !(st.files > 0)) { pills.hidden = true; return; }
    var mode = document.createElement("span"); mode.className = "ra-pill ra-pill-mode";
    mode.append("Story on the map" + (st.name ? " · " + st.name : ""));
    var x = document.createElement("button"); x.type = "button"; x.className = "ra-pill ra-pill-mode"; x.setAttribute("aria-label", "Take the story off the map"); x.title = "Take the story off the map";
    x.textContent = "×"; x.style.padding = "5px 10px";
    x.addEventListener("click", function () { if (window.raStoryBox) window.raStoryBox.clear().then(function () { mirror(); }); });
    pills.append(mode, x);
    [].forEach.call(src.children, function (c, i) {
      var isBtn = c.tagName === "BUTTON", p = document.createElement(isBtn ? "button" : "span");
      p.className = "ra-pill" + (/\bfrom\b/.test(c.className) ? " from" : "") + (/\bwarn\b/.test(c.className) ? " warn" : ""); p.textContent = c.textContent;
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
  q.setAttribute("placeholder", "Find a place or a surname, or tell a story — Gallignana · Žubrinić · my father is Ivan from Senj…");
})();
