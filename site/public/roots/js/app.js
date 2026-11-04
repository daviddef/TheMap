/* The page: drop a file, hand it to the worker, show the tree, the import report and the places to review.
   Everything from the GEDCOM reaches the DOM through textContent, never innerHTML: it is untrusted text. */
import { buildPacket } from './contribute.js';
import { makeSample } from './sample.js';
import { searchLinks, sends } from './lookup.js';
import { checklistText, checklistCsv } from './checklist.js';
import * as recent from './recent.js';
import { BUILD } from './build.js';
import { parseLink, profileUrl, treeUrl, toHash, fromHash } from './myheritage.js';
import { loadLink, saveLink } from './remember.js';
import { GROUPS as FIXGROUPS, describe } from './checklist.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const n0 = n => (+n).toLocaleString('en');
const pct = x => (x * 100).toFixed(1).replace(/\.0$/, '') + '%';

let curBytes = null, curName = null;   // a private copy, only so the visitor can choose to keep the file on this device
let worker = null, last = null, shown = { review: 0 };
const base = new URL('./', location.href).href;

function show(id) { for (const s of ['start', 'busy', 'work']) $('#' + s).hidden = s !== id; document.body.classList.toggle('loaded', id === 'work'); }
function fail(msg) { const e = $('#err'); e.textContent = msg; e.hidden = false; show('start'); }

function start(bytes, name) {
  curBytes = bytes.slice(0); curName = name || null; $('#keep').hidden = !curName; $('#keep').textContent = 'Keep on this device';
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

/* The Atlas map in the viewer can send us a place text: "Fix this text" opens Places to review filtered to it, "Copy" copies it. Only messages from our own viewer are heard. */
window.addEventListener('message', e => {
  const v = $('#viewer'); if (!v || e.source !== v.contentWindow || !e.data) return;
  if (typeof e.data.fixplace === 'string') { $('#rfilter').value = e.data.fixplace; tab('review'); drawReview(reviewItems, e.data.fixplace); $('#rfilter').scrollIntoView({ block: 'nearest' }); }
  else if (typeof e.data.copytxt === 'string') { try { navigator.clipboard.writeText(e.data.copytxt); } catch (x) { /* clipboard refused */ } }
});

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

let reviewItems = [];
function review(m) {
  const items = reviewItems = m.review; $('#rcount').textContent = String(items.filter(i => ['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found'].includes(i.tier)).length);
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
let flashT = 0;
const FLASH = { date: 'Dates saved', note: 'Note added', source: 'Source added', merge: 'Marked as maybe the same', notsame: 'Marked as not the same: it will not be suggested again', undo: 'Undone' };
function flash(op) {   // a visible answer to a click: the list a button sits in often scrolls past the place its result lands
  const f = $('#wflash'); if (!f || !FLASH[op]) return;
  f.textContent = FLASH[op] + (op === 'merge' || op === 'date' || op === 'note' || op === 'source' ? '. It is listed under "Your edits", where you can undo it.' : '.'); f.hidden = false;
  clearTimeout(flashT); flashT = setTimeout(() => { f.hidden = true; }, 6000);
}
let focusEdit = false;
const send = edit => { $('#werr').hidden = true; worker.postMessage({ cmd: 'edit', edit }); flash(edit.op); };
let undrawnAll = [], undrawnTotal = 0, undrawnShown = 30;
function drawUndrawn(u) {
  u.textContent = '';
  for (const r of undrawnAll.slice(0, undrawnShown)) {
    const row = el('div', 'wrow'), t = el('div', 'wwho', r.name); t.append(el('small', null, r.id + (r.place ? ' · ' + r.place : '')));
    const b = el('button', 'link', 'Add a year'); b.onclick = () => { who = r.id; focusEdit = true; worker.postMessage({ cmd: 'person', id: r.id }); };
    row.append(t, b); u.append(row);
  }
  const more = undrawnTotal - Math.min(undrawnShown, undrawnAll.length);
  if (undrawnAll.length > undrawnShown) { const b = el('button', 'link wmore', 'Show ' + Math.min(60, undrawnAll.length - undrawnShown) + ' more'); b.onclick = () => { undrawnShown += 60; drawUndrawn(u); }; u.append(b); }
  else if (undrawnTotal > undrawnAll.length) u.append(el('p', 'small wmore', 'and ' + n0(undrawnTotal - undrawnAll.length) + ' more'));
}
function workbench(w) {
  if (!w) return;
  $('#wcount').textContent = String(w.edits.length || ''); $('#wcount').hidden = !w.edits.length;
  $('#wundn').textContent = n0(w.undrawnTotal); $('#wmgn').textContent = n0(w.merges.length); $('#wedn').textContent = n0(w.edits.length);
  undrawnAll = w.undrawn; undrawnTotal = w.undrawnTotal; drawUndrawn($('#wundrawn'));
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
  const box = $('#wres'); box.textContent = ''; if (!m.rows.length && !(m.q && m.q.trim())) return;
  if (!m.rows.length && m.q && m.q.trim()) box.append(el('p', 'small', 'No one in this file matches “' + m.q.trim() + '”. Try just the surname, or a record number such as I123.'));
  for (const r of m.rows) { const row = el('div', 'wrow'), t = el('div', null, r.name); t.append(el('small', null, r.id + (r.living ? ' · living' : '') + (r.by ? ' · born ' + (r.est ? 'about ' : '') + r.by : ' · no year') + (r.bp ? ' · ' + r.bp : ''))); const b = el('button', 'link', 'Edit'); b.onclick = () => { who = r.id; focusEdit = true; worker.postMessage({ cmd: 'person', id: r.id }); }; row.append(t, b); box.append(row); }
}
function person(i) {
  if (!i) return; lastInfo = i;
  $('#wedit').hidden = false; if (focusEdit) { focusEdit = false; $('#wedit').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } const wn = $('#wname'); wn.textContent = ''; wn.append(...nameNodes(i.name, i.nl), ' · ' + i.id);
  const wh = $('#whelp'); wh.textContent = ''; if (i.help && i.help.length) { wh.append(el('h4', null, 'What the file and the Atlas hold'), infoList(i.help)); }
  $('#winfo').textContent = 'In your file: born ' + (i.birth || 'no date') + ', died ' + (i.death || 'no date') + (i.living ? '. Treated as living (no death recorded, born within 110 years)' + (hideLiv() ? ', so hidden while "Hide living people" is on, and left out of a shareable file.' : '. Left out of a shareable export.') : '.');
  const wm = $('#wmh'); wm.textContent = ''; const ml = mhA(i.id, i.name); if (ml.length) wm.append(...ml);
  const l = i.look, ul = $('#wlinks'); ul.textContent = '';
  const ls = searchLinks(l); $('#wlook').hidden = !ls.length;
  $('#wsends').textContent = ls.length ? 'Nothing is sent until you click a link. A click opens that site in a new tab and gives it: ' + sends(l) + (l.bp || l.dp ? ', and the places in your file' : '') + '.'
    + (l.living ? ' This person is treated as living: clicking sends their name to that site.' : '') : '';
  for (const x of ls) { const li = el('li'), a = el('a', null, x.site); a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a, el('small', null, ' · ' + x.note)); ul.append(li); }
  const f = $('#wdate'); f.birth.placeholder = i.birth || 'e.g. ABT 1850'; f.death.placeholder = i.death || 'e.g. 12 MAR 1910';
}
$('#wclose').onclick = () => { who = null; lastInfo = null; $('#wedit').hidden = true; $('#wres').textContent = ''; $('#wfind').value = ''; $('#wfind').focus(); };
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
  document.body.classList.toggle('wide', name === 'tree');   // the tree uses the whole window; the lists keep a readable width
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('.panel')) p.hidden = p.id !== 'p-' + name;
  if (name === 'fix' && worker) worker.postMessage({ cmd: 'checklist', living: $('#fliving').checked });
}
$$('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
$('#rfilter').oninput = e => last && drawReview(last.review, e.target.value);
$('#again').onclick = () => { document.body.classList.remove('wide'); if (worker) worker.terminate(); worker = null; last = null; curBytes = null; window.RR = null; show('start'); refreshRecent(); };

async function take(file) {
  if (!file) return;
  if (file.size > 400e6) return fail('That file is over 400 MB, which is more than this page can hold in memory.');
  start(await file.arrayBuffer(), file.name);
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
let fix = null; const ticked = new Set(), shownN = new Map(), asIs = new Set();   // asIs: rows the visitor knows are right, kept in memory only
const svg = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
const IC = {
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  check: svg('M5 12.5l4.5 4.5L19 7.5'),
  person: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/></svg>',
  tree: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9.5" y="3" width="5" height="4" rx="1"/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="16" y="17" width="5" height="4" rx="1"/><path d="M12 7v5M5.5 17v-5h13v5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  open: svg('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'),
};
/* an icon-only button or link: always has a title and an aria-label, so a screen reader and a hover both say what it does */
const ib = (icon, title, onclick) => { const b = el('button', 'ib'); b.type = 'button'; b.innerHTML = IC[icon]; b.title = title; b.setAttribute('aria-label', title); b.onclick = onclick; return b; };
const ia = (icon, title, url) => { const x = el('a', 'ib'); x.innerHTML = IC[icon]; x.title = title; x.setAttribute('aria-label', title); x.href = url; x.target = '_blank'; x.rel = 'noopener noreferrer'; return x; };
const copy = async (text, btn) => {
  try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* the text is on screen to select by hand */ } t.remove(); }
  const was = btn.innerHTML, wt = btn.title; if (btn.classList.contains('ib')) { btn.innerHTML = IC.check; btn.title = 'Copied'; } else btn.textContent = 'Copied';
  btn.classList.add('ok'); setTimeout(() => { btn.innerHTML = was; btn.title = wt; btn.classList.remove('ok'); }, 1200);
};
/* ---------- links back to MyHeritage ---------- */
let mhc = fromHash(location.hash), mhRemembered = false;
{ const kept = loadLink(), c = kept && parseLink(kept);                       // the last link pasted on this device, unless the address already carries one
  if (c) { $('#mhin').value = kept; if (!mhc) { mhc = c; mhRemembered = true; history.replaceState(null, '', toHash(c)); } } }
const mhA = (id, name) => {
  const p = profileUrl(mhc, id, name), tu = treeUrl(mhc, id); if (!p) return [];
  return [' ', ia('person', 'Open this profile on MyHeritage', p), ' ', ia('tree', 'Open this person in the tree on MyHeritage', tu)];
};
/* a link to another page (an Atlas page of this site, or a collection's own site): new tab, no referrer */
const lk = (t, u) => { const a = el('a', null, t); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
/* a name whose first name and surname are links to the Atlas's name pages */
function nameNodes(name, nl) {
  if (!nl) return [name]; const out = []; let rest = name || '';
  if (nl.given && rest.startsWith(nl.given.t)) { out.push(lk(nl.given.t, nl.given.u)); rest = rest.slice(nl.given.t.length); }
  if (nl.sur && rest.endsWith(nl.sur.t)) { out.push(rest.slice(0, rest.length - nl.sur.t.length), lk(nl.sur.t, nl.sur.u)); } else out.push(rest);
  return out;
}
/* what the Atlas holds, as a list: a label, the text, its links. A line that says the Atlas has nothing is marked so it reads as a statement, not a gap. */
function infoList(lines) {
  const ul = el('ul', 'atl');
  for (const x of lines) {
    const li = el('li', x.none ? 'none' : null); li.append(el('b', null, x.k + ' '), x.t);
    if (x.l && x.l.length) { li.append(' '); x.l.forEach((y, n) => { if (n) li.append(' · '); li.append(lk(y.t, y.u)); }); }
    ul.append(li);
  }
  return ul;
}
/* one person (or one event) as a tidy line: name, record number, what the event was, then the icons */
const MAXP = 3;
function pline(p, o = {}) {
  const li = el('li', 'fp');
  const pn = el('b', 'pn'); if (p.nl && p.name) pn.append(...nameNodes(p.name, p.nl)); else pn.textContent = p.name || '(no name)';
  li.append(pn, el('span', 'pid', p.id));
  const ev = p.ev ? p.ev + (p.date ? ' ' + p.date : '') : (p.by ? 'b. ' + p.by : ''); if (ev) li.append(el('span', 'chip', ev));
  const acts = el('span', 'acts');
  if (o.copyName !== false && p.name) acts.append(ib('copy', 'Copy name', function () { copy(p.name, this); }));
  const pu = profileUrl(mhc, p.id, p.name), tu = treeUrl(mhc, p.id);
  if (pu) acts.append(ia('person', 'Open this profile on MyHeritage', pu), ia('tree', 'Open this person in the tree on MyHeritage', tu));
  li.append(acts); return li;
}
/* a nested list of people, the first few shown and the rest behind one button */
function plist(list, total) {
  const ul = el('ul', 'fpl'); list.slice(0, MAXP).forEach(p => ul.append(pline(p)));
  if (list.length > MAXP) {
    const more = list.slice(MAXP), rest = el('ul', 'fpl'); rest.hidden = true; more.forEach(p => rest.append(pline(p)));
    const b = el('button', 'link more', 'Show ' + more.length + ' more'); b.onclick = () => { rest.hidden = !rest.hidden; b.textContent = rest.hidden ? 'Show ' + more.length + ' more' : 'Show fewer'; };
    const w = el('div'); w.append(ul, rest, b); if (total > list.length) w.append(el('small', 'muted', ' and ' + (total - list.length) + ' more, all in the spreadsheet')); return w;
  }
  if (total > list.length) { const w = el('div'); w.append(ul, el('small', 'muted', 'and ' + (total - list.length) + ' more, all in the spreadsheet')); return w; }
  return ul;
}
let lastInfo = null;
function mhStatus(extra) { $('#mhsum').textContent = mhc ? 'on · tree ' + mhc.tree : 'off'; $('#mhsum').classList.toggle('on', !!mhc); $('#mhstat').textContent = mhc ? (extra || (mhRemembered ? 'Remembered from last time, on this device only. Clear the box to forget it.' : 'Open one or two people to check they are the right ones. The link is remembered on this device only (not sent anywhere); clear the box to forget it.')) : ''; }
function mhWho(m) { mhStatus(m.name ? 'That link is ' + m.id + ' in your file: ' + m.name + '. If that is not who you pasted, the numbering differs and these links are wrong.' : 'No person ' + m.id + ' in this file, so check the link.'); }
$('#mhin').onchange = e => {                                   // leaving the box with text that is not a link: put back the last good link rather than keep the stray text
  if (e.target.value.trim() && !parseLink(e.target.value)) { e.target.value = loadLink(); mhStatus(e.target.value ? 'That text was not a MyHeritage link, so the last good link is back in the box.' : ''); if (!mhc) $('#mhstat').textContent = 'That text was not a MyHeritage link.'; }
};
$('#mhin').oninput = e => {
  const c = parseLink(e.target.value); mhRemembered = false;
  if (!c) { mhc = null; if (!e.target.value.trim()) saveLink(''); $('#mhstat').textContent = e.target.value.trim() ? 'That does not look like a MyHeritage profile or tree link.' : ''; refreshMh(); return; }
  saveLink(e.target.value.trim());
  mhc = c; history.replaceState(null, '', toHash(c)); mhStatus(); refreshMh(); if (worker && c.num) worker.postMessage({ cmd: 'who', id: 'I' + c.num });
};
function refreshMh() { pushMh(); drawFix(); if (lastInfo) person(lastInfo); }
if (mhc) mhStatus();

function fixRow(s, i) {
  const row = el('div', 'frow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ticked.has(i.key); cb.setAttribute('aria-label', 'Done'); row.classList.toggle('done', cb.checked);
  cb.onchange = () => { cb.checked ? ticked.add(i.key) : ticked.delete(i.key); row.classList.toggle('done', cb.checked); fixCount(s); };
  const body = el('div', 'fbody'), head = el('div', 'fhead'), note = el('div', 'fnote');
  const cpB = (txt, title) => ib('copy', title, function () { copy(txt, this); });
  const evs = n => n + ' event' + (n === 1 ? '' : 's');
  if (s.key === 'places' || s.key === 'check') {
    const swap = el('span', 'swap'); swap.append(el('span', 'was', i.raw), el('span', 'arrow', '→'), el('b', 'now', i.to));
    const acts = el('span', 'acts'); acts.append(cpB(i.to, 'Copy the new text'), cpB(i.raw, 'Copy the current text (to find it in MyHeritage)'));
    head.append(swap, acts);
    if (s.key === 'check') note.textContent = 'Suggestion only: ' + i.why;
    body.append(head); if (note.textContent) body.append(note); body.append(el('div', 'fcount', evs(i.count)), plist(i.people, i.count));
  } else if (s.key === 'decide') {
    head.append(el('span', 'was plain', i.raw)); body.append(head);
    const cs = el('div', 'cands'); if (i.cands.length) { cs.append(el('span', 'muted', 'Could be: ')); for (const c of i.cands) { const b = el('button', 'cand'); b.type = 'button'; b.innerHTML = IC.copy + '<span></span>'; b.lastChild.textContent = c; b.title = 'Copy “' + c + '”'; b.onclick = () => copy(c, b); cs.append(b); } } else cs.append(el('span', 'muted', 'No candidate found: look it up by hand.'));
    body.append(cs, el('div', 'fcount', evs(i.count)), plist(i.people, i.count));
  } else if (s.key === 'dupes') {
    head.append(el('b', null, 'Possibly the same person')); body.append(head, note);
    note.textContent = i.note + (i.ap || i.bp ? ' · ' + (i.ap || '—') + ' / ' + (i.bp || '—') : '');
    body.append(plist([{ name: i.an, id: i.a }, { name: i.bn, id: i.b }], 2));
  } else if (s.key === 'apart') {
    head.append(el('b', null, i.size + (i.size === 1 ? ' person' : ' people') + ' not connected to the main tree')); body.append(head, plist(i.people, i.size));
  } else if (s.key === 'suspect') {
    const one = pline({ name: i.name, id: i.id, by: null, nl: i.nl }, { copyName: true }); one.classList.add('solo'); head.append(one);
    const leave = el('button', 'link', 'Leave as is'); leave.type = 'button'; leave.title = 'I know this is right: hide it'; leave.onclick = () => { asIs.add(i.key); drawFix(); };
    head.append(leave); body.append(head);
    const ul = el('ul', 'reasons'); for (const r of i.reasons) ul.append(el('li', null, r.text)); body.append(ul);
  } else if (s.key === 'ages') {
    head.append(el('b', null, i.country + ' written for ' + (i.from === i.to ? i.from : i.from + '–' + i.to) + ', when it was ' + i.label)); body.append(head, el('div', 'fcount', i.count + ' event' + (i.count === 1 ? '' : 's') + ', ' + i.n + (i.n === 1 ? ' person' : ' people')), plist(i.people, i.n));
  } else if (s.key === 'leads') {
    const one = pline({ name: i.name, id: i.id, by: i.born, nl: i.nl }, { copyName: true }); one.classList.add('solo'); head.append(one);
    const leave = el('button', 'link', 'Leave as is'); leave.type = 'button'; leave.onclick = () => { asIs.add(i.key); drawFix(); };
    head.append(leave); body.append(head, el('div', 'fnote', 'Born ' + i.born + ' at ' + i.place + '. The Atlas lists these for that place and time:'));
    const ul = el('ul', 'reasons');
    for (const c of i.cols) { const li = el('li'), a = el('a', null, c.title); if (/^https?:\/\//.test(c.url)) { a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; } li.append(a, ' ' + [c.provider, c.from ? c.from + (c.to ? '–' + c.to : '') : ''].filter(Boolean).join(' · ')); ul.append(li); }
    if (i.more) ul.append(el('li', 'muted', 'and ' + i.more + ' more in the Atlas')); body.append(ul);
  } else {                                                                                        // years, names, dates: one person, a note under
    const p = { name: i.name, id: i.id, by: null, nl: i.nl }; const one = pline(p, { copyName: !!i.name }); one.classList.add('solo'); head.append(one);
    note.textContent = i.note + (i.with ? ' · with ' + i.with : '') + (i.kin ? ' · ' + i.kin : '') + (i.born && s.key !== 'dates' ? ' · born ' + i.born : '') + (i.place ? ' · born at ' + i.place : '');
    body.append(head, note);
  }
  if (i.next) { const n = el('p', 'fnext'); n.append(el('b', null, 'Next step '), i.next); body.append(n); }
  if (i.info && i.info.length) {
    const d = el('details', 'atlnotes'); d.open = !$('#fcollapse').checked; const sm = el('summary'); sm.append(el('b', null, 'What the Atlas holds '), el('span', 'muted', '(' + i.info.length + ')')); d.append(sm, infoList(i.info)); body.append(d);
  }
  row.append(cb, body); return row;
}
function fixCount(s) { const n = $('#fc-' + s.key); if (n) n.textContent = s.items.filter(i => ticked.has(i.key)).length + ' of ' + s.items.length + ' done'; }
const hay = (s, i) => (s.key === 'names' ? i.name + ' ' + i.kin : s.key === 'dupes' ? i.an + ' ' + i.bn : s.key === 'apart' ? i.people.map(p => p.name).join(' ') : (i.raw || '') + ' ' + (i.name || '') + ' ' + (i.country ? i.country + ' ' + i.label : '') + ' ' + (i.reasons ? i.reasons.map(r => r.text).join(' ') : '') + ' ' + (i.people ? i.people.map(p => p.name).join(' ') : '')).toLowerCase();
function drawFix() {
  if (!fix) return; const q = $('#ffilter').value.trim().toLowerCase(), box = $('#fsecs'); box.textContent = '';
  const byKey = new Map(fix.sections.map(x => [x.key, x])), done = new Set();
  const section = s => {
    done.add(s.key);
    const d = el('details', 'sec sec-' + s.key); d.id = 'fs-' + s.key; if (s.items.length) d.open = s.key === 'places' || d.dataset.open === '1';
    const sum = el('summary'), c = el('span', 'small'); c.id = 'fc-' + s.key; sum.append(el('b', null, s.title + ' '), el('span', 'count', n0(s.items.length)), ' ', c); d.append(sum);
    const how = el('p', 'small how', s.how); how.hidden = true; const inf = ib('info', 'What is this list?', function (e) { e.preventDefault(); e.stopPropagation(); how.hidden = !how.hidden; }); sum.append(' ', inf); d.append(how);
    const live = s.items.filter(i => !asIs.has(i.key)), hits = q ? live.filter(i => hay(s, i).includes(q)) : live, cap = shownN.get(s.key) || 100;
    if (!s.items.length) d.append(el('p', 'small', 'Nothing to do here.'));
    const left = s.items.length - live.length; if (left) { const b = el('button', 'link', left + ' left as is: show them again'); b.onclick = () => { for (const i of s.items) asIs.delete(i.key); d.dataset.open = '1'; drawFix(); }; d.append(b); }
    for (const i of hits.slice(0, cap)) d.append(fixRow(s, i));
    if (hits.length > cap) { const b = el('button', 'link', 'Show ' + Math.min(100, hits.length - cap) + ' more of ' + n0(hits.length - cap)); b.onclick = () => { shownN.set(s.key, cap + 100); d.dataset.open = '1'; drawFix(); }; d.append(b); }
    d.ontoggle = () => { d.dataset.open = d.open ? '1' : ''; };
    box.append(d); fixCount(s);
  };
  for (const g of fix.groups || FIXGROUPS) {                                                       // by what the reader has to do, then by kind
    const secs = g.sections.map(k => byKey.get(k)).filter(Boolean); if (!secs.length) continue;
    const total = secs.reduce((n, x) => n + x.items.length, 0), h = el('h3', 'fgroup'); h.append(g.title + ' ', el('span', 'count', n0(total)));
    box.append(h, el('p', 'small', g.how)); secs.forEach(section);
  }
  for (const s of fix.sections) if (!done.has(s.key)) section(s);
}
function fixlist(m) { fix = m; drawFix(); }
$('#ffilter').oninput = () => drawFix();
$('#fliving').onchange = () => worker && worker.postMessage({ cmd: 'checklist', living: $('#fliving').checked });
function saveAs(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type })), a = el('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
$('#ftext').onclick = () => fix && saveAs('fix-list.txt', checklistText(fix, new Date().toISOString().slice(0, 10)), 'text/plain;charset=utf-8');
$('#fcollapse').onchange = () => drawFix();
/* The PDF is the browser's own "Save as PDF" over a print-ready copy of the list, built here on the device from the same rows. Nothing is uploaded and
   no library or font is fetched. The copy is added to the page for the moment of printing and removed after. */
function printable() {
  const root = el('div'); root.id = 'fprint';
  root.append(el('h1', null, 'Fix list'), el('p', 'small', 'Made in your browser from your GEDCOM, ' + new Date().toISOString().slice(0, 10) + (fix.main ? ' · ' + n0(fix.main) + ' people in the main tree' : '') + '. Tick a box when the line is done in your own tree. Help from Record Atlas (recordatlas.org); where the Atlas has nothing, the line says so.'));
  for (const g of fix.groups || FIXGROUPS) {
    const secs = g.sections.map(k => fix.sections.find(x => x.key === k)).filter(x => x && x.items.length); if (!secs.length) continue;
    root.append(el('h2', null, g.title), el('p', 'small', g.how));
    for (const s of secs) {
      root.append(el('h3', null, s.title + ' (' + s.items.length + ')'));
      for (const i of s.items) {
        if (asIs.has(i.key) || ($('#ffilter').value.trim() && !hay(s, i).includes($('#ffilter').value.trim().toLowerCase()))) continue;
        const d = describe(s, i), row = el('div', 'pitem'), bx = el('span', 'pbox'); bx.textContent = '☐';
        const main = el('div'); main.append(el('b', null, d.head)); if (d.why) main.append(el('div', 'pwhy', d.why)); if (d.people) main.append(el('div', 'ppeople', d.people));
        if (d.next) { const n = el('div', 'pnext'); n.append(el('b', null, 'Next step '), d.next); main.append(n); }
        if (d.info.length) main.append(infoList(d.info));
        row.append(bx, main); root.append(row);
      }
    }
  }
  return root;
}
function toPdf() {
  if (!fix) return; const was = document.getElementById('fprint'); if (was) was.remove();
  const root = printable(); document.body.append(root); document.body.classList.add('printing');
  const undo = () => { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', undo); };
  window.addEventListener('afterprint', undo); setTimeout(() => { try { window.print(); } catch (e) { undo(); } }, 60);
}
$('#fpdf').onclick = toPdf;
$('#fcsv').onclick = () => fix && saveAs('fix-list.csv', '\ufeff' + checklistCsv(fix), 'text/csv;charset=utf-8');


/* ---------- files kept on this device (opt-in, see recent.js) ---------- */
const mb = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
async function refreshRecent() {
  const items = await recent.list(), box = $('#recent'), ul = $('#rlist'); ul.textContent = ''; box.hidden = !items.length;
  for (const f of items) {
    const li = el('li', 'rf'), open = el('button', 'btn', 'Open'), when = new Date(f.saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    open.onclick = async () => { const r = await recent.recall(f.id); if (r) start(r.bytes, r.name); else refreshRecent(); };
    li.append(el('b', 'rn', f.name), el('span', 'muted', mb(f.size) + ' · kept ' + when), open, ib('trash', 'Forget this file (removes it from this browser)', async () => { await recent.forget(f.id); refreshRecent(); }));
    ul.append(li);
  }
}
$('#rall').onclick = async () => { await recent.forgetAll(); refreshRecent(); };
$('#keep').onclick = async function () {
  if (!curBytes || !curName) return; const b = this; b.disabled = true;
  try { await recent.remember(curName, curBytes.slice(0)); b.textContent = 'Kept on this device ✓'; } catch (e) { b.textContent = 'Could not keep it: ' + (e.message || 'storage refused'); }
  b.disabled = false; refreshRecent();
};
refreshRecent();
