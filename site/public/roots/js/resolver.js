/* Place resolver: a port of gedcom-app-experiment/resolve_v2.py. Same pipeline and the same tiers, so the two can be compared string by string.

   Tiers that DRAW a person at the place:  confident, confident-by-region, probable, by-tree-context
   Tiers that draw at a coarser level:     parent-level (a later part of the string, a town), region, country-only
   Tiers that are only a review item:      review-skipped-part, review-other-country, ambiguous, not-found
   A review item is never drawn on a guess; resolve() returns the candidates so the user can pick one.

   Data comes from a Gazetteer: per-country shards (data/g/<CC>.json, loaded on demand) and data/adm.json. Folded keys are computed at
   build time by scripts/build-roots-data.py; norm() and sq() below mirror that script's functions and must stay in step with it. */
import { COUNTRY, HOME, PLACE_ALIAS, HOME_PT, COUNTIES, LEADING_JUNK } from './tables.js';
for (const t of [COUNTRY, HOME, PLACE_ALIAS, HOME_PT, COUNTIES]) Object.setPrototypeOf(t, null);   // so a place called "constructor" is not a country

export function norm(s) {
  s = s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
  s = s.replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ø/g, 'o').replace(/ß/g, 'ss').replace(/æ/g, 'ae');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}
export const sq = s => norm(s).replace(/ /g, '');

const SUFFIX = /\b(county|province|provincia|region|regione|district|shire|state|department|municipality|prefecture|governorate|oblast|kreis|landkreis|distrito|bashkia|opcina|grad|zupanija|county of|city of|town of|parish of)\b/g;
const VENUE = /\b(church|chapel|cathedral|cemetery|churchyard|hospital|house|huis|farm|plaas|palace|hotel|school|street|road|st\.? mary|parish|rectory|vicarage|manor|castle|barracks|prison|station|harbour|harbor|lodge|mission|methodist|baptist|anglican|catholic|dutch reformed|ngk|nederduitse|synagogue|mill|cottage|hall)\b/i;
const strip = s => norm(norm(s).replace(SUFFIX, ' '));    // the reference folds twice: once, drop the suffix words, fold again
const pop = p => p.p || 0;
const EMPTY = Object.freeze([]);
const homeIso = n => HOME[n] || (HOME_PT[n] ? HOME_PT[n][2] : null);
const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
const BLOCK = new Set(['georgia', 'jersey', 'guinea', 'niger', 'chad', 'turkey', 'victoria', 'mali', 'togo', 'oman', 'cuba', 'peru', 'china', 'samoa', 'dominica', 'panama', 'columbia', 'lebanon', 'jordan', 'israel']);
/* The Atlas's own country names (data/atlas.json -> countries), added to the hand table. A few names that are also US states, towns or common words
   are left out: they are only read as countries when the hand table says so. */
export function addCountryNames(countries) {
  for (const [cc, v] of Object.entries(countries || {})) { const k = norm(v[0]); if (k && !(k in COUNTRY) && !BLOCK.has(k)) COUNTRY[k] = cc; }
}

function haversine(a, b, c, d) {
  const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

function within1(a, b) {
  if (a === b) return true;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
export class Gazetteer {
  constructor() { this.idx = new Map(); this.floor = new Map(); this.merged = new Map(); this.loaded = new Set(); this.adm = new Map(); this.admname = new Map(); this.cache = new Map(); this.admLoaded = false; this.meta = null; }
  /* io.json(path) -> Promise<object>. In the page it is fetch of a same-origin file; in the tests it reads the file. */
  async loadAdmin(io) {
    if (this.admLoaded) return;
    const { d } = await io.json('data/adm.json');
    for (const r of d) {
      const div = { cc: r[0], level: r[1] === 1 ? 'adm1' : 'adm2', name: r[2], adm1: r[3], lat: r[4], lon: r[5] };
      for (const k of r[6].split('|')) { if (!k) continue; const a = this.admname.get(k); if (a) a.push(div); else this.admname.set(k, [div]); }
      if (r[1] === 1) { const a = this.adm.get(div.cc); if (a) a.push(div); else this.adm.set(div.cc, [div]); }
    }
    this.admLoaded = true;
  }
  async loadFloor(io) {
    if (this.floorLoaded) return; this.floorLoaded = true;
    const { n, y, x, p, k, c } = await io.json('data/floor.json');
    for (let i = 0; i < n.length; i++) {
      const pl = { n: n[i], y: y[i], x: x[i], p: p[i], k: c[i] };
      for (const key of k[i].split('|')) { const a = this.floor.get(key); if (a) a.push(pl); else this.floor.set(key, [pl]); }
    }
  }
  /* Every place with this key: the loaded country shards, plus the world floor for countries whose shard is not loaded. */
  look(key) {
    const a = this.idx.get(key), f = this.floor.get(key);
    if (!f) return a || EMPTY;
    const extra = f.filter(p => !this.loaded.has(p.k));
    if (!extra.length) return a || EMPTY;
    return a ? a.concat(extra) : extra;
  }
  async loadCountry(io, cc) {
    if (this.loaded.has(cc)) return; this.loaded.add(cc);
    let s; try { s = await io.json('data/g/' + cc + '.json'); } catch (e) { return; }
    const { n, y, x, p, k } = s;
    for (let i = 0; i < n.length; i++) {
      const pl = { n: n[i], y: y[i], x: x[i], p: p[i], k: cc };
      for (const key of k[i].split('|')) { const a = this.idx.get(key); if (a) a.push(pl); else this.idx.set(key, [pl]); }
    }
  }
  /* Spellings one letter away from this text (a missing, extra or wrong letter) among the places of one country. Suggestions only: nothing is ever
     accepted from them without the visitor's pick. Needs the country's places to be loaded. */
  suggest(text, cc) {
    const key = sq(norm(text)); if (key.length < 5) return [];
    const seen = new Set(), out = [];
    for (const [k, list] of this.idx) {
      if (Math.abs(k.length - key.length) > 1 || k === key || !within1(sq(k), key)) continue;
      for (const p of list) if (p.k === cc && !seen.has(p.n + p.y)) { seen.add(p.n + p.y); out.push(p); }
    }
    return out.sort((a, b) => pop(b) - pop(a)).slice(0, 6).map(p => describe(this, p));
  }
  fuzzyAdm(key, cc) {
    if (!this.fz) this.fz = new Map();
    const ck = cc + '|' + key; if (this.fz.has(ck)) return this.fz.get(ck);
    let out = null;
    for (const d of this.adm.get(cc) || []) {
      const t = sq(norm(d.name)); if (Math.abs(t.length - key.length) > 1 || t.length < 8) continue;
      if (within1(t, key)) (out = out || []).push(d);
    }
    this.fz.set(ck, out); return out;
  }
  nearestAdm1(p) {
    const key = p.k + '|' + p.n + '|' + p.y + '|' + p.x;
    if (this.cache.has(key)) return this.cache.get(key);
    let best = null;
    for (const d of this.adm.get(p.k) || []) { const dist = haversine(p.y, p.x, d.lat, d.lon); if (!best || dist < best[0]) best = [dist, d.name]; }
    const r = best ? best[1] : null; this.cache.set(key, r); return r;
  }
}

/* ---------- reading a string into parts ---------- */
export function parseParts(raw, gz) {
  const t = raw.replace(/\([^)]*\)/g, '').replace(/\[([^\]]*)\]/g, ', $1').replace(/\bQ'?ld\b/gi, 'Queensland').trim().replace(/\.+$/, '').trim();
  let ps = t.split(',').map(x => x.trim().replace(/\.+$/, '').replace(LEADING_JUNK, '').replace(/\s+(twp|twsp|tp|parish|dist|district)$/i, '')).filter(x => x && !/^(of|in|at|nr|near|the)$/i.test(x) && !/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/.test(x) && !/^(section|sec|row|grave|plot|lot|block|ward|wd)\b\s*[:#.]?\s*\w{0,4}\s*[,:]?/i.test(x) && !/^\w+\s*:\s*\w+/.test(x));   // "Innisfil Twp.": a township is named like the settlement. ("Co." is NOT stripped: Simcoe Co. is a county, not the town of Simcoe.)
  if (ps.length === 1) {                      // comma-less: peel a country, then a region, off the end
    let toks = ps[0].split(/\s+/);
    for (const n of [3, 2, 1]) {              // "Grahamstown Eastern Cape South Africa South Africa": a country said twice at the end is said once
      if (toks.length >= 2 * n && norm(toks.slice(-n).join(' ')) in COUNTRY && norm(toks.slice(-n).join(' ')) === norm(toks.slice(-2 * n, -n).join(' '))) { toks = toks.slice(0, -n); break; }
    }
    for (const n of [3, 2, 1]) if (toks.length > n && norm(toks.slice(-n).join(' ')) in COUNTRY) { ps = [toks.slice(0, -n).join(' '), toks.slice(-n).join(' ')]; break; }
    const rest = ps[0].split(/\s+/), whole = norm(ps[0]);
    // a string that is already a known place or division ("Cape Town") is not split just because its last word is also some division's name
    const known = gz.look(whole).length > 0 || gz.admname.has(strip(ps[0])) || gz.admname.has(sq(whole));
    for (const n of known ? [] : [3, 2, 1]) {
      if (rest.length > n && (gz.admname.has(sq(rest.slice(-n).join(' '))) || homeIso(norm(rest.slice(-n).join(' '))))) {
        ps = [rest.slice(0, -n).join(' '), rest.slice(-n).join(' '), ...ps.slice(1)]; break;
      }
    }
  }
  const out = [];
  for (const x of ps) { if (out.length && norm(x) === norm(out[out.length - 1]) && norm(x) in COUNTRY) continue; out.push(x); }   // "South Africa South Africa"
  return out;
}

/* Which country shards a string needs. A country the text names (or a home region it names) is its country; failing that, a division name
   that belongs to exactly one country is. A name that exists in many countries ("Victoria") decides nothing and loads nothing: with no
   country the resolver looks the place up in the world floor and in the countries the tree itself is mostly in. */
export function countriesTouched(raw, gz) {
  const out = new Set(), adm = new Set(); let named = false;
  for (const x of parseParts(raw, gz)) {
    const n = norm(x); if (n in COUNTRY) { out.add(COUNTRY[n]); named = true; } if (homeIso(n)) { out.add(homeIso(n)); named = true; }
    const nn = strip(x); for (const d of gz.admname.get(nn) || gz.admname.get(sq(nn)) || []) adm.add(d.cc);
  }
  if (!named && adm.size === 1) for (const c of adm) out.add(c);
  return out;
}

const CAND = 6;
const describe = (gz, p) => ({ n: p.n, y: p.y, x: p.x, k: p.k, p: p.p, region: gz.nearestAdm1(p) });

/* resolve(raw, prior, gz) -> {tier, iso, place, div, cands}.  `place` is a gazetteer row, `div` an admin division. */
export function resolve(raw, prior, gz) {
  const r = resolve0(raw, prior, gz);
  if (r.tier === 'ambiguous' || r.tier === 'not-found' || r.tier === 'review-skipped-part') {
    for (const n of parseParts(raw, gz).map(norm)) if (n in COUNTRY) r.said = COUNTRY[n];     // the text itself names a country: enough to draw at the country, never at a place
  }
  return r;
}
function resolve0(raw, prior, gz) {
  const ps = parseParts(raw, gz), ns = ps.map(norm);
  let iso = null;
  for (let i = ns.length - 1; i >= 0; i--) if (ns[i] in COUNTRY) { iso = COUNTRY[ns[i]]; break; }
  if (iso === 'HU' || iso === 'AT') { for (const n of ns) if (HOME[n] === 'HR') { iso = 'HR'; break; } }   // "Modrus-Fiume, Hungary": the Kingdom of Hungary held Croatia
  const admHits = [], placeParts = [], firstNamed = ns.findIndex(n => n && !(n in COUNTRY));
  for (let i = 0; i < ps.length; i++) {
    let x = ps[i], n = ns[i];
    if (!n || n in COUNTRY) continue;
    const nn = strip(n);
    let cand = gz.admname.get(nn) || gz.admname.get(sq(nn));
    if (!cand && iso && nn.length >= 8 && !(gz.look(PLACE_ALIAS[n] || n) || []).length) cand = gz.fuzzyAdm(sq(nn), iso);   // one letter out ("Schlewig-Holstein"): a hint only
    const co = (iso === 'GB' || iso === 'IE') && COUNTIES[nn];
    if (co && co[2] === iso) cand = (cand || []).concat([{ cc: iso, level: 'adm2', name: titleCase(nn), adm1: '', lat: co[0], lon: co[1] }]);
    if (homeIso(n) && (!iso || homeIso(n) === iso)) { iso = iso || homeIso(n); admHits.push([x, null, 'home', i]); }
    if (/\d/.test(x) && /[a-z]/.test(n)) { x = x.replace(/\b\d+[a-z]?\b/g, '').trim(); n = norm(x); }
    const venue = VENUE.test(x) || (i === 0 && ps.length >= 3 && /^(st|saint|sainte)\.? \S/i.test(x) && !(norm(ps[1]) in COUNTRY) && !gz.admname.has(strip(ps[1])) && !COUNTIES[norm(ps[1])]);   // "Saint Andrew, Holborn, London": a dedication, not a place
    const pn = PLACE_ALIAS[n] || n;
    if (venue && i < ps.length - 1) { placeParts.push([i, pn, true]); continue; }
    const hitPlaces = gz.look(pn) || [];
    if (cand && (!iso || cand.some(d => d.cc === iso))) {
      const here = cand.filter(d => !iso || d.cc === iso);
      if (i > firstNamed || !hitPlaces.some(p => !iso || p.k === iso)) admHits.push([x, here, 'admin', i]);   // a later part that is both ("New York" after "Nassau County") is the division
      else { placeParts.push([i, pn, false]); admHits.push([x, here, 'admin', i, true]); }   // [4]: the part is a place first; it must not also decide the country
    } else placeParts.push([i, pn, false]);
  }
  if (!iso && admHits.length) {
    const ccs = new Set();                                    // a division that belongs to one country decides it, even beside one (Albany) that belongs to several
    for (const [x, ds, , , alsoPlace] of admHits) if (ds && !alsoPlace && norm(x).length > 2) { const c = new Set(ds.map(d => d.cc)); if (c.size === 1) ccs.add([...c][0]); }   // a two-letter abbreviation ("Kp") is too thin to decide a country
    if (ccs.size === 1) iso = [...ccs][0];
  }
  const hints = new Set();
  for (const [, ds] of admHits) if (ds) for (const d of ds) { hints.add(d.name); if (d.adm1) hints.add(d.adm1); }
  const real = placeParts.filter(([, , v]) => !v);
  const firstReal = real.length ? Math.min(...real.map(([j]) => j)) : null;
  const R = (tier, iso2, place, div, cands, pool) => ({ tier, iso: iso2, place: place || null, div: div || null, cands: cands || [], pool });
  const cands = h => {                                       // the biggest first; a second row for the same name in the same region within 3 km is the same place twice
    const out = [];
    for (const p of [...h].sort((a, b) => pop(b) - pop(a))) {
      if (out.length >= CAND) break;
      if (out.some(q => q.k === p.k && norm(q.n) === norm(p.n) && haversine(q.y, q.x, p.y, p.x) <= 3)) continue;
      out.push(describe(gz, p));
    }
    return out;
  };

  for (const [i, n, venue] of placeParts) {
    const hits = gz.look(n) || [];
    let h = hits.filter(p => !iso || p.k === iso);
    if (!h.length) continue;
    h = h.slice().sort((a, b) => pop(b) - pop(a));
    const primary = real.length ? i === firstReal : true;
    const cty = admHits.find(a => a[1] && a[1].some(d => d.level === 'adm2' && !d.adm1 && d.cc === (iso || d.cc)) && a[3] !== i);
    if (h.length > 1 && cty) {                               // a named county (centre known to ~60 km): the one candidate inside it
      const c = cty[1].find(d => !d.adm1), inC = h.filter(p => haversine(p.y, p.x, c.lat, c.lon) <= 55);
      if (inC.length === 1) return R('confident-by-region', iso || inC[0].k, inC[0], null, [describe(gz, inC[0])]);
    }
    if (!(real.length ? i === firstReal : true) && admHits.some(a => a[3] === i && a[1])) continue;   // "Westminster, Middlesex": the county, not a pseudo-place called Middlesex
    if (h.length > 1 && hints.size) {
      const h2 = h.filter(p => hints.has(gz.nearestAdm1(p)));
      if (h2.length === 1) return R('confident-by-region', iso || h2[0].k, h2[0], null, [describe(gz, h2[0])]);
      if (h2.length) h = h2;
    }
    if (cty && primary) {                                    // the text names a county the chosen place is nowhere near: a review item, not a match
      const c = cty[1].find(d => !d.adm1), far = h.filter(p => haversine(p.y, p.x, c.lat, c.lon) > 110);
      if (far.length === h.length) return { ...R('ambiguous', iso, h[0], null, cands(h), h), contra: true };
    }
    if (h.length === 1 || (pop(h[0]) >= 3 * pop(h[1]) && pop(h[0]) > 0)) {
      let tier = iso ? 'confident' : 'probable';
      if (!iso && new Set(hits.map(p => p.k)).size === 1 && !prior.has(h[0].k) && pop(h[0]) < 100000)    // a bare name found in one country the tree never mentions is a guess
        return R('ambiguous', null, h[0], null, [describe(gz, h[0])], h);
      if (!iso && new Set(hits.map(p => p.k)).size > 1) {
        const top = hits.slice().sort((a, b) => pop(b) - pop(a));
        if (prior.size && !prior.has(top[0].k) && hits.some(p => prior.has(p.k))) return R('ambiguous', null, null, null, cands(top), top);   // the biggest one is in a country the tree never mentions, a smaller one in a country it does
        if (pop(top[0]) < 20 * Math.max(1, pop(top[1]))) {
          const inp = hits.filter(p => prior.has(p.k));
          if (new Set(inp.map(p => p.k)).size === 1 && (!prior.get || (prior.get(inp[0].k) || 0) / (prior.total || 1) >= 0.1)) return R('by-tree-context', inp[0].k, inp[0], null, [describe(gz, inp[0])]);
          if (prior.get && inp.length) {                                   // several of the tree's countries have one: take the country that dominates the tree, if one clearly does
            const ws = new Map(); for (const p of inp) ws.set(p.k, prior.get(p.k) || 0);
            const sum = [...ws.values()].reduce((a, b) => a + b, 0), [bk, bw] = [...ws].sort((a, b) => b[1] - a[1])[0];
            if (sum && bw / sum >= 0.7 && bw / (prior.total || 1) >= 0.3) { const pk = inp.filter(p => p.k === bk).sort((a, b) => pop(b) - pop(a)); if (pk.length === 1 || pop(pk[0]) >= 3 * pop(pk[1])) return R('by-tree-context', bk, pk[0], null, [describe(gz, pk[0])]); }
          }
          return R('ambiguous', null, null, null, cands(top), top);
        }
        h = [top[0]];
      }
      if (!primary) {
        const p = h[0];
        if (pop(p) >= 1000 && (norm(p.n) === n || sq(norm(p.n)) === sq(n)) && !(venue && pop(p) < 20000)) return R('parent-level', iso || p.k, p, null, [describe(gz, p)]);
        return R('review-skipped-part', iso || p.k, p, null, [describe(gz, p)]);
      }
      const pick = h[0], cc = iso || pick.k;
      const divs = admHits.filter(a => a[1] && a[3] !== i && !a[4]).flatMap(a => a[1]).filter(d => d.cc === cc && d.lat != null && (d.level === 'adm1' || d.level === 'adm2'));
      if (divs.length && !divs.some(d => d.name === gz.nearestAdm1(pick) || (d.adm1 && d.adm1 === gz.nearestAdm1(pick)) || haversine(pick.y, pick.x, d.lat, d.lon) <= 120))
      {                                                                                    // the text names a region or district ("Schleswig-Holstein") the one place of that name is nowhere near: draw the region the text names, and offer the place
        const d = divs.find(z => z.level === 'adm2') || divs[0];
        return R(d.level === 'adm2' ? 'district' : 'region', cc, null, d, [describe(gz, pick)], h);
      }
      const later = placeParts.filter(([j, , v]) => j > i && !v);
      for (const [, ln] of later) {                                                       // a later part that is itself a place of this country, a long way off: the text points somewhere else
        const lh = (gz.look(ln) || []).filter(p => p.k === cc && (norm(p.n) === ln || sq(norm(p.n)) === sq(ln)));   // by its own name, not by a short key
        if (lh.length && !lh.some(p => haversine(p.y, p.x, pick.y, pick.x) <= 60)) {
          const top = lh.slice().sort((x, y) => pop(y) - pop(x))[0];                        // "Bultfontein, Cradock": the farm is not in the gazetteer there; the district town is
          return { ...R(pop(top) >= 1000 ? 'parent-level' : 'ambiguous', cc, top, null, [describe(gz, top), describe(gz, pick)], h), contra: true };
        }
      }
      return R(tier, cc, pick, null, [describe(gz, pick)]);
    }
    if (!primary) return R('review-skipped-part', iso, h[0], null, cands(h));
    return R('ambiguous', iso, h[0], null, cands(h), h);
  }
  if (iso) {
    for (const [, n] of placeParts) {
      if (homeIso(n)) continue;                                  // a region the text names ("Cape") is not a place of that name in another country
      const hits = gz.look(n) || [];
      if (hits.length && !hits.some(p => p.k === iso)) {
        const top = hits.slice().sort((a, b) => pop(b) - pop(a));
        if (new Set(hits.map(p => p.k)).size === 1 || pop(top[0]) >= 20 * Math.max(1, pop(top[1]))) return R('review-other-country', top[0].k, top[0], null, cands(top));
      }
    }
  }
  if (admHits.length) {
    const withDiv = admHits.filter(h => h[1] && h[1].length);
    if (withDiv.length) {
      const h = withDiv[0], d = h[1][0], firstPart = ps.findIndex(x => norm(x) && !(norm(x) in COUNTRY));
      return R(d.level === 'adm2' && h[3] === firstPart ? 'district' : 'region', iso, null, d, withDiv.flatMap(z => z[1]).slice(0, CAND));
    }
    for (const [x] of admHits) { const hp = HOME_PT[norm(x)]; if (hp) return R('region', iso, null, { cc: hp[2], level: 'home', name: hp[3], adm1: '', lat: hp[0], lon: hp[1] }, []); }
    return R('region', iso, null, null, []);
  }
  return iso && !placeParts.length ? R('country-only', iso, null, null, []) : R('not-found', iso, null, null, []);
}

export const REAL = new Set(['confident', 'confident-by-region', 'probable', 'by-tree-context', 'by-neighbours']);
export const COARSE = new Set(['parent-level', 'region', 'district', 'country-only']);
export const REVIEW = new Set(['review-skipped-part', 'review-other-country', 'ambiguous']);

/* Resolve a whole file's place strings. `counts` is a Map(string -> mentions). Loads only the shards the strings can touch, plus the
   six countries the tree mentions most (the reference's "prior"), so an unadorned "Springfield" can be read in the tree's own context. */
export async function resolveAll(counts, gz, io, onProgress) {
  await gz.loadAdmin(io); await gz.loadFloor(io);
  const cc = new Map(), need = new Set();
  for (const [s, c] of counts) {
    for (const x of parseParts(s, gz)) { const n = norm(x); if (n in COUNTRY) cc.set(COUNTRY[n], (cc.get(COUNTRY[n]) || 0) + c); }
    for (const k of countriesTouched(s, gz)) need.add(k);
  }
  const top6 = [...cc].sort((a, b) => b[1] - a[1]).slice(0, 6), prior = new Map(top6); prior.total = [...cc.values()].reduce((a, b) => a + b, 0);
  for (const k of prior.keys()) need.add(k);
  let done = 0;
  for (const k of need) { await gz.loadCountry(io, k); onProgress && onProgress('shard', ++done, need.size, k); }
  const res = new Map();
  for (const s of counts.keys()) res.set(s, resolve(s, prior, gz));
  const nb = refineByNeighbours(res, counts, gz);
  return { res, prior: new Set(prior.keys()), countries: [...need], byNeighbours: nb };
}

/* A bare name with several candidates ("Selce") is placed only when exactly one candidate has the tree's own, already-placed people around
   it (within 50 km: at least 3 mentions from at least 2 different texts) and no other candidate has any. It is its own tier, "by-neighbours",
   so the report and the picker can always tell it from an exact match, and a pick on the review screen overrides it. */
export function refineByNeighbours(res, counts, gz) {
  const anchors = [];
  for (const [s, r] of res) if (REAL.has(r.tier) && r.place) anchors.push({ s, y: r.place.y, x: r.place.x, w: counts.get(s) || 1 });
  const cell = new Map(), key = (y, x) => Math.floor(y) + ',' + Math.floor(x);
  for (const a of anchors) { const k = key(a.y, a.x); (cell.get(k) || cell.set(k, []).get(k)).push(a); }
  const near = (y, x, self) => {
    let w = 0; const strs = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const L = cell.get(key(y + dy, x + dx)); if (!L) continue;
      for (const a of L) if (a.s !== self && haversine(y, x, a.y, a.x) <= 50) { w += a.w; strs.add(a.s); }
    }
    return { w, n: strs.size };
  };
  let changed = 0;
  for (const [s, r] of res) {
    if (r.tier !== 'ambiguous' || r.contra || !r.pool || r.pool.length < 2 || r.pool.length > 40) continue;
    const sup = r.pool.map(p => ({ p, ...near(p.y, p.x, s) })), good = sup.filter(z => z.w >= 3 && z.n >= 2), any = sup.filter(z => z.w > 0);
    if (good.length === 1 && any.length === 1) {
      const p = good[0].p; res.set(s, { tier: 'by-neighbours', iso: p.k, place: p, div: null, cands: [describe(gz, p)] }); changed++;
    }
  }
  return changed;
}
