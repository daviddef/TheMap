/* MY STORIES: the stories a reader has told the Atlas, kept in this browser so they can come back and add to them.

   A story is a name, the family research (line) it belongs to, and PIECES: the family story as first told, then each document line, photo
   note or other note added later. The Atlas reads the pieces together, so every piece added lets the journey, the names and the plan
   say more. Only text is kept. A photo itself is never stored (size, and who is in it): the reader keeps their copy and types or pastes
   what it says as a piece.

   Stored under `ra-stories-v1` and carried in the research file (research-file.js) so it is backed up, shared between devices, and
   encrypted with the six words when the reader has sync on. Deletions are remembered (`gone`, and a story's `pgone` for pieces) so a
   merge from another device cannot bring back what was removed here.

   A classic script (loaded with one <script> tag, evaluated by the tests); this file reads and writes localStorage only when asked to. */
(function (root) {
  "use strict";
  var KEY = "ra-stories-v1", KINDS = ["story", "document", "photo", "note"];
  var NAME_MAX = 80, LABEL_MAX = 80, TEXT_MAX = 6000, PIECES_MAX = 60, STORIES_MAX = 60;

  function now() { return new Date().toISOString(); }
  function rid(prefix) { var a = new Uint8Array(6); (root.crypto || { getRandomValues: function (x) { for (var i = 0; i < x.length; i++) x[i] = Math.floor(Math.random() * 256); } }).getRandomValues(a); return prefix + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function str(x, max) { return String(x == null ? "" : x).replace(/\s+$/g, "").slice(0, max); }
  function empty() { return { v: 1, stories: {}, gone: {} }; }

  /* What a stored or received document is allowed to hold. Anything else is dropped, so a hand-edited file cannot put markup or a huge string in. */
  function clean(d) {
    var out = empty();
    if (!d || typeof d !== "object") return out;
    Object.keys(d.gone || {}).forEach(function (i) { if (typeof d.gone[i] === "string") out.gone[String(i).slice(0, 40)] = d.gone[i].slice(0, 30); });
    var n = 0;
    Object.keys(d.stories || {}).forEach(function (id) {
      var s = d.stories[id]; if (!s || typeof s !== "object" || n >= STORIES_MAX) return;
      var st = { id: String(s.id || id).slice(0, 40), name: str(s.name, NAME_MAX).trim() || "Untitled story", line: str(s.line, 80), created: str(s.created, 30), updated: str(s.updated, 30), pieces: [], pgone: {} };
      var b = Math.round(Number(s.born)); if (b >= 1500 && b <= 2100) st.born = b;
      if (s.pick && typeof s.pick === "object") { st.pick = {}; Object.keys(s.pick).slice(0, 40).forEach(function (w) { if (typeof s.pick[w] === "string") st.pick[str(w, 60)] = s.pick[w].slice(0, 80); }); }
      Object.keys(s.pgone || {}).forEach(function (p) { if (typeof s.pgone[p] === "string") st.pgone[String(p).slice(0, 40)] = s.pgone[p].slice(0, 30); });
      (Array.isArray(s.pieces) ? s.pieces : []).slice(0, PIECES_MAX).forEach(function (p) {
        if (!p || typeof p !== "object" || st.pgone[p.id]) return;
        st.pieces.push({ id: String(p.id || rid("p")).slice(0, 40), kind: KINDS.indexOf(p.kind) > -1 ? p.kind : "note", label: str(p.label, LABEL_MAX), text: str(p.text, TEXT_MAX), added: str(p.added, 30) });
        if (typeof p.route === "boolean") st.pieces[st.pieces.length - 1].route = p.route;
      });
      if (out.gone[st.id] && out.gone[st.id] >= st.updated) return;
      out.stories[st.id] = st; n++;
    });
    return out;
  }

  /* Two copies of the stories (this device and another): a story by id, the later `updated` taking the fields; pieces from both by id unless
     removed (`pgone`) after they were added; a story removed (`gone`) after it was last changed stays removed. Only adds, so nothing is lost. */
  function merge(mine, theirs) {
    mine = clean(mine); theirs = clean(theirs);
    var out = empty();
    [mine.gone, theirs.gone].forEach(function (g) { Object.keys(g).forEach(function (i) { if (!out.gone[i] || g[i] > out.gone[i]) out.gone[i] = g[i]; }); });
    var ids = {}; Object.keys(mine.stories).concat(Object.keys(theirs.stories)).forEach(function (i) { ids[i] = 1; });
    Object.keys(ids).forEach(function (id) {
      var a = mine.stories[id], b = theirs.stories[id], win = !a ? b : !b ? a : ((b.updated || "") > (a.updated || "") ? b : a), other = win === a ? b : a;
      var s = clone(win);
      if (other) {
        Object.keys(other.pgone || {}).forEach(function (p) { if (!s.pgone[p] || other.pgone[p] > s.pgone[p]) s.pgone[p] = other.pgone[p]; });
        var have = {}; s.pieces.forEach(function (p) { have[p.id] = 1; });
        other.pieces.forEach(function (p) { if (!have[p.id] && !s.pgone[p.id]) s.pieces.push(clone(p)); });
        s.pieces = s.pieces.filter(function (p) { return !s.pgone[p.id]; }).sort(function (x, y) { return String(x.added).localeCompare(String(y.added)); }).slice(0, PIECES_MAX);
        if (!s.line && other.line) s.line = other.line;
        if (s.born == null && other.born != null) s.born = other.born;
        if (other.pick) s.pick = Object.assign({}, other.pick, s.pick || {});
      }
      if (out.gone[id] && out.gone[id] >= (s.updated || "")) return;
      out.stories[id] = s;
    });
    return clean(out);
  }

  /* Everything the Atlas reads, in the order it was added: the story as told, then each later piece. */
  /* Does this piece draw the journey? The family story does; an article, a photo's caption or a note adds years, people and "also mentioned"
     places but does not add stops to the route unless the reader says so (an obituary names a street, a mill and a brother's town). */
  function routeOn(p) { return typeof p.route === "boolean" ? p.route : p.kind === "story"; }
  function textOf(story, routeOnly) {
    var ps = story && story.pieces || [];
    if (routeOnly && ps.some(function (p) { return p.text && routeOn(p); })) ps = ps.filter(routeOn);
    return ps.map(function (p) { return p.text; }).filter(Boolean).join("\n\n");
  }
  /* What the reader holds, for the plan: the family story always, plus a document, a photo or a letter when a piece of that kind was added. */
  function holdsOf(story) {
    var k = {}; (story && story.pieces || []).forEach(function (p) { k[p.kind] = 1; });
    var out = []; if (k.document) out.push("document"); if (k.photo) out.push("photo");
    return out.length ? out : null;
  }
  function summary(story) {
    var c = { story: 0, document: 0, photo: 0, note: 0 }; (story && story.pieces || []).forEach(function (p) { c[p.kind] = (c[p.kind] || 0) + 1; });
    return c;
  }

  var api = { routeOn: routeOn, KEY: KEY, KINDS: KINDS, clean: clean, merge: merge, textOf: textOf, holdsOf: holdsOf, summary: summary, empty: empty };

  /* ---- the store, in the browser ------------------------------------------------------------------------------------------------ */
  if (root.document) {
    var ls = function () { try { return root.localStorage; } catch (e) { return null; } };
    var read = function () { var s = ls(); try { return clean(JSON.parse(s.getItem(KEY) || "null")); } catch (e) { return empty(); } };
    var write = function (d) {
      var s = ls(); if (!s) return false;
      try { s.setItem(KEY, JSON.stringify(clean(d))); } catch (e) { return false; }
      try { if (root.document) root.document.dispatchEvent(new root.CustomEvent("ra-progress-changed")); } catch (e) { /* not in a page */ }
      return true;
    };
    var touch = function (s) { s.updated = now(); };
    api.load = read;
    api.list = function () { var d = read(); return Object.keys(d.stories).map(function (i) { return d.stories[i]; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); };
    api.get = function (id) { return read().stories[id] || null; };
    api.create = function (o) {
      o = o || {}; var d = read(), id = rid("s"), t = now();
      var s = { id: id, name: str(o.name, NAME_MAX).trim() || "Untitled story", line: str(o.line, 80), created: t, updated: t, pieces: [], pgone: {} };
      if (o.text && String(o.text).trim()) s.pieces.push({ id: rid("p"), kind: KINDS.indexOf(o.kind) > -1 ? o.kind : "story", label: str(o.label, LABEL_MAX) || "The family story", text: str(o.text, TEXT_MAX), added: t });
      if (o.born != null) s.born = o.born;
      d.stories[id] = s; return write(d) ? id : null;
    };
    api.update = function (id, fn) { var d = read(), s = d.stories[id]; if (!s) return false; fn(s); touch(s); d.stories[id] = s; return write(d); };
    api.addPiece = function (id, p) {
      var pid = rid("p");
      return api.update(id, function (s) { s.pieces.push({ id: pid, kind: KINDS.indexOf(p.kind) > -1 ? p.kind : "note", label: str(p.label, LABEL_MAX), text: str(p.text, TEXT_MAX), added: now() }); }) ? pid : null;
    };
    api.editPiece = function (id, pid, p) { return api.update(id, function (s) { s.pieces.forEach(function (x) { if (x.id === pid) { if (p.label != null) x.label = str(p.label, LABEL_MAX); if (p.text != null) x.text = str(p.text, TEXT_MAX); if (p.kind && KINDS.indexOf(p.kind) > -1) x.kind = p.kind; } }); }); };
    api.removePiece = function (id, pid) { return api.update(id, function (s) { s.pieces = s.pieces.filter(function (x) { return x.id !== pid; }); s.pgone[pid] = now(); }); };
    api.setRoute = function (id, pid, on) { return api.update(id, function (s) { s.pieces.forEach(function (x) { if (x.id === pid) x.route = !!on; }); }); };
    api.rename = function (id, name) { return api.update(id, function (s) { s.name = str(name, NAME_MAX).trim() || s.name; }); };
    api.setLine = function (id, slug) { return api.update(id, function (s) { s.line = str(slug, 80); }); };
    api.setBorn = function (id, y) { return api.update(id, function (s) { if (y == null) delete s.born; else s.born = y; }); };
    api.setPick = function (id, word, rowId) { return api.update(id, function (s) { s.pick = s.pick || {}; if (rowId) s.pick[str(word, 60)] = String(rowId).slice(0, 80); else delete s.pick[word]; }); };
    api.remove = function (id) { var d = read(); if (!d.stories[id]) return false; delete d.stories[id]; d.gone[id] = now(); return write(d); };
    api.mergeIn = function (theirs) { var d = merge(read(), theirs); return write(d) ? Object.keys(d.stories).length : 0; };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.raStories = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
