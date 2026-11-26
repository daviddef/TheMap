/* THE RULES OF THE MAP ON MY RESEARCH, apart from the drawing, so they can be tested. The map takes its looks from the shared basemaps.js (and opens in the
 * look the Atlas home shows); what is here is what the home map does that this one did not: far out, places that would sit on top of one another become one
 * soft disc with a count, as on the home map, and the world is never drawn more than once. */
(function () {
  /* the home map's own numbers: it gathers places into discs below zoom 6, one disc to about 70 pixels */
  var CLUSTER_TO = 6, CLUSTER_PX = 70;

  /* The furthest out the map may go: the world (256 pixels at zoom 0) at least as wide and as tall as the box, to the next quarter step, so one copy fills it. */
  function minZoom(width, height) {
    var side = Math.max(+width || 0, +height || 0, 256);
    return Math.min(4, Math.ceil(Math.log(side / 256) / Math.LN2 * 4 - 1e-9) / 4);
  }

  /* Places closer together on screen than a disc would be, gathered. `at(p)` gives a place's [x, y] in pixels at the zoom being drawn. Each group keeps the
     places in their listed order; a place with no neighbour is a group of one and is drawn as its own pin. */
  function cluster(places, at, reach) {
    var groups = [];
    (places || []).forEach(function (p) {
      var q = at(p), best = null, near = reach;
      groups.forEach(function (g) {
        var d = Math.sqrt(Math.pow(g.x - q[0], 2) + Math.pow(g.y - q[1], 2));
        if (d <= near) { best = g; near = d; }
      });
      if (!best) { groups.push({ x: q[0], y: q[1], places: [p] }); return; }
      var n = best.places.length;
      best.x = (best.x * n + q[0]) / (n + 1); best.y = (best.y * n + q[1]) / (n + 1); best.places.push(p);
    });
    return groups;
  }

  /* What a disc stands for, in the legend's own words. Each place is counted once as read, in progress or planned; a find is said as well. */
  function summary(places) {
    var done = 0, part = 0, plan = 0, found = 0;
    places.forEach(function (p) { if (p.complete) done++; else if (p.flight) part++; else plan++; if (p.found) found++; });
    var bits = [];
    if (done) bits.push(done + " read to the end");
    if (part) bits.push(part + " in progress");
    if (plan) bits.push(plan + " planned");
    if (found) bits.push("found something at " + found);
    return { found: found, text: places.length + (places.length === 1 ? " place" : " places") + ": " + bits.join(", ") };
  }

  /* the disc's size, as the home map sizes its own: by how many it holds against the fullest on screen; never too small to hold its number */
  function radius(n, top) { return Math.max(13, Math.round(7 + 22 * Math.sqrt(n / Math.max(1, top)))); }

  /* The lettered «recommended next» marks, far out. Several of them can land on one spot, and on top of a disc, which left one letter showing through it.
     Marks closer together than a pin become one, labelled with the letters it holds, and a mark that would sit on a disc or a place pin moves to just below it.
     `path` is the recommended places in order (A first), `under` what is already drawn: [{x, y, r}]. Returns [{items: [indexes], label, x, y, dy}]. */
  function nextMarks(path, at, under, reach) {
    var idx = (path || []).map(function (c, i) { return { c: c, i: i }; });
    return cluster(idx, function (o) { return at(o.c); }, reach).map(function (g) {
      var items = g.places.map(function (o) { return o.i; }).sort(function (a, b) { return a - b; }), y = g.y;
      for (var again = true, n = 0; again && n < (under || []).length; n++) {
        again = false;
        under.forEach(function (d) {
          if (Math.abs(d.x - g.x) < d.r + 10 && Math.abs(d.y - y) < d.r + 10) { var low = d.y + d.r + 13; if (low > y) { y = low; again = true; } }
        });
      }
      return { items: items, label: letters(items), x: g.x, y: g.y, dy: Math.round(y - g.y) };
    });
  }
  /* "A", "A–F" for a run, "A, C" otherwise */
  function letters(items) {
    var L = items.map(function (i) { return String.fromCharCode(65 + i); });
    return items.length > 2 && items[items.length - 1] - items[0] === items.length - 1 ? L[0] + "\u2013" + L[L.length - 1] : L.join(", ");
  }

  var api = { CLUSTER_TO: CLUSTER_TO, CLUSTER_PX: CLUSTER_PX, minZoom: minZoom, cluster: cluster, summary: summary, radius: radius, nextMarks: nextMarks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.raResearchMap = api;
})();
