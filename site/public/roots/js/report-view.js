/* The import report, drawn as DOM. It lives here, not in app.js, so the Roots & Routes page and the Tree Canvas's "Your file" page show the SAME facts from the SAME
   code: change a sentence here and both change. Everything from the file reaches the DOM through textContent, never innerHTML: it is untrusted text.
   reportInto(m, container, {h}) draws what the reader (worker.js) sent as m.report. `h` is the heading level its sections use ('h2' on /roots/, 'h3' under "Your file").
   A tree.json has no GEDCOM, no place table and no timings to report; it gets its own short account (treeJsonReport) and never a half-empty GEDCOM one. */
export const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
export const n0 = n => (+n).toLocaleString('en');
export const pct = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';

const TIER = {
  'confident': ['At a real place', 'a place with this name in the country the text names'],
  'confident-by-region': ['At a real place', 'one place with this name in the region the text names'],
  'probable': ['At a real place', 'the only likely place of that name'],
  'by-tree-context': ['At a real place', 'no country given, but only one candidate is in a country your tree uses'],
  'parent-level': ['Drawn at the town', 'the exact spot (a church, a street) was not found, so the town in the text is used'],
  'by-neighbours': ['At a real place', 'several candidates, but only one has other people of your tree placed around it (within 50 km)'],
  'district': ['Drawn at the district', 'the most specific part of the text is a municipality or county, so people are drawn at its centre'],
  'region': ['Drawn at the region', 'a province or county, not a town'],
  'country-only': ['Drawn at the country', 'only a country was given'],
  'review-skipped-part': ['Review: only a later part matched', 'the first part of the text was not found, a later part was'],
  'review-other-country': ['Review: found in another country', 'the name exists, but not in the country the text names'],
  'ambiguous': ['Review: could be several places', 'more than one candidate and nothing to choose between them'],
  'not-found': ['Review: not found', 'no place of that name in the gazetteer'],
  'user': ['Chosen by you', 'you picked a candidate'],
};
const ORDER = ['confident', 'confident-by-region', 'probable', 'by-tree-context', 'by-neighbours', 'user', 'parent-level', 'district', 'region', 'country-only', 'review-skipped-part', 'review-other-country', 'ambiguous', 'not-found'];

function kv(dl, k, v) { dl.append(el('dt', null, k), el('dd', null, v)); }

export function reportInto(m, p, opt = {}) {
  const r = m.report, H = opt.h || 'h2'; p.textContent = '';
  if (m.kind === 'tree') return treeJsonReport(m, p, H);
  p.append(el(H, null, 'The file'));
  let d = el('dl', 'kv'); const f = r.file;
  kv(d, 'Format', 'GEDCOM ' + (f.version || '(version not stated)') + ', ' + f.eol + ' line endings' + (f.bom ? ', with a byte-order mark' : ''));
  kv(d, 'Text encoding', f.used + (f.declared ? ' (the file says ' + f.declared + ')' : ''));
  if (f.relinedLines) kv(d, 'Repaired', f.relinedLines + ' lines held bytes that are not valid UTF-8; they were re-read as Windows-1252 and ' + f.invalidBytes + ' characters could not be recovered. Nothing was dropped.');
  kv(d, 'Lines / records', n0(f.lines) + ' lines, ' + n0(f.records) + ' records');
  kv(d, 'Continuation lines', n0(f.conc) + ' CONC, ' + n0(f.cont) + ' CONT (joined when read)');
  if (f.junkLines) kv(d, 'Not GEDCOM lines', n0(f.junkLines) + ' lines (blank lines, or text broken across lines inside a note). Kept as they are; not used.');
  p.append(d);

  p.append(el(H, null, 'The people'));
  d = el('dl', 'kv'); const q = r.people;
  kv(d, 'In the file', n0(q.individuals));
  kv(d, 'Drawn', n0(q.drawn));
  kv(d, 'Possibly living', n0(q.living) + ' (no death recorded and born within 110 years, or no birth year). ' + (q.livingRedacted ? n0(q.livingRedacted) + ' are drawn without a name; their birth year is rounded to the decade.' : q.livingShown ? n0(q.livingShown) + ' are shown as the file gives them: this stays on your device.' : ''));
  kv(d, 'Not drawn: no year', n0(q.undatedNotDrawn) + ' people with no birth year and no relative to estimate from');
  kv(d, 'Not drawn: no place', n0(q.noPlaceNotDrawn) + ' people whose birth place did not resolve and who have no relative with a resolved place');
  kv(d, 'Borrowed a place', n0(q.placeBorrowedFromRelative) + ' people whose own birth place did not resolve are drawn at a parent’s, child’s or spouse’s; they are marked');
  kv(d, 'Estimated years', n0(q.birthYearEstimated) + ' birth years and ' + n0(q.deathYearEstimated) + ' death years are estimates, shown as “c.” in the views');
  p.append(d);

  const pl = r.places;
  p.append(el(H, null, 'The places'));
  p.append(el('p', null, n0(pl.distinct) + ' different place texts, ' + n0(pl.mentions) + ' mentions, of which ' + n0(pl.placeNameMentions) + ' name a place (the rest name only a region or a country, such as "Cape Colony" or "South Africa"). ' + pct(pl.realOfNamedPct) + ' of the named places are at a real place (' + pct(pl.realPct) + ' of all mentions), and ' + pct(pl.drawablePct) + ' can be drawn at some level. A place is never guessed: what cannot be read is listed under “Places to review”.'));
  const t = el('table', 't'), hd = el('tr'); for (const h of ['How it was placed', 'Texts', 'Mentions', '']) hd.append(el('th', h === 'Texts' || h === 'Mentions' ? 'n' : null, h));
  t.append(hd);
  const maxw = Math.max(...Object.values(pl.mentionsByTier));
  for (const k of ORDER) {
    if (!pl.byTier[k]) continue;
    const row = el('tr'), td = el('td'); td.append(el('span', null, TIER[k][0]), el('br'), el('span', 'small', TIER[k][1]));
    const bar = el('td'), b = el('span', 'bar-in'); b.style.width = Math.max(2, 140 * pl.mentionsByTier[k] / maxw) + 'px'; bar.append(b);
    row.append(td, el('td', 'n', n0(pl.byTier[k])), el('td', 'n', n0(pl.mentionsByTier[k]) + ' (' + pct(pl.mentionsByTier[k] / pl.mentions) + ')'), bar); t.append(row);
  }
  p.append(t);

  p.append(el(H, null, 'How long it took'));
  d = el('dl', 'kv'); const T = m.timings;
  kv(d, 'Read the file', T.parse + ' ms'); kv(d, 'Found people and places', T.model + ' ms');
  kv(d, 'Loaded the Atlas', T.atlasLoad + ' ms'); kv(d, 'Placed ' + n0(pl.distinct) + ' texts (' + pl.countriesLoaded + ' country files)', T.resolve + ' ms');
  kv(d, 'Built the tree', T.tree + ' ms'); kv(d, 'Flags, regimes, events', T.atlas + ' ms');
  p.append(d);
}

/* A tree.json is read by Record Atlas but was made somewhere else: there is no GEDCOM to describe, so say what the reader did and did not do, and nothing it did not. */
function treeJsonReport(m, p, H) {
  const r = m.report || {}, q = r.people || {};
  p.append(el(H, null, 'The file'));
  let d = el('dl', 'kv');
  kv(d, 'Format', 'tree.json (our own format), read in this browser');
  if (m.say && m.say.length) kv(d, 'Left out', m.say.join('; ') + '.');
  p.append(d);
  p.append(el(H, null, 'The people'));
  d = el('dl', 'kv');
  kv(d, 'In the file', n0(q.individuals || 0));
  kv(d, 'Drawn', n0(q.drawn || 0) + ' (the rest have no place the Atlas could use)');
  if (q.living != null) kv(d, 'Possibly living', n0(q.living) + '. A tree.json already shows its living people by family and relationship only, so this does not change when you hide them.');
  p.append(d);
  p.append(el('p', 'small', 'There is no place table or timing for a tree.json: its places arrive already named, and only those the file left unplaced were looked up in the Atlas.'));
}
