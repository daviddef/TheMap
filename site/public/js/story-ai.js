/* TWO WAYS TO GET A STORY READY, ON THE STORY PAGE (/read/#story): "AI ready" and "Paste a forum post". Both are buttons, and both send the
   reader's WHOLE text to Claude (Haiku, through the Worker at ai.recordatlas.org, which keeps counts and nothing else). That is more than the
   research plan sends (places and years, never a name), so each opens a small panel that says so and waits for a tick before it will send.

   AI READY. The story box holds whatever was typed or pasted, however it is laid out. The button asks Claude to rewrite it as short plain
   sentences, one fact each, saying who each is about, adding nothing. The old and the new are shown side by side with every new or changed
   word marked, and nothing in the box changes until "Use this version" is pressed; "Put my words back" undoes it.

   PASTE A FORUM POST. A post asking for help ("my grandfather died in October... does anyone know his father?") is a request, not a story.
   The panel reads it into: what the post knows, what it does not, and the questions it asks; a plain third-person story to put in the box so the
   reader draws the map and the family; and a draft reply for the group. Once the story is in the box and the places are found, the reply can
   be written again with the Atlas's own records for those places (the same candidates the research plan uses; the Worker attaches every link).

   Pure helpers are exported for the tests (module.exports). Everything the server sends is put in with textContent, never as markup. */
(function (root) {
  "use strict";
  var BASE = "/";

  function fold(s) { return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }

  /* The words of `b` marked "new" when they are not in `a` in the same order: a longest-common-subsequence on the words, folded for case,
     accents and punctuation. Returns [{t: "word ", c: true|false}] in b's order; whitespace and line breaks are kept in t. */
  function diffWords(a, b) {
    var A = String(a || "").split(/\s+/).filter(Boolean), parts = String(b || "").match(/\S+\s*|\s+/g) || [];
    var B = parts.map(function (p) { return fold(p); }), fa = A.map(fold), n = fa.length, m = B.length;
    if (n * m > 4000000) return parts.map(function (t) { return { t: t, c: false }; });
    var L = []; for (var i = 0; i <= n; i++) { L.push(new Uint16Array(m + 1)); }
    for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = fa[i] && fa[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = [], x = 0, y = 0;
    while (y < m) {
      if (!B[y]) { out.push({ t: parts[y], c: false }); y++; continue; }              /* whitespace or punctuation only */
      if (x < n && fa[x] === B[y]) { out.push({ t: parts[y], c: false }); x++; y++; }
      else if (x < n && L[x + 1][y] >= L[x][y + 1] && fa[x] !== B[y]) x++;              /* a word of the original that is gone */
      else { out.push({ t: parts[y], c: true }); y++; }
    }
    return out;
  }
  function changedCount(segs) { return segs.reduce(function (n, s) { return n + (s.c && /\S/.test(s.t) ? 1 : 0); }, 0); }

  function tidyBody(text) { return { text: String(text == null ? "" : text).slice(0, 8000) }; }
  function postBody(post, candidates) { var b = { post: String(post == null ? "" : post).slice(0, 8000) }; if (candidates && candidates.length) b.candidates = candidates; return b; }

  /* the reply as it would be posted: the words, then the Atlas pages it points at, each with its address in full */
  function replyText(r, origin) {
    var t = String((r && r.reply) || "").trim(), L = (r && r.links) || [];
    if (!L.length) return t;
    var o = String(origin || "").replace(/\/$/, "");
    return t + "\n\nIn the Record Atlas:\n" + L.map(function (l) { var u = String(l.url || ""); return "- " + l.name + (l.where ? " (" + l.where + ")" : "") + ": " + (/^\//.test(u) ? o + u : u); }).join("\n");
  }

  var api = { fold: fold, diffWords: diffWords, changedCount: changedCount, tidyBody: tidyBody, postBody: postBody, replyText: replyText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStoryAi = api;
  if (typeof document === "undefined") return;

  /* ---- the panel ------------------------------------------------------------------------------------------------------------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
  var text = $("sp-text"), panel = $("sp-aipanel");
  if (!text || !panel) return;
  BASE = (document.documentElement.getAttribute("data-base") || "/").replace(/\/?$/, "/");

  var title = $("sp-aip-h"), note = $("sp-aip-note"), ok = $("sp-aip-ok"), go = $("sp-aip-go"), stat = $("sp-aip-status"), out = $("sp-aip-out");
  var mode = null, undo = null, lastPost = null, busy = false;

  function say(m, bad) { stat.textContent = m || ""; stat.className = "sp-status" + (bad ? " bad" : ""); }
  function setStory(v) { text.value = v; text.dispatchEvent(new Event("input", { bubbles: true })); try { text.focus(); } catch (e) { /* fine */ } }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = BASE + "js/" + src; s.onload = res; s.onerror = function () { rej(new Error(src)); }; document.head.appendChild(s); }); }
  function ready() { return window.raStoryRead && window.raStoryRead.call ? Promise.resolve() : loadScript("story-read.js"); }
  var why = $("sp-aip-why"), send = $("sp-aip-send"), preview = $("sp-aip-preview");
  function short(mode2) { return mode2 === "post" ? text.value.trim().length < 20 : text.value.trim().length < 10; }
  function sync() {
    go.disabled = busy || !ok.checked || short(mode);
    /* say why the button is off, instead of leaving a grey button */
    if (why) why.textContent = busy ? "Claude is reading it…" : short(mode) ? (mode === "post" ? "Paste the post into the story box first (a few lines at least)." : "Write a little of the story first, then come back.") : !ok.checked ? "Tick the box above to switch this on." : "";
    if (preview && mode) preview.textContent = text.value.trim();
  }

  function open(m) {
    mode = m; panel.hidden = false; panel.setAttribute("data-stage", "ask"); out.textContent = ""; say(""); ok.checked = false; lastPost = null;
    panel.setAttribute("data-mode", m);
    if (send) send.hidden = false;
    if (m === "tidy") {
      title.textContent = "Tidy the story with AI";
      note.textContent = "Claude rewrites what is in the story box as short, plain sentences, one fact each, saying who each is about, and adds nothing. You see the old and the new side by side before anything changes.";
      go.textContent = "Tidy it with AI";
    } else {
      title.textContent = "Draft a reply";
      note.textContent = "For a post that asks for help with a family, pasted into the story box. Claude reads it as a request: what it knows, what it asks, and a draft reply for the group.";
      go.textContent = "Read this post";
    }
    $("sp-aip-consent").textContent = "Send this text to Claude (Haiku) once, to be read. It goes through ai.recordatlas.org, which keeps no text and no names, only counts. Nothing is sent until I press the button.";
    sync(); panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function close() { panel.hidden = true; mode = null; }

  /* ---- AI ready: the old and the new side by side ----------------------------------------------------------------------------- */
  function drawTidy(original, r) {
    out.textContent = ""; panel.setAttribute("data-stage", "result");
    if (!r || r.unparsed || !r.text) { out.append(el("p", "Claude's answer could not be laid out, so nothing was changed.", "sp-fine")); return; }
    var segs = diffWords(original, r.text), n = changedCount(segs);
    var cols = el("div", null, "sp-aip-cols"), a = el("div", null, "sp-aip-col"), b = el("div", null, "sp-aip-col");
    a.append(el("h4", "Your words")); a.append(el("p", original, "sp-aip-t"));
    b.append(el("h4", "Tidied")); var p = el("p", null, "sp-aip-t");
    segs.forEach(function (s) { if (s.c && /\S/.test(s.t)) { var m = el("mark", s.t.replace(/\s+$/, "")); p.append(m, document.createTextNode(s.t.slice(s.t.replace(/\s+$/, "").length))); } else p.append(document.createTextNode(s.t)); });
    b.append(p); cols.append(a, b); out.append(cols);
    out.append(el("p", n ? n + " word" + (n === 1 ? " is" : "s are") + " new or changed (marked). Check them before you use it." : "No word is new: it is your words, re-laid out.", "sp-fine"));
    if (r.added && r.added.length) out.append(el("p", "It wrote " + (r.added.length === 1 ? "a number" : "numbers") + " that is not in your words: " + r.added.join(", ") + ". Check before you use it.", "sp-status bad"));
    (r.changes || []).forEach(function (c) { out.append(el("p", "• " + c, "sp-fine")); });
    var row = el("p", null, "sp-row"), use = el("button", "Use this version", "sp-btn"), keep = el("button", "Keep mine", "sp-ghost");
    use.type = keep.type = "button";
    use.addEventListener("click", function () { undo = text.value; setStory(r.text); drawUndo(); });
    keep.addEventListener("click", close);
    row.append(use, keep); out.append(row);
  }
  function drawUndo() {
    out.textContent = ""; panel.setAttribute("data-stage", "done");
    out.append(el("p", "\u2713 The story box now holds the tidied version.", "sp-fine"));
    var row = el("p", null, "sp-row"), back = el("button", "Put my words back", "sp-ghost"), done = el("button", "Done", "sp-ghost");
    back.type = done.type = "button";
    back.addEventListener("click", function () { if (undo != null) setStory(undo); undo = null; close(); });
    done.addEventListener("click", close);
    row.append(back, done); out.append(row);
  }

  /* ---- a forum post, read as a request ---------------------------------------------------------------------------------------- */
  function list(title, items, cls) {
    if (!items || !items.length) return null;
    var d = el("div", null, "sp-aip-blk " + (cls || "")); d.append(el("h4", title));
    var ul = el("ul"); items.forEach(function (x) { ul.append(el("li", x)); }); d.append(ul); return d;
  }
  function drawPost(r) {
    out.textContent = ""; panel.setAttribute("data-stage", "result");
    if (!r || r.unparsed) { out.append(el("p", "Claude's answer could not be laid out. Nothing was changed.", "sp-fine")); return; }
    lastPost = r;
    var g = el("div", null, "sp-aip-grid");
    [list("What the post says", r.known), list("What it does not know", r.unknown), list("What it asks", r.questions)].forEach(function (x) { if (x) g.append(x); });
    out.append(g);
    if (r.living) out.append(el("p", "The post names people who may be alive. The reply keeps to what the post itself says about them.", "sp-fine"));
    drawReply(r);
  }
  function drawReply(r) {
    var old = out.querySelector(".sp-aip-reply"); if (old) old.remove();
    var d = el("div", null, "sp-aip-blk sp-aip-reply"); d.append(el("h4", "A draft reply for the group"));
    var ta = el("textarea"); ta.rows = 9; ta.value = replyText(r, location.origin); ta.setAttribute("aria-label", "Draft reply"); d.append(ta);
    var row = el("p", null, "sp-row"), cp = el("button", "Copy the reply", "sp-ghost"), more = el("button", "Write it again with the Atlas records for these places", "sp-ghost");
    cp.type = more.type = "button";
    cp.addEventListener("click", function () {
      var done = function () { say("Copied. Read it through and make it yours before you post it."); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); say("Select and copy the text above.", true); }); else { ta.select(); say("Select and copy the text above."); }
    });
    more.addEventListener("click", function () { withRecords(); });
    row.append(cp, more); d.append(row);
    d.append(el("p", "A draft by Claude Haiku, to read and change. The pages it points to are the Atlas's own; the rest is advice to check.", "sp-fine"));
    out.append(d);
  }
  /* the second call: the same post, with the Atlas records for the places the page found once the story was in the box */
  function withRecords() {
    var pg = window.raStoryPage, g = pg && pg.graph && pg.graph();
    if (!window.raStoryPlan || !g || !((g.facts || {}).route || []).length && !((g.facts || {}).kin || []).length) { say("Put the story in the box first, so the page can find the places. Then ask again.", true); return; }
    var cands = window.raStoryPlan.candidates(g, pg.countries && pg.countries(), BASE);
    if (!cands.length) { say("The Atlas matched no records to those places yet.", true); return; }
    run(cands);
  }

  function run(cands) {
    if (busy) return; busy = true; sync();
    var isPost = mode === "post";
    say(isPost ? "Claude Haiku is reading the post… this takes up to half a minute." : "Claude Haiku is tidying your words… this takes up to half a minute.");
    var original = text.value, post = text.value;
    ready().then(function () { return window.raStoryRead.call(isPost ? "post" : "tidy", isPost ? postBody(post, cands) : tidyBody(original)); })
      .then(function (j) { say(typeof j.left === "number" ? j.left + " tries left today." : ""); if (isPost) drawPost(j.result); else drawTidy(original, j.result); })
      .then(null, function (e) { var m = (e && e.message) || ""; say(/^not found/i.test(m) ? "This part of Ask Claude is not switched on yet. Nothing was sent." : m || "That could not be done just now.", true); })
      .then(function () { busy = false; sync(); });
  }

  $("sp-tidy").addEventListener("click", function () { open("tidy"); });
  $("sp-postbtn").addEventListener("click", function () { open("post"); });
  $("sp-aip-x").addEventListener("click", close);
  ok.addEventListener("change", sync); text.addEventListener("input", sync);
  go.addEventListener("click", function () { run(null); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
