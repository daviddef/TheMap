/* ONE SYNOPSIS OF SEVERAL FAMILY LINES, built from what is already in the browser's progress store and nothing else.
 *
 * David: «something that allows me to see certain family lines and join my research page to be a complete synopsis of all research and show where
 * I have overlaps in volumes and destinations that cover multiple research paths… a multi family research story so I know the places and research
 * to do to cover them all.»
 *
 * This file is the arithmetic, kept free of the page so it can be tested in Node. It reads the same marks the Families & places tab reads
 * (progress-kit's `marks`: id -> { t, where, href, place, total, walked, by: { line: { done, state, note, since } } }) and answers four questions:
 *   1. where the chosen families have worked, place by place;
 *   2. where they OVERLAP: a place two or more of them work, and a book two or more of them touched or plan to;
 *   3. what is still OPEN, and which open work is the same trip or the same book for several families;
 *   4. the plan, in the order that covers the most families first, and the same thing as plain text to copy.
 *
 * ONLY WHAT WAS RECORDED. A family with no mark at a place is not «absent» there: it has not been recorded, and nothing here says otherwise.
 * Pages a book was WALKED in full are shared by every family (the kit's rule: reading a page is a fact about the page), so they count as covered
 * for each line but are never called one family's work.
 */
(function (root) {
  "use strict";

  var OPEN_STATES = { planned: 1 };

  function mergeRanges(list) {
    var r = (list || []).filter(function (x) { return x && x.length === 2 && x[0] <= x[1]; })
      .map(function (x) { return [x[0], x[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    r.forEach(function (x) {
      var last = out[out.length - 1];
      if (last && x[0] <= last[1] + 1) { if (x[1] > last[1]) last[1] = x[1]; } else out.push(x);
    });
    return out;
  }
  function pagesIn(ranges) { return (ranges || []).reduce(function (n, x) { return n + (x[1] - x[0] + 1); }, 0); }

  function placeIdOf(id, m) {
    if (m && m.place) return m.place;
    var x = String((m && m.href) || "").match(/\/place\/([^/]+)\/?/);
    if (x) return x[1];
    if (id.indexOf("place:") === 0) return id.slice(6);
    return null;
  }
  function kindOf(id) { var i = id.indexOf(":"); return i > 0 ? id.slice(0, i) : "other"; }
  function own(b) { return !!(b && ((b.done && b.done.length) || b.state || b.note)); }

  function build(input) {
    var lines = input.lines || [], marks = input.marks || {}, placeMeta = input.places || {};
    var scope = (input.scope && input.scope.length) ? input.scope : lines.map(function (l) { return l.slug; });
    var inScope = {}; scope.forEach(function (s) { inScope[s] = 1; });
    var chosen = lines.filter(function (l) { return inScope[l.slug]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var nameOf = {}; chosen.forEach(function (l) { nameOf[l.slug] = l.name; });

    var places = {}, otherRows = { letters: [], films: [], registers: [], blocked: [], loose: [] };
    var pagesByLine = {}, booksByLine = {};
    chosen.forEach(function (l) { pagesByLine[l.slug] = 0; booksByLine[l.slug] = 0; });

    Object.keys(marks).forEach(function (id) {
      var m = marks[id] || {}, kind = kindOf(id), pid = placeIdOf(id, m);
      var mine = chosen.filter(function (l) { return own(m.by && m.by[l.slug]); });
      if (!mine.length) return;
      var perLine = {};
      mine.forEach(function (l) {
        var b = m.by[l.slug] || {};
        var cov = mergeRanges((m.walked || []).concat(b.done || []));
        var ownPages = pagesIn(mergeRanges(b.done || []));
        perLine[l.slug] = { state: b.state || (ownPages ? "searched" : ""), since: b.since || "", note: b.note || "", pages: pagesIn(cov), ownPages: ownPages };
        if (kind === "volume" && ownPages) { pagesByLine[l.slug] += ownPages; booksByLine[l.slug]++; }
      });
      var row = { id: id, kind: kind, title: m.t || id, total: m.total || 0, where: m.where || "", lines: perLine,
                  walkedPages: pagesIn(mergeRanges(m.walked || [])), href: m.href || "" };
      if (!pid || kind === "source" || kind === "collection" || kind === "archive") {
        var anyBlocked = mine.some(function (l) { return perLine[l.slug].state === "blocked"; });
        if (anyBlocked) otherRows.blocked.push(row);
        else if (mine.some(function (l) { return perLine[l.slug].state === "written"; })) otherRows.letters.push(row);
        else if (kind === "film") otherRows.films.push(row);
        else if (kind === "antenati") otherRows.registers.push(row);
        else otherRows.loose.push(row);
        return;
      }
      var pl = places[pid] || (places[pid] = { pid: pid, name: "", rows: [], lines: {} });
      pl.rows.push(row);
      mine.forEach(function (l) { pl.lines[l.slug] = 1; });
    });

    var list = Object.keys(places).map(function (pid) {
      var pl = places[pid], meta = placeMeta[pid] || {};
      var fallback = pl.rows.map(function (r) { return r.where; }).filter(function (w) { return w && w !== pid && w.toLowerCase().replace(/[^a-z0-9]/g, "") !== pid.replace(/[^a-z0-9]/g, ""); })[0];
      pl.name = meta.name || fallback || pid;
      pl.slugs = Object.keys(pl.lines).sort(function (a, b) { return nameOf[a].localeCompare(nameOf[b]); });
      pl.shared = pl.slugs.length > 1;
      // a BOOK touched by two or more families, and the OPEN work, by family
      pl.books = pl.rows.filter(function (r) { return r.kind === "volume"; }).map(function (r) {
        var ls = Object.keys(r.lines);
        r.sharedBook = ls.length > 1;
        r.open = ls.filter(function (s) {
          var x = r.lines[s];
          return OPEN_STATES[x.state] || (x.ownPages > 0 && r.total && x.pages < r.total && x.state !== "exhausted" && x.state !== "found");
        });
        return r;
      });
      pl.openBy = {};   // family -> open items at this place (books planned or part-read, and a place-level plan)
      pl.books.forEach(function (r) { r.open.forEach(function (s) { (pl.openBy[s] = pl.openBy[s] || []).push(r); }); });
      pl.rows.filter(function (r) { return r.kind !== "volume"; }).forEach(function (r) {
        Object.keys(r.lines).forEach(function (s) {
          if (OPEN_STATES[r.lines[s].state]) (pl.openBy[s] = pl.openBy[s] || []).push(r);
        });
      });
      pl.openFamilies = Object.keys(pl.openBy).sort(function (a, b) { return nameOf[a].localeCompare(nameOf[b]); });
      pl.sharedBooks = pl.books.filter(function (r) { return r.sharedBook; });
      pl.sameBookOpen = pl.books.filter(function (r) { return r.open.length > 1; });
      pl.pages = pl.books.reduce(function (n, r) { return n + Object.keys(r.lines).reduce(function (k, s) { return k + r.lines[s].ownPages; }, 0); }, 0);
      return pl;
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    var sharedPlaces = list.filter(function (p) { return p.shared; });
    // THE ORDER THAT COVERS THE MOST FAMILIES FIRST: how many families have open work here, then how many books are open in more than one
    // family's name, then the open books, then the name. The place-by-place list below stays alphabetical.
    var order = list.filter(function (p) { return p.openFamilies.length; }).slice().sort(function (a, b) {
      return (b.openFamilies.length - a.openFamilies.length) || (b.sameBookOpen.length - a.sameBookOpen.length) ||
             (Object.keys(b.openBy).reduce(function (n, s) { return n + b.openBy[s].length; }, 0) - Object.keys(a.openBy).reduce(function (n, s) { return n + a.openBy[s].length; }, 0)) ||
             a.name.localeCompare(b.name);
    });

    return {
      scope: chosen.map(function (l) { return { slug: l.slug, name: l.name, where: l.where || "", books: booksByLine[l.slug], pages: pagesByLine[l.slug] }; }),
      places: list, sharedPlaces: sharedPlaces, order: order, other: otherRows,
      totals: {
        families: chosen.length, places: list.length, sharedPlaces: sharedPlaces.length,
        books: list.reduce(function (n, p) { return n + p.books.length; }, 0),
        sharedBooks: list.reduce(function (n, p) { return n + p.sharedBooks.length; }, 0),
        pages: chosen.reduce(function (n, l) { return n + pagesByLine[l.slug]; }, 0),
        openPlaces: order.length,
        sameBookOpen: list.reduce(function (n, p) { return n + p.sameBookOpen.length; }, 0)
      }
    };
  }

  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function and(names) { return names.length < 3 ? names.join(" and ") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1]; }
  function bookLine(r, nameOf) {
    var bits = Object.keys(r.lines).sort(function (a, b) { return nameOf[a].localeCompare(nameOf[b]); }).map(function (s) {
      var x = r.lines[s], say = x.state || (x.ownPages ? "searched" : "marked");
      return nameOf[s] + ": " + say + (x.ownPages ? ", " + plural(x.ownPages, "page") + (r.total ? " of " + r.total : "") : "");
    });
    return r.title + " (" + bits.join("; ") + ")" + (r.walkedPages ? " [" + plural(r.walkedPages, "page") + " read in full for everyone]" : "");
  }

  /* THE STORY, AS PLAIN TEXT TO COPY OR PRINT: the same facts as the tab, in the order a person would walk them. Markdown, so it pastes into a note. */
  function story(syn, opts) {
    opts = opts || {};
    var nameOf = {}; syn.scope.forEach(function (l) { nameOf[l.slug] = l.name; });
    var names = syn.scope.map(function (l) { return l.name; });
    var t = syn.totals, L = [];
    L.push("# Research across " + (!names.length ? "no families yet" : names.length > 5 ? plural(names.length, "family", "families") + " (" + names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more)" : and(names)));
    if (opts.date) L.push("", "Built " + opts.date + " from the marks in this browser. Only what was recorded is here: a family with nothing at a place has not been recorded there, which is not the same as having been looked and found nothing.");
    L.push("", "## At a glance", "",
      "- " + plural(t.families, "family", "families") + ", " + plural(t.places, "place") + ", " + plural(t.books, "book") + " marked, " + plural(t.pages, "page") + " read for a named family.",
      "- " + plural(t.sharedPlaces, "place") + " worked by two or more families; " + plural(t.sharedBooks, "book") + " touched by two or more.",
      "- " + plural(t.openPlaces, "place") + " with open work (planned, or part-read); " + plural(t.sameBookOpen, "book") + " open for more than one family at once, which is one reading for all of them.");
    var idle = 0;
    syn.scope.forEach(function (l) { if (!l.books && !l.pages) { idle++; return; } L.push("- " + l.name + (l.where ? " of " + l.where : "") + ": " + plural(l.books, "book") + ", " + plural(l.pages, "page") + "."); });
    if (idle) L.push("- " + plural(idle, "chosen family", "chosen families") + " with no pages recorded in any book (their marks are places, letters or plans).");

    if (syn.sharedPlaces.length) {
      L.push("", "## Where the families overlap", "");
      syn.sharedPlaces.forEach(function (p) {
        L.push("### " + p.name + " (" + and(p.slugs.map(function (s) { return nameOf[s]; })) + ")");
        if (p.sharedBooks.length) p.sharedBooks.forEach(function (r) { L.push("- " + bookLine(r, nameOf)); });
        else if (p.books.length) L.push("- No single book is shared; the families have marked different books here.");
        else L.push("- Each family has the place on its list; no book is marked yet.");
        L.push("");
      });
    }

    L.push("## What to do, covering the most families first", "");
    if (!syn.order.length) L.push("Nothing is marked as planned or part-read for these families.");
    syn.order.forEach(function (p, i) {
      L.push((i + 1) + ". **" + p.name + "**: open for " + and(p.openFamilies.map(function (s) { return nameOf[s]; })) + ".");
      if (p.sameBookOpen.length) p.sameBookOpen.forEach(function (r) { L.push("   - One reading serves " + and(r.open.map(function (s) { return nameOf[s]; })) + ": " + r.title + (r.total ? " (" + plural(r.total, "image") + ")" : "") + "."); });
      p.openFamilies.forEach(function (s) {
        var mine = p.openBy[s].filter(function (r) { return !(r.open && r.open.length > 1); });
        mine.forEach(function (r) { L.push("   - " + nameOf[s] + ": " + r.title + (r.kind === "volume" ? "" : " (" + r.kind + ")") + "."); });
      });
    });

    var oth = syn.other;
    if (oth.letters.length || oth.blocked.length) {
      L.push("", "## Waiting or blocked", "");
      oth.letters.forEach(function (r) { L.push("- Letter or request out: " + bookLine(r, nameOf)); });
      oth.blocked.forEach(function (r) { L.push("- Blocked: " + bookLine(r, nameOf)); });
    }
    L.push("", "## Place by place", "");
    syn.places.forEach(function (p) {
      L.push("- **" + p.name + "**: " + and(p.slugs.map(function (s) { return nameOf[s]; })) + (p.books.length ? "; " + plural(p.books.length, "book") + " marked" : ""));
    });
    return L.join("\n") + "\n";
  }

  var api = { build: build, story: story, mergeRanges: mergeRanges, pagesIn: pagesIn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.raSynopsis = api;
})(typeof window !== "undefined" ? window : globalThis);
