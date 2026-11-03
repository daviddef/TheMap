/* The page: drop a file, hand it to the worker, show the tree, the import report and the places to review.
   Everything from the GEDCOM reaches the DOM through textContent, never innerHTML: it is untrusted text. */
import { buildPacket } from './contribute.js';
import { makeSample } from './sample.js';
import { searchLinks, sends } from './lookup.js';
import { checklistText, checklistCsv } from './checklist.js';
import { BUILD } from './build.js';
import { parseLink, profileUrl, treeUrl, toHash, fromHash } from './myheritage.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const n0 = n => (+n).toLocaleString('en');
const pct = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';

let worker = null, last = null, shown = { review: 0 };
const base = new URL('./', location.href).href;

function show(id) { for (const s of ['start', 'busy', 'work']) $('#' + s).hidden = s !== id; }
function fail(msg) { const e = $('#err'); e.textContent = msg; e.hidden = false; show('start'); }

function start(bytes) {
  $('#err').hidden = true; show('busy'); $('#busymsg').textContent = 'Starting…';
  if (worker) worker.terminate();
  worker = new Worker('js/worker.js', { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') $('#busymsg').textContent = m.msg + '…';
    else if (m.type === 'error') fail('Sorry, that file could not be read: ' + m.msg);
    else if (m.type === 'done') done(m);
    else if (m.type === 'exported') exported(m);
    else if (m.type === 'offer') offer(m);
    else if (m.type === 'who') mhWho(m);
    else if (m.type === 'checklist') fixlist(m);
    else if (m.type === 'suggested') suggested(m);
    else if (m.type === 'found') found(m);
    else if (m.type === 'person') person(m.info);
    else if (m.type === 'edit-error') { const e = $('#werr'); e.textContent = m.msg; e.hidden = false; }
  };
  worker.onerror = e => fail('The reader crashed: ' + (e.message || 'unknown error'));
  worker.postMessage({ cmd: 'load', bytes, base }, [bytes]);
}

const hideLiv = () => $('#hideliving').checked;
$('#hideliving').onchange = () => { $('#fliving').checked = !hideLiv(); worker && worker.postMessage({ cmd: 'living', hide: hideLiv() }); };
function done(m) {
  const stale = !m.build || m.build.pipeline !== BUILD || m.build.model !== BUILD; $('#stale').hidden = !stale;
  last = m; window.RR = { tree: m.tree, atlas: m.atlas };
  const keepTab = $('.tabs [aria-selected=true]')?.dataset.tab || 'tree';
  show('work'); chips(m); mountViewer(); report(m); review(m); workbench(m.wb); worker.postMessage({ cmd: 'offer' });
  tab(m.first ? 'tree' : keepTab);
}

function chips(m) {
  const r = m.report, c = $('#chips'); c.textContent = '';
  const add = (b, t) => { const s = el('span', 'chip'); s.append(el('b', null, b), ' ' + t); c.append(s); };
  add(n0(r.people.drawn), 'people drawn of ' + n0(r.people.individuals));
  add(pct(r.places.realOfNamedPct), 'of named places at a real place');
  add(pct(r.places.drawablePct), 'drawable');
  add((m.timings.parse + m.timings.model + m.timings.atlasLoad + m.timings.resolve + m.timings.tree + m.timings.atlas) / 1000 + ' s', 'to read, place and draw');
}

const STAMP = Date.now();                                                    // a fresh copy of the viewer each time the page is opened, never an old cached one
function mountViewer() {
  const old = $('#viewer'), f = document.createElement('iframe');
  let h = ''; try { h = old.contentWindow.location.hash || ''; } catch (e) { /* not loaded yet */ }      // the viewer keeps who is in focus and which view is open in its address
  f.id = 'viewer'; f.title = old.title; f.src = 'viewer.html?v=' + STAMP + h; old.replaceWith(f); f.onload = pushMh;
}
function pushMh() { try { $('#viewer').contentWindow.postMessage({ mh: mhc && mhc.site ? { site: mhc.site, tree: mhc.tree, slug: mhc.treeSlug } : null }, '*'); } catch (e) { /* not loaded yet */ } }

/* ---------- import report ---------- */
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

function report(m) {
  const r = m.report, p = $('#p-report'); p.textContent = '';
  p.append(el('h2', null, 'The file'));
  let d = el('dl', 'kv'); const f = r.file;
  kv(d, 'Format', 'GEDCOM ' + (f.version || '(version not stated)') + ', ' + f.eol + ' line endings' + (f.bom ? ', with a byte-order mark' : ''));
  kv(d, 'Text encoding', f.used + (f.declared ? ' (the file says ' + f.declared + ')' : ''));
  if (f.relinedLines) kv(d, 'Repaired', f.relinedLines + ' lines held bytes that are not valid UTF-8; they were re-read as Windows-1252 and ' + f.invalidBytes + ' characters could not be recovered. Nothing was dropped.');
  kv(d, 'Lines / records', n0(f.lines) + ' lines, ' + n0(f.records) + ' records');
  kv(d, 'Continuation lines', n0(f.conc) + ' CONC, ' + n0(f.cont) + ' CONT (joined when read)');
  if (f.junkLines) kv(d, 'Not GEDCOM lines', n0(f.junkLines) + ' lines (blank lines, or text broken across lines inside a note). Kept as they are; not used.');
  p.append(d);

  p.append(el('h2', null, 'The people'));
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
  p.append(el('h2', null, 'The places'));
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

  p.append(el('h2', null, 'How long it took'));
  d = el('dl', 'kv'); const T = m.timings;
  kv(d, 'Read the file', T.parse + ' ms'); kv(d, 'Found people and places', T.model + ' ms');
  kv(d, 'Loaded the Atlas', T.atlasLoad + ' ms'); kv(d, 'Placed ' + n0(pl.distinct) + ' texts (' + pl.countriesLoaded + ' country files)', T.resolve + ' ms');
  kv(d, 'Built the tree', T.tree + ' ms'); kv(d, 'Flags, regimes, events', T.atlas + ' ms');
  p.append(d);
}

/* ---------- places to review ---------- */
const GROUPS = [
  ['ambiguous', 'Could be several places', 'More than one candidate and nothing in the text to choose between them. Pick one and the people there are drawn at it.'],
  ['review-skipped-part', 'Matched only a later part', 'The first part of the text was not found; a later part (usually the town) was. Check it is the place meant.'],
  ['review-other-country', 'Found in a different country', 'The name exists, but not in the country the text names. Often an old name or a spelling; never accepted without you.'],
  ['not-found', 'Not found', 'No place of that name in the gazetteer. Old names, typos, house names and things that are not places end up here.'],
  ['parent-level', 'Drawn at the town only', 'The exact spot was not found; the town in the text is used.'],
  ['district', 'Drawn at the district only', 'The most specific part of the text is a municipality or county; people are drawn at its centre.'],
  ['region', 'Drawn at the region only', 'A province or county, so people are drawn at its centre and marked as such.'],
  ['country-only', 'Drawn at the country only', 'Only a country was given.'],
  ['user', 'Chosen by you', 'Click “undo” to go back to the reader’s answer.'],
];

function candLabel(c) { return c.n + (c.region ? ', ' + c.region : '') + ', ' + c.k + (c.p ? ' · pop. ' + n0(c.p) : ''); }

function review(m) {
  const items = m.review; $('#rcount').textContent = String(items.filter(i => ['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found'].includes(i.tier)).length);
  $('#rcount').hidden = $('#rcount').textContent === '0';
  drawReview(items, $('#rfilter').value);
}

function drawReview(items, q) {
  const root = $('#rlist'); root.textContent = '';
  const f = (q || '').trim().toLowerCase(), list = f ? items.filter(i => i.raw.toLowerCase().includes(f)) : items;
  $('#rnote').textContent = n0(list.length) + ' of ' + n0(items.length) + ' texts, A to Z';
  for (const [tier, title, help] of GROUPS) {
    const rows = list.filter(i => i.tier === tier); if (!rows.length) continue;
    const det = el('details', 'group'); det.open = ['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found', 'user'].includes(tier) && !!(f || rows.length < 400);
    det.append(el('summary', null, title + ' · ' + n0(rows.length)), el('p', 'help', help));
    const box = el('div'); det.append(box); root.append(det);
    let k = 0; const more = el('button', 'link more');
    const page = () => {
      for (const it of rows.slice(k, k + 150)) box.append(rowEl(it));
      k += 150; more.hidden = k >= rows.length; more.textContent = 'Show ' + Math.min(150, rows.length - k) + ' more';
    };
    more.onclick = page; det.append(more); page();
  }
}

const sugg = new Map();
function suggested(m) {
  const t = sugg.get(m.raw); if (!t) return; sugg.delete(m.raw);
  if (!m.rows.length) { t.sg.textContent = 'No spelling one letter away in that country'; return; }
  t.sg.remove();
  for (const cd of m.rows) { const b = el('button', 'cand'); b.append(cd.n + (cd.region ? ', ' + cd.region : '') + ', ' + cd.k); b.append(el('small', null, (cd.p ? ' · pop. ' + n0(cd.p) : '') + ' · ' + Math.abs(cd.y).toFixed(1) + (cd.y < 0 ? 'S' : 'N') + ' ' + Math.abs(cd.x).toFixed(1) + (cd.x < 0 ? 'W' : 'E'))); b.onclick = () => pick(m.raw, cd); t.c.append(b); }
}
function rowEl(it) {
  const r = el('div', 'row'), raw = el('div', 'raw', it.raw);
  raw.append(el('small', null, it.count + (it.count === 1 ? ' mention' : ' mentions') + (it.iso ? ' · country read as ' + it.iso : '')));
  const c = el('div', 'cands');
  if (it.picked) {
    c.append(el('span', 'picked', '✓ ' + candLabel(it.picked) + '  '));
    const u = el('button', 'link', 'undo'); u.onclick = () => pick(it.raw, null); c.append(u);
  } else if (it.cands.length && (it.tier === 'ambiguous' || it.tier === 'review-skipped-part' || it.tier === 'review-other-country')) {
    for (const cd of it.cands) { const b = el('button', 'cand'); b.append(cd.n + (cd.region ? ', ' + cd.region : '') + ', ' + cd.k); b.append(el('small', null, (cd.p ? ' · pop. ' + n0(cd.p) : '') + ' · ' + Math.abs(cd.y).toFixed(2) + (cd.y < 0 ? '°S ' : '°N ') + Math.abs(cd.x).toFixed(2) + (cd.x < 0 ? '°W' : '°E'))); b.title = 'Draw these people at ' + candLabel(cd); b.onclick = () => pick(it.raw, cd); c.append(b); }
  } else if (it.tier === 'not-found') {
    c.append(el('span', 'small', 'Nothing to offer. '));
    const sg = el('button', 'link', 'Try a nearby spelling'); sg.onclick = () => { sg.disabled = true; sg.textContent = 'Looking…'; sugg.set(it.raw, { c, sg }); worker.postMessage({ cmd: 'suggest', raw: it.raw }); }; c.append(sg);
  }
  r.append(raw, c); return r;
}

function pick(raw, cand) { $('#busymsg').textContent = 'Redrawing…'; worker.postMessage({ cmd: 'pick', raw, cand }); show('busy'); }

/* ---------- offer places back (opt-in, per item; nothing is sent from here) ---------- */
let offered = [], contact = null;
function offer(m) {
  offered = m.items.map(i => ({ ...i, on: false, text: i.raw }));
  $('#oheld').textContent = (m.held.livingOnly ? n0(m.held.livingOnly) + ' place texts are used only by living people' : '') + (m.held.livingName ? (m.held.livingOnly ? ' and ' : '') + n0(m.held.livingName) + ' contain the name of a living person' : '') + (m.held.livingOnly || m.held.livingName ? ', and are not listed.' : '');
  const box = $('#olist'); box.textContent = '';
  if (!offered.length) box.append(el('p', 'small', 'There is nothing to offer: every place was read, or only living people use the ones that were not.'));
  offered.forEach(it => {
    const row = el('div', 'orow'), cb = el('input'), t = el('input'), d = el('div');
    cb.type = 'checkbox'; cb.setAttribute('aria-label', 'Offer ' + it.raw); t.type = 'text'; t.value = it.text; t.setAttribute('aria-label', 'Place text to offer');
    cb.onchange = () => { it.on = cb.checked; compose(); }; t.oninput = () => { it.text = t.value; compose(); };
    d.append(t, el('small', null, it.kind === 'picked' ? 'You chose ' + it.pick.n + (it.pick.region ? ', ' + it.pick.region : '') + ', ' + it.pick.k : (it.iso ? 'country read as ' + it.iso + ' · ' : '') + 'not read' + (it.address ? ' · has a number in it' : '') + (it.named ? ' · has a person\'s name in it' : '') + (it.address || it.named ? ', so it is left out unless you trim it and tick it' : '')));
    row.append(cb, d); box.append(row); it.cb = cb;
  });
  compose();
}
$('#onone').onclick = () => { offered.forEach(i => { i.on = false; i.cb.checked = false; }); compose(); };
$('#oall').onclick = () => { offered.forEach(i => { i.on = !i.address && !i.named; i.cb.checked = i.on; }); compose(); };
function compose() {
  const on = offered.filter(i => i.on && i.text.trim()), msg = on.length ? buildPacket(on.map(i => ({ ...i, text: i.text.trim() })), new Date().toISOString().slice(0, 10)) : '';
  $('#ocount').textContent = on.length + ' ticked'; $('#opreview').value = msg || 'Tick the places you want to offer and the message appears here.';
  const mail = $('#omail'), ok = !!msg && !!(contact && contact.email) && msg.length <= 1800;
  mail.setAttribute('aria-disabled', String(!ok));
  mail.href = ok ? 'mailto:' + contact.email + '?subject=' + encodeURIComponent('Record Atlas: places from Roots & Routes') + '&body=' + encodeURIComponent(msg) : '#';
  const f = $('#ofile'); if (f.href.startsWith('blob:')) URL.revokeObjectURL(f.href); f.href = msg ? URL.createObjectURL(new Blob([msg], { type: 'text/plain;charset=utf-8' })) : '#';
  $('#osaid').textContent = msg && msg.length > 1800 ? 'Too long for an email link: copy it or download it.' : (msg && !(contact && contact.email) ? 'No address known here: copy it or download it.' : '');
}
$('#ocopy').onclick = async () => { const v = $('#opreview').value; try { await navigator.clipboard.writeText(v); $('#osaid').textContent = 'Copied.'; } catch (e) { $('#opreview').select(); $('#osaid').textContent = 'Select and copy the message above.'; } };
document.querySelector('[data-tab=offer]').addEventListener('click', async () => { if (contact) return; try { contact = await (await fetch('data/contact.json')).json(); } catch (e) { contact = { email: null }; } compose(); });

/* ---------- workbench ---------- */
let who = null;
const send = edit => { $('#werr').hidden = true; worker.postMessage({ cmd: 'edit', edit }); };
function workbench(w) {
  if (!w) return;
  $('#wcount').textContent = String(w.edits.length || ''); $('#wcount').hidden = !w.edits.length;
  $('#wundn').textContent = n0(w.undrawnTotal); $('#wmgn').textContent = n0(w.merges.length); $('#wedn').textContent = n0(w.edits.length);
  const u = $('#wundrawn'); u.textContent = '';
  for (const r of w.undrawn) {
    const row = el('div', 'wrow'), t = el('div', null, r.name); t.append(el('small', null, r.id + (r.place ? ' · ' + r.place : '')));
    const b = el('button', 'link', 'Add a year'); b.onclick = () => { who = r.id; worker.postMessage({ cmd: 'person', id: r.id }); };
    row.append(t, b); u.append(row);
  }
  if (w.undrawnTotal > w.undrawn.length) u.append(el('p', 'small', 'and ' + n0(w.undrawnTotal - w.undrawn.length) + ' more'));
  const m = $('#wmerge'); m.textContent = '';
  for (const r of w.merges) {
    const row = el('div', 'wrow'), t = el('div', null, r.an + ' and ' + r.bn);
    t.append(el('small', null, (r.ay === r.by ? 'both born ' + r.ay : 'born ' + r.ay + ' and ' + r.by) + (r.ap && r.ap === r.bp ? ' · both in ' + r.ap : (r.ap || r.bp) ? ' · ' + (r.ap || '—') + ' / ' + (r.bp || '—') : '') + ' · ' + r.a + ' and ' + r.b));
    const y = el('button', 'link', 'Maybe the same'), n = el('button', 'link', 'Not the same');
    y.onclick = () => send({ op: 'merge', who: r.a, other: r.b }); n.onclick = () => send({ op: 'notsame', who: r.a, other: r.b });
    const bx = el('div'); bx.append(y, ' · ', n); row.append(t, bx); m.append(row);
  }
  const e = $('#wedits'); e.textContent = '';
  if (!w.edits.length) e.append(el('p', 'small', 'None yet.'));
  for (const x of w.edits) {
    const row = el('div', 'wrow'), t = el('div', null, x.name + ' · ' + ({ date: x.field + ' ' + x.value, note: 'note: ' + (x.text || '').slice(0, 60), source: 'source: ' + x.title, merge: 'maybe the same as ' + x.other }[x.op] || x.op));
    const b = el('button', 'link', 'Undo'); b.onclick = () => send({ op: 'undo', n: x.n }); row.append(t, b); e.append(row);
  }
  if (who) worker.postMessage({ cmd: 'person', id: who });
}
function found(m) {
  const box = $('#wres'); box.textContent = '';
  for (const r of m.rows) { const row = el('div', 'wrow'), t = el('div', null, r.name); t.append(el('small', null, r.id + (r.living ? ' · living' : '') + (r.by ? ' · born ' + (r.est ? 'about ' : '') + r.by : ' · no year') + (r.bp ? ' · ' + r.bp : ''))); const b = el('button', 'link', 'Edit'); b.onclick = () => { who = r.id; worker.postMessage({ cmd: 'person', id: r.id }); }; row.append(t, b); box.append(row); }
}
function person(i) {
  if (!i) return; lastInfo = i;
  $('#wedit').hidden = false; $('#wname').textContent = i.name + ' · ' + i.id;
  $('#winfo').textContent = 'In your file: born ' + (i.birth || 'no date') + ', died ' + (i.death || 'no date') + (i.living ? '. Treated as living (no death recorded, born within 110 years)' + (hideLiv() ? ', so hidden while "Hide living people" is on, and left out of a shareable file.' : '. Left out of a shareable export.') : '.');
  const wm = $('#wmh'); wm.textContent = ''; const ml = mhA(i.id, i.name); if (ml.length) wm.append('Open in MyHeritage:', ...ml);
  const l = i.look, ul = $('#wlinks'); ul.textContent = '';
  const ls = searchLinks(l); $('#wlook').hidden = !ls.length;
  $('#wsends').textContent = ls.length ? 'Nothing is sent until you click a link. A click opens that site in a new tab and gives it: ' + sends(l) + (l.bp || l.dp ? ', and the places in your file' : '') + '.'
    + (l.living ? ' This person is treated as living: clicking sends their name to that site.' : '') : '';
  for (const x of ls) { const li = el('li'), a = el('a', null, x.site); a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a, el('small', null, ' · ' + x.note)); ul.append(li); }
  const f = $('#wdate'); f.birth.placeholder = i.birth || 'e.g. ABT 1850'; f.death.placeholder = i.death || 'e.g. 12 MAR 1910';
}
let fto = 0;
$('#wfind').oninput = e => { clearTimeout(fto); fto = setTimeout(() => worker && worker.postMessage({ cmd: 'find', q: e.target.value }), 200); };
$('#wdate').onsubmit = e => { e.preventDefault(); const f = e.target; for (const k of ['birth', 'death']) if (f[k].value.trim()) send({ op: 'date', who, field: k, value: f[k].value }); f.reset(); };
$('#wnote').onsubmit = e => { e.preventDefault(); send({ op: 'note', who, text: e.target.text.value }); e.target.reset(); };
$('#wsrc').onsubmit = e => { e.preventDefault(); const f = e.target; send({ op: 'source', who, title: f.title.value, url: f.url.value, page: f.page.value }); f.reset(); };
document.addEventListener('click', e => { const g = e.target.closest && e.target.closest('[data-goto]'); if (g) tab(g.dataset.goto); });

/* ---------- export ---------- */
let xurls = [];
$('#xgo').onclick = () => {
  if (!worker) return; $('#xbusy').hidden = false; $('#xgo').disabled = true; $('#xout').hidden = true;
  worker.postMessage({ cmd: 'export', mode: document.querySelector('input[name=xm]:checked').value });
};
function exported(m) {
  for (const u of xurls) URL.revokeObjectURL(u); xurls = [];
  const f = URL.createObjectURL(new Blob([m.text], { type: 'text/plain;charset=utf-8' })), l = URL.createObjectURL(new Blob([m.logText], { type: 'text/plain;charset=utf-8' }));
  xurls.push(f, l);
  const a = $('#xfile'), b = $('#xlog'); a.href = f; a.download = 'tree-' + m.mode + '.ged'; b.href = l; b.download = 'tree-' + m.mode + '-change-log.txt';
  const s = m.stats, bits = [];
  if (s.coords) bits.push(n0(s.coords) + ' places given coordinates'); if (s.applied) bits.push(n0(s.applied) + ' place texts replaced');
  if (s.redacted) bits.push(n0(s.redacted) + ' living people reduced to a bare record');
  if (s.textRedacted) bits.push(n0(s.textRedacted) + ' lines with a living name changed'); if (s.recoded) bits.push(n0(s.recoded) + ' lines re-read from Windows-1252 to UTF-8');
  $('#xsum').textContent = m.changed ? 'Made: ' + n0(m.from) + ' lines became ' + n0(m.lines) + '. ' + bits.join('; ') + '.' : 'No changes: the file is the same as the one you gave us.';
  $('#xout').hidden = false; $('#xbusy').hidden = true; $('#xgo').disabled = false;
}

/* ---------- tabs and the file ---------- */
function tab(name) {
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('.panel')) p.hidden = p.id !== 'p-' + name;
  if (name === 'fix' && worker) worker.postMessage({ cmd: 'checklist', living: $('#fliving').checked });
}
$$('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
$('#rfilter').oninput = e => last && drawReview(last.review, e.target.value);
$('#again').onclick = () => { if (worker) worker.terminate(); worker = null; last = null; window.RR = null; show('start'); };

async function take(file) {
  if (!file) return;
  if (file.size > 400e6) return fail('That file is over 400 MB, which is more than this page can hold in memory.');
  start(await file.arrayBuffer());
}
const drop = $('#drop');
drop.onclick = e => { if (e.target.closest('label')) return; $('#file').click(); };
drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file').click(); } };
$('#file').onchange = e => take(e.target.files[0]);
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); });
drop.addEventListener('drop', e => take(e.dataTransfer.files[0]));
document.addEventListener('dragover', e => e.preventDefault()); document.addEventListener('drop', e => e.preventDefault());
$('#sample').onclick = () => start(new TextEncoder().encode(makeSample()).buffer);


/* ---------- fix list ---------- */
let fix = null; const ticked = new Set(), shownN = new Map();
const copy = async (text, btn) => {
  const was = btn.textContent;
  try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* the text is on screen to select by hand */ } t.remove(); }
  btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = was; }, 1200);
};
/* ---------- links back to MyHeritage ---------- */
let mhc = fromHash(location.hash);
const mhA = (id, name) => {
  const p = profileUrl(mhc, id, name), t = treeUrl(mhc, id); if (!p) return [];
  const out = []; for (const [u, lab] of [[p, 'MyHeritage'], [t, 'in tree']]) { const a = el('a', null, lab + ' ↗'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; out.push(' ', a); } return out;
};
const peopleEl = l => { const s = el('span'); l.slice(0, 8).forEach((p, k) => { if (k) s.append('; '); s.append(p.name + ' (' + p.id + ', ' + p.ev + (p.date ? ' ' + p.date : '') + ')', ...mhA(p.id, p.name)); }); return s; };
let lastInfo = null;
function mhStatus(extra) { $('#mhstat').textContent = mhc ? 'Linked: tree ' + mhc.tree + '.' + (extra || '') + ' Open one or two people to check they are the right ones.' : ''; }
function mhWho(m) { mhStatus(m.name ? ' That link is person ' + m.id + ' in your file: ' + m.name + '. If that is not who you pasted, the numbering differs and these links are wrong.' : ' No person ' + m.id + ' in this file, so check the link.'); }
$('#mhin').oninput = e => {
  const c = parseLink(e.target.value);
  if (!c) { mhc = null; $('#mhstat').textContent = e.target.value.trim() ? 'That does not look like a MyHeritage profile or tree link.' : ''; refreshMh(); return; }
  mhc = c; history.replaceState(null, '', toHash(c)); mhStatus(); refreshMh(); if (worker && c.num) worker.postMessage({ cmd: 'who', id: 'I' + c.num });
};
function refreshMh() { pushMh(); drawFix(); if (lastInfo) person(lastInfo); }
if (mhc) { $('#mhbox').open = true; mhStatus(' (from the address)'); }

function fixRow(s, i) {
  const row = el('div', 'frow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ticked.has(i.key); cb.setAttribute('aria-label', 'Done');
  cb.onchange = () => { cb.checked ? ticked.add(i.key) : ticked.delete(i.key); fixCount(s); };
  const body = el('div'), line = el('div'), small = el('small');
  const cp = (txt, label) => { const b = el('button', 'link', label); b.onclick = () => copy(txt, b); return b; };
  if (s.key === 'places' || s.key === 'check') {
    line.append(el('span', 'was', i.raw), ' → ', el('b', null, i.to), ' ', cp(i.to, 'Copy new text'), ' ', cp(i.raw, 'Copy current'));
    small.append(i.count + ' event' + (i.count === 1 ? '' : 's') + ': ', peopleEl(i.people), (i.count > 8 ? '; and ' + (i.count - 8) + ' more (all in the spreadsheet)' : '') + (s.key === 'check' ? ' · suggestion only: ' + i.why : ''));
  } else if (s.key === 'decide') {
    line.append(el('span', 'was', i.raw));
    for (const c of i.cands) { line.append(' '); line.append(cp(c, 'Copy: ' + c)); }
    small.append((i.cands.length ? '' : 'no candidate found · ') + i.count + ' event' + (i.count === 1 ? '' : 's') + ': ', peopleEl(i.people));
  } else if (s.key === 'years') {
    line.append(el('b', null, i.name), ' (' + i.id + ') ', cp(i.name, 'Copy name'), ...mhA(i.id, i.name)); small.textContent = i.note + (i.place ? ' · born at ' + i.place : '');
  } else if (s.key === 'names') {
    line.append(el('b', null, i.name || '(no name)'), ' (' + i.id + ')', ...mhA(i.id, i.name)); small.textContent = i.note + (i.kin ? ' · ' + i.kin : '') + (i.born ? ' · born ' + i.born : '') + (i.place ? ' at ' + i.place : '');
  } else if (s.key === 'dates') {
    line.append(el('b', null, i.name), ' (' + i.id + ') ', cp(i.name, 'Copy name'), ...mhA(i.id, i.name)); small.textContent = i.note + (i.with ? ' · with ' + i.with : '');
  } else if (s.key === 'dupes') {
    line.append(el('b', null, i.an), ' (' + i.a + ')', ...mhA(i.a, i.an), ' and ', el('b', null, i.bn), ' (' + i.b + ')', ...mhA(i.b, i.bn), ' ', cp(i.an, 'Copy name')); small.textContent = i.note + (i.ap || i.bp ? ' · ' + (i.ap || '—') + ' / ' + (i.bp || '—') : '');
  } else {
    line.append(el('b', null, i.size + (i.size === 1 ? ' person' : ' people')));
    i.people.forEach((p, k) => { if (k) small.append('; '); small.append(p.name + ' (' + p.id + (p.by ? ', b. ' + p.by : '') + ')', ...mhA(p.id, p.name)); });
    if (i.size > i.people.length) small.append('; and ' + (i.size - i.people.length) + ' more');
  }
  body.append(line, small); row.append(cb, body); return row;
}
function fixCount(s) { const n = $('#fc-' + s.key); if (n) n.textContent = s.items.filter(i => ticked.has(i.key)).length + ' of ' + s.items.length + ' done'; }
const hay = (s, i) => (s.key === 'names' ? i.name + ' ' + i.kin : s.key === 'dupes' ? i.an + ' ' + i.bn : s.key === 'apart' ? i.people.map(p => p.name).join(' ') : (i.raw || '') + ' ' + (i.name || '') + ' ' + (i.people ? i.people.map(p => p.name).join(' ') : '')).toLowerCase();
function drawFix() {
  if (!fix) return; const q = $('#ffilter').value.trim().toLowerCase(), box = $('#fsecs'); box.textContent = '';
  for (const s of fix.sections) {
    const d = el('details'); d.id = 'fs-' + s.key; if (s.items.length) d.open = s.key === 'places' || d.dataset.open === '1';
    const sum = el('summary'), c = el('span', 'small'); c.id = 'fc-' + s.key; sum.append(el('b', null, s.title + ' '), el('span', 'count', n0(s.items.length)), ' ', c); d.append(sum);
    d.append(el('p', 'small', s.how));
    const hits = q ? s.items.filter(i => hay(s, i).includes(q)) : s.items, cap = shownN.get(s.key) || 100;
    if (!s.items.length) d.append(el('p', 'small', 'Nothing to do here.'));
    for (const i of hits.slice(0, cap)) d.append(fixRow(s, i));
    if (hits.length > cap) { const b = el('button', 'link', 'Show ' + Math.min(100, hits.length - cap) + ' more of ' + n0(hits.length - cap)); b.onclick = () => { shownN.set(s.key, cap + 100); d.dataset.open = '1'; drawFix(); }; d.append(b); }
    d.ontoggle = () => { d.dataset.open = d.open ? '1' : ''; };
    box.append(d); fixCount(s);
  }
}
function fixlist(m) { fix = m; drawFix(); }
$('#ffilter').oninput = () => drawFix();
$('#fliving').onchange = () => worker && worker.postMessage({ cmd: 'checklist', living: $('#fliving').checked });
function saveAs(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type })), a = el('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
$('#ftext').onclick = () => fix && saveAs('fix-list.txt', checklistText(fix, new Date().toISOString().slice(0, 10)), 'text/plain;charset=utf-8');
$('#fcsv').onclick = () => fix && saveAs('fix-list.csv', '\ufeff' + checklistCsv(fix), 'text/csv;charset=utf-8');
