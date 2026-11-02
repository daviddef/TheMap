/* From a parsed GEDCOM to people, and from people plus resolved places to the TREE the Roots & Routes template draws.
   A port of the converter in the family-tree-page skill (gedcom_to_tree.py), with the same rules:
     - living = no death, burial or cremation recorded AND (no birth year OR born within 110 years). Unknown birth + no death = living.
     - living people are REDACTED by default: kept as nodes so the tree stays connected, with no given name, occupation, sources or death
       place, and a birth year rounded to the decade. `living: 'omit'` removes them from the data altogether.
     - missing birth years are estimated from relatives and flagged (bye); missing death years likewise (dye). Nothing is hidden.
     - a place is only ever the resolver's answer. A person whose own place did not resolve may borrow a relative's, flagged (bpe), else
       they are listed under "Not drawn yet". Nothing is guessed. */
import { get, all, text } from './gedcom.js';

const NOW = new Date().getFullYear();
const YEAR = /(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)/;
const APPROX = /\b(ABT|ABOUT|CAL|EST|BEF|AFT|BET|FROM|TO|C\.?|CIRCA)\b/i;

export function yearOf(s) {
  const m = YEAR.exec(s || ''); if (!m) return null;
  return { y: +m[1], approx: APPROX.test(s) };
}
const clean = s => (s || '').replace(/\s+/g, ' ').trim();

function nameOf(n) {
  if (!n) return ['', ''];
  let given = '', sur = '';
  const m = /^(.*?)\s*\/(.*?)\//.exec(n.val);
  if (m) { given = m[1].trim(); sur = m[2].trim(); } else given = n.val.trim();
  const g = get(n, 'GIVN'), s = get(n, 'SURN');
  if (g && g.val) given = g.val.trim(); if (s && s.val) sur = s.val.trim();
  return [clean(given), clean(sur)];
}

/* an event's year and place, each from the first of `tags` that has one (so a christening fills in a birth with no date) */
function evOf(node, tags) {
  let year = null, place = null, approx = false;
  for (const t of tags) {
    for (const e of all(node, t)) {
      if (year === null) { const d = get(e, 'DATE'), y = d && yearOf(d.val); if (y) { year = y.y; approx = y.approx; } }
      if (place === null) { const p = get(e, 'PLAC'); if (p && p.val.trim()) place = p.val.trim(); }
    }
  }
  return { year, place, approx };
}

/* People as the file states them, plus every place string with how often it is mentioned (any PLAC at any depth). */
export function readPeople(parsed) {
  const recs = parsed.nodes, srcrec = new Map(), P = new Map(), fams = [], mentions = new Map();
  const note = k => mentions.set(k, (mentions.get(k) || 0) + 1);
  const walk = n => { for (const k of n.kids) { if (k.tag === 'PLAC' && k.val.trim()) note(k.val.trim()); if (k.kids.length) walk(k); } };
  for (const r of recs) {
    if (r.tag === 'SOUR' && r.xref) srcrec.set(r.xref, r);
    if (r.tag === 'FAM') fams.push(r);
    if (r.kids.length) walk(r);
  }
  for (const r of recs) {
    if (r.tag !== 'INDI' || !r.xref) continue;
    const [given, sur] = nameOf(get(r, 'NAME'));
    const b = evOf(r, ['BIRT', 'CHR', 'BAPM']), d = evOf(r, ['DEAT', 'BURI', 'CREM']);
    const resi = [];
    for (const e of all(r, 'RESI')) { const dd = get(e, 'DATE'), pp = get(e, 'PLAC'), y = dd && yearOf(dd.val); if (pp && pp.val.trim()) resi.push([y ? y.y : null, pp.val.trim()]); }
    const occ = get(r, 'OCCU'), sx = get(r, 'SEX');
    const srcs = [];
    for (const node of [r, ...r.kids.filter(k => ['BIRT', 'DEAT', 'MARR', 'CHR', 'BURI', 'RESI'].includes(k.tag))]) {
      for (const s of all(node, 'SOUR')) {
        let t = null, u = null;
        if (s.val.startsWith('@') && srcrec.has(s.val)) {
          const sr = srcrec.get(s.val), tt = get(sr, 'TITL') || get(sr, 'ABBR'); t = tt ? text(tt) : s.val;
          const m = /https?:\/\/\S+/.exec(sr.kids.map(text).join(' ')); u = m ? m[0] : null;
        } else t = text(s);
        if (t && !srcs.some(x => x.t === t)) srcs.push(u ? { t: t.slice(0, 140), u } : { t: t.slice(0, 140) });
      }
    }
    const id = r.xref.replace(/@/g, '');
    P.set(id, { id, sex: sx && sx.val ? sx.val[0].toLowerCase() : 'm', given, sur, by: b.year, byApprox: b.approx, bpRaw: b.place, dy: d.year, dpRaw: d.place,
      resi, occ: occ ? occ.val : null, srcs: srcs.slice(0, 6), deathKnown: !!(get(r, 'DEAT') || get(r, 'BURI') || get(r, 'CREM')), father: null, mother: null, spouse: [], kids: [] });
  }
  for (const f of fams) {
    const h0 = get(f, 'HUSB'), w0 = get(f, 'WIFE');
    let h = h0 && h0.val ? h0.val.replace(/@/g, '') : null, w = w0 && w0.val ? w0.val.replace(/@/g, '') : null;
    if (!P.has(h)) h = null; if (!P.has(w)) w = null;
    if (h && w) { P.get(h).spouse.push(w); P.get(w).spouse.push(h); }
    for (const c of all(f, 'CHIL')) {
      const cid = c.val.replace(/@/g, ''); if (!P.has(cid)) continue;
      if (h) { P.get(cid).father = h; P.get(h).kids.push(cid); }
      if (w) { P.get(cid).mother = w; P.get(w).kids.push(cid); }
    }
  }
  for (const p of P.values()) { p.spouse = [...new Set(p.spouse)]; p.kids = [...new Set(p.kids)]; }
  return { people: P, mentions };
}

const slugify = s => s.normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
const fold = s => (s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase();

/* Fill the years the file leaves out, decide who is living. Mutates the people; returns the sets of estimated ids. */
export function prepare(P) {
  const est = new Set(), dest = new Set();
  for (let round = 0; round < 4; round++) {
    for (const p of P.values()) {
      if (p.by !== null) continue;
      let c = null;
      const f = p.father && P.get(p.father), m = p.mother && P.get(p.mother);
      if (f && f.by) c = f.by + 30; else if (m && m.by) c = m.by + 28;
      else if (p.kids.length) { const ks = p.kids.map(k => P.get(k).by).filter(Boolean); if (ks.length) c = Math.min(...ks) - 28; }
      if (c === null && p.spouse.length) { const ss = p.spouse.map(s => P.get(s).by).filter(Boolean); if (ss.length) c = ss[0]; }
      if (c) { p.by = c; est.add(p.id); }
    }
  }
  for (const p of P.values()) {
    p.liv = !p.deathKnown && (p.by === null || p.by > NOW - 110);
    if (!p.liv && p.dy === null && p.by !== null) { p.dy = Math.min(p.by + 75, NOW - 1); dest.add(p.id); }
  }
  return { est, dest };
}

/* placeFor(raw) -> {name} | null.  Returns {tree, report}. */
export function buildTree(P, placeFor, est, dest, opts = {}) {
  const living = opts.living || 'redact', maxLines = 8;
  const keep = new Map(), undrawn = [];
  const ok = raw => (raw ? placeFor(raw) : null);
  for (const p of P.values()) {
    if (p.liv && living === 'omit') continue;
    if (p.by === null) { undrawn.push({ id: p.id, name: p.liv ? 'Living person' : clean(p.given + ' ' + p.sur), why: 'year', ...(p.bpRaw && !p.liv ? { place: p.bpRaw } : {}) }); continue; }
    keep.set(p.id, p);
  }
  for (const p of keep.values()) { const r = ok(p.bpRaw); p.bp = r ? r.name : null; p.bpe = false; }
  let borrowed = 0;
  for (let round = 0; round < 3; round++) {
    for (const p of keep.values()) {
      if (p.bp) continue;
      for (const rid of [p.father, p.mother, ...p.spouse, ...p.kids]) {
        const q = rid && keep.get(rid);
        if (q && q.bp && !q.bpe) { p.bp = q.bp; p.bpe = true; borrowed++; break; }     // only a place the file itself states is borrowed, never a borrowed one
      }
    }
  }
  const dropped = [];
  for (const [id, p] of keep) if (!p.bp) { dropped.push(id); undrawn.push({ id, name: p.liv ? 'Living person' : clean(p.given + ' ' + p.sur), why: 'place', b: p.liv ? null : p.by, ...(p.bpRaw && !p.liv ? { place: p.bpRaw } : {}) }); }
  for (const id of dropped) keep.delete(id);
  for (const p of keep.values()) {
    const dr = ok(p.dpRaw);
    p.dp = dr ? dr.name : p.bp; p.my = null; p.mye = false;
    if (!p.liv) {
      for (const [y, rp] of [...p.resi].sort((a, b) => (a[0] === null) - (b[0] === null) || (a[0] || 0) - (b[0] || 0))) {
        const r = ok(rp);
        if (r && r.name !== p.bp && y && y > p.by + 14) { p.my = y; p.dp = r.name; break; }
      }
      if (p.my === null && p.dp !== p.bp && p.dy && p.dy - p.by > 24) { p.my = p.by + Math.floor((p.dy - p.by) * .6); p.mye = true; }
      if (p.dp === p.bp) p.my = null;
    }
  }
  for (const p of keep.values()) {
    if (p.father && !keep.has(p.father)) p.father = null; if (p.mother && !keep.has(p.mother)) p.mother = null;
    p.spouseK = p.spouse.filter(s => keep.has(s)); p.kidsK = p.kids.filter(k => keep.has(k));
  }
  // lines: the seven most common surnames get a colour of their own, everyone else shares the last
  const counts = new Map();
  for (const p of keep.values()) if (p.sur) { const k = fold(p.sur), c = counts.get(k); if (c) c[0]++; else counts.set(k, [1, p.sur]); }
  const order = [...counts].sort((a, b) => b[1][0] - a[1][0]).slice(0, maxLines - 1).map(e => e[0]);
  const lines = order.map(k => ({ sur: counts.get(k)[1], host: '' }));
  // focus: the deceased person with the most ancestors and descendants (each counted to 30)
  const reach = (start, nexts) => { const seen = new Set([start]), q = [start]; while (q.length && seen.size < 31) { const i = q.shift(); for (const k of nexts(keep.get(i))) if (!seen.has(k)) { seen.add(k); q.push(k); } } return seen.size - 1; };
  let focus = null, best = -1;
  for (const [i, p] of keep) {
    if (p.liv) continue;
    const sc = Math.min(reach(i, q => q.kidsK), 30) + Math.min(reach(i, q => [q.father, q.mother].filter(Boolean)), 30);
    if (sc > best) { best = sc; focus = i; }
  }
  if (focus === null) focus = keep.keys().next().value || null;
  const people = [];
  for (const [i, p] of keep) {
    const li = order.indexOf(fold(p.sur));
    people.push({ id: i, sex: p.sex === 'f' ? 'f' : 'm', given: p.liv ? '' : p.given, sur: p.sur, line: li < 0 ? maxLines - 1 : li,
      by: p.liv ? Math.floor(p.by / 10) * 10 : p.by, bp: p.bp, dy: p.liv ? null : p.dy, dp: p.liv ? null : p.dp, my: p.my,
      occ: p.liv ? null : p.occ, father: p.father, mother: p.mother, spouse: p.spouseK, kids: p.kidsK, srcs: p.liv ? [] : p.srcs,
      bye: est.has(p.id) || (p.byApprox && !p.liv), dye: dest.has(p.id), bpe: p.bpe, slug: p.liv ? null : slugify(p.given + ' ' + p.sur) });
  }
  const tree = { meta: { title: 'Roots & Routes', sub: 'Your tree, drawn in this browser. Click anyone and every view follows.', living, generated: new Date().toISOString().slice(0, 10), source: 'your GEDCOM' },
    lines, focus, people, undrawn };
  let nliv = 0, ndrawnLiv = 0; for (const p of P.values()) if (p.liv) nliv++; for (const p of keep.values()) if (p.liv) ndrawnLiv++;
  const report = { individuals: P.size, drawn: people.length, living: nliv, livingRedacted: living === 'redact' ? ndrawnLiv : 0, livingOmitted: living === 'omit' ? nliv : 0,
    undatedNotDrawn: undrawn.filter(u => u.why === 'year').length, noPlaceNotDrawn: dropped.length, birthYearEstimated: est.size, deathYearEstimated: dest.size, placeBorrowedFromRelative: borrowed, focus };
  return { tree, report, keep };
}
