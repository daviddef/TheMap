/* Consistency checks that read a person's whole life, and checks only the Atlas can make. Three kinds, each worked out from the file and the Atlas
   and never from a guess:
     lifeline   an event before the birth or after the death, a marriage too young or after a spouse died, two different birth or death years,
                a wife recorded under her husband's surname
     atlas      a place written with today's country on a date when the Atlas shows another power ruling it; two places too far apart for the
                years between them; a surname that changes between father and child and is not one of the catalogue's spellings
     leads      a person with no parents recorded, born where the Atlas lists a record collection for those years (the place to look next)
   Reasons for one person are stacked on one row. Recorded years only: an estimated year never raises a flag. No DOM, no network. */
import { get } from './gedcom.js';

const az = (a, b) => a.localeCompare(b, 'en');
const yearOf = v => { const m = /\b(\d{4})\b/.exec(v || ''); return m ? +m[1] : null; };
const idOf = x => String(x || '').replace(/@/g, '');
const sfold = t => (t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/* events that can happen after death (burial, a will, probate) or that are about the birth itself */
const BIRTHISH = new Set(['BIRT', 'CHR', 'BAPM']), POSTHUMOUS = new Set(['DEAT', 'BURI', 'CREM', 'PROB', 'WILL', 'CEME']);
const NAMES = { BIRT: 'Birth', CHR: 'Christening', BAPM: 'Baptism', DEAT: 'Death', BURI: 'Burial', MARR: 'Marriage', RESI: 'Residence', IMMI: 'Immigration', EMIG: 'Emigration', NATU: 'Naturalisation', CENS: 'Census', OCCU: 'Occupation', DIV: 'Divorce' };
const evName = t => NAMES[t] || t;
const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, k) => k); for (let i = 1; i <= a.length; i++) { let pv = d[0]; d[0] = i; for (let k = 1; k <= b.length; k++) { const t = d[k]; d[k] = Math.min(d[k] + 1, d[k - 1] + 1, pv + (a[i - 1] === b[k - 1] ? 0 : 1)); pv = t; } } return d[b.length]; };
function km(a, b, c, d) { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); }

/* env: { parsed, P, est, dest, keep(p), shown(p), locate(raw) -> {lat,lon,iso,name,kind} | null, period(t, year) -> {label, iso} | null,
          cols(t, year) -> [{title,url,provider,from,to}], families: [[form, ...]] (spellings the Atlas catalogue treats as one name) } */
export function buildConsistency(env) {
  const { parsed, P, est, dest, keep, shown, locate, period, cols } = env;
  const fam = new Map();                                                   // folded spelling -> family index
  (env.families || []).forEach((f, n) => f.forEach(s => fam.set(sfold(s), n)));
  const sameName = (a, b) => { a = sfold(a); b = sfold(b); return !a || !b || a === b || (fam.has(a) && fam.get(a) === fam.get(b)); };

  /* ---- every dated event, per person, and the marriages ---- */
  const evs = new Map(), marr = [];                                        // id -> [{tag, y, raw}]
  const push = (p, tag, y, raw, approx) => { if (!evs.has(p.id)) evs.set(p.id, []); evs.get(p.id).push({ tag, y, raw, approx }); };
  const births = new Map(), deaths = new Map();                            // id -> Set of years given by separate BIRT / DEAT records
  for (const r of parsed.nodes) {
    if (r.tag === 'INDI' && r.xref) {
      const p = P.get(idOf(r.xref)); if (!p) continue;
      for (const k of r.kids) {
        const d = get(k, 'DATE'), y = d ? yearOf(d.val) : null; if (y === null) continue;
        const pl = get(k, 'PLAC');
        push(p, k.tag, y, pl ? pl.val.trim() : '', /\b(ABT|CAL|EST|BEF|AFT|BET)\b/i.test(d.val));
        const m = k.tag === 'BIRT' ? births : k.tag === 'DEAT' ? deaths : null;
        if (m && !/\b(ABT|CAL|EST|BEF|AFT|BET)\b/i.test(d.val)) { if (!m.has(p.id)) m.set(p.id, new Set()); m.get(p.id).add(y); }
      }
    } else if (r.tag === 'FAM') {
      const own = ['HUSB', 'WIFE'].map(t => { const h = get(r, t); return h && P.get(idOf(h.val)); }), mk = r.kids.filter(k => k.tag === 'MARR');
      for (const k of mk) { const d = get(k, 'DATE'), y = d ? yearOf(d.val) : null, pl = get(k, 'PLAC'); if (y === null) continue;
        marr.push({ y, husb: own[0], wife: own[1] });
        for (const p of own) if (p) push(p, 'MARR', y, pl ? pl.val.trim() : '', /\b(ABT|CAL|EST|BEF|AFT|BET)\b/i.test(d.val)); }
    }
  }

  const rows = new Map();                                                  // id -> {p, reasons: [{code, text}]}
  const why = (p, code, text) => { if (!keep(p)) return; let r = rows.get(p.id); if (!r) rows.set(p.id, r = { p, reasons: [] }); if (!r.reasons.some(x => x.text === text)) r.reasons.push({ code, text }); };
  const recB = p => (p.by !== null && !est.has(p.id) ? p.by : null), recD = p => (p.dy !== null && p.dy !== undefined && !dest.has(p.id) ? p.dy : null);

  /* ---- lifeline ---- */
  for (const p of P.values()) {
    const b = recB(p), d = recD(p);
    for (const e of evs.get(p.id) || []) {
      if (BIRTHISH.has(e.tag) || e.tag === 'DEAT') continue;                                                    // birth and death years are checked in "dates that do not add up"
      const tol = e.approx ? 2 : 0;
      if (d !== null && !POSTHUMOUS.has(e.tag) && e.y - tol > d + 1) why(p, 'after-death', evName(e.tag) + ' in ' + e.y + ', after the death in ' + d);
      if (b !== null && e.y + tol < b - (p.byApprox ? 2 : 0)) why(p, 'before-birth', evName(e.tag) + ' in ' + e.y + ', before the birth in ' + b);
    }
    for (const [tag, m, w] of [['birth', births, 'birth'], ['death', deaths, 'death']]) {
      const ys = [...(m.get(p.id) || [])].sort((a, c) => a - c);
      if (ys.length > 1 && ys[ys.length - 1] - ys[0] > 0) why(p, 'conflict-' + tag, 'Records give more than one ' + w + ' year (' + ys.join(', ') + '); the page uses ' + (tag === 'birth' ? p.by : p.dy));
    }
  }
  for (const m of marr) {
    for (const [p, q, role] of [[m.husb, m.wife, 'spouse'], [m.wife, m.husb, 'spouse']]) {
      if (!p) continue; const b = recB(p), sd = q ? recD(q) : null, d = recD(p);
      if (b !== null && m.y - b < 14 && m.y >= b) why(p, 'marry-young', 'Married in ' + m.y + ' at ' + (m.y - b) + ' (born ' + b + ')');
      if (sd !== null && m.y > sd + 0) why(p, 'marry-dead', 'Marriage in ' + m.y + ' is after their ' + role + ' died in ' + sd);
      if (d !== null && m.y > d) why(p, 'marry-dead', 'Marriage in ' + m.y + ' is after their own death in ' + d);
    }
    /* a wife written under her husband's surname while her father has another: her married name, not her birth name */
    const w = m.wife, h = m.husb;
    if (w && h && w.sur && h.sur && sameName(w.sur, h.sur) && w.father && P.get(w.father) && P.get(w.father).sur && !sameName(P.get(w.father).sur, w.sur))
      why(w, 'maiden', 'Recorded as ' + w.sur + ', her husband’s surname, but her father is ' + P.get(w.father).sur + ': a married name entered as a birth name?');
  }

  /* ---- Atlas: period-wrong place, journeys, surname breaks ---- */
  const ages = new Map(), loc = new Map(), at = raw => { if (!loc.has(raw)) loc.set(raw, locate(raw)); return loc.get(raw); };
  for (const p of P.values()) {
    if (!keep(p)) continue;
    const list = (evs.get(p.id) || []).filter(e => e.raw && !e.approx);
    for (const e of list) {
      const t = at(e.raw); if (!t || t.kind !== 'place') continue;
      const parts = e.raw.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2 || !t.today || sfold(parts[parts.length - 1]) !== sfold(t.today)) continue;           // only a text that names today's country
      const per = period(t, e.y); if (per && per.iso && per.iso !== t.iso) {                                          // grouped: the same wording recurs thousands of times
        const k = t.today + '|' + per.label, g = ages.get(k) || { key: 'o|' + k, country: t.today, label: per.label, count: 0, from: e.y, to: e.y, people: new Map() };
        g.count++; g.from = Math.min(g.from, e.y); g.to = Math.max(g.to, e.y); g.people.set(p.id, shown(p)); ages.set(k, g);
      }
    }
    const dated = list.filter(e => !BIRTHISH.has(e.tag) || e.tag === 'BIRT').map(e => ({ ...e, t: at(e.raw) })).filter(e => e.t && e.t.kind === 'place').sort((a, b) => a.y - b.y);
    for (let i = 1; i < dated.length; i++) {
      const a = dated[i - 1], b = dated[i], dt = b.y - a.y, d = Math.round(km(a.t.lat, a.t.lon, b.t.lat, b.t.lon));
      if (a.t.name === b.t.name && a.t.iso === b.t.iso) continue;
      const fast = a.y < 1900 ? 1500 : 4000;                                                                       // km that cannot be crossed inside a single recorded year
      if (dt <= 1 && d > fast * (dt + 1)) why(p, 'journey', evName(a.tag) + ' in ' + a.y + ' at ' + a.t.name + ' and ' + evName(b.tag) + ' in ' + b.y + ' at ' + b.t.name + ' are ' + d.toLocaleString('en') + ' km apart');
    }
    for (const pid of [p.father]) {
      const f = pid && P.get(pid); if (!f || !f.sur || !p.sur || p.sex === 'f') continue;
      if (!sameName(f.sur, p.sur)) why(p, 'surname', 'Surname ' + p.sur + ' differs from their father’s (' + f.sur + ')' + (lev(sfold(p.sur), sfold(f.sur)) <= 2 ? ': a close spelling, not yet in the Atlas surname catalogue. If it is the same name, it is a variant to record there, not an error here' : ': the Atlas surname catalogue does not list them as one name'));
    }
  }

  /* ---- research leads ---- */
  const leads = [];
  for (const p of P.values()) {
    if (!keep(p) || p.father || p.mother || !p.bpRaw || p.by === null || est.has(p.id)) continue;
    const t = at(p.bpRaw); if (!t || t.kind !== 'place') continue;
    const cs = cols(t, p.by); if (!cs.length) continue;
    leads.push({ key: 'l|' + p.id, id: p.id, name: shown(p), born: p.by, place: p.bpRaw, cols: cs.slice(0, 4), more: Math.max(0, cs.length - 4) });
  }
  leads.sort((a, b) => az(a.name, b.name) || az(a.id, b.id));

  const suspect = [...rows.values()].map(({ p, reasons }) => ({ key: 's|' + p.id + '|' + reasons.map(r => r.code).sort().join('+'), id: p.id, name: shown(p), reasons }))
    .sort((a, b) => b.reasons.length - a.reasons.length || az(a.name, b.name) || az(a.id, b.id));
  const period_ = [...ages.values()].map(g => ({ key: g.key, country: g.country, label: g.label, count: g.count, from: g.from, to: g.to, people: [...g.people].slice(0, 8).map(([id, name]) => ({ id, name, by: null })), n: g.people.size }))
    .sort((a, b) => az(a.country, b.country) || a.from - b.from);
  return { suspect, leads, ages: period_ };
}
