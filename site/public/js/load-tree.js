/* The loading screen for reading a family tree file: a tree grows and the people it finds fly onto it as cards that turn into leaves, near-identical cards are stamped
   and merged, flags go up at the end. It follows the reader's real progress messages (public/roots/js/pipeline.js says them), so a slow step is a slow step; the real
   message stays in small type under the bar. Everything drawn here is invented: the names on the cards are a fixed list, never a name from the visitor's file, and
   nothing from the file reaches this script except the progress message, which names a stage and a country code and a count.
   Used by /tree-canvas/ and /roots/. Both pages' policy is script-src and style-src 'self', so this is a plain script and a stylesheet it links itself.
   API: RALoad.say(message) shows or updates the screen (after a short delay, so a quick read never flashes it), RALoad.hide() lets the tree finish and fades it. */
(function () {
  var STAGES = [
    { k: 'Unfolding your file', s: 'Read', j: ['Blowing the dust off your ancestors.', 'Reading small print written by somebody’s great-aunt.', 'Your file is clearing its throat.'] },
    { k: 'Counting heads', s: 'Find', j: ['Found a John. Found another John. Found nine Johns.', 'Everyone is somebody’s cousin. Counting.', 'Sorting the living from the legendary.'] },
    { k: 'Unrolling the map', s: 'Atlas', j: ['Asking the Atlas what Fiume was called in 1910.', 'Dusting off a few hundred thousand villages.', 'The Atlas is putting its glasses on.'] },
    { k: 'Pinning places', s: 'Place', j: ['Salisbury or Harare? Yes.', 'Five spellings, one village. Diplomacy in progress.', 'Telling the Austro-Hungarian Empire we’ve moved.'] },
    { k: 'Crunching relationships', s: 'Build', j: ['Checking nobody is their own grandfather.', 'Merging the two Marias who were obviously the same Maria.', 'Introducing second cousins at a safe distance.'] },
    { k: 'Raising the flags', s: 'Flags', j: ['Whose flag flew over the church that year? Ahem.', 'Borders have moved. Again.', 'Ironing the flags.'] }];
  var SAY = ['Allegedly born 1872.', 'I moved twice. Nobody asked me.', 'Please stop calling me “unknown”.', 'Yes, that is my real surname.', 'I had eleven siblings and one ledger.', 'My spelling is a work in progress.', 'Spotted in two registers. Suspicious.', 'I was never in Salisbury. Probably.'];
  var NM = ['Maria', 'Ivan', 'Giovanni', 'Anna', 'Josip', 'Katarina', 'Johann', 'Rosa', 'Luka', 'Elisabeth', 'Marija', 'Antonio'];
  var SN = ['Kovač', 'Rossi', 'Novak', 'Bianchi', 'Horvat', 'Mayer'];
  var PL = ['Senj', 'Rijeka', 'Imotski', 'Trieste', 'Gallignana', 'Pomer'];
  var PAL = ['#6FB3C4', '#D2A860', '#7CC293', '#E08A76', '#B79AE0', '#E7E5DE'];
  var W = 680, H = 300, DELAY = 350;

  /* which stage a progress message belongs to, and how far through it is (only the places step says); null for any other message (it is shown, and the tree waits) */
  function stageOf(msg) {
    var m = String(msg || '').replace(/…|\.\.\.$/g, '').trim(), r;
    if (/^Reading (the|your) file/.test(m)) return { i: 0 };
    if (/^Finding people/.test(m)) return { i: 1 };
    if (/^Reading the Atlas/.test(m)) return { i: 2 };
    if ((r = /^Loading the \S+ places \((\d+) of (\d+)\)/.exec(m))) return { i: 3, p: Math.min(0.95, (+r[1]) / Math.max(1, +r[2])) };
    if (/^Placing /.test(m)) return { i: 3 };
    if (/^Building the tree/.test(m)) return { i: 4 };
    if (/^Drawing flags/.test(m)) return { i: 5 };
    return null;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { stageOf: stageOf, STAGES: STAGES };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var el = null, cv, ctx, ttl, jk, bar, real, scale = 1, raf = 0, timer = 0, outT = 0;
  var shown = false, pending = false, ending = false, endAt = 0;
  var stage = 0, sub = 0.3, gd = 0, tm = 0, last = 0, launch = {}, leaves = [], sel = null, say_ = '', sayT = 0, msg = 'Starting';
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

  function scene(g) {
    leaves = []; var ord = 0, landed = 0, merged = 0, pend = [];
    ctx.fillStyle = '#2A251E'; ctx.fillRect(0, H - 22, W, 22);
    (function br(x, y, a, len, d, sd) {
      var f = cl((g * 1.1 - d * 0.11) / 0.11, 0, 1); if (f <= 0) return;
      var e = ez(f), ang = a + Math.sin(tm * 1.1 + d + sd) * 0.018 * d, x2 = x + Math.sin(ang) * len * e, y2 = y - Math.cos(ang) * len * e;
      ctx.strokeStyle = '#8A6A3D'; ctx.lineWidth = Math.max(1.2, (6 - d) * 1.7); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (f >= 1 && d >= 2) {
        if (launch[sd] === undefined) launch[sd] = { t: tm + (sd % 7) * 0.11, c: PAL[stage] };
        pend.push({ x: x2, y: y2, sd: sd, d: d, o: d === 5 ? ord++ : -1 });
      }
      if (d < 5) { br(x2, y2, ang - 0.42 - (sd % 3) * 0.05, len * 0.74, d + 1, sd * 2 + 1); br(x2, y2, ang + 0.42 + (sd % 2) * 0.05, len * 0.74, d + 1, sd * 2 + 2); }
    })(W / 2, H - 22, 0, H * 0.25, 0, 1);
    pend.forEach(function (p) {
      var L = launch[p.sd], q = (tm - L.t) / 0.9; if (q < 0) return;
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
        var m = cl((g - 0.63) / 0.06, 0, 1);
        if (m > 0) {
          var ox = 24 * (1 - ez(m)), oy = -16 * (1 - ez(m));
          ctx.fillStyle = '#E0644E'; ctx.globalAlpha = 1 - 0.7 * ez(m); ctx.beginPath(); ctx.arc(gx + ox, gy + oy, 4.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          if (m < 1) {
            ctx.save(); ctx.translate(gx, gy - 24); ctx.rotate(-0.12); ctx.fillStyle = '#E0644E'; ctx.strokeStyle = '#E0644E'; ctx.lineWidth = 1.5; ctx.font = '500 10px sans-serif'; ctx.textAlign = 'center';
            ctx.globalAlpha = Math.min(1, m * 3) * (m > 0.85 ? (1 - m) / 0.15 : 1); ctx.strokeRect(-42, -9, 84, 17); ctx.fillText('SAME PERSON?', 0, 3); ctx.restore();
          } else { merged++; ctx.strokeStyle = '#E0644E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(gx, gy, 9, 0, 7); ctx.stroke(); ctx.fillStyle = '#E0644E'; ctx.font = '500 9px sans-serif'; ctx.fillText('×2', gx + 10, gy - 8); }
        }
      }
      if (g > 0.84 && p.d === 5) {
        ctx.strokeStyle = '#CFC6B4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 13); ctx.stroke();
        var fc = [['#C8372D', '#fff', '#1F4E9C'], ['#2E8B57', '#fff', '#C8372D'], ['#1F4E9C', '#E7C640', '#C8372D']][p.sd % 3];
        fc.forEach(function (c, k) { ctx.fillStyle = c; ctx.fillRect(gx + 1, gy - 13 + k * 3, 8, 3); });
      }
    });
    if (sel && sayT > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.r + 2, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#CFC6B4'; ctx.font = '500 12px sans-serif'; ctx.fillText(landed + ' people', 14, H - 30);
    if (merged) { ctx.fillStyle = '#E0644E'; ctx.fillText(merged + ' duplicates merged', 14, H - 46); }
    if (sel && sayT > 0) {
      ctx.font = '500 13px sans-serif'; var tw = ctx.measureText(say_).width + 20, bx = cl(sel.x, tw / 2 + 6, W - tw / 2 - 6), by = cl(sel.y - 30, 20, H - 20);
      ctx.fillStyle = '#F1E9D6'; rr(bx - tw / 2, by - 14, tw, 26, 6); ctx.fill(); ctx.fillStyle = '#2B2620'; ctx.textAlign = 'center'; ctx.fillText(say_, bx, by + 4); ctx.textAlign = 'left';
    }
  }
  function frame(ts) {
    if (!shown) { raf = 0; return; }
    var dt = Math.min(0.05, ((ts - last) / 1000) || 0); last = ts; tm += dt; if (sayT > 0) sayT -= dt;
    var target = ending ? 1 : (stage + sub) / 6; if (target > gd) gd = Math.min(target, gd + Math.max(0.0006, (target - gd) * dt * 2.2));
    var S = STAGES[stage]; ttl.textContent = S.k + '…'; jk.textContent = S.j[Math.floor(tm / 2.4) % 3]; bar.style.width = (gd * 100) + '%'; bar.style.background = PAL[stage]; real.textContent = msg + '…';
    if (!still && Math.abs((cv.clientWidth || W) / W - scale) > 0.005) fit();      /* the stylesheet may arrive after the first frame */
    if (!still) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#201C17'; ctx.fillRect(0, 0, W, H); scene(gd); }
    if (ending && (gd > 0.97 || tm - endAt > 0.9)) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  function reveal() {
    pending = false; build(); shown = true; el.classList.remove('out'); el.hidden = false; fit(); last = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function finish() {
    el.classList.add('out'); clearTimeout(outT);
    outT = setTimeout(function () { el.hidden = true; shown = false; ending = false; }, 260);
  }
  function reset() { stage = 0; sub = 0.3; gd = 0; tm = 0; launch = {}; leaves = []; sel = null; sayT = 0; ending = false; }
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
