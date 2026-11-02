/* Turns resolved places into the ATLAS object the Roots & Routes template reads: pins, the regime and flag over each pin by year, mortality
   events, collections. A port of build_atlas_data.py that runs in the worker, over data/atlas.json (the Atlas for every region at once).

   Two layers, kept apart:  layer 1 (every pin) = where it is and which country;  layer 2 (only where the Atlas has surveyed) = regime
   timeline, events, collections. A place with no region gets a pin and the flags its country had on each date, and nothing else.
   Nothing in layer 2 is ever inferred for a place the Atlas does not hold. */
import { norm, REAL, COARSE } from './resolver.js';

const FROM_YEAR = 1700, TO_YEAR = 2026;

function inside(lat, lon, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
    if ((xi > lon) !== (xj > lon) && lat < (yj - yi) * (lon - xi) / (xj - xi) + yi) ins = !ins;
  }
  return ins;
}
function km(a, b, c, d) { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }

export class AtlasCore {
  constructor(core) {
    this.c = core;
    this.regions = Object.entries(core.regions).map(([id, r]) => ({ id, ...r, box: bbox(r.ring) }));
    this.byName = new Map();                                     // folded name -> surveyed places
    for (const p of core.places) for (const nm of [p[1], ...p[5]]) { const k = norm(nm); if (!k) continue; const a = this.byName.get(k); if (a) a.push(p); else this.byName.set(k, [p]); }
    this.fcache = new Map();
  }
  regionOf(lat, lon) { for (const r of this.regions) { const b = r.box; if (lat >= b[0] && lat <= b[1] && lon >= b[2] && lon <= b[3] && inside(lat, lon, r.ring)) return r.id; } return null; }
  /* the Atlas's own place with the same name, in the same country, within 15 km — the only way a pin gets an Atlas id */
  match(name, cc, lat, lon) {
    for (const p of this.byName.get(norm(name)) || []) if (p[2] === cc && km(lat, lon, p[3], p[4]) <= 15) return p;
    return null;
  }
  flagAtYear(iso, y) {
    const es = this.c.flagMap[iso]; if (!es) return null;
    let best = null; for (const [f, t, i] of es) if (f <= y && (t === null || y < t) && (!best || f > best[0])) best = [f, i];
    if (best) return best[1];
    best = null; for (const [f, , i] of es) if (f <= y && (!best || f > best[0])) best = [f, i];
    return best ? best[1] : null;
  }
  eraRegime(rid, y) {
    if (!rid) return null; const es = this.c.regions[rid].eras;
    for (const e of es) if (e[0] <= y && y < e[1]) return e[2];
    return y >= es[es.length - 1][1] ? es[es.length - 1][2] : null;
  }
  /* [[year, imageId], ...] — a new entry only where the flag changes. Cached per (region, country) because most pins share both. */
  flagTimeline(frid, iso0) {
    const key = frid + '|' + iso0; if (this.fcache.has(key)) return this.fcache.get(key);
    const out = []; let last = null;
    for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
      const rg = this.eraRegime(frid, y); let iso = rg ? this.c.riso[rg] : null;
      if (!iso || !this.c.flagMap[iso]) iso = iso0;
      const im = this.flagAtYear(iso, y) || this.flagAtYear(iso0, y);
      if (im === null || im === undefined) continue;
      if (im !== last) { out.push([y, im]); last = im; }
    }
    this.fcache.set(key, out); return out;
  }
}
function bbox(ring) { let a = 90, b = -90, c = 180, d = -180; for (const [y, x] of ring) { if (y < a) a = y; if (y > b) b = y; if (x < c) c = x; if (x > d) d = x; } return [a, b, c, d]; }

/* A resolution -> the thing to draw, or null.  `r` is a resolver result, or {tier:'user', place} for a pick made on the review screen. */
export function targetOf(r, core) {
  if (!r) return null;
  if (r.tier === 'user' || REAL.has(r.tier) || r.tier === 'parent-level') {
    const p = r.place; if (!p) return null;
    return { id: 'p|' + p.k + '|' + p.n + '|' + p.y + '|' + p.x, name: p.n, lat: p.y, lon: p.x, iso: p.k, region: p.region || null, kind: 'place' };
  }
  if ((r.tier === 'region' || r.tier === 'district') && r.div) return { id: 'd|' + r.div.cc + '|' + r.div.name + '|' + r.div.adm1, name: r.div.name + (r.div.level === 'adm2' ? ' (district)' : ' (region)'), lat: r.div.lat, lon: r.div.lon, iso: r.div.cc, region: null, kind: 'region' };
  const cc = r.tier === 'country-only' ? r.iso : r.said;                  // a country the text names itself, though the place in it is undecided
  if (cc && core.countries[cc]) { const c = core.countries[cc]; return { id: 'c|' + cc, name: c[0] + ' (country only)', lat: c[1], lon: c[2], iso: cc, region: null, kind: 'country' }; }
  return null;
}

/* Give every target a unique display name (the template keys places by name). */
export function nameTargets(targets) {
  const byName = new Map();
  for (const t of targets.values()) { t.n = t.name; const a = byName.get(t.n); if (a) a.push(t); else byName.set(t.n, [t]); }
  for (const a of byName.values()) {
    if (a.length < 2) continue;
    for (const t of a) t.n = t.name + ', ' + (t.region || t.iso);
    const again = new Map(); for (const t of a) { const b = again.get(t.n); if (b) b.push(t); else again.set(t.n, [t]); }
    for (const b of again.values()) if (b.length > 1) b.forEach((t, i) => { if (i) t.n = t.n + ' (' + (i + 1) + ')'; });
  }
}

/* Build the ATLAS for these targets. `getFlag(imageId)` -> Promise<svg text> (the page fetches /fl/<id>.svg; nothing about the tree is in the URL beyond which flags exist). */
export async function buildAtlas(targets, AC, getFlag) {
  const core = AC.c, places = [], evUsed = {}, usedReg = new Set(), imgs = [], idx = new Map();
  const img = i => { if (!idx.has(i)) { idx.set(i, imgs.length); imgs.push(i); } return idx.get(i); };
  for (const t of targets.values()) {
    const lat = +t.lat, lon = +t.lon;
    const rid = AC.regionOf(lat, lon);
    const hit = [];
    for (const ev of core.events) {
      if (ev.t < FROM_YEAR || ev.f > 2025) continue;
      if (ev.g || (ev.poly && ev.poly.some(r => inside(lat, lon, r)))) { hit.push(ev.id); if (!evUsed[ev.id]) evUsed[ev.id] = [ev.n, ev.ty, ev.f, ev.t, ev.says, ev.toll]; }
    }
    const iso0 = core.territory[t.iso] || t.iso;
    const fl = AC.flagTimeline(rid, iso0).map(([y, i]) => [y, img(i)]);
    if (rid) usedReg.add(rid);
    const ap = t.kind === 'place' ? AC.match(t.name, t.iso, lat, lon) : null;
    places.push({ n: t.n, id: ap ? ap[0] : null, lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, reg: rid, cn: t.iso, ev: hit, fl, cols: ap ? ap[6] : [], kind: t.kind });
  }
  const regions = {}, used = new Set();
  for (const k of usedReg) { const g = core.regions[k]; regions[k] = { label: g.label, eras: g.eras }; for (const e of g.eras) used.add(e[2]); }
  const regimes = {}; for (const k of used) regimes[k] = core.regimes[k] || { label: k, c: ['#7A8790', '#A9B4BB'] };
  const fu = new Set(); for (const r of Object.values(regions)) for (const e of r.eras) for (const x of e[5]) fu.add(x);
  for (const p of places) for (const c of p.cols) fu.add(c[4]);
  const prov = {}, provurl = {}; for (const k of fu) { if (core.prov[k]) prov[k] = core.prov[k]; if (core.provurl[k]) provurl[k] = core.provurl[k]; }
  const flags = [];
  for (let n = 0; n < imgs.length; n++) {
    let s = ''; try { s = (await getFlag(imgs[n])).trim(); } catch (e) { s = ''; }
    const vb = (/viewBox="([^"]+)"/.exec(s) || [, '0 0 3 2'])[1];
    let inner = s.replace(/^<svg[^>]*>|<\/svg>\s*$/g, '');
    inner = inner.replace(/\bid="([^"]+)"/g, (m, a) => 'id="f' + n + '_' + a + '"').replace(/url\(#([^)]+)\)/g, (m, a) => 'url(#f' + n + '_' + a + ')').replace(/(xlink:)?href="#([^"]+)"/g, (m, x, a) => 'href="#f' + n + '_' + a + '"');
    flags.push([vb, inner]);
  }
  const rlabel = {}; for (const k of Object.keys(regions)) rlabel[k] = regions[k].label;
  return { land: core.land, regimes, regions, places, events: evUsed, prov, provurl, flags, fid: imgs, rlabel };
}

export { REAL, COARSE };
