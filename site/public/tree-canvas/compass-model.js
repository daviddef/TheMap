/* COMPASS: your family on the map through time. THE MODEL: every pure rule behind the Compass workspace. No DOM, no network, no storage, no Leaflet. Tested in node
   (site/test/tree-canvas-compass.test.js).

   WHAT IT DOES. From the trees the Tree Canvas holds (the loaded file, and the archives the Compare view has chosen) it works out, for any year, WHO IS WHERE:
     - each DECEASED person is at the place the file says they were: the birthplace until the first recorded move, then each route stop that has a year, then the death place;
     - a year or a place the file does not state, but that was worked out (a borrowed birthplace, an estimated year, a move put at three-fifths of a life), is flagged `est` and is
       drawn dashed and called estimated, never as a fact;
     - A LIVING PERSON IS NEVER PLACED. A person who may be alive (the canvas's own rule, mirrored here) has no stays at all, appears in no place total, and is counted only as
       "not placed" in the summary line. Nothing in this file reads a place off a living person.
   Everything it returns is numbers and ids. A name is only ever put into text by the caller, from the tree, for a person who has died. */

export const SIDE_COLOUR = { f: '#2A5FA3', m: '#DB8420', n: '#6b5a44' };   // the Fan's own pair (views.js SIDE_BASE): paternal blue, maternal orange; neutral for the rest
export const LINE_COLOURS = ['#C2452D', '#2A5FA3', '#3f8a3a', '#8A5CC2', '#D39A12', '#1E9C97', '#C9508F', '#6b5a44'];   // a family line's colour (the tree's own `line` index, eight of them)
export const LIVING_YEARS = 110;   // the canvas's rule (roots/js/model.js): no death recorded and born within 110 years is possibly alive

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n || 200) : '');

/* A person who may be alive. Mirrors the canvas: a redacted GEDCOM person (`hid`), a tree.json `living`, or no death year with a birth within 110 years. */
export function isLiving(p, now) {
  if (!p) return true;
  now = now || new Date().getFullYear();
  if (p.living || p.hid || p.ghost) return true;
  if (p.dy == null && (p.by == null || p.by > now - LIVING_YEARS)) return true;
  return false;
}

/* ---- places ---- */
/* The place a tree names, with where it is: the Atlas extract's list first (the reader resolved every name the tree uses), then the tree's own places table (tree.json). */
export function placeTable(tree, atlas) {
  const m = new Map();
  const add = (n, o) => { if (typeof n === 'string' && n && !m.has(n) && num(o.lat) != null && num(o.lon) != null) m.set(n, o); };
  const fid = atlas && Array.isArray(atlas.fid) ? atlas.fid : [];
  /* the flag timeline as [[from year, flag file id]]: the atlas gives an index into its own list of flag files, which differs from one extract to the next, so it is turned into the file name here */
  const flags = fl => (Array.isArray(fl) ? fl : []).map(r => [r[0], fid[r[1]]]).filter(r => typeof r[0] === 'number' && typeof r[1] === 'string' && /^[a-z0-9-]+$/.test(r[1]));
  for (const x of (atlas && Array.isArray(atlas.places) ? atlas.places : [])) if (x) add(x.n, { name: text(x.n), lat: x.lat, lon: x.lon, cn: text(x.cn, 4), id: text(x.id, 120) || null, fl: flags(x.fl), ev: Array.isArray(x.ev) ? x.ev : [] });
  for (const x of (tree && Array.isArray(tree.places) ? tree.places : [])) if (x) add(x.n, { name: text(x.n), lat: x.lat, lon: x.lon, cn: text(x.cn, 4), id: null, fl: [], ev: [] });
  return m;
}
/* the flag file in force over a place in year y (`fl`: [[from, flag file id], ...] in time order); null before the first */
export function flagAt(fl, y) {
  let best = null;
  for (const r of fl || []) { if (r[0] > y) break; best = r[1]; }
  return best;
}

/* ---- stays: where one person was, year by year ---- */
/* A person's places in order, each with the years they were there. Returns [{a, b, k, est, me}]: from year a to year b (inclusive), at place name k; est = this stay rests on something
   worked out (a borrowed place, an estimated year or a move the file does not date); me = the move INTO this stay is estimated (not stated by the file). Only for a deceased person with a birth year; a living person gets []. */
export function staysOf(p, places, now) {
  if (isLiving(p, now) || num(p.by) == null) return [];
  now = now || new Date().getFullYear();
  const by = p.by, dyEst = num(p.dy) == null || !!p.dye;
  let dy = num(p.dy) != null && p.dy >= by ? p.dy : by + 75;
  if (dyEst) dy = Math.max(by, Math.min(dy, now));   // an estimated death never lands in the future
  const ok = n => (n && places.has(n) ? n : null);
  /* the stops, in order: [place, year or null, est] */
  let stops = [];
  const route = Array.isArray(p.route) ? p.route.filter(s => Array.isArray(s) && s[0]) : [];
  if (route.length) {
    if (!(ok(route[0][0]) === ok(p.bp) || !p.bp)) stops.push([p.bp, by, !!p.bye]);
    for (const s of route) stops.push([s[0], num(s[1]), !!s[2]]);
    if (p.dp && route[route.length - 1][0] !== p.dp) stops.push([p.dp, dy, true]);
    if (stops.length && stops[0][1] == null) stops[0][1] = by;
  } else {
    stops.push([p.bp, by, !!(p.bpe || p.bye)]);
    if (p.dp && p.dp !== p.bp) {
      const my = num(p.my), moveEst = my == null || !!p.mye;
      stops.push([p.dp, my != null ? my : Math.max(by + 1, dy), moveEst]);
    }
  }
  stops = stops.filter(s => ok(s[0]));
  if (!stops.length) return [];
  /* undated stops between dated ones are spread evenly and called estimated */
  for (let i = 0; i < stops.length; i++) {
    if (stops[i][1] != null) continue;
    let j = i; while (j < stops.length && stops[j][1] == null) j++;
    const lo = i > 0 ? stops[i - 1][1] : by, hi = j < stops.length ? stops[j][1] : dy, n = j - i + 1;
    for (let k = i; k < j; k++) { stops[k][1] = Math.round(lo + (hi - lo) * (k - i + 1) / n); stops[k][2] = true; }
  }
  stops.sort((x, y) => x[1] - y[1]);
  const out = [];
  for (let i = 0; i < stops.length; i++) {
    const a = Math.max(by, Math.min(dy, stops[i][1])), b = i + 1 < stops.length ? Math.max(a, Math.min(dy, stops[i + 1][1] - 1)) : dy;
    const k = stops[i][0], last = out[out.length - 1];
    const est = !!stops[i][2] || (i === 0 && !!p.bye) || (i === stops.length - 1 && dyEst);
    if (last && last.k === k) { last.b = b; last.est = last.est || est; continue; }
    out.push({ a, b, k, est, me: !!stops[i][2] });
  }
  if (out.length) out[out.length - 1].b = dy;
  return out;
}

/* ---- the index ---- */
/* sources: [{key, name, tree, atlas}], the file first, then each archive the Compare view holds. Returns {persons, places, stats}. persons[i]: {i, s (source index), id, name, sur,
   sk, line, by, dy, bye, dye, stays, key}. stats[s]: the honest count of what the file holds. */
export function buildIndex(sources, o) {
  const now = (o && o.now) || new Date().getFullYear(), persons = [], places = new Map(), stats = [];
  sources.forEach((src, s) => {
    const tree = src.tree || {}, ppl = Array.isArray(tree.people) ? tree.people : [], und = Array.isArray(tree.undrawn) ? tree.undrawn.length : 0;
    const table = placeTable(tree, src.atlas), st = { key: src.key, name: src.name, people: ppl.length + und, living: 0, placed: 0, withMove: 0, estMove: 0, undated: und, noPlace: 0, estimated: 0 };
    for (const p of ppl) {
      if (!p || p.id == null) continue;
      if (isLiving(p, now)) { st.living++; continue; }
      const stays = staysOf(p, table, now);
      if (!stays.length) { st.noPlace++; continue; }
      st.placed++;
      const ks = new Set(stays.map(x => x.k));
      if (ks.size > 1) { if (stays.slice(1).some(x => !x.me)) st.withMove++; else st.estMove++; }
      if (stays.some(x => x.est)) st.estimated++;
      for (const k of ks) { const pl = table.get(k); const key = placeKey(pl); if (!places.has(key)) places.set(key, { key, name: pl.name, lat: pl.lat, lon: pl.lon, cn: pl.cn, id: pl.id, fl: pl.fl, ev: pl.ev }); }
      persons.push({ i: persons.length, s, id: String(p.id), name: personName(p), sur: text(p.sur, 80), sk: p.sk || surKey(p.sur), line: Number.isInteger(p.line) ? p.line : 0, by: p.by, dy: stays[stays.length - 1].b,
        bye: !!p.bye, dye: !!p.dye || num(p.dy) == null, stays: stays.map(x => ({ a: x.a, b: x.b, k: placeKey(table.get(x.k)), est: x.est, me: x.me })), slug: text(p.slug, 80) || null });
    }
    stats.push(st);
  });
  return { persons, places, stats, now };
}
const placeKey = pl => pl.name + '|' + pl.lat.toFixed(2) + ',' + pl.lon.toFixed(2);
const surKey = s => String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const personName = p => text(((p.given || '') + ' ' + (p.sur || '')).trim(), 160) || '(no name)';

/* ---- relationships to the person in focus (the canvas's selected person) ---- */
/* For one source's tree: every ancestor with `up` (generations above the focus, 1 = a parent) and `side` ('f' via the father, 'm' via the mother), and every descendant with `down`. Keys are person ids. */
export function relations(tree, focusId) {
  const rel = new Map(), by = new Map();
  for (const p of (tree && tree.people) || []) if (p && p.id != null) by.set(String(p.id), p);
  const f = by.get(String(focusId));
  if (!f) return rel;
  rel.set(String(f.id), { up: 0, down: 0, side: null, self: true });
  const walkUp = (id, up, side) => {
    const p = by.get(String(id)); if (!p || up > 12) return;
    for (const [pid, sd] of [[p.father, 'f'], [p.mother, 'm']]) {
      if (pid == null || !by.has(String(pid))) continue;
      const sdd = side || sd, r = rel.get(String(pid));
      if (r && r.up) continue;
      rel.set(String(pid), { ...(r || { down: 0 }), up: up + 1, side: sdd });
      walkUp(pid, up + 1, sdd);
    }
  };
  walkUp(f.id, 0, null);
  const walkDown = (id, down) => {
    const p = by.get(String(id)); if (!p || down > 12) return;
    for (const k of p.kids || []) {
      if (!by.has(String(k))) continue;
      const r = rel.get(String(k)); if (r && r.down) continue;
      rel.set(String(k), { ...(r || { up: 0, side: null }), down: down + 1 });
      walkDown(k, down + 1);
    }
  };
  walkDown(f.id, 0);
  /* collateral relatives take a side too: everyone descended from an ancestor on the father's side only is on his side, from the mother's side only on hers, from both (the focus's own
     brothers and sisters, say) on neither. They have no generation (coll: true), so the generation filter leaves them out. */
  const reach = side => {
    const seen = new Set(), q = [];
    for (const [id, r] of rel) if (r.up && r.side === side) { seen.add(id); q.push(id); }
    while (q.length) { const p = by.get(q.pop()); for (const k of (p && p.kids) || []) { const ks = String(k); if (by.has(ks) && !seen.has(ks)) { seen.add(ks); q.push(ks); } } }
    return seen;
  };
  const fs = reach('f'), ms = reach('m');
  for (const id of new Set([...fs, ...ms])) {
    const r = rel.get(id);
    if (r) continue;   // an ancestor, or a descendant of the focus: already placed
    rel.set(id, { up: 0, down: 0, side: fs.has(id) && ms.has(id) ? null : fs.has(id) ? 'f' : 'm', coll: true });
  }
  return rel;
}

/* ---- filters ---- */
export const DEFAULT_FILTER = { scope: 'all', gen: 0, born: true, lived: true, died: true };   // scope: all | f (father's side) | m (mother's side) | line (the focus's family line); gen 0 = any
export function cleanFilter(f) {
  f = f && typeof f === 'object' ? f : {};
  return { scope: ['all', 'f', 'm', 'line'].includes(f.scope) ? f.scope : 'all', gen: Number.isInteger(f.gen) && f.gen >= 0 && f.gen <= 8 ? f.gen : 0,
    born: f.born !== false, lived: f.lived !== false, died: f.died !== false };
}
/* A person passes the scope and generation tests. `ctx`: {rel: [Map per source] | null, focus: {s, sk} | null}. With no focus person, scope and generation filters do nothing (and the view says so). */
export function passesWho(p, f, ctx) {
  const fo = ctx && ctx.focus;
  if (!fo || (f.scope === 'all' && !f.gen)) return true;
  const r = ctx.rel && ctx.rel[p.s] && ctx.rel[p.s].get(p.id);
  if (f.scope === 'f' || f.scope === 'm') { if (!r || r.side !== f.scope) return false; }
  if (f.scope === 'line' && !(p.s === fo.s && p.sk && p.sk === fo.sk)) return false;
  if (f.gen) { if (!r || r.coll || Math.max(r.up || 0, r.down || 0) > f.gen) return false; }
  return true;
}

/* ---- who is on screen in year Y ---- */
/* The stay a person is in during year y, or null (not yet born, or dead). */
export function stayAt(p, y) {
  if (y < p.by || y > p.dy) return null;
  for (const s of p.stays) if (y >= s.a && y <= s.b) return s;
  return null;
}
/* W: the window, in years, that "born" and "died" cover. Every person alive in y has exactly one role: born (within W years of their birth), died (within W years of their death), else
   lived; a chip that is off hides that role, so with all three on this is everyone alive in y. */
export function peopleAt(index, y, f, ctx, W) {
  f = cleanFilter(f); W = Math.max(1, W | 0 || 1);
  const by = new Map(); let total = 0, est = 0;
  for (const p of index.persons) {
    const s = stayAt(p, y); if (!s) continue;
    const role = y - p.by < W ? 'born' : p.dy - y < W ? 'died' : 'lived', born = role === 'born', died = role === 'died';
    if (!f[role]) continue;
    if (!passesWho(p, f, ctx)) continue;
    let e = by.get(s.k); if (!e) by.set(s.k, e = { key: s.k, n: 0, people: [], born: 0, died: 0, est: 0 });
    e.n++; e.people.push(p.i); if (born) e.born++; if (died) e.died++; if (s.est) { e.est++; est++; }
    total++;
  }
  return { by, total, est };
}

/* ---- movements ---- */
/* Moves made in the years (y - W, y]: a person's step from one stay to the next, grouped by origin, destination and colour, so several people on one route are one arc.
   colour: 'side' (relative to the focus: f / m / n) or 'line' (the family line). Returns [{from, to, n, people, year, est, colour, c}]. */
export function movesIn(index, y, W, f, ctx, colour) {
  f = cleanFilter(f); W = Math.max(1, W | 0 || 1);
  const g = new Map();
  for (const p of index.persons) {
    if (p.stays.length < 2) continue;
    if (!passesWho(p, f, ctx)) continue;
    for (let i = 1; i < p.stays.length; i++) {
      const to = p.stays[i], from = p.stays[i - 1];
      if (to.a > y || to.a <= y - W || from.k === to.k) continue;
      const c = colourOf(p, colour, ctx), key = from.k + '>' + to.k + '>' + c;
      let e = g.get(key); if (!e) g.set(key, e = { from: from.k, to: to.k, n: 0, people: [], year: to.a, est: true, colour: c });
      e.n++; e.people.push(p.i); if (to.a > e.year) e.year = to.a; if (!to.me) e.est = false;   // a move is estimated when the file does not state it (a borrowed place or an estimated death year does not make the move itself a guess)
    }
  }
  return [...g.values()].sort((a, b) => b.n - a.n || b.year - a.year);
}
/* a person's colour key: for 'side' f / m / n by their place in the focus's family, for 'line' the line index */
export function colourOf(p, mode, ctx) {
  if (mode === 'line') return 'l' + (p.line % LINE_COLOURS.length);
  const r = ctx && ctx.rel && ctx.rel[p.s] && ctx.rel[p.s].get(p.id);
  return r && r.side ? r.side : 'n';
}
export const colourHex = c => (c && c[0] === 'l' ? LINE_COLOURS[+c.slice(1) % LINE_COLOURS.length] : SIDE_COLOUR[c] || SIDE_COLOUR.n);

/* one person's whole route, with its dated stops: [{k, a, b, est}] */
export const routeOf = p => p.stays.map(s => ({ k: s.k, a: s.a, b: s.b, est: s.est }));

/* ---- clustering at world scale ---- */
/* Dots per place at close range, one dot per grid cell when far out, so a world of places is never thousands of markers. `project(lat, lon)` → {x, y} in pixels at the current zoom; cell: pixels. */
export function clusterPlaces(items, places, project, cell) {
  const cs = new Map();
  for (const it of items) {
    const pl = places.get(it.key); if (!pl) continue;
    const pt = project(pl.lat, pl.lon), cx = Math.floor(pt.x / cell), cy = Math.floor(pt.y / cell), k = cx + ':' + cy;
    let c = cs.get(k); if (!c) cs.set(k, c = { n: 0, est: 0, keys: [], lat: 0, lon: 0, w: 0, top: null, topN: -1 });
    c.n += it.n; c.est += it.est || 0; c.keys.push(it.key); c.lat += pl.lat * it.n; c.lon += pl.lon * it.n; c.w += it.n;
    if (it.n > c.topN) { c.topN = it.n; c.top = pl.name; }
  }
  return [...cs.values()].map(c => ({ n: c.n, est: c.est, keys: c.keys, lat: c.lat / c.w, lon: c.lon / c.w, label: c.keys.length > 1 ? c.top + ' and ' + (c.keys.length - 1) + ' more' : c.top, places: c.keys.length })).sort((a, b) => b.n - a.n);
}
/* a dot's radius in pixels: the square root of the people (area follows the count), kept between a readable minimum and a cap */
export const dotRadius = n => Math.max(5, Math.min(30, 4 + Math.sqrt(n) * 2.4));

/* ---- staying: what to say when no one moves ---- */
/* The longest unbroken stretch, around year y, in which the people of one family line (or everyone shown, if no line) were at one place. Counted from the stays themselves, so every
   number is true to the data. Returns null when no one is there in y. {from, to, years, people, thin (fewer than 5 people: say "recorded"), line (the surname or ''), place}. */
export function stayRun(index, placeKeyV, y, line, f, ctx) {
  f = cleanFilter(f);
  const present = new Map();
  for (const p of index.persons) {
    if (line && p.sk !== line) continue;
    if (!passesWho(p, f, ctx)) continue;
    for (const s of p.stays) if (s.k === placeKeyV) for (let t = s.a; t <= s.b; t++) present.set(t, (present.get(t) || 0) + 1);
  }
  if (!present.get(y)) return null;
  let a = y, b = y; while (present.get(a - 1)) a--; while (present.get(b + 1)) b++;
  const seen = new Set();
  for (const p of index.persons) { if (line && p.sk !== line) continue; if (passesWho(p, f, ctx)) for (const s of p.stays) if (s.k === placeKeyV && s.a <= b && s.b >= a) seen.add(p.i); }
  return { from: a, to: b, years: b - a + 1, people: seen.size, thin: seen.size < 5, place: placeKeyV, line: line || '' };
}
/* the caption for a stay run: always the real numbers; "recorded" when it rests on a few records */
export function stayCaption(run, placeName, famName) {
  if (!run) return '';
  const where = run.years === 1 ? '1 year' : run.years + ' years', span = run.from === run.to ? String(run.from) : run.from + '–' + run.to;
  if (run.thin) return (famName ? 'The ' + famName + ' family is recorded' : 'The people shown are recorded') + ' in ' + placeName + ' for ' + where + ' (' + span + '), on ' + (run.people === 1 ? 'one person' : run.people + ' people') + '.';
  return (famName ? 'The ' + famName + ' family stays' : 'The people shown stay') + ' in ' + placeName + ': ' + where + ' (' + span + ').';
}
/* the place to speak about: the focus person's place in y if they are there, else the place with most people */
export function focusPlaceAt(index, y, byPlace, focus) {
  if (focus) {
    const p = index.persons.find(q => q.s === focus.s && q.id === focus.id), s = p && stayAt(p, y);
    if (s && byPlace.has(s.k)) return s.k;
  }
  let best = null, n = -1;
  for (const [k, e] of byPlace) if (e.n > n) { n = e.n; best = k; }
  return best;
}
/* the most numerous family line at a place in a year (its surname key), by the people the filter lets through */
export function mainLine(index, byPlaceEntry, focus) {
  if (focus && focus.sk && byPlaceEntry.people.some(i => index.persons[i].sk === focus.sk)) return focus.sk;
  const c = new Map(); let best = '', n = 0;
  for (const i of byPlaceEntry.people) { const k = index.persons[i].sk; if (!k) continue; const v = (c.get(k) || 0) + 1; c.set(k, v); if (v > n) { n = v; best = k; } }
  return best;
}
/* the sentence for a year with movement: who left, who came, always true counts */
export function moveCaption(moves, places, y, W) {
  if (!moves.length) return '';
  const total = moves.reduce((s, m) => s + m.n, 0), top = moves[0], pf = places.get(top.from), pt = places.get(top.to);
  const when = W > 1 ? 'In the ' + W + ' years to ' + y : 'In ' + y;
  const people = n => (n === 1 ? 'one person' : n + ' people');
  if (moves.length === 1) return when + ', ' + people(top.n) + ' moved from ' + (pf ? pf.name : 'one place') + ' to ' + (pt ? pt.name : 'another') + (top.est ? ' (estimated)' : '') + '.';
  return when + ', ' + people(total) + ' moved between ' + moves.length + ' pairs of places; the biggest, ' + people(top.n) + ', from ' + (pf ? pf.name : 'one place') + ' to ' + (pt ? pt.name : 'another') + '.';
}

/* ---- the honest summary ---- */
export function summaryText(stats) {
  const t = stats.reduce((a, s) => ({ people: a.people + s.people, living: a.living + s.living, placed: a.placed + s.placed, withMove: a.withMove + s.withMove, estMove: a.estMove + s.estMove, est: a.est + s.estimated }), { people: 0, living: 0, placed: 0, withMove: 0, estMove: 0, est: 0 });
  const n = v => v.toLocaleString('en');
  return { ...t, line: n(t.people) + ' people in the file, ' + n(t.withMove) + ' with a known move' + (t.estMove ? ' (and ' + n(t.estMove) + ' with a move worked out from their dates)' : '') + (t.placed ? '; ' + n(t.placed) + ' who have died have a place' : '') + (t.living ? '; ' + n(t.living) + ' who may be living are never placed' : '') + '.' };
}

/* ---- the Under way list: only what touches a place where someone on screen was ---- */
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
export const EVENT_TRAIL = 30;   // an arrow stays in the list for this many years after it began, as on /history/
/* hist: history.json; mort: mortality.json; present: [{key, cn, lat, lon, ev, n}] the places with people in this year. all = true lists the whole world's. Returns rows
   [{id, kind, title, from, to, href, cc, why, major}] sorted by how many people they touch, then the year. */
export function relevantEvents(hist, mort, y, present, o) {
  o = o || {};
  const all = !!o.all, trail = o.trail || EVENT_TRAIL, limit = o.limit || 120;
  const cns = new Map(), evs = new Map();
  for (const pl of present || []) { if (pl.cn) cns.set(pl.cn, (cns.get(pl.cn) || 0) + pl.n); for (const e of pl.ev || []) evs.set(e, (evs.get(e) || 0) + pl.n); }
  const rows = [];
  const active = (f, t) => f <= y && y <= Math.max(num(t) == null ? f : t, f + trail - 1);
  for (const m of (hist && hist.moves) || []) {
    if (!active(m.f, m.t)) continue;
    const ccs = [m.s, m.o, m.how === 'origin' || m.how === 'text' ? m.seat : null].filter(Boolean);
    const hit = ccs.find(c => cns.has(c)), n = hit ? cns.get(hit) : 0;
    if (!all && !hit) continue;
    rows.push({ id: 'm|' + m.p + '|' + m.e + '|' + m.f + '|' + m.s, kind: m.v, title: text(m.vb || m.v, 40) + ' · ' + text(m.ot, 160), from: m.f, to: num(m.t) == null ? m.f : m.t, href: '/flags/' + m.p + '/#' + m.e, cc: hit || null, n, why: hit ? 'touches ' + hit : '', major: !!m.major });
  }
  for (const v of (hist && hist.voyages) || []) {
    const f = Math.floor(v.from), t = Math.floor(v.to);
    if (!(f <= y && y <= t + 1)) continue;
    let near = 0;
    if (!all) {
      const pts = [...(v.route || []), ...(v.reached || [])].filter(w => num(w.lat) != null);
      for (const pl of present || []) if (pts.some(w => hav(w.lat, w.lon, pl.lat, pl.lon) < 600)) near += pl.n;
      if (!near) continue;
    }
    rows.push({ id: 'v|' + v.id, kind: 'voyage', title: 'Voyage · ' + text(v.title, 160), from: f, to: t, href: '/history/', cc: null, n: near, why: near ? 'passes within 600 km of a place with people' : '', major: false });
  }
  for (const e of (mort && mort.events) || []) {
    if (!(e.f <= y && y <= e.t + 4)) continue;
    const hitEv = evs.has(e.id), hitCc = (e.cc || []).find(c => cns.has(c));
    if (!all && !hitEv && !hitCc) continue;
    const n = hitEv ? evs.get(e.id) : hitCc ? cns.get(hitCc) : 0;
    rows.push({ id: 'e|' + e.id, kind: 'mortality', title: text(e.n, 160), from: e.f, to: e.t, href: '/history/', cc: hitCc || null, n, why: hitEv ? 'touches a place with people' : hitCc ? 'touches ' + hitCc : '', major: false });
  }
  rows.sort((a, b) => b.n - a.n || b.from - a.from || a.id.localeCompare(b.id));
  return { rows: rows.slice(0, limit), total: rows.length };
}

/* ---- who held the ground: point in polygon over the Atlas's boundaries by year ---- */
export function ringContains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/* the polities whose boundary holds (lat, lon) in year y (shapes from history-ground.json: {n, q, s, e, p: [ring, ...]}); the first ring is the outline, a later ring a hole is not modelled
   by the source, so any ring that contains the point counts */
export function holdersAt(shapes, lat, lon, y) {
  const out = [];
  for (const sh of shapes || []) {
    if (!(sh.s <= y && y < sh.e)) continue;
    if ((sh.p || []).some(r => ringContains(r, lat, lon))) out.push({ name: sh.n, q: sh.q || null, from: sh.s, to: sh.e });
  }
  return out;
}

/* people alive per decade, for the little density line along the year slider: [{y, n}] from lo to hi */
export function densityByDecade(index, lo, hi) {
  const out = [];
  for (let d = Math.floor(lo / 10) * 10; d <= hi; d += 10) { let n = 0; for (const p of index.persons) if (p.by <= d + 9 && p.dy >= d) n++; out.push({ y: d, n }); }
  return out;
}

/* ---- the books: register volumes and collections for a place, in order of how well they fit the years in view ---- */
/* place: the Atlas place record (/p/<id>.json: volumes, fs, collections). from, to: the years in view. Returns [{kind, title, from, to, url, waypoint, film, fit, id}] with `fit`:
   2 the book's years overlap the range, 1 within 25 years of it, 0 otherwise, -1 no years given; ordered by fit, then closeness, then smaller span first (a register of a decade before a century's index). */
export function booksFor(place, from, to) {
  const out = [];
  const add = (kind, o) => {
    const a = num(o.from), b = num(o.to), url = typeof o.url === 'string' && /^https:\/\//.test(o.url) ? o.url : '';
    if (!url) return;
    let fit = -1, gap = 9999;
    if (a != null || b != null) {
      const lo = a != null ? a : b, hi = b != null ? b : a;
      gap = hi < from ? from - hi : lo > to ? lo - to : 0;
      fit = gap === 0 ? 2 : gap <= 25 ? 1 : 0;
    }
    out.push({ kind, title: text(o.t || o.title, 200) || 'Untitled', from: a, to: b, url, waypoint: text(o.waypoint, 120) || null, film: text(o.film, 40) || null, confession: text(o.conf, 60) || null,
      provider: text(o.provider, 40) || (kind === 'collection' ? 'FamilySearch' : ''), fit, gap, span: a != null && b != null ? b - a : 9999, id: kind === 'volume' || kind === 'collection' ? 'volume:' + (o.waypoint || url) : null, count: num(o.n) });
  };
  for (const v of (place && place.volumes) || []) add('volume', v);
  for (const c of (place && place.fs) || []) add('collection', c);
  for (const c of (place && place.collections) || []) add('record', c);
  const seen = new Set();
  return out.filter(b => { const k = b.kind + '|' + b.url; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => y.fit - x.fit || x.gap - y.gap || x.span - y.span || x.title.localeCompare(y.title));
}
/* the plain request text a person can paste into an email, a forum or a research log. It names the place, the kind of record, the years and the waypoint or film; it names no person. */
export function requestText(book, placeName, region) {
  const yrs = book.from != null || book.to != null ? (book.from === book.to || book.to == null ? String(book.from) : (book.from == null ? '' : book.from) + '–' + (book.to == null ? '' : book.to)) : 'years not given';
  const lines = ['I am looking for records from ' + placeName + (region ? ' (' + region + ')' : '') + '.', 'Record type: ' + (book.kind === 'collection' ? 'a collection' : book.kind === 'volume' ? 'a register volume' : 'a record collection') + ': ' + book.title + '.', 'Years: ' + yrs + '.'];
  if (book.confession) lines.push('Confession: ' + book.confession + '.');
  if (book.waypoint) lines.push('FamilySearch waypoint: ' + book.waypoint.split(':')[0] + '.');
  if (book.film) lines.push('Film: ' + book.film + '.');
  lines.push('Where it is listed: ' + book.url);
  return lines.join('\n');
}
/* the years in view: the range the visitor is looking at (year +/- the window) */
export const rangeInView = (y, W) => [y - Math.max(0, (W | 0) - 1), y];

/* ---- a view record: the last year and filter, opaque and tiny ---- */
export function cleanView(v) {
  v = v && typeof v === 'object' ? v : {};
  const f = cleanFilter(v.f);
  return { y: Number.isInteger(v.y) && v.y >= 600 && v.y <= 2100 ? v.y : null, f, w: [1, 5, 10, 25].includes(v.w) ? v.w : 10, c: v.c === 'line' ? 'line' : 'side', sp: [1, 2, 4, 8].includes(v.sp) ? v.sp : 2 };
}

/* the year range the data covers: earliest birth to latest death among the placed people */
export function yearSpan(index) {
  let lo = Infinity, hi = -Infinity;
  for (const p of index.persons) { if (p.by < lo) lo = p.by; if (p.dy > hi) hi = p.dy; }
  return lo === Infinity ? null : [lo, hi];
}
