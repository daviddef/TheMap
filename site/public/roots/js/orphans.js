/* ORPHANS AND WHERE TO START, as a checklist: the people the file leaves outside every tree, grouped by where they were born, each group with the record collections the Atlas
   knows for that place and those years. The same groups Roots & Routes' "Orphans" tab draws as cards (tree-views.template.html, renderOrphans), written once more here as rows shaped
   like the fix list's (groups of sections of rows, each row keyed) so the Tree Canvas's Fix list can draw them with the same page. It reads the tree the reader made (tree.people)
   and the Atlas slice that goes with it (atlas.places, regions, regimes); the groups of people come from metrics.js's `components`, the one place the rule is written, so the
   counts here are the strip's counts (a test runs the viewer's own code over the same trees).

   THE RULES (the viewer's, not new ones):
     a group of people joined by parent, spouse or child links is a CONNECTED TREE at 20 or more people, a DETACHED FAMILY at 2 to 19, an ORPHAN at 1;
     a DEAD END is a person in a connected tree with no recorded father and no recorded mother (counted here, not listed: the fix list's "Find what is missing" lists them);
     people who cannot be drawn (no year, or no place) are "not drawn yet" (counted here, not listed: the fix list's People tab lists them under "People without a birth year");
     a row is the people of ONE KIND born at ONE PLACE; rows rank by people x (2 if the Atlas knows a collection for those years, else 1) x (1 if the place is in the Atlas, else 0.5);
     a place that is only a country has nothing to search by, so those rows are their own, last section.

   IT IS A LIST TO WORK DOWN IN THE TREE THE VISITOR KEEPS ELSEWHERE, NOT A PLACE TO EDIT. Each row offers the Atlas's collections to open, the place and the people as text to copy, the
   people to open in the visitor's own tree, and a tick or "left as is", kept like every other fix-list decision. Nothing is picked, joined or written into the file.
   A row's key is `o|<k>|<place>` (k: o orphans, c detached families), under which the store keeps only a hash. Where a row is exactly one of the People list's "Groups not joined to the
   main tree" (the same people), it takes that row's own key instead, so one tick is one decision in both lists.
   No DOM, no network, no storage. */
import { components, BIG_TREE } from './metrics.js';

export const PEOPLE_CAP = 300;   // people listed on one row; the row says how many there are in all
export const SHOW_COLS = 3;      // collections shown on a row (Roots & Routes shows three)

export const KINDS = {
  clus: { title: 'Detached families, by birthplace', how: 'Small families of 2 to 19 people who are joined to each other but to no larger tree. Each row is the people of those families born at one place. One parent, spouse or child found outside the family joins all of them to a tree at once.' },
  orph: { title: 'Orphans, by birthplace', how: 'People joined to no one at all: no parent, spouse or child in your file. Each row is the orphans born at one place. Finding one relative joins one person to a tree.' },
  country: { title: 'Only a country is known', how: 'The place of birth is only a country, so there is no town or parish to search yet. Find the place in a record or a relative’s page and correct it in your own tree; then these people can be looked for properly.' },
};
export const GROUPS = [
  { key: 'join', title: 'Connect them to a tree', how: 'People and small families that no parent, spouse or child link joins to a tree, grouped by where they were born, with the record collections the Atlas knows for that place and those years.', sections: ['clus', 'orph'] },
  { key: 'wide', title: 'Not enough to search by', how: 'Where the file names only a country, no collection can be suggested.', sections: ['country'] },
];
export const NEXT = {
  clus: 'Look in the collections below for one parent, spouse or child of these families who is not in your file. One link joins a whole family to a tree.',
  orph: 'Look in the collections below for a parent, spouse or child of these people. One link joins one person to a tree.',
  country: 'Find the town or parish in a record or a relative’s page, then correct the place in your own tree and open the file again.',
};

const isCountry = pl => !!pl && (pl.kind === 'country' || /\(country only\)$/.test(pl.n || ''));
const countryName = cc => { try { return cc ? new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc : ''; } catch (e) { return cc || ''; } };
/* a person as the viewer words it: a living person whose name the reader withheld is "Living <surname>" */
const nameOf = p => (p.hid === 1 ? 'Living ' + (p.sur || '') : ((p.given || '') + ' ' + (p.sur || '')).trim() || '(no name recorded)').trim();

/* the Atlas's own page for a place, or its "add a place" page when it does not hold it */
const atlasUrl = pl => (pl && pl.id ? 'https://recordatlas.org/place/' + pl.id + '/' : 'https://recordatlas.org/add/');

/* The regime and period over a place in a year (the viewer's eraAt): { rg, label, polity, from, to } or null. */
export function eraAt(atlas, pl, year) {
  const reg = pl && pl.reg && atlas && atlas.regions && atlas.regions[pl.reg]; if (!reg) return null;
  const es = reg.eras.map(e => ({ from: e[0], to: e[1], rg: e[2], polity: e[3], note: e[4], filed: e[5] }));
  const e = es.find(x => year >= x.from && year < x.to) || (es.length && year >= es[es.length - 1].to ? es[es.length - 1] : null);
  return e ? { ...e, label: (atlas.regimes && atlas.regimes[e.rg] && atlas.regimes[e.rg].label) || e.rg } : null;
}
/* the viewer's recLink: where to look when the Atlas lists no collection for the years: the archive filed for that era, else the place's page */
function fallback(atlas, pl, place, year) {
  const e = eraAt(atlas, pl, year), k = e && e.filed && e.filed[0];
  if (k && atlas.provurl && atlas.provurl[k]) return { t: (atlas.prov && atlas.prov[k]) || k, u: atlas.provurl[k], w: 'archive' };
  return { t: place + ' in Record Atlas', u: atlasUrl(pl), w: 'Atlas place' };
}

/* Which small groups hang from a connected tree in the file anyway, through someone who is not drawn (no year, or no place): tree.undrawn lists those people with their relatives. The reader
   draws only people it can place, so a family whose link to a tree runs through one of them looks detached here and is not detached in the file. Returns the set of group numbers. */
export function bridgedGroups(tree, comp, sizes) {
  const und = (tree && tree.undrawn) || [], up = new Map(), find = x => { while (up.get(x) !== x) { up.set(x, up.get(up.get(x))); x = up.get(x); } return x; };
  const node = id => (comp.has(id) ? 'g' + comp.get(id) : 'u' + id);
  for (const u of und) up.set('u' + u.id, 'u' + u.id);
  for (const g of new Set(comp.values())) up.set('g' + g, 'g' + g);
  const ids = new Set(und.map(u => u.id));
  for (const u of und) for (const r of [u.father, u.mother, ...(u.spouse || []), ...(u.kids || [])]) if (r && (comp.has(r) || ids.has(r))) { const a = find('u' + u.id), b = find(node(r)); if (a !== b) up.set(a, b); }
  const big = new Set(); for (const [, g] of comp) if (sizes[g] >= BIG_TREE) big.add(find('g' + g));
  const out = new Set(); for (const g of new Set(comp.values())) if (sizes[g] < BIG_TREE && big.has(find('g' + g))) out.add(g);
  return out;
}

/* tree: { people: [...] } as the reader makes it; atlas: { places: [{ n, id, cn, cols, reg, kind }], regions, regimes, prov, provurl }
   opt: { apart: the checklist's "Groups not joined" items (to share a row's key with the same people), omitLiving: leave out people whose name the reader withheld }
   -> { sections: [{ key, title, how, items }], groups, counts, summary: { orphans, clusters, clusterPeople, deadEnds, undrawn, living }, omitted } */
export function buildOrphans(tree, atlas, opt) {
  opt = opt || {};
  const { list, comp, sizes } = components(tree), full = new Map((tree && tree.people || []).map(r => [r.id, r]));
  const PL = new Map(); for (const a of (atlas && atlas.places) || []) PL.set(a.n, a);
  let orphans = 0, deadEnds = 0, clusterPeople = 0, living = 0; const clusComps = new Set();
  const sets = { orph: new Map(), clus: new Map() };   // kind -> place -> [person]
  const compSize = new Map();   // group number -> people drawn in it, for the "is this row a whole group" test
  for (const p of list) {
    const s = sizes[comp.get(p.id)], r = full.get(p.id);
    if (p.hid === 1) living++;
    if (s >= BIG_TREE) { if (!p.father && !p.mother) deadEnds++; continue; }
    const kind = s === 1 ? 'orph' : 'clus';
    if (kind === 'orph') orphans++; else { clusterPeople++; clusComps.add(comp.get(p.id)); }
    compSize.set(comp.get(p.id), s);
    if (opt.omitLiving && p.hid === 1) continue;
    const m = sets[kind]; if (!m.has(p.bp)) m.set(p.bp, []);
    m.get(p.bp).push({ id: p.id, name: nameOf(r), by: r.by, sur: r.hid === 1 ? '' : r.sur || '', g: comp.get(p.id) });
  }
  const bridged = bridgedGroups(tree, comp, sizes); let bridgedPeople = 0; for (const p of list) if (bridged.has(comp.get(p.id))) bridgedPeople++;
  const summary = { orphans, clusters: clusComps.size, clusterPeople, deadEnds, bridgedPeople, undrawn: tree && tree.undrawn && tree.undrawn.length ? tree.undrawn.length : 0, living };
  const apart = (opt.apart || []).filter(a => a && a.key && Array.isArray(a.people));
  const sections = Object.keys(KINDS).map(k => ({ key: k, title: KINDS[k].title, how: KINDS[k].how, orphans: true, items: [] })), bySec = new Map(sections.map(s => [s.key, s]));
  const used = new Set();
  for (const kind of ['clus', 'orph']) for (const [place, ps] of sets[kind]) {
    const pl = PL.get(place) || null, ys = ps.map(p => p.by).filter(y => y != null).sort((a, b) => a - b);
    const lo = ys[0], hi = ys[ys.length - 1], med = ys[ys.length >> 1];
    const cols = ((pl && pl.cols) || []).filter(c => (c[2] == null || c[2] <= hi) && (c[3] == null || c[3] >= lo));
    const era = eraAt(atlas, pl, med), country = isCountry(pl), sec = bySec.get(country ? 'country' : kind);
    const links = country ? [] : cols.length ? cols.slice(0, SHOW_COLS).map(c => ({ t: c[0], u: c[1], w: 'Atlas collection', p: (atlas.prov && atlas.prov[c[4]]) || '', from: c[2], to: c[3] })) : [fallback(atlas, pl, place, med)];
    const surs = new Map(); for (const p of ps) if (p.sur) surs.set(p.sur, (surs.get(p.sur) || 0) + 1);
    const sorted = [...surs].sort((a, b) => b[1] - a[1]);
    const people = ps.slice().sort((a, b) => a.by - b.by).map(p => ({ id: p.id, name: p.name, by: p.by })), fam = new Set(ps.map(p => p.g)), nBridged = ps.filter(p => bridged.has(p.g)).length;
    /* one row is one whole group of the People list's "Groups not joined" when it holds exactly the people of one group of this tree and that list has the same group: one key, one decision */
    let key = 'o|' + (kind === 'orph' ? 'o' : 'c') + '|' + place, shared = false;
    if (fam.size === 1) {
      const g = ps[0].g, whole = compSize.get(g) === ps.length;
      const hit = whole && apart.find(a => a.size === ps.length && !used.has(a.key) && a.people.every(x => ps.some(p => p.id === x.id)) && (a.people.length === a.size ? ps.every(p => a.people.some(x => x.id === p.id)) : true));
      if (hit) { key = hit.key; shared = true; used.add(hit.key); }
    }
    sec.items.push({ key, kind: country ? 'country' : kind, countryOnly: country, place, pk: kind, shared, iso: pl && pl.cn || '', country: country ? (place || '').replace(/\s*\(country only\)\s*$/, '') : countryName(pl && pl.cn), inAtlas: !!(pl && pl.id), url: atlasUrl(pl), size: ps.length, families: fam.size, bridged: nBridged,
      lo: lo == null ? null : lo, hi: hi == null ? null : hi, med: med == null ? null : med, era: era ? { rg: era.rg, label: era.label, polity: era.polity, from: era.from, to: era.to } : null, atlasRegime: era ? ((atlas.regimes && atlas.regimes[era.rg] && atlas.regimes[era.rg].c) || null) : null,
      sur: sorted.map(x => x[0]).slice(0, 60), top: sorted.slice(0, 3).map(x => x[0] + ' ' + x[1]).join(', '), links, nCols: country ? 0 : cols.length, moreCols: Math.max(0, cols.length - SHOW_COLS), hasCol: cols.length > 0,
      score: ps.length * (cols.length ? 2 : 1) * (pl && pl.id ? 1 : .5), people: people.slice(0, PEOPLE_CAP), more: Math.max(0, people.length - PEOPLE_CAP), next: NEXT[country ? 'country' : kind] });
  }
  /* the viewer's order: the highest score first (people x collection x in the Atlas); a tie keeps the order the people come in, as the viewer's does */
  for (const s of sections) s.items.sort((a, b) => b.score - a.score);
  return { sections, groups: GROUPS.map(g => ({ key: g.key, title: g.title, how: g.how, sections: g.sections })), counts: Object.fromEntries(sections.map(s => [s.key, s.items.length])), summary, omitted: opt.omitLiving ? living : 0 };
}

/* The group as text to paste (a note, a research log, a message to a relative): where and when, the surnames, then one line per person. Never more than the row lists. */
export function groupText(i) {
  const L = [i.place + (i.country && i.country !== i.place ? ', ' + i.country : '') + ': ' + i.size + (i.size === 1 ? ' person' : ' people') + (i.lo != null ? ', born ' + (i.lo === i.hi ? i.lo : i.lo + '–' + i.hi) : '')];
  if (i.top) L.push('Surnames: ' + i.top);
  for (const p of i.people) L.push(p.name + (p.by != null ? ' (born ' + p.by + ')' : '') + ' [' + p.id + ']');
  if (i.more) L.push('and ' + i.more + ' more');
  return L.join('\n');
}
