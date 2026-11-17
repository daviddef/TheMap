/* treejson.js — read a Roots & Routes `tree.json` that a researcher built for their OWN site, so it can be dropped on the Tree Canvas like a GEDCOM.
 *
 * Pure: text in, `{ ok, tree, notes }` or `{ ok:false, error }` out. No DOM, no network, so the same file runs in the worker and in node
 * (scripts/test-tree-json.mjs). The format is written up at /tree-canvas/publish/ ; this file is the check that page promises.
 *
 * What it does, in order:
 *   1. parses the text and says plainly what is wrong when it is not a tree (never "Unexpected token");
 *   2. keeps only the fields the canvas reads, each cut to a safe size and type (the file is the visitor's own, but it is still not trusted);
 *   3. makes the family links agree with one another (a child named in `kids` gets that parent, a parent's `kids` lists the child) and drops links to people
 *      who are not in the file, counting them;
 *   4. applies the archive rule for living people to EVERY file, before anything is drawn: `living: true`, or no death year (or only an estimated
 *      one) and born after 1920, leaves a card with a name and a family and nothing else (no dates, places, page, sources). A careless export cannot
 *      put a living person's details on the canvas;
 *   5. marks the tree `meta.source = "tree.json"`, which is how the canvas knows to carry the richer fields (page, route, corrections count, full
 *      dates) for a file and still call it the visitor's own and never one of the archives.
 *
 * The page link (`page`) is a path on the owner's site, so it is only kept when the file also says which site: `meta.site`, an https address.
 *
 * PLACES. A name like "Mascali" or "Melbourne" means nothing without a country, so a file may bring the places it already placed, the way Roots & Routes writes them
 * (`atlas.places`, or a top-level `places`): only the name, the latitude and longitude and the country ("IT" or "Italy") are read, and used to place that exact text. Everything
 * else about a place (its flag, its rulers, its eras) is looked up again in the Atlas's own files; nothing drawn comes from the file. A place the file does not bring is
 * looked up by its text, as a GEDCOM's is, so "Rijeka, Croatia" works with no table at all. */

export const MAX_PEOPLE = 200000;
const LIVING_AFTER = 1920;

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const yr = v => (Number.isInteger(v) && v >= 1000 && v <= 2100 ? v : null);
const idOf = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : (Number.isInteger(v) ? String(v) : ''));
const bool = v => v === true;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$|^(about|abt|before|after|c\.?)?\s*\d{1,2}?\s*[A-Za-z]{0,9}\s*\d{4}$/i;
const day = v => { const s = str(v, 40); return s && DATE.test(s) ? s : ''; };

/* a site address the owner's pages live on: https only, host only (no path, no query, no credentials) */
export function siteOf(v) {
  try { const u = new URL(String(v || '')); return u.protocol === 'https:' && !u.username && !u.password && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ? u.hostname.toLowerCase() : ''; } catch (e) { return ''; }
}
const pagePath = v => { const s = typeof v === 'string' ? v.trim() : ''; return /^\/(?!\/)[^\s<>"'\\]{0,300}$/.test(s) ? s : ''; };

/* the places a file says it has placed: { "Mascali" → {lat, lon, cn} }. Plain numbers and a country code, nothing else. */
function readPlaces(raw) {
  const list = Array.isArray(raw.places) ? raw.places : (raw.atlas && Array.isArray(raw.atlas.places) ? raw.atlas.places : []);
  const out = new Map();
  for (const r of list.slice(0, 20000)) {
    if (!r || typeof r !== 'object') continue;
    const n = str(r.n != null ? r.n : r.name, 200), lat = Number(r.lat), lon = Number(r.lon), cn = str(r.cn, 60);
    if (n && cn && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !out.has(n)) out.set(n, { lat, lon, cn });   /* cn: "IT" or "Italy"; the reader turns it into a code */
  }
  return out;
}

export function readTreeJson(text) {
  let raw;
  const t = String(text == null ? '' : text).replace(/^\uFEFF/, '');
  try { raw = JSON.parse(t); } catch (e) {
    return { ok: false, error: 'It is not valid JSON, so it cannot be a tree.json (' + String(e && e.message || e).slice(0, 100) + ').' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'A tree.json is an object with a "people" list. This file is ' + (Array.isArray(raw) ? 'a bare list' : 'not an object') + '.' };
  if (!Array.isArray(raw.people)) return { ok: false, error: 'There is no "people" list in this file. A tree.json has {"meta": …, "people": [ … ]}.' };
  if (!raw.people.length) return { ok: false, error: 'The "people" list is empty, so there is nothing to draw.' };
  if (raw.people.length > MAX_PEOPLE) return { ok: false, error: 'This file has more than ' + MAX_PEOPLE.toLocaleString('en') + ' people, more than this page can hold.' };

  const notes = { people: 0, skipped: 0, badYears: 0, brokenLinks: 0, mended: 0, living: 0, pageDropped: 0, duplicates: 0 };
  const byId = new Map(), order = [];
  raw.people.forEach((r, n) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) { notes.skipped++; return; }
    const id = idOf(r.id);
    if (!id) { notes.skipped++; return; }
    if (byId.has(id)) { notes.duplicates++; return; }
    const by = yr(r.by), dy = yr(r.dy);
    if ((r.by != null && by == null) || (r.dy != null && dy == null)) notes.badYears++;
    const p = {
      id, sex: r.sex === 'm' || r.sex === 'f' ? r.sex : 'u', given: str(r.given, 120), sur: str(r.sur, 120),
      by, dy, bye: bool(r.bye), dye: bool(r.dye), bd: day(r.bd), dd: day(r.dd), bp: str(r.bp, 200) || null, dp: str(r.dp, 200) || null,
      father: idOf(r.father) || null, mother: idOf(r.mother) || null,
      spouse: Array.isArray(r.spouse) ? [...new Set(r.spouse.map(idOf).filter(Boolean))].slice(0, 40) : [],
      kids: Array.isArray(r.kids) ? [...new Set(r.kids.map(idOf).filter(Boolean))].slice(0, 80) : [],
      occ: str(r.occ, 120) || null, my: yr(r.my), mye: bool(r.mye),
      route: Array.isArray(r.route) ? r.route.filter(s => Array.isArray(s) && str(s[0], 200)).slice(0, 40).map(s => [str(s[0], 200), yr(s[1]), s[2] ? 1 : 0]) : [],
      page: pagePath(r.page), cx: Number.isInteger(r.cx) && r.cx > 0 && r.cx < 10000 ? r.cx : 0,
      srcs: Array.isArray(r.srcs) ? r.srcs.filter(s => s && typeof s === 'object' && str(s.t, 140)).slice(0, 20).map(s => ({ t: str(s.t, 140), u: /^https:\/\//i.test(String(s.u || '')) ? String(s.u).slice(0, 500) : '' })) : [],
      surAlso: Array.isArray(r.surAlso) ? r.surAlso.map(s => str(s, 120)).filter(Boolean).slice(0, 10) : [],
      living: bool(r.living), unplaced: bool(r.unplaced),
    };
    byId.set(id, p); order.push(p);
  });
  if (!order.length) return { ok: false, error: 'No person in the list has an "id", so none can be drawn. Each person needs a unique "id".' };

  /* family links that agree with one another, and nothing that points outside the file */
  const keep = id => (id && byId.has(id) ? id : null);
  for (const p of order) {
    for (const k of ['father', 'mother']) if (p[k] && !byId.has(p[k])) { notes.brokenLinks++; p[k] = null; }
    const nsp = p.spouse.length, nk = p.kids.length;
    p.spouse = p.spouse.filter(x => x !== p.id && byId.has(x)); p.kids = p.kids.filter(x => x !== p.id && byId.has(x));
    notes.brokenLinks += (nsp - p.spouse.length) + (nk - p.kids.length);
  }
  for (const p of order) {
    for (const k of ['father', 'mother']) {
      const q = p[k] && byId.get(p[k]);
      if (q && !q.kids.includes(p.id)) { q.kids.push(p.id); notes.mended++; }
    }
    for (const c of p.kids) {
      const q = byId.get(c); if (!q) continue;
      const slot = p.sex === 'f' ? 'mother' : p.sex === 'm' ? 'father' : null;
      if (slot && !q[slot]) { q[slot] = p.id; notes.mended++; }
    }
    for (const s of p.spouse) { const q = byId.get(s); if (q && !q.spouse.includes(p.id)) { q.spouse.push(p.id); notes.mended++; } }
  }

  /* the living rule, for every file: nothing but a name and a family survives for anyone who may be alive */
  const people = order.map(p => {
    const lives = p.living || ((p.dy == null || p.dye) && (p.by || 0) > LIVING_AFTER);
    if (!lives) return p;
    notes.living++;
    return { id: p.id, sex: p.sex, given: p.given, sur: p.sur, living: true, father: keep(p.father), mother: keep(p.mother), spouse: p.spouse, kids: p.kids, unplaced: true };
  });
  notes.people = people.length;

  const m = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta : {};
  const site = siteOf(m.site);
  if (!site) for (const p of people) if (p.page) { p.page = ''; notes.pageDropped++; }
  const places = readPlaces(raw);
  const tree = { places, meta: { title: str(m.title, 80) || '', sub: str(m.sub, 160), source: 'tree.json', site, graded: bool(m.graded), generated: str(m.generated, 20), living: 'redact' }, people, undrawn: [] };
  return { ok: true, tree, notes };
}

/* every distinct place text in the file (birth, death, route stops) with how many times it is written: the reader resolves these against the Atlas, as it does for a GEDCOM */
export function placeMentions(tree) {
  const m = new Map(), note = s => { if (s) m.set(s, (m.get(s) || 0) + 1); };
  for (const p of tree.people) { if (p.living) continue; note(p.bp); note(p.dp); for (const s of p.route || []) note(s[0]); }
  return m;
}

/* what the visitor is told after the file is read, in a sentence or two */
export function describe(notes) {
  const out = [];
  if (notes.living) out.push(notes.living.toLocaleString('en') + ' who may be living ' + (notes.living === 1 ? 'is' : 'are') + ' shown by name and family only');
  if (notes.brokenLinks) out.push(notes.brokenLinks.toLocaleString('en') + ' link' + (notes.brokenLinks === 1 ? '' : 's') + ' to people not in the file left out');
  if (notes.skipped) out.push(notes.skipped.toLocaleString('en') + ' entr' + (notes.skipped === 1 ? 'y' : 'ies') + ' without an id skipped');
  if (notes.duplicates) out.push(notes.duplicates.toLocaleString('en') + ' repeated id' + (notes.duplicates === 1 ? '' : 's') + ' skipped');
  if (notes.badYears) out.push(notes.badYears.toLocaleString('en') + ' year' + (notes.badYears === 1 ? '' : 's') + ' that are not numbers between 1000 and 2100 ignored');
  if (notes.pageDropped) out.push('page links ignored because the file does not say which site they belong to (meta.site)');
  return out;
}
