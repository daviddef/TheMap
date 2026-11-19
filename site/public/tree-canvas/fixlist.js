/* THE TREE CANVAS'S FIX LIST: the model behind the full "Fix list" workspace and the per-person list in the canvas's side panel. Pure functions and one small state
   object: no DOM, no network, no storage of its own. Tested in node (test/tree-canvas-fixlist.test.js).

   WHAT IT HOLDS. The rows are the Roots & Routes fix list's own (the worker's `checklist` message, built by /roots/js/checklist.js: the same sections, the same groups,
   the same counts, the same row keys), plus two groups that only the canvas can make, from the Compare view when archives are chosen:
     "Missing from your file"  people an archive holds and your file does not, with how they are related to someone in your file ("father of ...");
     "Details differ"          a person in both, where the two records disagree on a detail ("died 1859 against 1854").
   Those two come from the Compare walk (pairs.js, in the canvas) and are handed over in memory; they exist only while a Compare is on, and only for the places it has
   walked. They are never stored: only the visitor's decision about each, under a key that names nothing (cmpKey below).

   WHAT IS KEPT. A decision is `a` (left as is) or `d` (done), under the existing store (/roots/js/decisions.js, localStorage `ra-fix-decisions-v1`, which the six-word
   copy already carries). A Roots & Routes row is kept under its own key, exactly as that page keeps it, so a tick made on /roots/ shows here and the other way round.
   A Compare row is kept under `cmp|m|<hash>` or `cmp|d|<hash>`, where the hash (cyrb53 of the tree's key, a separator and the record keys) names no one and nothing: the store then
   hashes that key again. No name, date or place is ever written.

   THE PLACES TAB uses the same model, state, filters and counts over another set of rows (roots/js/placereview.js: the places the Atlas could not settle exactly, shaped like
   the reader's checklist). `buildModel(msg, null, '', PLACES)` builds it; its sections have their own ranks (PLACE_PRIORITY). Its rows are kept under `d|<place text>`, the key
   Roots & Routes already uses for the same place in its fix list, so a "done" or "left as is" made in either list is the same decision.

   THE ORPHANS TAB does the same over the people the file leaves outside every tree (roots/js/orphans.js): a row is the people of one kind born at one place, with the Atlas's record
   collections for that place and those years. `buildModel(msg, null, '', ORPHANS)` builds it. Its rows are kept under `o|<k>|<place>`, or, where a row is exactly one of the People list's
   "Groups not joined to the main tree" (the same people), under that row's own key, so a tick on one shows on the other. */
import { describe, GROUPS } from '../roots/js/checklist.js';
import { hashKey } from '../roots/js/decisions.js';
import { h53 } from './work.js';

export const BATCH = 10;                 // people opened per press of "Open next 10 people"
export const PAGE = 100;                 // rows drawn per section before "Show 100 more"
export const MAX_CMP = 600;              // Compare rows taken from one walk (the walk itself stops at 300 places)

export const CMP_SECTIONS = [
  { key: 'cmpmiss', title: 'Missing from your file', how: 'People an archive holds that your file has no one for, found by walking out from the person you started Compare from. Add them to your own tree by hand (the + button copies their details); check each against its source first. Only people who have died are listed.' },
  { key: 'cmpdiff', title: 'Details differ', how: 'A person in your file and the same person in an archive, where the two records disagree on a detail. Look at both, decide which is right, and correct your own tree if it is yours. Nothing is changed in the archive or in your file.' },
];
export const CMP_GROUP = { key: 'compare', title: 'Compared with the archives', how: 'What the Compare view found between your file and the archives you chose. It is worked out from the places Compare has walked, so it grows as you compare from other people.', sections: ['cmpmiss', 'cmpdiff'] };

/* A Compare row's key for the decision store: kind (m or d), then a hash of the tree's own key and the records' keys. Nothing readable. `salt` is the tree's key (work.js treeKey). */
export const cmpKey = (salt, kind, ...parts) => 'cmp|' + kind + '|' + h53(String(salt || '') + '\u0001' + kind + '\u0001' + parts.join('\u0001')).toString(36);

const clip = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n) : '');
const url = u => (typeof u === 'string' && /^https:\/\/[^\s<>"'\\]{4,500}$/.test(u) ? u : '');

/* The two Compare groups' rows, from what the canvas posted ({missing:[], differs:[]}), cleaned (it is another document's data) and keyed. */
export function cmpSections(raw, salt) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const miss = (Array.isArray(r.missing) ? r.missing : []).slice(0, MAX_CMP).map(x => x && typeof x === 'object' ? ({
    key: cmpKey(salt, 'm', clip(x.ak, 200)), kind: 'cmpmiss', ck: clip(x.ak, 200), name: clip(x.name, 200) || '(no name)', yrs: clip(x.yrs, 60), place: clip(x.place, 200),
    archive: clip(x.archive, 80), url: url(x.url), rel: clip(x.rel, 20), relName: clip(x.relName, 200), relId: clip(x.relId, 120), relKey: clip(x.relKey, 200), text: clip(x.text, 2000).length ? String(x.text).slice(0, 2000) : '',
  }) : null).filter(x => x && x.ck);
  const dif = (Array.isArray(r.differs) ? r.differs : []).slice(0, MAX_CMP).map(x => x && typeof x === 'object' ? ({
    key: cmpKey(salt, 'd', clip(x.fid, 120), clip(x.ak, 200), clip(x.reason, 400)), kind: 'cmpdiff', ck: clip(x.ak, 200), fid: clip(x.fid, 120), fkey: clip(x.fkey, 200), fname: clip(x.fname, 200) || '(no name)', fyrs: clip(x.fyrs, 60),
    aname: clip(x.aname, 200) || '(no name)', ayrs: clip(x.ayrs, 60), archive: clip(x.archive, 80), url: url(x.url), reason: clip(x.reason, 400),
  }) : null).filter(x => x && x.ck && x.fid);
  return [{ ...CMP_SECTIONS[0], group: 'compare', cmp: true, items: miss }, { ...CMP_SECTIONS[1], group: 'compare', cmp: true, items: dif }];
}

/* ---- PRIORITY: which fix unlocks the most ----
   Every section has a fixed rank (1 = first) and one line of reason. The rule: a fix that CONNECTS or REMOVES work for many other rows ranks above a fix that only corrects one
   row; and a fact that other checks depend on (a birth year puts a person on the map and in every date check) ranks above one that only re-labels a place.
   1-3 are High, 4-9 Medium, the rest Low. The same table is shown, row by row, in the pull request, so it can be argued with. */
export const PRIORITY = {
  apart:   { rank: 1,  why: 'Each group here is cut off from the main tree. Finding one parent or spouse joins a whole branch at once, and every other check then works on it.' },
  dupes:   { rank: 2,  why: 'A merge removes duplicate work, and often clears the false “not joined” groups that two copies of one person cause.' },
  years:   { rank: 3,  why: 'A birth year puts the person on the map and in the timeline, and most other checks (dates, places in period, duplicates) need it.' },
  viaph:   { rank: 4,  why: 'These people are in the tree, but only through an unknown person, so the link is not real yet. Naming that one person makes a whole branch certain.' },
  decide:  { rank: 5,  why: 'Only you can choose. Until a place is chosen its events cannot go on the map, and one choice covers every event that uses the same text.' },
  dates:   { rank: 6,  why: 'A date that does not add up is usually a typo or a wrong person, and a wrong date spreads into every check that uses it.' },
  suspect: { rank: 7,  why: 'A life that does not add up may have two people joined into one. Worth looking at early, but each is a judgement, not a sure fault.' },
  cmpdiff: { rank: 8,  why: 'An archive and your file disagree about someone already in your tree. One of the two is wrong.' },
  places:  { rank: 9,  why: 'A sure correction: one paste fixes every event that uses the same text. Quick, but it changes a spelling, not what you know.' },
  cmpmiss: { rank: 10,  why: 'People an archive holds that your file lacks. They grow the tree, but each needs checking against its source before it is added.' },
  check:   { rank: 11, why: 'Suggestions, not fixes: the Atlas is not certain, so each needs a look at the date and source first.' },
  names:   { rank: 12, why: 'A missing name makes a person hard to recognise, but the family around them is usually enough to carry on with.' },
  leads:   { rank: 13, why: 'A research idea (a record collection to try), not a fault in the file.' },
  ages:    { rank: 14, why: 'Often fine: it is how people name a place today. The maps already draw the flag of the day, so this is the lowest-value change.' },
};
export const LEVEL_AT = { High: 3, Medium: 10 };   // rank <= 3 High, <= 10 Medium, else Low
export const levelOf = (rank, at) => { at = at || LEVEL_AT; return rank <= at.High ? 'High' : rank <= at.Medium ? 'Medium' : 'Low'; };
export const prioOf = (key, table, at) => { const p = (table || PRIORITY)[key] || { rank: 99, why: '' }; return { rank: p.rank, level: levelOf(p.rank, at), why: p.why }; };

/* ---- the Places tab: the same idea for the places the Atlas could not settle exactly. A choice that moves many events at once ranks above one that only restates how a place is drawn. ---- */
export const PLACE_PRIORITY = {
  ambiguous:              { rank: 1, why: 'The text fits more than one place, so its events are drawn at the biggest guess. One choice moves every event that uses the same text, and the “Cleaned” export writes it.' },
  'review-other-country': { rank: 2, why: 'The name exists, but in another country than the text names. Often an old name or a boundary that moved: only you can say which, and one choice settles every event.' },
  'review-skipped-part':  { rank: 3, why: 'The first part of the text was not found, so the later part decided the match. Worth a look: it may be the right town, or a different one.' },
  'not-found':            { rank: 4, why: 'No candidate to pick, so it needs a spelling or a lookup by hand. More work per place than choosing, and the Atlas cannot help beyond a near spelling.' },
  'parent-level':         { rank: 5, why: 'Drawn at the town the text names. Right unless you know the exact spot, so nothing is wrong, only less exact.' },
  district:               { rank: 6, why: 'Drawn at the centre of a district. A coarse but honest place; refine it only if you know where.' },
  region:                 { rank: 7, why: 'Drawn at the centre of a province or county and marked as such. Often all the text says.' },
  'country-only':         { rank: 8, why: 'The text names only a country, so there is nothing more to draw. The lowest-value change.' },
};
export const PLACE_LEVEL_AT = { High: 3, Medium: 5 };   // ranks 1-3 are places to choose, 4-5 need a lookup or are nearly right, the rest only describe how a place is drawn
export const PLACES = { groups: null, prio: key => prioOf(key, PLACE_PRIORITY, PLACE_LEVEL_AT), table: PLACE_PRIORITY, kind: 'places' };
/* ---- the Orphans tab: the same idea for people who are in no tree. A fix that joins several people at once ranks above one that joins one; a place with only a country has nothing to search by. ---- */
export const ORPHAN_PRIORITY = {
  clus:    { rank: 1, why: 'Each family here is cut off from every tree. Finding one parent, spouse or child outside it joins all of its people at once, the same reason the People list ranks its “not joined” groups first.' },
  orph:    { rank: 2, why: 'Each person here is joined to no one, so a found relative joins one person, not a family. Worth doing, but each row is less work saved than a detached family.' },
  country: { rank: 3, why: 'The file gives only a country for these people, so the Atlas has no collection to suggest. Find the place first; the lowest-value row until you do.' },
};
export const ORPHAN_LEVEL_AT = { High: 1, Medium: 2 };   // detached families High, orphans Medium, country-only Low
export const ORPHANS = { groups: null, prio: key => prioOf(key, ORPHAN_PRIORITY, ORPHAN_LEVEL_AT), table: ORPHAN_PRIORITY, kind: 'orphans' };
export const ORDERS = { priority: 'Priority', list: 'List order', most: 'Most to do' };
export const ROW_SORTS = { useful: 'Most useful first', name: 'Name A–Z', list: 'List order' };

/* The groups and, inside each, the sections, in the order asked for: 'priority' (sections by rank; a group by its best-ranked section that has rows), 'most' (by rows still to do),
   or 'list' (Roots & Routes' own order). Groups are never broken up: their sections stay together. Ties keep the list order. */
export function arranged(model, tl, order) {
  const gs = model.groups.map((g, gi) => ({ g, gi, secs: g.sections.map(k => model.bySec.get(k)).filter(Boolean) })).filter(x => x.secs.length);
  if (order !== 'priority' && order !== 'most') return gs.map(x => ({ g: x.g, secs: x.secs }));
  const left = s => (tl && tl.sec[s.key] ? tl.sec[s.key].open : s.items.length);
  const sk = order === 'most' ? s => -left(s) : s => s.rank;
  for (const x of gs) {
    x.secs = x.secs.map((s, i) => [s, i]).sort((a, b) => sk(a[0]) - sk(b[0]) || a[1] - b[1]).map(a => a[0]);
    x.k = order === 'most' ? -x.secs.reduce((n, s) => n + left(s), 0) : Math.min(...x.secs.map(s => (s.items.length ? s.rank : 1000 + s.rank)));
  }
  return gs.sort((a, b) => a.k - b.k || a.gi - b.gi).map(x => ({ g: x.g, secs: x.secs }));
}

/* rows inside a section: most useful first (events for places, birth year for people, size for a branch), by name, or as listed. Nothing without the value is dropped: it goes last. */
const year = v => { if (v == null) return null; const m = String(v).match(/\d{4}/); return m ? +m[0] : null; };
const USEFUL = {
  places: i => -(i.count || 0), check: i => -(i.count || 0), decide: i => -(i.count || 0), ages: i => -(i.count || 0),
  suspect: i => -(i.reasons ? i.reasons.length : 0), apart: i => -(i.size || 0), viaph: i => -(i.size || 0),
  names: i => year(i.born), dates: i => year(i.born), leads: i => year(i.born),
  dupes: i => { const a = year(i.ay), b = year(i.by); return a == null ? b : b == null ? a : Math.min(a, b); },
  years: i => (i.kind === 'estimated' ? year(i.hint) : null), cmpmiss: i => year(i.yrs),
};
for (const k of Object.keys(PLACE_PRIORITY)) USEFUL[k] = i => -(i.events || i.count || 0);   // a place text: the one with most events first
for (const k of Object.keys(ORPHAN_PRIORITY)) USEFUL[k] = i => -(i.score || 0);                // an Orphans row: Roots & Routes' own ranking (people x a collection x in the Atlas)
const nameOf = i => (i.name || i.raw || i.place || i.an || i.fname || (i.people && i.people[0] && i.people[0].name) || i.first || '').toString();
const SORTED = new WeakMap();
export function rowSort(s, how) {
  if (!how || how === 'list') return s.items;
  let c = SORTED.get(s.items); if (!c) SORTED.set(s.items, c = {}); if (c[how]) return c[how];
  const f = how === 'useful' ? USEFUL[s.key] : null, az = (a, b) => nameOf(a).localeCompare(nameOf(b), 'en', { sensitivity: 'base' });
  const a = s.items.map((i, n) => [i, n, f ? f(i) : null]);
  a.sort((x, y) => how === 'name' ? az(x[0], y[0]) || x[1] - y[1] : (x[2] == null) - (y[2] == null) || (x[2] == null ? 0 : x[2] - y[2]) || x[1] - y[1]);
  return (c[how] = a.map(x => x[0]));
}

/* The whole list: the reader's sections in the reader's own order (groups by what the visitor has to do), then the Compare group when there is one.
   m: the worker's checklist message ({sections, groups, main}) or null. cmp: {missing, differs} or null. */
export function buildModel(m, cmp, salt, kind) {
  const sections = m && Array.isArray(m.sections) ? m.sections.map(s => ({ ...s, cmp: false })) : [];
  const groups = (m && m.groups || (kind ? [] : GROUPS)).map(g => ({ key: g.key, title: g.title, how: g.how, sections: g.sections.filter(k => sections.some(s => s.key === k)) }));
  const known = new Set(groups.flatMap(g => g.sections));
  const stray = sections.filter(s => !known.has(s.key)).map(s => s.key);
  if (stray.length) groups.push({ key: 'other', title: 'Other', how: '', sections: stray });
  const cs = cmp ? cmpSections(cmp, salt) : [];
  if (cs.length && cs.some(s => s.items.length)) { sections.push(...cs); groups.push({ ...CMP_GROUP, sections: cs.map(s => s.key) }); }
  for (const s of sections) Object.assign(s, kind ? kind.prio(s.key) : prioOf(s.key));
  const byKey = new Map(), bySec = new Map(sections.map(s => [s.key, s]));
  for (const s of sections) for (const i of s.items) byKey.set(i.key, { s, i });
  return { sections, groups, bySec, byKey, main: m && m.main || 0, total: [...byKey.keys()].length, hasCmp: cs.some(s => s.items.length) };
}
/* what the Roots & Routes functions (text, spreadsheet, summary) expect: its sections only */
export const rrView = model => { const sections = model.sections.filter(s => !s.cmp); return { sections, groups: model.groups.filter(g => g.key !== 'compare'), main: model.main, counts: Object.fromEntries(sections.map(s => [s.key, s.items.length])) }; };

/* ---- research names: a spelling family from the Atlas catalogue, matched on whole words, whatever the typography ---- */
const FOLD_MAP = { đ: 'd', ł: 'l', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', ð: 'd', þ: 'th' };
/* a name as a list of lower-case ASCII words: accents and case do not matter, hyphens, apostrophes and spaces split words ("D'Arcy", "De-Franceschi") */
export const foldWords = t => String(t || '').toLowerCase().replace(/[đłøßæœðþ]/g, c => FOLD_MAP[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(Boolean);
/* which spellings a pick stands for: what the catalogue holds as the same name, met on a record, or reached by a rule, and the leads (plausible, never seen: to look for, not to claim).
   A form the catalogue says is sometimes another family's ("case-by-case") is left out, or "Franceschi" would drag in everyone else. */
export const NAME_STATUS = new Set(['same', 'attested', 'rule', 'lead']);
const archiveScore = a => (/[^\x00-\x7f]/.test(a) ? 2 : /^\p{Lu}/u.test(a) ? 1 : 0);
/* cat: the shipped surname catalogue [{id, name, a: [archive], m: [[form, status]]}] -> { archives: [{key, label, names, forms}], names: [{id, name, archives, forms}] }, each A to Z */
export function catalogueChoices(cat) {
  const arch = new Map(), names = [];
  for (const f of Array.isArray(cat) ? cat : []) {
    if (!f || !f.name) continue;
    const forms = [...new Set([f.name, ...(f.m || []).filter(m => NAME_STATUS.has(m[1])).map(m => m[0])])], keys = [];
    for (const a of f.a || []) {
      const k = foldWords(a).join(''); if (!k) continue;
      let e = arch.get(k); if (!e) arch.set(k, e = { key: k, label: a, names: [], forms: [] });
      if (archiveScore(a) > archiveScore(e.label)) e.label = a;
      if (!e.names.includes(f.name)) e.names.push(f.name); e.forms.push(...forms); keys.push(k);
    }
    names.push({ id: f.id, name: f.name, archives: [...new Set(keys)], forms });
  }
  const az = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
  const archives = [...arch.values()].map(e => ({ ...e, forms: [...new Set(e.forms)], names: e.names.sort(az) })).sort((a, b) => az(a.label, b.label));
  for (const n of names) n.archiveLabels = n.archives.map(k => arch.get(k).label);
  return { archives, names: names.sort((a, b) => az(a.name, b.name)) };
}
/* the words of every name on a row (cached): the people on it, the family around an unnamed one, and, for a group, the surnames of everyone in it */
const NAMEWORDS = new WeakMap();
export function nameText(s, i) {
  const a = peopleOf(s, i).map(p => (p && p.name) || '');
  if (s.key === 'names') a.push(i.name || '', i.kin || ''); else if (s.key === 'cmpmiss') a.push(i.name || '', i.relName || ''); else if (s.key === 'cmpdiff') a.push(i.fname || '', i.aname || '');
  if (Array.isArray(i.sur)) a.push(i.sur.join(' '));
  return a.join(' | ');
}
/* forms -> a test on a row, or null when there is nothing to match. A form matches as whole words, glued or not: "Defranceschi" is found in "De Franceschi", "di Franceschi" in "difranceschi". */
export function nameMatcher(forms) {
  const glued = new Set(); for (const f of forms || []) { const w = foldWords(f); if (w.length) glued.add(w.join('')); }
  if (!glued.size) return null;
  return (s, i) => {
    let w = NAMEWORDS.get(i); if (!w) NAMEWORDS.set(i, w = foldWords(nameText(s, i)));
    for (let a = 0; a < w.length; a++) { let g = ''; for (let b = a; b < w.length && b < a + 3; b++) { g += w[b]; if (glued.has(g)) return true; } }
    return false;
  };
}

/* ---- who is on a row ---- */
export function peopleOf(s, i) {
  if (s.key === 'dupes') return [{ id: i.a, name: i.an }, { id: i.b, name: i.bn }];
  if (s.key === 'cmpmiss') return i.relId ? [{ id: i.relId, name: i.relName, via: true }] : [];
  if (s.key === 'cmpdiff') return [{ id: i.fid, name: i.fname }];
  if (Array.isArray(i.people)) return i.people;
  return i.id ? [{ id: i.id, name: i.name }] : [];
}
/* text to search a row by: the same fields the Roots & Routes filter reads, and the Compare rows' */
const HAY = new WeakMap();
export function hay(s, i) {
  let h = HAY.get(i); if (h !== undefined) return h;
  h = (s.key === 'names' ? i.name + ' ' + i.kin : s.key === 'dupes' ? i.an + ' ' + i.bn : (s.key === 'apart' || s.key === 'viaph') ? i.people.map(p => p.name).join(' ') + ' ' + (i.via || []).join(' ')
    : s.orphans ? i.place + ' ' + (i.country || '') + ' ' + (i.sur || []).join(' ') + ' ' + i.people.map(p => p.name).join(' ') + ' ' + (i.links || []).map(l => l.t + ' ' + (l.p || '')).join(' ')
    : s.key === 'cmpmiss' ? i.name + ' ' + i.relName + ' ' + i.archive + ' ' + i.yrs : s.key === 'cmpdiff' ? i.fname + ' ' + i.aname + ' ' + i.reason + ' ' + i.archive
    : (i.raw || '') + ' ' + (i.name || '') + ' ' + (i.country ? i.country + ' ' + i.label : '') + ' ' + (i.reasons ? i.reasons.map(r => r.text).join(' ') : '') + ' ' + (i.people ? i.people.map(p => p.name).join(' ') : '') + (s.place ? ' ' + [...(i.cands || []), ...(i.picked ? [i.picked] : [])].map(c => c.n + ' ' + (c.region || '')).join(' ') : '')).toLowerCase();
  HAY.set(i, h); return h;
}
/* the rows that name this person (a file person's id), with the section each is in */
export function personIndex(model) {
  const idx = new Map();
  for (const s of model.sections) for (const i of s.items) { const seen = new Set(); for (const p of peopleOf(s, i)) { if (!p || p.id == null || seen.has(p.id)) continue; seen.add(p.id); const k = String(p.id); let l = idx.get(k); if (!l) idx.set(k, l = []); l.push({ s, i }); } }
  return idx;
}

/* ---- the decisions: which rows are done, which are left as is ---- */
export function createState(store, hooks) {
  const ticked = new Set(), asIs = new Set(), pending = []; let timer = 0, savedAt = 0, lastOk = true;
  const h = hooks || {};
  const flush = () => {
    clearTimeout(timer); timer = 0; if (!pending.length) return lastOk;
    const list = pending.splice(0); lastOk = store ? store.putMany(list) : false; savedAt = Date.now();
    if (h.saved) h.saved(lastOk, list.length); return lastOk;
  };
  const queue = list => { pending.push(...list); clearTimeout(timer); timer = setTimeout(flush, 300); };
  return {
    ticked, asIs,
    isDone: k => ticked.has(k), isAsIs: k => asIs.has(k),
    isOpen: k => !ticked.has(k) && !asIs.has(k),
    /* kind 'd' (done) or 'a' (left as is); yes false takes it back. Returns nothing: the page redraws what changed. */
    set(key, kind, yes) { (kind === 'a' ? asIs : ticked)[yes ? 'add' : 'delete'](key); queue([[key, kind, !!yes]]); },
    setMany(keys, kind, yes) { const set = kind === 'a' ? asIs : ticked; for (const k of keys) set[yes ? 'add' : 'delete'](k); queue(keys.map(k => [k, kind, !!yes])); },
    /* read every row of the store once, and take what it holds for the rows of this list (rows read from a decisions file, `extra`, apply as well). Returns how many rows matched. */
    load(model, extra) {
      ticked.clear(); asIs.clear(); let n = 0; const rows = (store && store.rows()) || {};
      for (const k of model.byKey.keys()) { const hk = hashKey(k), r = rows[hk] || (extra && extra[hk]); if (!r) continue; let hit = false; if (r.a) { asIs.add(k); hit = true; } if (r.d) { ticked.add(k); hit = true; } if (hit) n++; }
      return n;
    },
    flush, pending: () => pending.length, savedAt: () => savedAt, lastOk: () => lastOk,
  };
}

/* ---- counts ---- */
export function tally(model, st) {
  const sec = {}, grp = {}; let open = 0, done = 0, asis = 0, total = 0;
  for (const s of model.sections) {
    let o = 0, d = 0, a = 0;
    for (const i of s.items) { if (st.ticked.has(i.key)) d++; else if (st.asIs.has(i.key)) a++; else o++; }
    sec[s.key] = { total: s.items.length, open: o, done: d, asis: a }; open += o; done += d; asis += a; total += s.items.length;
  }
  for (const g of model.groups) { const t = { total: 0, open: 0, done: 0, asis: 0 }; for (const k of g.sections) { const x = sec[k]; if (x) { t.total += x.total; t.open += x.open; t.done += x.done; t.asis += x.asis; } } grp[g.key] = t; }
  /* "N of M done": every row dealt with (ticked, or left as is) of every row */
  return { sec, grp, open, done, asis, total, handled: done + asis };
}

/* ---- which rows to show ---- */
/* mode: 'open' (not ticked, not left as is), 'done', 'asis' (left as is), 'all'. q: text to search for. personId: only rows that name this file person. */
export function visible(s, st, o) {
  o = o || {}; const q = (o.q || '').trim().toLowerCase(), mode = o.mode || 'open', pid = o.personId == null ? null : String(o.personId);
  return rowSort(s, o.rows).filter(i => {
    const d = st.ticked.has(i.key), a = !d && st.asIs.has(i.key);
    if (mode === 'open' ? (d || a) : mode === 'done' ? !d : mode === 'asis' ? !a : false) return false;
    if (q && !hay(s, i).includes(q)) return false;
    if (o.names && !o.names(s, i)) return false;
    if (o.likely && !i.likely) return false;   // only the rows that carry a neighbour-based suggestion (likely.js)
    if (pid != null && !peopleOf(s, i).some(p => p && String(p.id) === pid)) return false;
    return true;
  });
}

/* ---- paste-ready lines: what to copy for a row (current text -> standard form), one click each ---- */
export function copyActions(s, i) {
  if (s.key === 'places' || s.key === 'check') return [{ label: 'New', title: 'Copy the new text, the one in bold: ' + i.to, text: i.to }, { label: 'Old', title: 'Copy the old text, the crossed-out one, to search for it in your tree: ' + i.raw, text: i.raw }];
  if (s.key === 'decide') { const L = i.likely ? i.likely.idx : -1, a = (i.cands || []).map((c, n) => ({ label: c, title: 'Copy “' + c + '”', text: c, likely: n === L })); return L > 0 ? [a[L], ...a.filter((x, n) => n !== L)] : a; }   // a suggested candidate goes first, still only to copy
  return [];
}

/* ---- open the people on a group's rows, a batch at a time (R&R's "Open all") ---- */
export function toOpen(secs, st, o) {
  o = o || {}; const q = (o.q || '').trim().toLowerCase(), seen = new Set(), out = [];
  for (const s of secs) for (const i of rowSort(s, o.rows)) {
    if (st.asIs.has(i.key) || st.ticked.has(i.key) || (q && !hay(s, i).includes(q)) || (o.names && !o.names(s, i))) continue;
    for (const p of peopleOf(s, i)) { if (!p || p.id == null || p.via || seen.has(p.id)) continue; seen.add(p.id); out.push(p); }
  }
  return out;
}

/* the sentence a row says about its problem, for a screen reader's label and the row's own head: the Roots & Routes text for its rows, the Compare rows' own */
export function headOf(s, i) {
  if (s.key === 'cmpmiss') return i.name + (i.yrs ? ' (' + i.yrs + ')' : '') + ' is in ' + i.archive + (i.relName ? ' as the ' + REL_WORD[i.rel] + ' of ' + i.relName : '') + ' but not in your file';
  if (s.key === 'cmpdiff') return i.fname + ': ' + i.reason;
  if (s.orphans) return orphanHead(i);
  return describe(s, i).head;
}
/* an Orphans row as one sentence, for a screen reader's label and the row's own head */
export function orphanHead(i) { return i.size + (i.size === 1 ? ' person' : ' people') + ' born at ' + i.place + (i.pk === 'clus' ? ', in detached families' : ', joined to no one'); }
export const REL_WORD = { father: 'father', mother: 'mother', child: 'child', spouse: 'spouse', self: 'starting person' };
