/* The loading screen for reading a family tree file: a tree grows and the people it finds fly onto it as cards that turn into leaves, near-identical cards are stamped
   and merged, flags go up at the end. It follows the reader's real progress messages (public/roots/js/pipeline.js says them), so a slow step is a slow step; the real
   message stays in small type under the bar. Everything drawn here is invented: the names on the cards are a fixed list, never a name from the visitor's file, and
   nothing from the file reaches this script except the progress message, which names a stage and a country code and a count. After the tree is built the scene turns to
   a dotted map of the world: pins drop on it (the step that puts the places on the map), then dashed routes draw themselves between them and a little suitcase travels
   along (the step that counts who moved). The pins and routes are a fixed set of well-known cities, the same for everybody, and never a place from the visitor's file.
   The stage on show follows the real stage but one step at a time, each for at least DWELL seconds, so a step the reader does in a few milliseconds can still be seen;
   the real message under the bar is never delayed.
   Used by /tree-canvas/ and /roots/. Both pages' policy is script-src and style-src 'self', so this is a plain script and a stylesheet it links itself.
   API: RALoad.say(message) shows or updates the screen (after a short delay, so a quick read never flashes it), RALoad.hide() lets the tree finish and fades it. */
(function () {
  var STAGES = [
    { k: 'Unfolding your file', s: 'Read', j: ['Blowing the dust off your ancestors.', 'Reading small print written by somebody’s great-aunt.', 'Your file is clearing its throat.'] },
    { k: 'Counting heads', s: 'Find', j: ['Found a John. Found another John. Found nine Johns.', 'Everyone is somebody’s cousin. Counting.', 'Sorting the living from the legendary.'] },
    { k: 'Unrolling the map', s: 'Atlas', j: ['Asking the Atlas what Fiume was called in 1910.', 'Dusting off a few hundred thousand villages.', 'The Atlas is putting its glasses on.'] },
    { k: 'Pinning places', s: 'Place', j: ['Salisbury or Harare? Yes.', 'Five spellings, one village. Diplomacy in progress.', 'Telling the Austro-Hungarian Empire we’ve moved.'] },
    { k: 'Crunching relationships', s: 'Build', j: ['Checking nobody is their own grandfather.', 'Merging the two Marias who were obviously the same Maria.', 'Introducing second cousins at a safe distance.'] },
    { k: 'Drawing the map', s: 'Map', j: ['Teaching the Atlas where Imotski is.', 'Pins go in, strings come out.', 'Checking that nobody was born in the sea. Mostly.'] },
    { k: 'Tracing the journeys', s: 'Moves', j: ['Great-grandfather: three borders, one ocean.', 'How far will a family go for a better harvest?', 'Counting everyone who packed a suitcase.'] },
    { k: 'Raising the flags', s: 'Flags', j: ['Whose flag flew over the church that year? Ahem.', 'Borders have moved. Again.', 'Ironing the flags.'] }];
  var SAY = ['Allegedly born 1872.', 'I moved twice. Nobody asked me.', 'Please stop calling me “unknown”.', 'Yes, that is my real surname.', 'I had eleven siblings and one ledger.', 'My spelling is a work in progress.', 'Spotted in two registers. Suspicious.', 'I was never in Salisbury. Probably.'];
  var NM = ['Maria', 'Ivan', 'Giovanni', 'Anna', 'Josip', 'Katarina', 'Johann', 'Rosa', 'Luka', 'Elisabeth', 'Marija', 'Antonio'];
  var SN = ['Kovač', 'Rossi', 'Novak', 'Bianchi', 'Horvat', 'Mayer'];
  var PL = ['Senj', 'Rijeka', 'Imotski', 'Trieste', 'Gallignana', 'Pomer'];
  var PAL = ['#6FB3C4', '#D2A860', '#7CC293', '#E08A76', '#B79AE0', '#7DD3C0', '#F2A65A', '#E7E5DE'];
  var W = 680, H = 300, DELAY = 350, DWELL = 0.45;
  /* the world, as dots: 38 rows of 100 columns (3.6 degrees each, from 80 N), one hex string per row; then the fixed pins (lon, lat) and the routes between them (pin, pin) */
  var MASK = ["000001fbfff80380000e00000", "0000eaf03ff80000707fe0c00", "07c3ff7e1ff000c047fffffc2", "cfffffe71fc003fbfffffffff", "0fffffa71e0c0ffffffffffff", "0fffff0e04001efffffffffbc", "000fffcf8000ceffffffff860", "0003ffffc001dfffffffffc40", "0001ffffe0007fffffffffc00", "0001ffff00007fffffffff800", "0001fffc0001e7f7fffffe000", "0000fff80001c2ff7ffff4800", "0000fff80000f80ffffff5800", "00007ff00001fffffffff0000", "00003e100003fffffffff0000", "00001e100007ffffdfffe0000", "000006400007ffffe3ef80000", "000003c00007fffbc38f10000", "000000600007fffe018780000", "000000378003fffd010508000", "0000000fe001ffff000220000", "0000000ff0000ffe000660000", "0000000ff8000ffc0002f0800", "0000001fff0007f8000211e00", "0000000fff0007f80000c0200", "0000000fff0007fc000003400", "00000007fe0007f900000f400", "00000003fe0007f300001fe00", "00000003fe0003f300003ff00", "00000003f80003e000007ff80", "00000003f00001e000003ff80", "00000003e00001c0000039f00", "00000003c0000000000000f00", "0000000780000000000000002", "000000070000000000000000c", "0000000700000000000000000", "0000000600000000000000000", "0000000200000000000000000"];
  var PINS = [[14.4, 45.3], [-6.3, 53.3], [10, 53.5], [-74, 40.7], [-87.6, 41.9], [-58.4, -34.6], [28, -26.2], [151.2, -33.9], [115.9, -32]];
  var ARCS = [[0, 3], [0, 5], [1, 4], [2, 7], [0, 6], [3, 4], [6, 8], [0, 8]];
  var MX = 20, MY = 10, MK = 640 / 360;      /* where the map sits on the canvas, and pixels per degree */

  /* which stage a progress message belongs to, and how far through it is (only the places step says); null for any other message (it is shown, and the tree waits) */
  function stageOf(msg) {
    var m = String(msg || '').replace(/…|\.\.\.$/g, '').trim(), r;
    if (/^Reading (the|your) file/.test(m)) return { i: 0 };
    if (/^Finding people/.test(m)) return { i: 1 };
    if (/^Reading the Atlas/.test(m)) return { i: 2 };
    if ((r = /^Loading the \S+ places \((\d+) of (\d+)\)/.exec(m))) return { i: 3, p: Math.min(0.95, (+r[1]) / Math.max(1, +r[2])) };
    if (/^Placing /.test(m)) return { i: 3 };
    if (/^Building the tree/.test(m)) return { i: 4 };
    if (/^Putting .+ on the map/.test(m)) return { i: 5 };
    if (/^Tracing journeys/.test(m)) return { i: 6 };
    if (/^Drawing flags/.test(m)) return { i: 7 };
    return null;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { stageOf: stageOf, STAGES: STAGES, WORLD: { mask: MASK, pins: PINS, arcs: ARCS } };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var el = null, cv, ctx, ttl, jk, bar, real, scale = 1, raf = 0, timer = 0, outT = 0;
  var shown = false, pending = false, ending = false, endAt = 0;
  var stage = 0, sub = 0.3, gd = 0, tm = 0, last = 0, launch = {}, leaves = [], sel = null, say_ = '', sayT = 0, msg = 'Starting';
  var ss = 0, ssAt = 0, tAt = [], la = 0, doneAt = -1, land = null, nPins = 0, nArcs = 0;      /* ss: the stage on show; tAt: when each was reached; la: how much of the map is showing */
  var still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var cl = function (x, a, b) { return Math.max(a, Math.min(b, x)); }, ez = function (x) { return 1 - Math.pow(1 - x, 3); };

  function build() {
    if (el) return;
    var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/js/load-tree.css'; document.head.appendChild(link);
    el = document.createElement('div'); el.className = 'lt'; el.hidden = true; el.id = 'ra-lt';
    el.innerHTML = '<div class="lt-card"><canvas class="lt-cv" aria-hidden="true"></canvas><div class="lt-title" aria-hidden="true"></div><div class="lt-joke" aria-hidden="true"></div>' +
      '<div class="lt-bar" aria-hidden="true"><i></i></div><div class="lt-real" role="status" aria-live="polite"></div></div>';
    document.body.appendChild(el);
    cv = el.querySelector('canvas'); ctx = cv.getContext('2d'); ttl = el.querySelector('.lt-title'); jk = el.querySelector('.lt-joke'); bar = el.querySelector('.lt-bar i'); real = el.querySelector('.lt-real');
    if (still) cv.hidden = true;
    cv.addEventListener('click', function (e) {
      var r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale, hit = null;
      leaves.forEach(function (l) { if (Math.hypot(l.x - x, l.y - y) < l.r + 3) hit = l; });
      if (hit) { sel = hit; say_ = NM[hit.i % 12] + ' ' + SN[hit.i % 6] + ': ' + SAY[hit.i % 8]; sayT = 3; }
    });
    window.addEventListener('resize', fit);
  }
  function fit() {
    if (!cv || still) return; var w = cv.clientWidth || W, d = window.devicePixelRatio || 1; scale = w / W;
    cv.width = w * d; cv.height = H * scale * d; cv.style.height = (H * scale) + 'px'; ctx.setTransform(scale * d, 0, 0, scale * d, 0, 0);
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

  /* the map: a veil over the tree, the world in dots, pins that drop one after another, then dashed routes that draw themselves with a suitcase travelling along */
  function pinAt(i) { return [MX + (PINS[i][0] + 180) * MK, MY + (80 - PINS[i][1]) * MK]; }
  function bez(a, b, t) {
    var cx = (a[0] + b[0]) / 2, cy = Math.min(a[1], b[1]) - Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.28 - 8, u = 1 - t;
    return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
  }
  function mapLayer() {
    if (la < 0.01) return;
    if (!land) {
      land = [];
      MASK.forEach(function (row, r) { for (var c = 0; c < 100; c++) if (parseInt(row.charAt(c >> 2), 16) >> (3 - (c & 3)) & 1) land.push([MX + (c + 0.5) * 6.4, MY + (r + 0.5) * 6.4]); });
    }
    var mt = tm - (tAt[5] === undefined ? tm : tAt[5]), jt = tAt[6] === undefined ? -1 : tm - tAt[6], i, k, q;
    ctx.fillStyle = 'rgba(32,28,23,' + (0.74 * la) + ')'; ctx.fillRect(0, 0, W, H - 22);
    ctx.globalAlpha = la; ctx.fillStyle = '#5E6B73';
    for (i = 0; i < land.length; i++) ctx.fillRect(land[i][0] - 1.1, land[i][1] - 1.1, 2.2, 2.2);
    nPins = 0; nArcs = 0;
    for (k = 0; k < ARCS.length; k++) {
      q = cl((jt - k * 0.04) / 0.45, 0, 1); if (q <= 0) continue; nArcs++;
      var a = pinAt(ARCS[k][0]), b = pinAt(ARCS[k][1]), n = Math.max(2, Math.round(q * 30)), e = ez(q);
      ctx.strokeStyle = '#6FB3C4'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -tm * 14; ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      for (i = 1; i <= n; i++) { var pt = bez(a, b, e * i / n); ctx.lineTo(pt[0], pt[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      var tp = q < 1 ? e : (tm * 0.32 + k * 0.29) % 1, c = bez(a, b, tp);
      ctx.fillStyle = 'rgba(242,166,90,.28)'; ctx.beginPath(); ctx.arc(c[0], c[1], 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#F2A65A'; rr(c[0] - 4, c[1] - 3, 8, 6, 1.2); ctx.fill();
      ctx.strokeStyle = '#F2A65A'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(c[0] - 1.6, c[1] - 3); ctx.lineTo(c[0] - 1.6, c[1] - 4.6); ctx.lineTo(c[0] + 1.6, c[1] - 4.6); ctx.lineTo(c[0] + 1.6, c[1] - 3); ctx.stroke();
    }
    for (i = 0; i < PINS.length; i++) {
      var t0 = 0.03 + i * 0.045; q = cl((mt - t0) / 0.28, 0, 1); if (q <= 0) continue; nPins++;
      var pp = pinAt(i), py = pp[1] - Math.pow(1 - q, 2) * 46, rq = cl((mt - t0 - 0.28) / 0.6, 0, 1);
      if (q >= 1 && rq < 1) { ctx.strokeStyle = 'rgba(224,100,78,' + (0.8 * (1 - rq)) + ')'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(pp[0], pp[1], 3 + rq * 11, 1.5 + rq * 5, 0, 0, 7); ctx.stroke(); }
      ctx.fillStyle = '#E0644E'; ctx.beginPath(); ctx.arc(pp[0], py - 6.5, 3.6, Math.PI * 0.78, Math.PI * 2.22); ctx.lineTo(pp[0], py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F1E9D6'; ctx.beginPath(); ctx.arc(pp[0], py - 6.5, 1.3, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* A LITTLE LIFE AROUND THE TREE: a leaf or two let go and drift down to the ground, and a seed drops, takes root beside the trunk and grows into a small plant
     (one every 8 seconds, up to three). Drawn under the map veil, so they go quiet when the map comes up. Nothing here comes from the visitor's file. */
  var LEAFC = ['#7CC293', '#D2A860', '#E08A76'], SEEDX = [170, -175, 100], GY = H - 22, fl = [];
  function leafShape(x, y, s, rot, col, al) {
    if (s < 0.3) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = al; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.9, -s * 0.2, 0, s); ctx.quadraticCurveTo(-s * 0.9, -s * 0.2, 0, -s); ctx.fill();
    ctx.strokeStyle = 'rgba(32,28,23,.45)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function plant(i, t) {
    var px = W / 2 + SEEDX[i], sx = W / 2 + SEEDX[i] * 0.35, sy = H * 0.3, f = cl(t / 1.2, 0, 1);
    if (t < 0) return;
    if (f < 1) {      /* the seed falls from the canopy */
      var fx = sx + (px - sx) * f + Math.sin(f * 6) * 7 * (1 - f), fy = sy + (GY - 3 - sy) * f * f;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(f * 5); ctx.fillStyle = '#C79A55'; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.9, 0, 0, 7); ctx.fill(); ctx.restore();
      return;
    }
    ctx.fillStyle = '#5E4A2E'; ctx.beginPath(); ctx.ellipse(px, GY, 8, 2.4, 0, Math.PI, 0); ctx.fill();      /* a little mound of earth */
    var g = cl((t - 1.2 - 0.5) / 2.6, 0, 1); if (g <= 0) return;
    var h = 40 * ez(g), sw = Math.sin(tm * 1.5 + i) * 0.06 * g, tx = px + Math.sin(sw) * h, ty = GY - Math.cos(sw) * h;
    ctx.strokeStyle = '#7CC293'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, GY); ctx.lineTo(tx, ty); ctx.stroke();
    [[0.42, -1], [0.7, 1]].forEach(function (a, k) {
      var q = cl((g - 0.3 - k * 0.15) / 0.4, 0, 1);
      leafShape(px + (tx - px) * a[0] + a[1] * 4 * q, GY - (GY - ty) * a[0], 7 * ez(q), a[1] * 1.15 + sw, LEAFC[0], 1);
    });
    leafShape(tx, ty - 3, 5.5 * ez(cl((g - 0.7) / 0.3, 0, 1)), sw, '#9BD7AC', 1);
  }
  function drift() {
    var k, i;
    if (leaves.length > 6) for (k = 0; k < 2; k++) {
      var t = tm - 0.9 - k * 1.7, T = 3.8, n, q, c;
      if (t < 0) continue;
      n = Math.floor(t / T); q = (t - n * T) / 2.7;      /* it falls for 2.7 s, lies a moment and fades, then the next one lets go */
      if (!fl[k] || fl[k].n !== n) { c = leaves[(n * 7 + k * 5 + 3) % leaves.length]; fl[k] = { n: n, x: c.x, y: c.y }; }
      c = fl[k]; if (q > 1.35) continue;
      var fq = cl(q, 0, 1), x = c.x + Math.sin(fq * 8 + k * 2) * 16 * (0.3 + fq) + fq * (k ? -22 : 22), y = c.y + (GY - 2 - c.y) * Math.pow(fq, 1.2);
      leafShape(x, y, 5.5, Math.sin(fq * 6 + k) * 0.9 + fq * 2 + (q > 1 ? 1.2 : 0), LEAFC[(n + k) % 3], q > 1 ? Math.max(0, 1 - (q - 1) / 0.35) : 1);
    }
    for (i = 0; i < Math.min(3, Math.floor((tm - 0.6) / 8) + 1); i++) plant(i, tm - 0.6 - i * 8);
  }

  function scene(g) {
    leaves = []; var ord = 0, landed = 0, merged = 0, pend = [];
    ctx.fillStyle = '#2A251E'; ctx.fillRect(0, H - 22, W, 22);
    (function br(x, y, a, len, d, sd) {
      var f = cl((g * 1.4 - d * 0.11) / 0.11, 0, 1); if (f <= 0) return;
      var e = ez(f), ang = a + Math.sin(tm * 1.1 + d + sd) * 0.018 * d, x2 = x + Math.sin(ang) * len * e, y2 = y - Math.cos(ang) * len * e;
      ctx.strokeStyle = '#8A6A3D'; ctx.lineWidth = Math.max(1.2, (6 - d) * 1.7); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (f >= 1 && d >= 2) {
        if (launch[sd] === undefined) launch[sd] = { t: tm + (sd % 7) * 0.11, c: PAL[ss] };
        pend.push({ x: x2, y: y2, sd: sd, d: d, o: d === 5 ? ord++ : -1 });
      }
      if (d < 5) { br(x2, y2, ang - 0.42 - (sd % 3) * 0.05, len * 0.74, d + 1, sd * 2 + 1); br(x2, y2, ang + 0.42 + (sd % 2) * 0.05, len * 0.74, d + 1, sd * 2 + 2); }
    })(W / 2, H - 22, 0, H * 0.25, 0, 1);
    pend.forEach(function (p) {
      var L = launch[p.sd], q = (tm - L.t) / 0.9; if (q < 0) return; if (la > 0.3) q = 1;      /* a card still in the air when the map comes up lands at once, under the veil */
      var gx = p.x, gy = p.y;
      if (q < 1) {
        var e = ez(q), sx = -70, sy = 50 + (p.sd * 37) % 150, x = sx + (gx - sx) * e, y = sy + (gy - sy) * e - Math.sin(q * Math.PI) * 40, s = 1 - 0.88 * e, cw = 84 * s, ch = 58 * s;
        ctx.save(); ctx.translate(x, y); ctx.rotate((1 - e) * -0.5); ctx.fillStyle = '#F1E9D6'; rr(-cw / 2, -ch / 2, cw, ch, 5 * s); ctx.fill();
        if (s > 0.5) {
          ctx.fillStyle = '#2B2620'; ctx.font = '500 ' + (11 * s) + 'px sans-serif'; ctx.fillText(NM[p.sd % 12] + ' ' + SN[p.sd % 6], -cw / 2 + 6, -ch / 2 + 16 * s);
          ctx.fillStyle = '#6B6355'; ctx.font = (10 * s) + 'px sans-serif'; ctx.fillText('b. ' + (1840 + p.sd % 90), -cw / 2 + 6, -ch / 2 + 30 * s);
          if (g > 0.3) { ctx.fillStyle = '#C2563F'; ctx.fillText('● ' + PL[p.sd % 6], -cw / 2 + 6, ch / 2 - 8 * s); }
        }
        ctx.restore(); return;
      }
      landed++; var r = (p.d === 5 ? 5.5 : 3.8) * (0.85 + 0.15 * Math.sin(tm * 3 + p.sd));
      ctx.fillStyle = L.c; ctx.beginPath(); ctx.arc(gx, gy, r, 0, 7); ctx.fill(); leaves.push({ x: gx, y: gy, r: r + 5, i: p.sd });
      if (p.o >= 0 && p.o % 10 === 3) {
        var m = tAt[4] === undefined ? (ss > 4 ? 1 : 0) : cl((tm - tAt[4]) / 0.5, 0, 1);
        if (m > 0) {
          var ox = 24 * (1 - ez(m)), oy = -16 * (1 - ez(m));
          ctx.fillStyle = '#E0644E'; ctx.globalAlpha = 1 - 0.7 * ez(m); ctx.beginPath(); ctx.arc(gx + ox, gy + oy, 4.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          if (m < 1) {
            ctx.save(); ctx.translate(gx, gy - 24); ctx.rotate(-0.12); ctx.fillStyle = '#E0644E'; ctx.strokeStyle = '#E0644E'; ctx.lineWidth = 1.5; ctx.font = '500 10px sans-serif'; ctx.textAlign = 'center';
            ctx.globalAlpha = Math.min(1, m * 3) * (m > 0.85 ? (1 - m) / 0.15 : 1); ctx.strokeRect(-42, -9, 84, 17); ctx.fillText('SAME PERSON?', 0, 3); ctx.restore();
          } else { merged++; ctx.strokeStyle = '#E0644E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, 9, 0, 7); ctx.stroke(); ctx.fillStyle = '#E0644E'; ctx.font = '500 9px sans-serif'; ctx.fillText('×2', gx + 10, gy - 8); }
        }
      }
      if (ss >= 7 && p.d === 5) {
        ctx.strokeStyle = '#CFC6B4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 13); ctx.stroke();
        var fc = [['#C8372D', '#fff', '#1F4E9C'], ['#2E8B57', '#fff', '#C8372D'], ['#1F4E9C', '#E7C640', '#C8372D']][p.sd % 3];
        fc.forEach(function (c, k) { ctx.fillStyle = c; ctx.fillRect(gx + 1, gy - 13 + k * 3, 8, 3); });
      }
    });
    drift();
    mapLayer();
    if (sel && sayT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.r + 2, 0, 7); ctx.stroke(); }
    var cy = H - 30;
    ctx.fillStyle = '#CFC6B4'; ctx.font = '500 12px sans-serif'; ctx.fillText(landed + ' people', 14, cy);
    if (merged) { ctx.fillStyle = '#E0644E'; ctx.fillText(merged + ' duplicates merged', 14, cy -= 16); }
    if (la > 0.3 && nPins) { ctx.fillStyle = '#7DD3C0'; ctx.fillText(nPins + (nPins === 1 ? ' place pinned' : ' places pinned'), 14, cy -= 16); }
    if (la > 0.3 && nArcs) { ctx.fillStyle = '#F2A65A'; ctx.fillText(nArcs + (nArcs === 1 ? ' journey traced' : ' journeys traced'), 14, cy -= 16); }
    if (sel && sayT > 0) {
      ctx.font = '500 13px sans-serif'; var tw = ctx.measureText(say_).width + 20, bx = cl(sel.x, tw / 2 + 6, W - tw / 2 - 6), by = cl(sel.y - 30, 20, H - 20);
      ctx.fillStyle = '#F1E9D6'; rr(bx - tw / 2, by - 14, tw, 26, 6); ctx.fill(); ctx.fillStyle = '#2B2620'; ctx.textAlign = 'center'; ctx.fillText(say_, bx, by + 4); ctx.textAlign = 'left';
    }
  }
  function frame(ts) {
    if (!shown) { raf = 0; return; }
    var dt = Math.min(0.05, ((ts - last) / 1000) || 0); last = ts; tm += dt; if (sayT > 0) sayT -= dt;
    /* the stage on show follows the real one, a step at a time and each for DWELL seconds (not at all for a reader who asked for less motion) */
    if (still) ss = stage;
    else { if (ss > stage) { ss = stage; tAt.length = ss + 1; } if (ss < stage && tm - ssAt >= DWELL) { ss++; ssAt = tm; tAt[ss] = tm; } }
    var caught = ss >= stage; if (ending && caught && doneAt < 0) doneAt = tm;
    var target = ending && caught ? 1 : (ss + (caught ? sub : 0.95)) / STAGES.length; if (target > gd) gd = Math.min(target, gd + Math.max(0.0006, (target - gd) * dt * 2.2));
    la += ((ss === 5 || ss === 6 ? 1 : 0) - la) * Math.min(1, dt * 6);
    var S = STAGES[ss]; ttl.textContent = S.k + '…'; jk.textContent = S.j[Math.floor(tm / 2.4) % 3]; bar.style.width = (gd * 100) + '%'; bar.style.background = PAL[ss]; real.textContent = msg + '…';
    if (!still && Math.abs((cv.clientWidth || W) / W - scale) > 0.005) fit();      /* the stylesheet may arrive after the first frame */
    if (!still) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#201C17'; ctx.fillRect(0, 0, W, H); scene(gd); }
    if (ending && ((caught && (gd > 0.97 || tm - doneAt > 0.9)) || tm - endAt > 3)) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  function reveal() {
    pending = false; build(); shown = true; el.classList.remove('out'); el.hidden = false; fit(); last = 0; ss = stage; ssAt = tm; tAt = []; tAt[ss] = tm;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function finish() {
    el.classList.add('out'); clearTimeout(outT);
    outT = setTimeout(function () { el.hidden = true; shown = false; ending = false; }, 260);
  }
  function reset() { stage = 0; sub = 0.3; gd = 0; tm = 0; ss = 0; ssAt = 0; tAt = []; la = 0; doneAt = -1; nPins = 0; nArcs = 0; launch = {}; leaves = []; fl = []; sel = null; sayT = 0; ending = false; }
  /* the messages that are work in progress; anything else (a note that the file loaded, say) is not the loading screen's to show */
  function wants(text) { return !!stageOf(text) || /^(Starting|Hiding living people|Showing everyone|Redrawing)/.test(String(text || '')); }
  window.RALoad = {
    wants: wants,
    say: function (text) {
      if (ending) { clearTimeout(outT); if (el) el.hidden = true; shown = false; reset(); }
      var s = stageOf(text); msg = String(text || '').replace(/…$/, '') || 'Starting';
      if (s) { stage = s.i; sub = s.p === undefined ? 0.3 : s.p; }
      if (!shown && !pending) { reset(); if (s) { stage = s.i; sub = s.p === undefined ? 0.3 : s.p; } pending = true; timer = setTimeout(reveal, DELAY); }
    },
    hide: function () {
      if (pending) { clearTimeout(timer); pending = false; return; }
      if (!shown || ending) return;
      ending = true; endAt = tm; if (still) finish();
    },
    off: function () { clearTimeout(timer); clearTimeout(outT); pending = false; ending = false; shown = false; if (el) el.hidden = true; }
  };
})();
