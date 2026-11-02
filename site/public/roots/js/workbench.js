/* The workbench: edits the user makes (a date, a note, a source, "these two may be the same person") held as an overlay on top of their file,
   and the lists that tell them where to start (people with no year, likely duplicates). The original lines are never touched here; export.js
   applies the overlay to them and lists every line it wrote. No DOM, no network. */
import { yearOf } from './model.js';

const MON = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC', ONE = `(?:(?:\\d{1,2} )?(?:${MON}) )?\\d{3,4}(?:/\\d{2})?`;
const DATE = new RegExp(`^(?:(?:ABT|BEF|AFT|CAL|EST) )?${ONE}$|^BET ${ONE} AND ${ONE}$|^FROM ${ONE}(?: TO ${ONE})?$`);
/* A GEDCOM date as the user typed it, upper-cased and tidied, or null if it is not one ("12 mar 1850", "abt 1850", "bet 1840 and 1845"). */
export function cleanDate(s) { const t = String(s || '').trim().replace(/\s+/g, ' ').toUpperCase(); return DATE.test(t) ? t : null; }

export class Overlay {
  constructor() { this.edits = []; this.seq = 0; this.dismissed = new Set(); }
  add(e) {
    // the latest date for a person's field wins; the same merge hint twice is one
    if (e.op === 'date') this.edits = this.edits.filter(x => !(x.op === 'date' && x.who === e.who && x.field === e.field));
    if (e.op === 'merge') { const k = [e.who, e.other].sort().join('|'); if (this.edits.some(x => x.op === 'merge' && [x.who, x.other].sort().join('|') === k)) return null; this.dismissed.delete(k); }
    const r = { ...e, n: ++this.seq }; this.edits.push(r); return r;
  }
  remove(n) { this.edits = this.edits.filter(x => x.n !== n); }
  dismiss(a, b) { this.dismissed.add([a, b].sort().join('|')); }
  of(who) { return this.edits.filter(x => x.who === who || x.other === who); }
}

/* Pairs that may be one person entered twice: same given name and surname, births within two years, same sex, not related as parent, child or spouse,
   neither living. `est` = ids whose year is only estimated (they never make a suggestion). Sorted by name, A to Z. */
export function suggestMerges(P, est, overlay) {
  const fold = s => (s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const groups = new Map();
  for (const p of P.values()) {
    if (p.liv || p.by === null || est.has(p.id) || !p.sur || !p.given) continue;
    const k = fold(p.given.split(/\s+/)[0]) + '|' + fold(p.sur.split(/\s+/)[0]); if (k.length < 5) continue;
    (groups.get(k) || groups.set(k, []).get(k)).push(p);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.by - b.by);
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length && g[j].by - g[i].by <= 2; j++) {
      const a = g[i], b = g[j]; if (a.sex !== b.sex) continue;
      if (a.father === b.id || a.mother === b.id || b.father === a.id || b.mother === a.id || a.spouse.includes(b.id)) continue;
      const key = [a.id, b.id].sort().join('|');
      if (overlay.dismissed.has(key) || overlay.edits.some(x => x.op === 'merge' && [x.who, x.other].sort().join('|') === key)) continue;
      const same = a.bpRaw && b.bpRaw && fold(a.bpRaw) === fold(b.bpRaw);
      out.push({ a: a.id, b: b.id, strong: !!same && a.by === b.by, why: (a.by === b.by ? 'same birth year' : 'birth years ' + a.by + ' and ' + b.by) + (same ? ', same birth place' : '') });
    }
  }
  return out.sort((x, y) => (P.get(x.a).sur + P.get(x.a).given).localeCompare(P.get(y.a).sur + P.get(y.a).given, 'en') || x.a.localeCompare(y.a));
}

export { yearOf };
