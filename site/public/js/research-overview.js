/* THE «ALL FAMILIES» TAB ON /my-research/: choose which family lines to look at together, and read them as one synopsis.
 *
 * The arithmetic is research-synopsis.js (tested in Node); this file is only the page: the family chooser, the figures, the overlaps, the plan,
 * and Copy / Download / Print of the same thing as plain text. Everything is drawn from the marks already in this browser, with textContent, because
 * a family name and a place text are the reader's own words and are never trusted as markup. Nothing leaves the browser.
 *
 * WHAT IT WILL NOT DO is call a family «absent» from a place: a family with no mark at a place has not been recorded there. The text says so.
 */
(function () {
  "use strict";
  var P = window.raProgress, S = window.raSynopsis, host = document.getElementById("mr-all"), panel = document.getElementById("mr-p-all");
  if (!P || !S || !host || !panel) return;
  var BASE = host.getAttribute("data-base") || "/";
  var SKEY = "ra-synopsis-scope", PLACES = {}, asked = {};

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  /* NOTHING CHOSEN YET MEANS THE FAMILY YOU ARE ON. «All» is a choice, never the default. */
  function readScope() { try { var s = JSON.parse(localStorage.getItem(SKEY) || "null"); if (s && typeof s === "object") return s; } catch (e) { /* none */ } var a = P.active(); return { all: false, slugs: a ? [a] : [] }; }
  function writeScope(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) { /* storage blocked: the choice lasts until the page closes */ } document.dispatchEvent(new CustomEvent("ra-scope-changed")); }
  var scope = readScope(), openState = false;
  function syn0(lines, slugs) {
    var names = lines.filter(function (l) { return slugs.indexOf(l.slug) > -1; }).map(function (l) { return l.name === "My research so far" ? "Research Names" : l.name; });
    return names.length > 8 ? "Reading " + names.length + " families together, from " + names[0] + " to " + names[names.length - 1] + "." : "Reading " + (names.join(", ") || "no families") + ".";
  }

  function chosenSlugs(lines) {
    var all = lines.map(function (l) { return l.slug; });
    return scope.all ? all : all.filter(function (s) { return scope.slugs.indexOf(s) > -1; });
  }

  /* NAMES, NOT SLUGS. The place file holds the atlas's name for a place; fetch it once for each place in the chosen families, a few at a time. */
  function wantNames(syn) {
    var todo = syn.places.map(function (p) { return p.pid; }).filter(function (p) { return !(p in PLACES) && !asked[p]; });
    if (!todo.length) return;
    todo.forEach(function (p) { asked[p] = 1; });
    var i = 0, running = 0, changed = false;
    function next() {
      while (running < 6 && i < todo.length) {
        (function (pid) {
          running++;
          fetch(BASE + "p/" + pid + ".json").then(function (r) { return r.json(); })
            .then(function (d) { PLACES[pid] = { name: String(d.name || "").replace(/\s*\([^)]*\)\s*$/, "") || pid }; changed = true; })
            .catch(function () { PLACES[pid] = { name: pid }; })
            .then(function () { running--; if (i >= todo.length && !running) { if (changed) draw(); } else next(); });
        })(todo[i++]);
      }
    }
    next();
  }

  function badge(name, cls) { return el("span", "mra-b " + (cls || ""), name); }

  function draw() {
    scope = readScope();
    var lines = P.lines();
    host.textContent = "";
    if (!lines.length) {
      host.append(el("p", "cap", "No families yet. Add one from the Research menu in the header, then mark books on a place page, and they will be drawn together here."));
      return;
    }
    var slugs = chosenSlugs(lines);
    var syn = S.build({ lines: lines, marks: P.all(), scope: slugs, places: PLACES });
    var nameOf = {}; lines.forEach(function (l) { nameOf[l.slug] = l.name; });

    // ---- the chooser
    var box = el("section", "mra-pick");
    box.append(el("h2", "mr-h", "All families together"));
    box.append(el("p", "cap", "Choose the families to read as one. This joins what you have marked for each of them into a single picture: where they overlap, what is still open, and a plan that covers the most families in the fewest trips. Nothing here is a new record; it is read from the marks you and the family research sessions have made."));
    /* EIGHTY FAMILIES IS NOT A ROW OF BUTTONS. Once the research sessions have published their families the list is long, so the chooser folds
       away behind its own summary («86 of 86 chosen»), can be searched, and has the four cuts a reader actually wants. */
    var det = el("details", "mra-choose"); if (lines.length <= 12) det.open = true;
    if (openState) det.open = true;
    det.append(el("summary", "", "Families: " + slugs.length + " of " + lines.length + " chosen"));
    det.addEventListener("toggle", function () { openState = det.open; });
    var find = el("input", "mra-find"); find.type = "search"; find.placeholder = "Find a family"; find.setAttribute("aria-label", "Find a family to include"); find.autocomplete = "off";
    var acts = el("div", "mra-acts");
    function setScope(fn) { var cur = fn(P.lines()); scope = { all: cur.length === P.lines().length, slugs: cur }; writeScope(scope); openState = true; draw(); }
    [["All families", function (ls) { return ls.map(function (l) { return l.slug; }); }],
     ["None", function () { return []; }],
     ["Only those with work marked", function (ls) { return ls.filter(function (l) { return l.marks > 0; }).map(function (l) { return l.slug; }); }],
     ["Only the ones I made", function (ls) { return ls.filter(function (l) { return !l.session; }).map(function (l) { return l.slug; }); }]].forEach(function (a2) {
      var bt = el("button", "mra-link", a2[0]); bt.type = "button"; bt.addEventListener("click", function () { setScope(a2[1]); }); acts.append(bt);
    });
    var chips = el("div", "mra-chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Families to include");
    lines.forEach(function (l) {
      var label = (l.name === "My research so far" ? "Research Names" : l.name) + (l.where ? " of " + l.where : "");
      var lab = el("label", "mra-chip" + (slugs.indexOf(l.slug) > -1 ? " is-on" : "")); lab.setAttribute("data-f", label.toLowerCase());
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = slugs.indexOf(l.slug) > -1;
      cb.addEventListener("change", function () {
        var cur = chosenSlugs(P.lines()), i = cur.indexOf(l.slug);
        if (cb.checked && i < 0) cur.push(l.slug); else if (!cb.checked && i > -1) cur.splice(i, 1);
        scope = { all: cur.length === P.lines().length, slugs: cur }; writeScope(scope); openState = true; draw();
      });
      lab.append(cb, el("span", "mra-chip-n", label), el("small", "", plural(l.marks, "mark")));
      chips.append(lab);
    });
    find.addEventListener("input", function () {
      var f = find.value.trim().toLowerCase();
      [].forEach.call(chips.children, function (c) { c.hidden = !!f && c.getAttribute("data-f").indexOf(f) < 0; });
    });
    det.append(find, acts, chips);
    box.append(det);
    if (!det.open) {
      var sel = syn0(lines, slugs);
      box.append(el("p", "cap mra-who", sel));
    }
    host.append(box);

    if (!syn.scope.length) { host.append(el("p", "cap", "Choose at least one family above.")); return; }
    wantNames(syn);

    // ---- the figures
    var t = syn.totals, fig = el("ul", "mra-fig");
    [[t.families, "families"], [t.places, "places"], [t.sharedPlaces, "places shared by two or more"], [t.books, "books marked"], [t.sharedBooks, "books touched by two or more"], [t.pages, "pages read for a named family"], [t.openPlaces, "places with open work"]].forEach(function (f) {
      var li = el("li"); li.append(el("b", "", String(f[0])), el("span", "", f[1])); fig.append(li);
    });
    host.append(fig);
    host.append(el("p", "cap mra-note", "Only what was recorded is counted. A family with nothing at a place has not been recorded there, which is not the same as having been looked and found nothing. Pages read in full are shared by everyone and are not counted as any one family's."));

    var tools = el("div", "mra-tools");
    function tbtn(txt, fn) { var b = el("button", "mra-btn", txt); b.type = "button"; b.addEventListener("click", fn); tools.append(b); return b; }
    function text() { return S.story(S.build({ lines: P.lines(), marks: P.all(), scope: chosenSlugs(P.lines()), places: PLACES }), { date: new Date().toISOString().slice(0, 10) }); }
    var copy = tbtn("Copy the plan as text", function () {
      var tx = text();
      function done(ok) { copy.textContent = ok ? "Copied" : "Select and copy from the box below"; setTimeout(function () { copy.textContent = "Copy the plan as text"; }, 2500); if (!ok) { pre.hidden = false; pre.value = tx; pre.focus(); pre.select(); } }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tx).then(function () { done(true); }, function () { done(false); }); else done(false);
    });
    tbtn("Download as a note (.md)", function () {
      try {
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text()], { type: "text/markdown" })); a.download = "research-across-families.md";
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } catch (e) { pre.hidden = false; pre.value = text(); }
    });
    tbtn("Print", function () { window.print(); });
    var pre = el("textarea", "mra-pre"); pre.hidden = true; pre.readOnly = true; pre.rows = 12; pre.setAttribute("aria-label", "The plan as text");
    host.append(tools, pre);

    // ---- where they overlap
    host.append(el("h3", "mra-h3", "Where the families overlap"));
    if (!syn.sharedPlaces.length) host.append(el("p", "cap", "No place is worked by more than one of the chosen families yet."));
    syn.sharedPlaces.forEach(function (p) {
      var s = el("section", "mra-place"), h = el("h4"), a = el("a", "", p.name); a.href = BASE + "place/" + p.pid + "/"; h.append(a);
      p.slugs.forEach(function (sl) { h.append(" ", badge(nameOf[sl])); });
      s.append(h);
      if (p.sharedBooks.length) {
        var ul = el("ul", "mra-l");
        p.sharedBooks.forEach(function (r) {
          var li = el("li"); li.append(el("span", "", r.title + (r.total ? " (" + plural(r.total, "image") + ")" : "")));
          Object.keys(r.lines).sort(function (x, y) { return nameOf[x].localeCompare(nameOf[y]); }).forEach(function (sl) {
            var x = r.lines[sl]; li.append(" ", badge(nameOf[sl] + ": " + (x.state || "searched") + (x.ownPages ? ", " + plural(x.ownPages, "page") : ""), x.state ? "st-" + x.state : ""));
          });
          if (r.open.length > 1) li.append(" ", badge("one reading serves " + r.open.length, "mra-once"));
          ul.append(li);
        });
        s.append(ul);
      } else s.append(el("p", "cap", p.books.length ? "No single book is shared; the families have marked different books here." : "Each family has the place on its list; no book is marked yet."));
      host.append(s);
    });

    // ---- the plan
    host.append(el("h3", "mra-h3", "What to do, covering the most families first"));
    host.append(el("p", "cap", "A place comes first when more of the chosen families have open work there (a book or place on the to-do list, or a book part-read), then when a book is open for several of them at once, since one reading serves them all."));
    if (!syn.order.length) host.append(el("p", "cap", "Nothing is marked as planned or part-read for these families."));
    var ol = el("ol", "mra-plan");
    syn.order.forEach(function (p) {
      var li = el("li"), a = el("a", "", p.name); a.href = BASE + "place/" + p.pid + "/"; li.append(el("b", "", ""), a);
      p.openFamilies.forEach(function (sl) { li.append(" ", badge(nameOf[sl])); });
      var ul = el("ul", "mra-l");
      p.sameBookOpen.forEach(function (r) { ul.append(el("li", "", "One reading serves " + r.open.map(function (sl) { return nameOf[sl]; }).sort().join(" and ") + ": " + r.title + (r.total ? " (" + plural(r.total, "image") + ")" : ""))); });
      p.openFamilies.forEach(function (sl) {
        p.openBy[sl].filter(function (r) { return !(r.open && r.open.length > 1); }).forEach(function (r) { ul.append(el("li", "", nameOf[sl] + ": " + r.title + (r.kind === "volume" ? "" : " (" + r.kind + ")"))); });
      });
      li.append(ul); ol.append(li);
    });
    host.append(ol);

    // ---- waiting / blocked
    var oth = syn.other;
    if (oth.letters.length || oth.blocked.length) {
      host.append(el("h3", "mra-h3", "Waiting or blocked"));
      var wl = el("ul", "mra-l");
      oth.letters.forEach(function (r) { wl.append(el("li", "", "Out: " + r.title + " (" + Object.keys(r.lines).map(function (sl) { return nameOf[sl]; }).sort().join(", ") + ")")); });
      oth.blocked.forEach(function (r) { wl.append(el("li", "", "Blocked: " + r.title + " (" + Object.keys(r.lines).map(function (sl) { return nameOf[sl]; }).sort().join(", ") + ")")); });
      host.append(wl);
    }

    // ---- place by place
    host.append(el("h3", "mra-h3", "Place by place"));
    var pl = el("ul", "mra-l mra-all");
    syn.places.forEach(function (p) {
      var li = el("li"), a = el("a", "", p.name); a.href = BASE + "place/" + p.pid + "/"; li.append(a);
      p.slugs.forEach(function (sl) { li.append(" ", badge(nameOf[sl])); });
      if (p.books.length) li.append(" ", el("small", "", plural(p.books.length, "book") + " marked"));
      pl.append(li);
    });
    host.append(pl);
  }

  function visible() { return !panel.hidden; }
  function maybe() { if (visible()) draw(); }
  var t = document.getElementById("mr-t-all");
  if (t) t.addEventListener("click", function () { setTimeout(draw, 0); });
  document.addEventListener("ra-progress-changed", maybe);
  document.addEventListener("ra-scope-changed", function () { scope = readScope(); maybe(); });
  window.addEventListener("storage", function () { scope = readScope(); maybe(); });
  window.addEventListener("hashchange", function () { setTimeout(maybe, 0); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(maybe, 0); }); else setTimeout(maybe, 0);
})();
