/* The fix list: what to correct in the tree you keep elsewhere (MyHeritage, Ancestry, a desktop program), worked out from the file and written so each
   line can be copied and pasted. Sections, each A to Z:
     places     a place text with a firm match: current text, and the standard form to paste in         (only matches we are sure of)
     check      a probable match: shown with the suggestion, marked as a suggestion
     decide     places we could not pin down: the candidates found, for you to choose from
     years      people with no birth year, and people whose year is only estimated from relatives
     dates      dates that do not add up (born after death, a parent too young or too old, a child born after a parent died)
     dupes      people who may be one person entered twice
     apart      groups of people not joined to the main tree
   No DOM, no network. It reads the session; it changes nothing. */
import { get } from './gedcom.js';

const EV = { BIRT: 'Birth', CHR: 'Christening', BAPM: 'Baptism', DEAT: 'Death', BURI: 'Burial', CREM: 'Cremation', MARR: 'Marriage', DIV: 'Divorce', RESI: 'Residence', IMMI: 'Immigration', EMIG: 'Emigration', NATU: 'Naturalisation', CENS: 'Census', OCCU: 'Occupation', PROB: 'Probate', WILL: 'Will', EVEN: 'Event', BAPL: 'Baptism (LDS)', ENDL: 'Endowment', SLGC: 'Sealing', GRAD: 'Graduation', RETI: 'Retirement', BARM: 'Bar mitzvah', BASM: 'Bas mitzvah', BLES: 'Blessing', CHRA: 'Adult christening', CONF: 'Confirmation', FCOM: 'First communion', ORDN: 'Ordination', ADOP: 'Adoption' };
const SAMPLE = 8, name = p => ((p.given || '') + ' ' + (p.sur || '')).trim() || p.id;
const az = (a, b) => a.localeCompare(b, 'en');

/* env: { parsed, P, est, dest, merges, resolve(raw) -> {tier, place, cands} | null, label(place) -> string, living: bool } */
export function buildChecklist(env) {
  const { parsed, P, est, dest, merges, resolve, label } = env, living = env.living !== false;
  const shown = p => (p.liv && !living ? 'Living person' : name(p));
  const keep = p => living || !p.liv;
  const idOf = x => x.replace(/@/g, '');

  /* ---- every event with a place, per person ---- */
  const byRaw = new Map();                                              // raw text -> { count, people: [...] }
  const add = (raw, p, ev, date) => {
    let g = byRaw.get(raw); if (!g) byRaw.set(raw, g = { count: 0, people: [] });
    g.count++; g.people.push({ id: p.id, name: shown(p), ev, date: date || '' });
  };
  const visit = (rec, owners) => {
    for (const k of rec.kids) {
      const pl = get(k, 'PLAC'); if (!pl || !pl.val.trim()) continue;
      const raw = pl.val.trim(), d = get(k, 'DATE'), ev = EV[k.tag] || k.tag;
      for (const p of owners) if (keep(p)) add(raw, p, ev, d && d.val);
    }
  };
  for (const r of parsed.nodes) {
    if (r.tag === 'INDI' && r.xref) { const p = P.get(idOf(r.xref)); if (p) visit(r, [p]); }
    else if (r.tag === 'FAM') {
      const own = ['HUSB', 'WIFE'].map(t => { const h = get(r, t); return h && P.get(idOf(h.val)); }).filter(Boolean);
      if (own.length) visit(r, own);
    }
  }

  /* A suggested form is a FIX only when it loses nothing and is the same name spelled differently: the town matches (diacritics, a typo) and any
     region the text gives matches too. A different town or region name may be the historical one (Port Elizabeth, Natal), so it is only
     something to CHECK against the date. A text with more parts than the standard form, or a part the standard form lacks, is already more detailed: left alone. */
  const fold = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const lev = (a, b) => { const d = Array.from({ length: b.length + 1 }, (_, k) => k); for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i; for (let k = 1; k <= b.length; k++) { const t = d[k]; d[k] = Math.min(d[k] + 1, d[k - 1] + 1, prev + (a[i - 1] === b[k - 1] ? 0 : 1)); prev = t; } } return d[b.length]; };
  const near = (a, b) => { a = fold(a); b = fold(b); return a === b || lev(a, b) <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.2)); };
  const classify = (raw, r) => {
    const lab = label(r.place), lp = lab.split(', '), rp = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!lab || lab === raw || rp.length > lp.length) return null;
    const rest = rp.slice(1).filter((x, k, arr) => !(r.said && k === arr.length - 1));       // the country the text names may be spelled any way
    if (!rest.every(x => lp.slice(1).some(y => near(x, y)))) return null;                    // something in the text would be lost: leave it
    return { to: lab, fix: near(rp[0], lp[0]) };
  };
  const places = [], check = [], decide = [];
  for (const [raw, g] of byRaw) {
    const r = resolve(raw); if (!r) continue;
    const sure = (r.tier === 'confident' || r.tier === 'confident-by-region' || r.tier === 'user') && r.place;
    if (r.place && (sure || r.tier === 'probable' || r.tier === 'by-tree-context' || r.tier === 'by-neighbours')) {
      const c = classify(raw, r); if (!c) continue;
      if (sure && c.fix) places.push({ key: 'p|' + raw, raw, to: c.to, count: g.count, people: g.people });
      else check.push({ key: 'c|' + raw, raw, to: c.to, tier: r.tier, why: sure ? 'a different name: it may be the historical name, so check it against the date' : 'a probable match, not a certain one', count: g.count, people: g.people });
    } else if (['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found'].includes(r.tier)) {
      decide.push({ key: 'd|' + raw, raw, tier: r.tier, count: g.count, cands: (r.cands || []).slice(0, 5).map(label), people: g.people });
    }
  }
  for (const a of [places, check, decide]) a.sort((x, y) => az(x.raw, y.raw));

  /* ---- years ---- */
  const years = [];
  for (const p of P.values()) {
    if (!keep(p)) continue;
    if (p.by === null) years.push({ key: 'y|' + p.id, id: p.id, name: shown(p), kind: 'none', place: p.liv && !living ? '' : p.bpRaw || '', note: 'No birth year' });
    else if (est.has(p.id)) years.push({ key: 'y|' + p.id, id: p.id, name: shown(p), kind: 'estimated', hint: p.by, place: p.bpRaw || '', note: 'Birth year only estimated from relatives: about ' + p.by });
  }
  years.sort((a, b) => az(a.name, b.name) || az(a.id, b.id));

  /* ---- people the file gives no full name ---- */
  const kinWith = p => [['father', p.father], ['mother', p.mother], ['spouse', p.spouse[0]], ['child', p.kids[0]]].filter(([, id]) => id && P.get(id) && (P.get(id).given || P.get(id).sur)).slice(0, 2).map(([r, id]) => r + ' ' + shown(P.get(id))).join(', ');
  const names = [];
  for (const p of P.values()) {
    if (!keep(p) || (p.given && p.sur)) continue;
    const kind = !p.given && !p.sur ? 'none' : !p.sur ? 'given' : 'surname';
    names.push({ key: 'n|' + p.id, id: p.id, name: kind === 'none' ? '' : shown(p), kind, note: kind === 'none' ? 'No name recorded' : kind === 'given' ? 'Given name only' : 'Surname only', kin: kinWith(p), born: p.by, place: p.bpRaw || '' });
  }
  names.sort((a, b) => az(a.name || '\uffff' + a.kin, b.name || '\uffff' + b.kin) || az(a.id, b.id));

  /* ---- dates that do not add up (recorded years only: an estimate never raises a flag) ---- */
  const dates = [], real = (p, which) => (which === 'b' ? p.by !== null && !est.has(p.id) : p.dy !== null && p.dy !== undefined && !dest.has(p.id));
  const tol = (p, which) => ((which === 'b' ? p.byApprox : false) ? 2 : 0);
  const flag = (p, why, extra) => { if (keep(p)) dates.push({ key: 'x|' + p.id + '|' + why, id: p.id, name: shown(p), note: why, born: p.by, died: p.dy ?? null, with: extra || '' }); };
  for (const p of P.values()) {
    if (real(p, 'b') && real(p, 'd')) {
      if (p.dy + tol(p, 'b') < p.by) flag(p, 'Died (' + p.dy + ') before being born (' + p.by + ')');
      else if (p.dy - p.by > 110) flag(p, 'Lived ' + (p.dy - p.by) + ' years (born ' + p.by + ', died ' + p.dy + ')');
    }
    if (!real(p, 'b')) continue;
    for (const [pid, role] of [[p.mother, 'mother'], [p.father, 'father']]) {
      const q = pid && P.get(pid); if (!q || !real(q, 'b')) continue;
      const gap = p.by - q.by, t = tol(p, 'b') + tol(q, 'b');
      if (gap + t < 0) flag(p, 'Born ' + (-gap) + ' years before their ' + role + ' (born ' + q.by + ')', shown(q));
      else if (gap + t < 13) flag(p, 'Their ' + role + ' was only ' + gap + ' years older (born ' + q.by + ')', shown(q));
      else if (role === 'mother' && gap - t > 55) flag(p, 'Their mother was ' + gap + ' years older (born ' + q.by + ')', shown(q));
      else if (role === 'father' && gap - t > 85) flag(p, 'Their father was ' + gap + ' years older (born ' + q.by + ')', shown(q));
      if (real(q, 'd') && p.by - t > q.dy + (role === 'father' ? 1 : 0)) flag(p, 'Born (' + p.by + ') after their ' + role + ' died (' + q.dy + ')', shown(q));
    }
  }
  dates.sort((a, b) => az(a.name, b.name) || az(a.note, b.note));

  /* ---- possible duplicates ---- */
  const dupes = merges.filter(m => keep(P.get(m.a)) && keep(P.get(m.b))).map(m => {
    const a = P.get(m.a), b = P.get(m.b);
    return { key: 'm|' + [m.a, m.b].sort().join('|'), a: m.a, b: m.b, an: shown(a), bn: shown(b), ay: a.by, by: b.by, ap: a.bpRaw || '', bp: b.bpRaw || '', strong: !!m.strong, note: m.why };
  });

  /* ---- groups not joined to the main tree ---- */
  const seen = new Set(), comps = [];
  for (const p of P.values()) {
    if (seen.has(p.id)) continue;
    const comp = [], q = [p.id]; seen.add(p.id);
    while (q.length) { const id = q.pop(), x = P.get(id); comp.push(x); for (const n of [x.father, x.mother, ...x.spouse, ...x.kids]) if (n && P.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    comps.push(comp);
  }
  comps.sort((a, b) => b.length - a.length);
  const apart = comps.slice(1).map(c => c.filter(keep)).filter(c => c.length).map(c => {
    const s = c.slice().sort((a, b) => az(name(a), name(b)));
    return { key: 'a|' + s[0].id, size: c.length, people: s.slice(0, SAMPLE).map(p => ({ id: p.id, name: shown(p), by: p.by })), first: shown(s[0]) };
  }).sort((a, b) => az(a.first, b.first));

  const out = {
    main: comps.length ? comps[0].length : 0,
    sections: [
      { key: 'places', title: 'Fix these places', how: 'Open the person, edit the event, and replace the place with the text in the second column. One fix covers every event that uses the same text.', items: places },
      { key: 'check', title: 'Check these places', how: 'Suggestions, not fixes: a probable match, or a different name that may be the one in use at the time. Check each against its date and source before you paste it.', items: check },
      { key: 'decide', title: 'Places to decide', how: 'We could not pin these down. The candidates are what the gazetteer found; pick the one your sources support, or leave it.', items: decide },
      { key: 'years', title: 'People without a birth year', how: 'A year puts the person on the map. Estimated years come from relatives and are not evidence.', items: years },
      { key: 'names', title: 'People without a full name', how: 'The file gives no name, or only a given name or a surname. The family around them is shown so you can tell who they are.', items: names },
      { key: 'dates', title: 'Dates that do not add up', how: 'Recorded years only. Each one is a place to look for a typo or a wrong person.', items: dates },
      { key: 'dupes', title: 'Maybe the same person', how: 'Same name, same sex, births within two years, not related to each other. Check before merging; MyHeritage and others keep a merge tool.', items: dupes },
      { key: 'apart', title: 'Groups not joined to the main tree', how: 'Each group has no link to the largest tree. Finding one parent or spouse joins it.', items: apart },
    ],
  };
  out.counts = Object.fromEntries(out.sections.map(s => [s.key, s.items.length]));
  return out;
}

/* ---- plain text and CSV, so the list can go on paper or into a spreadsheet ---- */
const ppl = l => l.slice(0, SAMPLE).map(x => x.name + ' (' + x.id + ', ' + x.ev + (x.date ? ' ' + x.date : '') + ')').join('; ');

export function checklistText(c, date = '') {
  const L = ['FIX LIST' + (date ? ' · ' + date : ''), 'Made in your browser from your file. Tick each line when it is done in your own tree.', ''];
  for (const s of c.sections) {
    if (!s.items.length) continue;
    L.push(s.title.toUpperCase() + ' (' + s.items.length + ')', s.how, '');
    for (const i of s.items) {
      if (s.key === 'places' || s.key === 'check') L.push('[ ] "' + i.raw + '"  ->  "' + i.to + '"' + (s.key === 'check' ? ' (suggestion: ' + i.why + ')' : '') + '  · ' + i.count + ' event' + (i.count === 1 ? '' : 's') + ': ' + ppl(i.people) + (i.count > SAMPLE ? '; and ' + (i.count - SAMPLE) + ' more (all of them are in the spreadsheet)' : ''));
      else if (s.key === 'decide') L.push('[ ] "' + i.raw + '"  ·  ' + (i.cands.length ? 'could be: ' + i.cands.join(' | ') : 'no candidate found') + '  · ' + i.count + ' event' + (i.count === 1 ? '' : 's') + ': ' + ppl(i.people) + (i.count > SAMPLE ? '; and ' + (i.count - SAMPLE) + ' more' : ''));
      else if (s.key === 'years') L.push('[ ] ' + i.name + ' (' + i.id + ')  ·  ' + i.note + (i.place ? '  ·  born at ' + i.place : ''));
      else if (s.key === 'names') L.push('[ ] ' + (i.name || '(no name)') + ' (' + i.id + ')  ·  ' + i.note + (i.kin ? '  ·  ' + i.kin : '') + (i.born ? '  ·  born ' + i.born : '') + (i.place ? ' at ' + i.place : ''));
      else if (s.key === 'dates') L.push('[ ] ' + i.name + ' (' + i.id + ')  ·  ' + i.note + (i.with ? '  ·  with ' + i.with : ''));
      else if (s.key === 'dupes') L.push('[ ] ' + i.an + ' (' + i.a + ') and ' + i.bn + ' (' + i.b + ')  ·  ' + i.note);
      else if (s.key === 'apart') L.push('[ ] ' + i.size + (i.size === 1 ? ' person: ' : ' people: ') + i.people.map(p => p.name + ' (' + p.id + (p.by ? ', b. ' + p.by : '') + ')').join('; ') + (i.size > i.people.length ? '; and ' + (i.size - i.people.length) + ' more' : ''));
    }
    L.push('');
  }
  return L.join('\n');
}

const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function checklistCsv(c) {
  const rows = [['Done', 'Section', 'Person', 'Id', 'Event', 'Date', 'Current text', 'Change to / note']];
  const row = (...a) => rows.push(['', ...a]);
  for (const s of c.sections) for (const i of s.items) {
    if (s.key === 'places' || s.key === 'check') for (const p of i.people) row(s.title, p.name, p.id, p.ev, p.date, i.raw, i.to + (s.key === 'check' ? ' (suggestion: ' + i.why + ')' : ''));
    else if (s.key === 'decide') for (const p of i.people) row(s.title, p.name, p.id, p.ev, p.date, i.raw, i.cands.join(' | '));
    else if (s.key === 'years') row(s.title, i.name, i.id, '', '', '', i.note);
    else if (s.key === 'names') row(s.title, i.name || '(no name)', i.id, '', '', '', i.note + (i.kin ? ' · ' + i.kin : '') + (i.born ? ' · born ' + i.born : ''));
    else if (s.key === 'dates') row(s.title, i.name, i.id, '', '', '', i.note + (i.with ? ' (with ' + i.with + ')' : ''));
    else if (s.key === 'dupes') row(s.title, i.an + ' / ' + i.bn, i.a + ' / ' + i.b, '', '', '', i.note);
    else if (s.key === 'apart') for (const p of i.people) row(s.title, p.name, p.id, '', '', '', 'group of ' + i.size);
  }
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
