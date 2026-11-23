/* THE STORIES, IN THE RESEARCH VIEW ON /my-research/. David: «the "my story" tab, isn't this the same as /read/#story? I don't think we need another;
   rather could we show the story here and consolidate?» It was: «My story» was an older copy of the Read page's story tool. There is one tool now
   (/read/#story). The stories it saves are shown here, as part of the research, for the families being read: each with the dated log of what was
   added to it, a way back into the tool to add more (/read/?story=<id>#story), and a way to start a new one for the family you mark under.

   Reads the stories store (stories.js) and the families (progress-kit.js, research-synopsis.js scopeOf). Everything is built with textContent: a story's
   name and words are the reader's own and are never trusted as markup. A story belongs to a family by its `line`; one with no family (or whose
   family is gone) is listed too, under «not tied to a family», so nothing saved is hidden by the choice of families. */
(function () {
  "use strict";
  var host = document.getElementById("mr-stories"), P = window.raProgress, S = window.raSynopsis, ST = window.raStories;
  if (!host || !P || !S || !ST) return;
  var BASE = (host.getAttribute("data-base") || "/").replace(/\/?$/, "/");
  var KIND = { story: "More of the story", document: "An article or document", photo: "A photo", note: "A note" };
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var confirmDel = null, openLog = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var h = d.getHours(), m = d.getMinutes();
    return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() + ", " + (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  function snippet(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; }
  function readStored() { try { return JSON.parse(localStorage.getItem("ra-synopsis-scope") || "null"); } catch (e) { return null; } }
  function nm(l) { return l.name === "My research so far" ? "Research Names" : l.name; }
  function readHref(id, extra) { return BASE + "read/?" + (id ? "story=" + encodeURIComponent(id) : "") + (extra || "") + "#story"; }

  function card(st, lineName) {
    var c = el("article", "mrs-card"), head = el("div", "mrs-head"), t = el("h4", "mrs-name", st.name);
    head.append(t);
    if (lineName) head.append(el("span", "mrs-fam", lineName));
    c.append(head);
    var n = st.pieces.length, last = st.updated || st.created;
    c.append(el("p", "mrs-meta", n + (n === 1 ? " piece" : " pieces") + (last ? " · last changed " + when(last) : "")));
    var first = st.pieces[0];
    if (first && first.text) c.append(el("p", "mrs-first", snippet(first.text, 240)));

    var row = el("div", "mrs-row");
    var go = el("a", "mrs-btn mrs-pri", "Continue this story"); go.href = readHref(st.id); go.title = "Opens it in the story tool, where you can add the next piece";
    row.append(go);
    if (confirmDel === st.id) {
      var sure = el("button", "mrs-btn mrs-danger", "Yes, delete it"), no = el("button", "mrs-btn", "Keep it");
      sure.type = "button"; no.type = "button";
      sure.addEventListener("click", function () { ST.remove(st.id); confirmDel = null; });
      no.addEventListener("click", function () { confirmDel = null; draw(); });
      row.append(el("span", "mrs-ask", "Delete “" + snippet(st.name, 40) + "” and its " + n + (n === 1 ? " piece" : " pieces") + "? This cannot be undone."), sure, no);
    } else {
      var del = el("button", "mrs-link", "Delete story"); del.type = "button";
      del.addEventListener("click", function () { confirmDel = st.id; draw(); });
      row.append(del);
    }
    c.append(row);

    /* THE DATED LOG: every piece in the order it was added, newest first, with what kind it was and where it came from. */
    if (n) {
      var d = el("details", "mrs-log"); if (openLog[st.id]) d.open = true;
      d.addEventListener("toggle", function () { openLog[st.id] = d.open; });
      d.append(el("summary", "", "Log of additions (" + n + ")"));
      var ol = el("ol", "mrs-ol");
      st.pieces.slice().sort(function (a, b) { return String(b.added).localeCompare(String(a.added)); }).forEach(function (p) {
        var li = el("li"), top = el("div", "mrs-lt");
        top.append(el("b", "", KIND[p.kind] || "A note"), el("span", "mrs-when", when(p.added)));
        if (p.label && p.label !== KIND[p.kind]) top.append(el("span", "mrs-src", p.label));
        li.append(top, el("p", "mrs-txt", snippet(p.text, 200)));
        ol.append(li);
      });
      d.append(ol); c.append(d);
    }
    return c;
  }

  function draw() {
    host.textContent = "";
    var lines = P.lines(), slugs = S.scopeOf(lines, P.active(), readStored()), byName = {};
    lines.forEach(function (l) { byName[l.slug] = nm(l); });
    var all = ST.list(), inScope = {}; slugs.forEach(function (s) { inScope[s] = 1; });
    var mine = all.filter(function (s) { return s.line && inScope[s.line]; });
    var loose = all.filter(function (s) { return !s.line || !byName[s.line]; });
    var others = all.length - mine.length - loose.length;

    var h = el("section", "mrs");
    h.append(el("h2", "mr-h", "Stories"));
    var act = P.active(), actName = act && byName[act];
    var lead = el("p", "cap", "What you know, told in your own words. The story tool reads it into a journey, the registers to search and the names to try; the stories you save are kept here with the families they belong to.");
    h.append(lead);
    var bar = el("p", "mrs-bar");
    var neu = el("a", "mrs-btn" + (all.length ? "" : " mrs-pri"), actName ? "Tell a story for " + actName : "Tell a story"); neu.href = readHref(null, act ? "&family=" + encodeURIComponent(act) : "");
    bar.append(neu);
    h.append(bar);
    if (!mine.length && !loose.length) {
      h.append(el("p", "cap", all.length
        ? "None of your saved stories belongs to the families read here. " + others + (others === 1 ? " story belongs" : " stories belong") + " to another family: tick it in the Research menu to see it."
        : "No stories saved yet. Tell one in the story tool, press “Save the story only”, and it appears here."));
      host.append(h); return;
    }
    mine.forEach(function (s) { h.append(card(s, slugs.length > 1 ? byName[s.line] : "")); });
    if (loose.length) {
      h.append(el("h3", "mrs-sub", "Not tied to a family"));
      loose.forEach(function (s) { h.append(card(s, "")); });
    }
    if (others > 0) h.append(el("p", "cap", others + (others === 1 ? " more story belongs" : " more stories belong") + " to families not being read here."));
    host.append(h);
  }

  document.addEventListener("ra-progress-changed", draw);
  document.addEventListener("ra-scope-changed", draw);
  window.addEventListener("storage", draw);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", draw); else draw();
})();
