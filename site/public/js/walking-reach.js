/* WALKING REACH: how far a person could walk from a place in a given time, round the sea and over (or round) the hills.

   The map's neighbours used to be a circle: as the crow flies, over water and across ridges. A researcher planning where to look walks, so the
   shape that matters is the ground that can be reached on foot. This works it out from terrain tiles (Terrarium elevation tiles, read in the
   browser), with Tobler's hiking function for speed: about 5 km/h on the flat, slower uphill, slower again steeply downhill. The sea cannot be
   walked and a cliff cannot be climbed, so they are left out.

   WHAT IT IS NOT. It is a reach, not a boundary. Old parishes and jurisdictions did not follow terrain, rivers are not bridges, lakes show as
   flat ground, and a road makes a valley faster than this says. It is for «where is it sensible to look», never for «where the records are».

   The computation (field, outline, simplify) takes plain arrays and is tested in node; compute() adds the tiles and the map projection.
   Elevation tiles: https://registry.opendata.aws/terrain-tiles/ (Mapzen terrain tiles: SRTM, EU-DEM, NED, GMTED, ETOPO1 and others). */
(function (root) {
  "use strict";

  var TILE_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
  var Z = 10, MAX_TILES = 49, KMH_MAX = 6.1, STEEP = 0.7, SEA = 0;

  /* Tobler's hiking function, km/h for a slope given as rise over run (0.1 = 10% uphill). The fastest walking is a slight downhill. */
  function tobler(s) { return 6 * Math.exp(-3.5 * Math.abs(s + 0.05)); }

  /* ---- a small binary min-heap on (time, cell), lazy deletion ---- */
  function Heap(cap) { this.t = new Float32Array(cap); this.c = new Int32Array(cap); this.n = 0; }
  Heap.prototype.push = function (t, c) {
    if (this.n === this.t.length) {
      var t2 = new Float32Array(this.n * 2), c2 = new Int32Array(this.n * 2);
      t2.set(this.t); c2.set(this.c); this.t = t2; this.c = c2;
    }
    var i = this.n++, T = this.t, C = this.c;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (T[p] <= t) break;
      T[i] = T[p]; C[i] = C[p]; i = p;
    }
    T[i] = t; C[i] = c;
  };
  Heap.prototype.pop = function () {
    var T = this.t, C = this.c, top = C[0], tt = T[0], n = --this.n;
    if (n > 0) {
      var t = T[n], c = C[n], i = 0;
      for (;;) {
        var l = 2 * i + 1;
        if (l >= n) break;
        var r = l + 1, m = (r < n && T[r] < T[l]) ? r : l;
        if (T[m] >= t) break;
        T[i] = T[m]; C[i] = C[m]; i = m;
      }
      T[i] = t; C[i] = c;
    }
    this.lastT = tt;
    return top;
  };

  /* Walking time in hours from the start cell to every cell, up to maxHours (Infinity where not reached).
     elev: Float32Array(w*h) metres; cell: metres across one cell. A cell at or below `sea` is water and cannot be entered. */
  function field(elev, w, h, cell, sx, sy, maxHours, sea) {
    sea = sea == null ? SEA : sea;
    var time = new Float32Array(w * h).fill(Infinity), done = new Uint8Array(w * h);
    /* sixteen directions, not eight: with eight, flat ground comes out as an octagon. A knight's move may not jump a strip of water, so both
       cells it passes between must be land. */
    var heap = new Heap(4096), s = sy * w + sx;
    var dx = [1, 1, 0, -1, -1, -1, 0, 1, 2, 2, 1, -1, -2, -2, -1, 1];
    var dy = [0, 1, 1, 1, 0, -1, -1, -1, 1, -1, -2, -2, -1, 1, 2, 2];
    var dist = [], k;
    for (k = 0; k < 16; k++) dist.push(cell * Math.hypot(dx[k], dy[k]));
    time[s] = 0; heap.push(0, s);
    while (heap.n) {
      var c = heap.pop();
      if (done[c]) continue;
      done[c] = 1;
      var t0 = time[c], cx = c % w, cy = (c - cx) / w, e0 = elev[c];
      for (k = 0; k < 16; k++) {
        var nx = cx + dx[k], ny = cy + dy[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var n = ny * w + nx;
        if (done[n]) continue;
        var e1 = elev[n];
        if (e1 <= sea) continue;
        if (k >= 8) {
          var m1, m2;
          if (dx[k] === 2 || dx[k] === -2) { m1 = cy * w + cx + dx[k] / 2; m2 = (cy + dy[k]) * w + cx + dx[k] / 2; }
          else { m1 = (cy + dy[k] / 2) * w + cx; m2 = (cy + dy[k] / 2) * w + cx + dx[k]; }
          if (elev[m1] <= sea || elev[m2] <= sea) continue;
        }
        var slope = (e1 - e0) / dist[k];
        if (slope > STEEP || slope < -STEEP) continue;
        var t1 = t0 + dist[k] / 1000 / tobler(slope);
        if (t1 > maxHours || t1 >= time[n]) continue;
        time[n] = t1; heap.push(t1, n);
      }
    }
    return time;
  }

  /* The outer outline of the reached cells, as corner coordinates [x, y] (x to the right, y down), the loop with the largest area.
     Unreached cells inside it (a hole the walk went round) are filled: the shape is where you could get to and back from. */
  function outline(time, w, h, maxHours) {
    var inn = function (x, y) { return x >= 0 && y >= 0 && x < w && y < h && time[y * w + x] <= maxHours; };
    var W = w + 1, out = {}, x, y;
    function add(ax, ay, bx, by) { var k = ay * W + ax; (out[k] || (out[k] = [])).push([bx, by, 0]); }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (!inn(x, y)) continue;
      if (!inn(x, y - 1)) add(x, y, x + 1, y);
      if (!inn(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inn(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inn(x - 1, y)) add(x, y + 1, x, y);
    }
    var best = null, bestA = 0, key;
    for (key in out) {
      var kk = +key, sx0 = kk % W, sy0 = (kk - sx0) / W, list = out[key];
      for (var i = 0; i < list.length; i++) {
        if (list[i][2]) continue;
        var loop = [], cx = sx0, cy = sy0, cur = list[i], guard = 0;
        for (;;) {
          loop.push([cx, cy]); cur[2] = 1;
          var ex = cur[0], ey = cur[1];
          if (ex === sx0 && ey === sy0) break;
          var nxt = out[ey * W + ex];
          if (!nxt) break;
          var free = nxt.filter(function (e) { return !e[2]; });
          if (!free.length) break;
          if (free.length > 1) {          /* two edges leave a corner where cells touch diagonally: turn right, so the loop stays simple */
            var ddx = ex - cx, ddy = ey - cy;
            free.sort(function (p, q) { return cross(ddx, ddy, p[0] - ex, p[1] - ey) - cross(ddx, ddy, q[0] - ex, q[1] - ey); });
            cur = free[free.length - 1];
          } else cur = free[0];
          cx = ex; cy = ey;
          if (++guard > 4 * w * h + 8) break;
        }
        var ar = Math.abs(area(loop));
        if (ar > bestA) { bestA = ar; best = loop; }
      }
    }
    return best || [];
  }
  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  function area(p) { var a = 0; for (var i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]); return a / 2; }

  /* Douglas-Peucker on a closed loop: split at the two points furthest apart so the seam is not a corner of its own. */
  function simplify(pts, tol) {
    if (pts.length < 8) return pts.slice();
    var a = 0, b = 0, best = -1, i;
    for (i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; b = i; } }
    var first = dp(pts.slice(a, b + 1), tol), second = dp(pts.slice(b).concat([pts[0]]), tol);
    return first.slice(0, -1).concat(second.slice(0, -1));
  }
  function dp(p, tol) {
    if (p.length < 3) return p;
    var a = p[0], b = p[p.length - 1], maxd = -1, mi = 0, i;
    for (i = 1; i < p.length - 1; i++) {
      var d = segDist(p[i], a, b);
      if (d > maxd) { maxd = d; mi = i; }
    }
    if (maxd <= tol) return [a, b];
    return dp(p.slice(0, mi + 1), tol).slice(0, -1).concat(dp(p.slice(mi), tol));
  }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    var t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  /* ---- Web Mercator tile maths ---- */
  function px(lon, z) { return (lon + 180) / 360 * Math.pow(2, z) * 256; }
  function py(lat, z) { var s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * 256; }
  function lonOf(x, z) { return x / (Math.pow(2, z) * 256) * 360 - 180; }
  function latOf(y, z) { var n = Math.PI - 2 * Math.PI * y / (Math.pow(2, z) * 256); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

  function loadTile(z, x, y) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("terrain tile " + z + "/" + x + "/" + y)); };
      img.src = TILE_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    });
  }

  /* opts: { lat, lon, hours }. Resolves { hours, ring: [[lat, lon], ...], timeAt(lat, lon) -> hours | null, clamped } or rejects. */
  function compute(opts) {
    var lat = opts.lat, lon = opts.lon, hours = opts.hours, clamped = false;
    var cosl = Math.cos(lat * Math.PI / 180), mpp = 156543.03392 * cosl / Math.pow(2, Z);
    var tx0, tx1, ty0, ty1, R;
    for (;;) {
      R = hours * KMH_MAX + 1;
      var dLat = R / 111.32, dLon = R / (111.32 * cosl);
      tx0 = Math.floor(px(lon - dLon, Z) / 256); tx1 = Math.floor(px(lon + dLon, Z) / 256);
      ty0 = Math.floor(py(Math.min(85, lat + dLat), Z) / 256); ty1 = Math.floor(py(Math.max(-85, lat - dLat), Z) / 256);
      if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= MAX_TILES || hours <= 1) break;
      hours -= 1; clamped = true;
    }
    var nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, jobs = [], tx, ty;
    for (ty = ty0; ty <= ty1; ty++) for (tx = tx0; tx <= tx1; tx++) jobs.push(loadTile(Z, tx, ty));
    return Promise.all(jobs).then(function (imgs) {
      var cv = document.createElement("canvas"); cv.width = nx * 256; cv.height = ny * 256;
      var cx = cv.getContext("2d", { willReadFrequently: true });
      imgs.forEach(function (im, i) { cx.drawImage(im, (i % nx) * 256, Math.floor(i / nx) * 256); });
      var data = cx.getImageData(0, 0, cv.width, cv.height).data;
      /* two pixels to a cell: smooths the speckle in the source and keeps the grid small */
      var K = 2, w = Math.floor(cv.width / K), h = Math.floor(cv.height / K), elev = new Float32Array(w * h), x, y, a, b, o;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var sum = 0;
        for (a = 0; a < K; a++) for (b = 0; b < K; b++) {
          o = ((y * K + a) * cv.width + (x * K + b)) * 4;
          sum += data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
        }
        elev[y * w + x] = sum / (K * K);
      }
      var ox = tx0 * 256, oy = ty0 * 256, cell = mpp * K;
      var sx = Math.floor((px(lon, Z) - ox) / K), sy = Math.floor((py(lat, Z) - oy) / K);
      /* a town on the shore can sit on a cell the tiles call sea: start from the nearest cell that is land */
      var found = null, rad;
      for (rad = 0; rad < 12 && !found; rad++) {
        for (y = -rad; y <= rad && !found; y++) for (x = -rad; x <= rad; x++) {
          if (Math.max(Math.abs(x), Math.abs(y)) !== rad) continue;
          var cx2 = sx + x, cy2 = sy + y;
          if (cx2 >= 0 && cy2 >= 0 && cx2 < w && cy2 < h && elev[cy2 * w + cx2] > SEA) { found = [cx2, cy2]; break; }
        }
      }
      if (!found) throw new Error("no land near the place");
      var time = field(elev, w, h, cell, found[0], found[1], hours, SEA);
      var loop = simplify(outline(time, w, h, hours), 0.8);
      var ring = loop.map(function (p) { return [latOf(oy + p[1] * K, Z), lonOf(ox + p[0] * K, Z)]; });
      return {
        hours: hours, clamped: clamped, ring: ring,
        timeAt: function (la, lo) {
          var cxx = Math.floor((px(lo, Z) - ox) / K), cyy = Math.floor((py(la, Z) - oy) / K);
          if (cxx < 0 || cyy < 0 || cxx >= w || cyy >= h) return null;
          var t = time[cyy * w + cxx];
          return isFinite(t) ? t : null;
        }
      };
    });
  }

  root.raReach = { tobler: tobler, field: field, outline: outline, simplify: simplify, compute: compute, area: area, hoursText: hoursText };

  /* «1 h 20 min», «45 min» */
  function hoursText(t) {
    var m = Math.round(t * 60);
    if (m < 5) return "a few minutes";
    if (m < 60) return (Math.round(m / 5) * 5) + " min";
    var hh = Math.floor(m / 60), mm = Math.round((m % 60) / 5) * 5;
    if (mm === 60) { hh++; mm = 0; }
    return hh + " h" + (mm ? " " + mm + " min" : "");
  }
})(typeof window !== "undefined" ? window : this);
