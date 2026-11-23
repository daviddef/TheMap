/* NIGHT DOTS: a fourth basemap for the Atlas main map. A dark ground and the land drawn as a regular grid of small dots, so the
   colours of the real data are the only bright thing on it. Loaded only when somebody chooses Night dots (RecordMap.astro adds
   this script and the land outlines then), so the default load carries none of it.

   HOW THE DOTS ARE MADE. The grid lives in SCREEN space: one dot every 8 css pixels, at the same pixel grid at every whole zoom,
   so a tile (256 px = 32 cells) always carries whole cells and neighbouring tiles join without a seam. Whether a cell holds a dot
   is decided by rasterising Natural Earth land outlines straight into that cell grid (a scanline fill, three samples across and
   down each cell, a dot when at least four of nine are land). Two sets of outlines, so the coasts stay recognisable as you zoom:
   110m for zoom 0-3 and 50m for zoom 4 and up. From zoom 8 the dots hand over to Esri's own dark grey tiles, which are the same
   provider and attribution as the light grey map.

   THE CATCH. On this map a grey data dot means "nobody has looked". So these dots are deliberately NOT a grey: a deep navy, about
   1.85:1 against the ground, well under half the diameter of the smallest data marker, and test/night-dots.test.js fails if the colour
   comes within reach of any access colour. A tone-on-tone texture, not data.

   Pure parts (decode, project, landCells, cellAt, the colours) are exported for the tests; everything that needs Leaflet is in
   create(). Classic script, no module, like the other files in public/js. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.raNightDots = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var GROUND = "#121b22";   /* the dark ground behind everything on this basemap */
  var DOT = "#2a4868";      /* basemap dot: 1.85:1 against GROUND, chroma 22, hue 268 in Lab; nothing like an access colour */
  var LIGHT_GROUND = "#e4e9ec";   /* Light dots: the same grid on a pale ground, for the light theme */
  var LIGHT_DOT = "#aebcc6";      /* a cool blue-grey, 1.6:1 against LIGHT_GROUND: texture, not an access colour */
  var DOT_R = 1.3;          /* css px; the smallest data marker is radius 3 plus a 1.8 px ring */
  var SPACING = 8;          /* css px between dots; must divide 256 so tiles join */
  var SUB = 3;              /* samples per cell side */
  var COVER = 4;            /* samples (of SUB*SUB) that must be land for a cell to take a dot */
  var FINE_FROM = 4;        /* zoom from which the 50m outlines are used */
  var HAND_OVER = 8;        /* zoom from which Esri's dark tiles take over from the dots */
  var LABELS_FROM = 5;      /* zoom from which place names are drawn */
  var CHUNK = 64;           /* edges per bounding-box chunk */
  var MAX_LAT = 85.0511287798;

  /* ---------- outlines: TopoJSON in, rings of Mercator [0,1] out ---------- */

  /* Natural Earth's land, as world-atlas ships it (TopoJSON, quantised, arcs delta-coded). Returns an array of rings, each an
     array of [lon, lat]. A ring that crosses 180 is already cut there by the source. */
  function decode(topo) {
    var sc = topo.transform.scale, tr = topo.transform.translate;
    var arcs = topo.arcs.map(function (a) {
      var x = 0, y = 0;
      return a.map(function (p) { x += p[0]; y += p[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; });
    });
    function ring(idx) {
      var pts = [];
      idx.forEach(function (i) {
        var a = i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
        pts = pts.concat(pts.length ? a.slice(1) : a);
      });
      return pts;
    }
    var out = [];
    var geoms = [];
    var obj = topo.objects.land || topo.objects[Object.keys(topo.objects)[0]];
    (obj.geometries || [obj]).forEach(function (g) { geoms.push(g); });
    geoms.forEach(function (g) {
      var polys = g.type === "MultiPolygon" ? g.arcs : [g.arcs];
      polys.forEach(function (poly) { poly.forEach(function (r) { out.push(ring(r)); }); });
    });
    return out;
  }

  function mercY(lat) {
    var l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180;
    return 0.5 - Math.log(Math.tan(Math.PI / 4 + l / 2)) / (2 * Math.PI);
  }

  /* Project rings to the unit square and cut each into chunks of CHUNK edges with a bounding box, so a tile only walks the
     parts of a ring that lie in its band. */
  function project(rings) {
    var world = { rings: [] };
    rings.forEach(function (r) {
      var n = r.length;
      if (n < 3) return;
      var X = new Float64Array(n), Y = new Float64Array(n);
      for (var i = 0; i < n; i++) { X[i] = (r[i][0] + 180) / 360; Y[i] = mercY(r[i][1]); }
      var chunks = [];
      for (var a = 0; a < n - 1; a += CHUNK) {
        var b = Math.min(a + CHUNK, n - 1), y0 = Infinity, y1 = -Infinity, x0 = Infinity;
        for (var k = a; k <= b; k++) { if (Y[k] < y0) y0 = Y[k]; if (Y[k] > y1) y1 = Y[k]; if (X[k] < x0) x0 = X[k]; }
        chunks.push({ a: a, b: b, y0: y0, y1: y1, x0: x0 });
      }
      world.rings.push({ X: X, Y: Y, chunks: chunks });
    });
    return world;
  }

  /* ---------- the mask: which cells of one tile hold a dot ---------- */

  /* Returns a Uint8Array of n*n (n = 256/spacing), 1 where the cell is land. Deterministic: the same outlines, zoom and tile
     always give the same cells, and tile (x) is wrapped so the world's copies agree. */
  function landCells(world, z, x, y, o) {
    o = o || {};
    var S = o.spacing || SPACING, K = o.sub || SUB, need = o.cover || COVER;
    var n = 256 / S, rows = n * K, step = S / K, N = Math.pow(2, z);
    var wx = ((x % N) + N) % N;
    var cnt = new Uint8Array(n * n);
    var ty0 = y / N, ty1 = (y + 1) / N, tx1 = (wx + 1) / N;
    var xs = new Array(rows), r, c, i, k, j;
    for (k = 0; k < rows; k++) xs[k] = null;
    for (r = 0; r < world.rings.length; r++) {
      var R = world.rings[r], X = R.X, Y = R.Y;
      for (c = 0; c < R.chunks.length; c++) {
        var ch = R.chunks[c];
        if (ch.y1 < ty0 || ch.y0 >= ty1 || ch.x0 > tx1) continue;
        for (i = ch.a; i < ch.b; i++) {
          var ay = (Y[i] * N - y) * 256, by = (Y[i + 1] * N - y) * 256;
          if (ay === by) continue;
          var lo = ay < by ? ay : by, hi = ay < by ? by : ay;
          var k0 = Math.ceil(lo / step - 0.5), k1 = Math.ceil(hi / step - 0.5) - 1;
          if (k0 < 0) k0 = 0;
          if (k1 > rows - 1) k1 = rows - 1;
          if (k0 > k1) continue;
          var ax = (X[i] * N - wx) * 256, bx = (X[i + 1] * N - wx) * 256;
          for (k = k0; k <= k1; k++) {
            var t = ((k + 0.5) * step - ay) / (by - ay);
            (xs[k] || (xs[k] = [])).push(ax + (bx - ax) * t);
          }
        }
      }
    }
    for (k = 0; k < rows; k++) {
      var row = xs[k];
      if (!row) continue;
      row.sort(function (p, q) { return p - q; });
      /* Outlines that start to the right of the tile were skipped, so an odd count means the land runs on past the tile's edge. */
      if (row.length % 2) row.push(1e9);
      var base = ((k / K) | 0) * n;
      for (j = 0; j + 1 < row.length; j += 2) {
        var c0 = Math.ceil(row[j] / step - 0.5), c1 = Math.ceil(row[j + 1] / step - 0.5) - 1;
        if (c0 < 0) c0 = 0;
        if (c1 > rows - 1) c1 = rows - 1;
        for (var cc = c0; cc <= c1; cc++) cnt[base + ((cc / K) | 0)]++;
      }
    }
    var out = new Uint8Array(n * n);
    for (i = 0; i < out.length; i++) out[i] = cnt[i] >= need ? 1 : 0;
    return out;
  }

  /* Which tile, and which cell of it, a place falls in at a zoom. */
  function cellOf(lon, lat, z, spacing) {
    var S = spacing || SPACING, N = Math.pow(2, z);
    var px = ((lon + 180) / 360) * N * 256, py = mercY(lat) * N * 256;
    var tx = Math.floor(px / 256), ty = Math.floor(py / 256), n = 256 / S;
    return { x: tx, y: ty, col: Math.floor((px - tx * 256) / S), row: Math.floor((py - ty * 256) / S), n: n };
  }
  /* Is there a dot at this place at this zoom? (A cell is one dot wide, so on a coast a place can sit in a sea cell.) */
  function dotAt(world, lon, lat, z, o) {
    var c = cellOf(lon, lat, z, o && o.spacing);
    return landCells(world, z, c.x, c.y, o)[c.row * c.n + c.col] === 1;
  }

  /* Which outline set a zoom wants. */
  function setFor(z) { return z >= FINE_FROM ? "fine" : "coarse"; }

  /* How the two layers share a zoom: the dots are shown below HAND_OVER, Esri's dark tiles from it; the names from LABELS_FROM. */
  function plan(z) {
    return { dots: z < HAND_OVER, dark: z >= HAND_OVER, labels: z >= LABELS_FROM };
  }

  /* ---------- Leaflet ---------- */

  /* create(L, opts) -> a layer. opts: { dir: URL of the folder holding land-110m.json and land-50m.json,
     labelsPane: pane name for the place names, reduce: boolean | function, fetch: for tests }. */
  function create(L, opts) {
    opts = opts || {};
    var DIR = (opts.dir || "").replace(/\/?$/, "/");
    var sets = { coarse: null, fine: null }, pending = { coarse: null, fine: null };
    var cache = {}, cacheOrder = [];
    var dpr = Math.min(2, Math.max(1, (typeof window !== "undefined" && window.devicePixelRatio) || 1));
    function reduced() {
      if (typeof opts.reduce === "function") return !!opts.reduce();
      return !!opts.reduce;
    }

    function load(which) {
      if (sets[which]) return Promise.resolve(sets[which]);
      if (pending[which]) return pending[which];
      var file = which === "fine" ? "land-50m.json" : "land-110m.json";
      pending[which] = fetch(DIR + file).then(function (r) { if (!r.ok) throw new Error(file); return r.json(); })
        .then(function (t) { sets[which] = project(decode(t)); return sets[which]; })
        .catch(function (e) { pending[which] = null; throw e; });
      return pending[which];
    }

    function cells(which, z, x, y) {
      var key = which + z + "/" + (((x % Math.pow(2, z)) + Math.pow(2, z)) % Math.pow(2, z)) + "/" + y;
      var m = cache[key];
      if (!m) {
        m = landCells(sets[which], z, x, y);
        cache[key] = m; cacheOrder.push(key);
        if (cacheOrder.length > 600) delete cache[cacheOrder.shift()];
      }
      return m;
    }

    var light = !!opts.light;
    function paint(tile, coords) {
      var which = setFor(coords.z);
      if (!sets[which]) return false;
      var m = cells(which, coords.z, coords.x, coords.y), n = 256 / SPACING;
      var g = tile.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = light ? LIGHT_DOT : DOT;
      g.beginPath();
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) {
        if (!m[j * n + i]) continue;
        var cx = (i + 0.5) * SPACING, cy = (j + 0.5) * SPACING;
        g.moveTo(cx + DOT_R, cy);
        g.arc(cx, cy, DOT_R, 0, 6.2832);
      }
      g.fill();
      return true;
    }

    var Dots = L.GridLayer.extend({
      options: { tileSize: 256, maxNativeZoom: HAND_OVER - 1, className: "ra-nd-dots", updateWhenZooming: false, keepBuffer: 1 },
      createTile: function (coords, done) {
        var tile = L.DomUtil.create("canvas", "ra-nd-tile");
        tile.width = 256 * dpr; tile.height = 256 * dpr;
        var which = setFor(coords.z);
        /* A tile's cells take about a tenth of a millisecond (measured, 50m outlines), so they are drawn on the spot: no tile
           ever arrives blank and pops in. Only the first time, while the outlines are still being fetched, is a tile late. */
        /* done() waits a tick: Leaflet files the tile only after createTile returns, and a done() before that is ignored. */
        if (sets[which]) { paint(tile, coords); setTimeout(function () { done(null, tile); }, 0); }
        else load(which).then(function () { if (!tile._dead) paint(tile, coords); done(null, tile); }, function () { done(null, tile); });
        return tile;
      }
    });

    var Night = L.Layer.extend({
      options: { attribution: "Land &copy; Natural Earth &middot; Esri, HERE, Garmin &middot; &copy; OpenStreetMap contributors" },
      initialize: function () {
        this._dots = new Dots({ attribution: "" });
        this._dark = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_" + (light ? "Light" : "Dark") + "_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          { className: light ? "ra-nd-light" : "ra-nd-dark", maxNativeZoom: 16, maxZoom: 18 });
        this._names = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_" + (light ? "Light" : "Dark") + "_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          { pane: opts.labelsPane || "overlayPane", minZoom: LABELS_FROM, maxNativeZoom: 16, maxZoom: 18, className: "ra-nd-names" });
        this._timer = null;
      },
      onAdd: function (map) {
        this._map = map;
        map.getContainer().classList.add(light ? "ra-lightdots" : "ra-night");
        map.on("zoomanim", this._anim, this);
        map.on("zoomend", this._end, this);
        this._apply(map.getZoom(), true);
        if (setFor(map.getZoom()) === "fine") load("fine").then(this._redraw.bind(this), function () {});
        load("coarse").then(this._redraw.bind(this), function () {});
      },
      onRemove: function (map) {
        clearTimeout(this._timer);
        map.off("zoomanim", this._anim, this);
        map.off("zoomend", this._end, this);
        map.getContainer().classList.remove(light ? "ra-lightdots" : "ra-night");
        [this._dots, this._dark, this._names].forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); });
      },
      bringToBack: function () {
        [this._names, this._dark, this._dots].forEach(function (l) { if (l && this._map && this._map.hasLayer(l)) l.bringToBack(); }, this);
        return this;
      },
      _redraw: function () { if (this._map && this._map.hasLayer(this._dots)) this._dots.redraw(); },
      _anim: function (e) { this._apply(e.zoom, false); },
      _end: function () { this._apply(this._map.getZoom(), false); },
      /* The dots show below HAND_OVER, Esri's dark tiles from it, and the two cross over as the zoom lands. With reduced motion
         there is no fade: whichever one is wanted is simply the one on the map. */
      _apply: function (z, first) {
        var map = this._map, p = plan(z), still = reduced(), self = this;
        if (setFor(z) === "fine" && !sets.fine) load("fine").then(this._redraw.bind(this), function () {});
        function put(l, on) { if (on && !map.hasLayer(l)) map.addLayer(l); }
        if (p.dots) { clearTimeout(this._timer); put(this._dots, true); this._dots.setOpacity(1); }
        if (p.dark) { put(this._dark, true); this._dark.setOpacity(1); }
        if (p.labels) put(this._names, true); else if (map.hasLayer(this._names)) map.removeLayer(this._names);
        if (!p.dark && map.hasLayer(this._dark)) {
          if (still || first) map.removeLayer(this._dark);
          else { this._dark.setOpacity(0); setTimeout(function () { if (!plan(map.getZoom()).dark && map.hasLayer(self._dark)) map.removeLayer(self._dark); }, 450); }
        }
        if (!p.dots && map.hasLayer(this._dots)) {
          if (still || first) map.removeLayer(this._dots);
          else {
            this._dots.setOpacity(0);
            clearTimeout(this._timer);
            this._timer = setTimeout(function () { if (!plan(map.getZoom()).dots && map.hasLayer(self._dots)) map.removeLayer(self._dots); }, 450);
          }
        }
        this.bringToBack();
      }
    });
    var layer = new Night();
    layer._load = load; layer._cells = cells;
    return layer;
  }

  return {
    GROUND: GROUND, DOT: DOT, LIGHT_GROUND: LIGHT_GROUND, LIGHT_DOT: LIGHT_DOT, DOT_R: DOT_R, SPACING: SPACING, SUB: SUB, COVER: COVER, FINE_FROM: FINE_FROM,
    HAND_OVER: HAND_OVER, LABELS_FROM: LABELS_FROM,
    decode: decode, project: project, landCells: landCells, cellOf: cellOf, dotAt: dotAt, setFor: setFor, plan: plan, mercY: mercY,
    create: create
  };
});
