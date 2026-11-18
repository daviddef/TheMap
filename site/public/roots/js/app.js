/* The page: drop a file, hand it to the worker, show the tree, the import report and the places to review.
   Everything from the GEDCOM reaches the DOM through textContent, never innerHTML: it is untrusted text. */
import { makeSample } from './sample.js';
import { searchLinks, sends } from './lookup.js';
import { checklistText, checklistCsv } from './checklist.js';
import * as recent from './recent.js';
import { store as dec, fixes, summarise, rowsFrom, fileTextOf, parseRows, lookup } from './decisions.js';
import { BUILD } from './build.js';
import { parseLink, profileUrl, treeUrl, toHash, fromHash } from './myheritage.js';
import { loadLink, saveLink, loadSite, saveSite, loadTrees, saveTreeLink } from './remember.js';
import { personUrl } from './ancestry.js';
import { GROUPS as FIXGROUPS, describe, issuesByPerson } from './checklist.js';
import { el, n0, pct, reportInto } from './report-view.js';   // the import report is drawn by the module the Tree Canvas's "Your file" page shares

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

let curBytes = null, curName = null;   // a private copy, only so the visitor can choose to keep the file on this device
let worker = null, last = null, shown = { review: 0 };
let openTo = null;   // the tab to land on after the next load: «Fix list» on a kept file goes straight there, not through the whole tree
const base = new URL('./', location.href).href;

function show(id) { for (const s of ['start', 'busy', 'work']) $('#' + s).hidden = s !== id; document.body.classList.toggle('loaded', id === 'work'); }
function fail(msg) { const e = $('#err'); e.textContent = msg; e.hidden = false; show('start'); }

function start(bytes, name) {
  curBytes = bytes.slice(0); curName = name || null; $('#keep').hidden = !curName; $('#keep').textContent = 'Keep on this device';
  if (curName) keepAuto();
  $('#err').hidden = true; show('busy'); $('#busymsg').textContent = 'Starting…';
  if (worker) worker.terminate();
  worker = new Worker('js/worker.js', { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') $('#busymsg').textContent = m.msg + '…';
    else if (m.type === 'error') fail('Sorry, that file could not be read: ' + m.msg);
    else if (m.type === 'done') done(m);
    else if (m.type === 'exported') exported(m);
    else if (m.type === 'who') mhWho(m);
    else if (m.type === 'checklist') fixlist(m);
    else if (m.type === 'checklist-failed') { if (window.console) console.error('fix list', m.msg, m.stack); if (!document.getElementById('p-fix').hidden) $('#fsecs').textContent = 'The fix list could not be made for this file: ' + m.msg; }
    else if (m.type === 'suggested') suggested(m);
  };
  worker.onerror = e => fail('The reader crashed: ' + (e.message || 'unknown error'));
  worker.postMessage({ cmd: 'load', bytes, base }, [bytes]);
}

const hideLiv = () => $('#hideliving').checked;
$('#hideliving').onchange = () => { $('#fliving').checked = !hideLiv(); worker && worker.postMessage({ cmd: 'living', hide: hideLiv() }); };
function done(m) {
  const stale = !m.build || m.build.pipeline !== BUILD || m.build.model !== BUILD; $('#stale').hidden = !stale;
  last = m; window.RR = { tree: m.tree, atlas: m.atlas, loadNames, links: rrLinks }; anc = m.anc || null; ancStatus(); mhFile = m.mh || null; applyTreeLink();
  const keepTab = $('.tabs [aria-selected=true]')?.dataset.tab || 'canvas';
  show('work'); chips(m); mountViewer(); reportInto(m, $('#p-report')); review(m); askFix();
  tab(openTo || (m.first ? 'canvas' : keepTab)); openTo = null;
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
  f.id = 'viewer'; f.title = old.title; f.src = 'viewer.html?v=' + STAMP + '&shell=1' + h; old.replaceWith(f); f.onload = pushMh;   // shell=1: this page draws Orphans as its own tab, so the viewer drops its in-page one
  viewerLive = false; $('#orcount').textContent = ''; $('.tabs [data-tab=orphans]').title = ORTITLE;
}
function pushMh() { try { $('#viewer').contentWindow.postMessage({ mh: mhc && mhc.site ? { site: mhc.site, tree: mhc.tree, slug: mhc.treeSlug } : null }, '*'); } catch (e) { /* not loaded yet */ } }

/* The Atlas map in the viewer can send us a place text: "Fix this text" opens Places to review filtered to it, "Copy" copies it. Only messages from our own viewer are heard. */
window.addEventListener('message', e => {
  const v = $('#viewer'); if (!v || e.source !== v.contentWindow || !e.data) return;
  if (e.data.type === 'ra-roots-view') {
    viewerLive = true;
    const n = +e.data.orphans || 0, c = +e.data.clusters || 0; $('#orcount').textContent = n ? n0(n) : '';
    $('.tabs [data-tab=orphans]').title = n || c ? n0(n) + ' orphan records · ' + n0(c) + ' detached ' + (c === 1 ? 'family' : 'families') + ' · where to start looking' : ORTITLE;
    const showing = e.data.view === 'orphans';
    if (wantView) { const w = wantView; wantView = null; if ((w === 'orphans') !== showing) { try { v.contentWindow.postMessage({ raView: w }, '*'); } catch (x) { /* gone */ } } return; }   // the first report of a new viewer: it may be on the other view
    const sel = $('.tabs [aria-selected=true]')?.dataset.tab;   // the viewer changed view itself: keep the tab in step, say nothing back
    if (sel === 'tree' && showing) tab('orphans', true); else if (sel === 'orphans' && !showing) tab('tree', true);
    return;
  }
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
/* The Tree Canvas (canvas.html) is mounted the first time its tab is shown for a given file, and again for a new file: it reads the tree from
   window.RR when it starts, and it needs a visible frame to measure. It stores nothing (the file's owner decides what is kept, on the start screen). */
let canvasFor = null;
function mountCanvas() {
  if (!window.RR || canvasFor === window.RR) return;
  const old = $('#canvasv'), f = document.createElement('iframe');
  f.id = 'canvasv'; f.title = old.title; f.src = 'canvas.html?v=' + STAMP; old.replaceWith(f); canvasFor = window.RR;
}
/* «Orphans» and «Tree views» are two tabs of ONE viewer, so who is in focus and every other choice carries across: Orphans only opens the viewer's Orphans view, and Tree
   views goes back to the view that was open before. The viewer is told with a message (it stores nothing here), and tells us back which view it is showing, so a tile or
   link inside it that opens Orphans moves the tab too. A request made before a new viewer has loaded waits for its first report. */
const ORTITLE = 'Records joined to no one, small families outside every tree, and where to start looking';
let viewerLive = false, wantView = null;
function viewerView(want) {
  const v = $('#viewer'); wantView = want;
  if (viewerLive && v && v.contentWindow) { try { v.contentWindow.postMessage({ raView: want }, '*'); wantView = null; } catch (x) { /* not reachable yet: the first report will send it */ } }
}
function tab(name, fromViewer) {
  const panel = name === 'orphans' ? 'tree' : name;   // Orphans has no panel of its own: it is the viewer's Orphans view
  document.body.classList.toggle('wide', panel === 'tree' || panel === 'canvas');   // the tree uses the whole window; the lists keep a readable width
  for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of $$('.panel')) p.hidden = p.id !== 'p-' + panel;
  if (name === 'canvas') mountCanvas();
  if (name === 'fix' && worker) askFix();
  if ((name === 'orphans' || name === 'tree') && !fromViewer) viewerView(name === 'orphans' ? 'orphans' : 'tree');
}
$$('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.tab));
$('#rfilter').oninput = e => last && drawReview(last.review, e.target.value);
$('#again').onclick = () => { document.body.classList.remove('wide'); if (worker) worker.terminate(); worker = null; last = null; curBytes = null; window.RR = null; canvasFor = null; show('start'); refreshRecent(); };

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
const askFix = () => worker && worker.postMessage({ cmd: 'checklist', living: $('#fliving').checked, ancestry: $('#fanc').value });
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
let mhc = fromHash(location.hash), mhRemembered = false, mhFile = null;
{ const kept = loadLink(), c = kept && parseLink(kept);                       // the last link pasted on this device, unless the address already carries one
  if (c) { $('#mhin').value = kept; if (!mhc) { mhc = c; mhRemembered = true; history.replaceState(null, '', toHash(c)); } } }
/* the Ancestry tree an Ancestry export came from: its number is in the file's header, and each record number is Ancestry's own person number */
let anc = null, ancSite = loadSite();
const ancA = id => { const u = personUrl(anc, id, ancSite); return u ? [ia('open', 'Open this person in the Ancestry tree (ancestry.' + ancSite + ')', u)] : []; };
const mhA = (id, name) => {
  const p = profileUrl(mhc, id, name), tu = treeUrl(mhc, id), a = ancA(id);
  return [...(p ? [' ', ia('person', 'Open this profile on MyHeritage', p), ' ', ia('tree', 'Open this person in the tree on MyHeritage', tu)] : []), ...a];
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
    const li = el('li', x.none ? 'none' : x.outside ? 'outside' : null); li.append(el('b', null, x.k + ' '), x.t);
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
  acts.append(...ancA(p.id));
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
function mhStatus(extra) { $('#mhsum').textContent = mhc ? 'on · tree ' + mhc.tree : 'off'; $('#mhsum').classList.toggle('on', !!mhc); $('#mhstat').textContent = mhc ? (extra || (mhRemembered ? 'Remembered from last time. Clear the box to forget it.' : 'Open one or two people to check they are the right ones. The link is remembered for this tree, so you only paste it once: it stays on this device and goes into your research file and, if you turn on online sync, your encrypted copy. Clear the box to forget it.')) : ''; }
function mhWho(m) { mhStatus(m.name ? 'That link is ' + m.id + ' in your file: ' + m.name + '. If that is not who you pasted, the numbering differs and these links are wrong.' : 'No person ' + m.id + ' in this file, so check the link.'); }
$('#mhin').onchange = e => {                                   // leaving the box with text that is not a link: put back the last good link rather than keep the stray text
  if (e.target.value.trim() && !parseLink(e.target.value)) { e.target.value = loadLink(); mhStatus(e.target.value ? 'That text was not a MyHeritage link, so the last good link is back in the box.' : ''); if (!mhc) $('#mhstat').textContent = 'That text was not a MyHeritage link.'; }
};
$('#mhin').oninput = e => {
  const c = parseLink(e.target.value); mhRemembered = false;
  if (!c) { mhc = null; if (!e.target.value.trim()) { saveLink(''); if (mhFile) saveTreeLink(mhFile.guid, ''); } $('#mhstat').textContent = e.target.value.trim() ? 'That does not look like a MyHeritage profile or tree link.' : ''; refreshMh(); return; }
  saveLink(e.target.value.trim()); if (mhFile) saveTreeLink(mhFile.guid, e.target.value.trim());
  mhc = c; history.replaceState(null, '', toHash(c)); mhStatus(); refreshMh(); if (worker && c.num) worker.postMessage({ cmd: 'who', id: 'I' + c.num });
};
/* THE LINK IS ASKED FOR ONCE PER TREE. The file's header names its tree (mhFile.guid). The link is looked up for that tree in this order: one the visitor
   pasted before (kept per tree here, in their research file and in their online copy), then a tree the Atlas already knows (data in known-sites.json,
   fetched here), and only then does the box stay empty for a paste. An empty remembered entry means "forget it", and is respected. */
const knownP = fetch(new URL('known-sites.json', base)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
function applyTreeLink() {
  if (!mhFile) return;
  const guid = mhFile.guid, mine = loadTrees();
  knownP.then(K => {
    if (!mhFile || mhFile.guid !== guid) return;
    const own = guid in mine, kept = own ? mine[guid] : ((K[guid] && K[guid].link) || ''), c = kept && parseLink(kept);
    if (!c) return;                                              // nothing remembered, or forgotten on purpose: the box is left for a paste
    $('#mhin').value = kept; mhc = c; mhRemembered = true; history.replaceState(null, '', toHash(c));
    mhStatus(own ? 'Remembered for this tree, so you will not be asked again. It is kept on this device and goes into your research file and, if you turn on online sync, your encrypted copy. Clear the box to forget it.' : 'This is a tree the Atlas already knows, so the link was filled in for you. Nothing to paste.');
    refreshMh(); if (own && worker && c.num) worker.postMessage({ cmd: 'who', id: 'I' + c.num });   // a link the Atlas ships is not re-checked against the file
  });
}
function ancStatus() { $('#ancstat').textContent = anc ? 'This is an Ancestry export (tree ' + anc.tree + '): every person has a link into that tree on ancestry.' + ancSite + ', read from the file itself. Nothing is sent.' : 'Not an Ancestry export (or no tree number in its header), so no Ancestry links are made.'; }
/* what the Tree canvas needs to open a person on MyHeritage or Ancestry, handed over in memory (window.RR.links): this page owns the link and the file's
   header, the canvas only asks for a person's address and, from its Options tab, passes a pasted link back through set(). Nothing is sent anywhere. */
const rrLinks = {
  get: () => ({ mh: !!mhc, mhFile: !!mhFile, text: $('#mhin').value, note: $('#mhstat').textContent, anc: !!anc, ancTree: anc ? anc.tree : '', ancSite }),
  url: (id, name) => { const p = profileUrl(mhc, id, name), t = treeUrl(mhc, id), a = personUrl(anc, id, ancSite); return p || a ? { mh: p, tree: t, anc: a } : null; },
  set: text => { const i = $('#mhin'); i.value = text; i.oninput({ target: i }); return $('#mhstat').textContent; },
  setSite: v => setSite(v),
};
function tellCanvas() { try { const f = document.getElementById('canvasv'); if (f && f.contentWindow) f.contentWindow.postMessage({ tcLinks: 1 }, location.origin); } catch (e) { /* not loaded yet */ } }
function refreshMh() { pushMh(); drawFix(); tellCanvas(); }
if (mhc) mhStatus();

function fixRow(s, i) {
  const row = el('div', 'frow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ticked.has(i.key); cb.setAttribute('aria-label', 'Done'); row.classList.toggle('done', cb.checked);
  cb.onchange = () => { cb.checked ? ticked.add(i.key) : ticked.delete(i.key); dec.put(i.key, 'd', cb.checked); row.classList.toggle('done', cb.checked); fixCount(s); decStatus(0); keepSummary(); };
  const body = el('div', 'fbody'), head = el('div', 'fhead'), note = el('div', 'fnote');
  /* a copy button that SAYS which text it copies: two bare icons side by side could not be told apart */
  const cpL = (label, title, txt) => { const b = el('button', 'cand'); b.type = 'button'; b.innerHTML = IC.copy + '<span></span>'; b.lastChild.textContent = label; b.title = title; b.setAttribute('aria-label', title); b.onclick = function () { copy(txt, this); }; return b; };
  const evs = n => n + ' event' + (n === 1 ? '' : 's');
  if (s.key === 'places' || s.key === 'check') {
    const swap = el('span', 'swap'); swap.append(el('span', 'was', i.raw), el('span', 'arrow', '→'), el('b', 'now', i.to));
    const acts = el('span', 'acts'); acts.append(cpL('New', 'Copy the new text, the one in bold: ' + i.to, i.to), cpL('Old', 'Copy the old text, the crossed-out one, to search for it in MyHeritage: ' + i.raw, i.raw));
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
    /* WHY, because «he is in my tree» is the first thing anyone says: this list is about the FILE, not the tree online. */
    note.textContent = (i.gone ? 'The file names ' + i.gone + ' relative' + (i.gone === 1 ? '' : 's') + ' of these people who ' + (i.gone === 1 ? 'is' : 'are') + ' not in it, so it may be a partial export.'
      : 'In this file there is no parent, spouse or child link from ' + (i.size === 1 ? 'this person' : 'these people') + ' to anyone else.')
      + ' Built from ' + (curName || 'the file you loaded') + '. If they are joined in your tree now, export again.'; body.append(note);
  } else if (s.key === 'suspect') {
    const one = pline({ name: i.name, id: i.id, by: null, nl: i.nl }, { copyName: true }); one.classList.add('solo'); head.append(one);
    const leave = el('button', 'link', 'Leave as is'); leave.type = 'button'; leave.title = 'I know this is right: hide it'; leave.onclick = () => { asIs.add(i.key); dec.put(i.key, 'a', true); drawFix(); };
    head.append(leave); body.append(head);
    const ul = el('ul', 'reasons'); for (const r of i.reasons) ul.append(el('li', null, r.text)); body.append(ul);
  } else if (s.key === 'ages') {
    head.append(el('b', null, i.country + ' written for ' + (i.from === i.to ? i.from : i.from + '–' + i.to) + ', when it was ' + i.label)); body.append(head, el('div', 'fcount', i.count + ' event' + (i.count === 1 ? '' : 's') + ', ' + i.n + (i.n === 1 ? ' person' : ' people')), plist(i.people, i.n));
  } else if (s.key === 'leads') {
    const one = pline({ name: i.name, id: i.id, by: i.born, nl: i.nl }, { copyName: true }); one.classList.add('solo'); head.append(one);
    const leave = el('button', 'link', 'Leave as is'); leave.type = 'button'; leave.onclick = () => { asIs.add(i.key); dec.put(i.key, 'a', true); drawFix(); };
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
/* DONE IS GREY AND TICKED. «anything on the fix list thats done, grey it out and add a tick». A section is done when nothing in it is
   still to do: every row ticked or left as is, or no rows at all. A group is done when all its sections are. */
const secDone = s => s.items.every(i => ticked.has(i.key) || asIs.has(i.key));
function fixCount(s) {
  const n = $('#fc-' + s.key); if (n) n.textContent = s.items.filter(i => ticked.has(i.key)).length + ' of ' + s.items.length + ' done';
  const d = $('#fs-' + s.key); if (d) { const ok = secDone(s); d.classList.toggle('sec-done', ok); const t = d.querySelector('summary .tick'); if (t) t.hidden = !ok; }
  if (fix) for (const h of $$('#fsecs .fgroup')) { const ok = h.dataset.keys.split(',').every(k => { const x = fix.sections.find(y => y.key === k); return !x || secDone(x); }); h.classList.toggle('group-done', ok); h.querySelector('.tick').hidden = !ok; }
  fixTab();
}
/* the number on the Fix list tab: what is still to do, not counting what is ticked or left as is */
function fixTab() {
  const c = $('#fxcount'); if (!c) return;
  const n = fix ? fix.sections.reduce((t, s) => t + s.items.filter(i => !asIs.has(i.key) && !ticked.has(i.key)).length, 0) : 0;
  c.textContent = n ? n0(n) : ''; c.title = n ? n0(n) + ' fixes left to do' : '';
}
const hay = (s, i) => (s.key === 'names' ? i.name + ' ' + i.kin : s.key === 'dupes' ? i.an + ' ' + i.bn : s.key === 'apart' ? i.people.map(p => p.name).join(' ') : (i.raw || '') + ' ' + (i.name || '') + ' ' + (i.country ? i.country + ' ' + i.label : '') + ' ' + (i.reasons ? i.reasons.map(r => r.text).join(' ') : '') + ' ' + (i.people ? i.people.map(p => p.name).join(' ') : '')).toLowerCase();
/* OPEN ALL, A BATCH AT A TIME. "Open all for the fixes group, so I don't have to do one at a time": every person on the rows still to do in a group,
   opened on the tree site in new tabs. Ten at a time, because a browser lets a page open a handful of tabs from one click and some hundreds
   of them would bury the machine; the button says how many are left and each press opens the next ten. A person who is on several rows is
   opened once. Rows that are ticked, left as is or hidden by the filter are skipped. If the browser blocks the extra tabs the button says so
   and says what to switch on; nothing is lost, the people not opened stay on the count. */
const BATCH = 10, opened = new Set();
function peopleOf(s, i) {
  if (s.key === 'dupes') return [{ id: i.a, name: i.an }, { id: i.b, name: i.bn }];
  if (i.people) return i.people;
  return i.id ? [{ id: i.id, name: i.name }] : [];
}
const openUrl = p => profileUrl(mhc, p.id, p.name) || personUrl(anc, p.id, ancSite) || '';
function toOpen(secs, q) {
  const seen = new Set(), out = [];
  for (const s of secs) for (const i of s.items) {
    if (asIs.has(i.key) || ticked.has(i.key) || (q && !hay(s, i).includes(q))) continue;
    for (const p of peopleOf(s, i)) { if (!p || !p.id || seen.has(p.id)) continue; seen.add(p.id); out.push(p); }
  }
  return out;
}
function openAllBar(g, secs, q) {
  const bar = el('div', 'fgact'), b = el('button', 'open-all'), say = el('span', 'small muted');
  b.type = 'button';
  const left = () => toOpen(secs, q).filter(p => !opened.has(p.id) && openUrl(p));
  const paint = () => {
    const todo = toOpen(secs, q), n = left().length, usable = todo.some(openUrl);
    b.disabled = !usable || !n;
    b.textContent = !usable ? 'Open people' : !n ? 'All opened' : n > BATCH ? 'Open next ' + BATCH + ' people' : 'Open ' + n + (n === 1 ? ' person' : ' people');
    b.title = !usable ? 'Paste your MyHeritage tree link above (or load an Ancestry export) and each person can be opened here' : 'Open the next people in this group, each in its own tab, on ' + (mhc ? 'MyHeritage' : 'Ancestry');
    if (!usable) say.textContent = todo.length ? 'Needs your tree link above.' : '';
    else say.textContent = (todo.length - n) + ' of ' + todo.length + (todo.length === 1 ? ' person' : ' people') + ' opened' + (n > BATCH ? ', ' + n + ' to go' : '');
  };
  b.onclick = () => {
    let blocked = 0, did = 0;
    for (const p of left().slice(0, BATCH)) {
      const w = window.open(openUrl(p), '_blank');
      if (w) { try { w.opener = null; } catch { /* cross-origin already */ } opened.add(p.id); did++; } else { blocked++; break; }
    }
    paint();
    if (blocked) say.textContent = (did ? did + ' opened, then' : 'Nothing opened:') + ' your browser blocked the extra tabs. Allow pop-ups for this site (the icon at the right of the address bar), then press again.';
  };
  bar.append(b, say); paint(); return bar;
}
function drawFix() {
  if (!fix) return; keepSummary(); const q = $('#ffilter').value.trim().toLowerCase(), box = $('#fsecs'); box.textContent = '';
  const byKey = new Map(fix.sections.map(x => [x.key, x])), done = new Set();
  const section = s => {
    done.add(s.key);
    const d = el('details', 'sec sec-' + s.key); d.id = 'fs-' + s.key; if (s.items.length) d.open = s.key === 'places' || d.dataset.open === '1';
    const sum = el('summary'), c = el('span', 'small'); c.id = 'fc-' + s.key; const tk = el('span', 'tick', '\u2713'); tk.title = 'Done: nothing left to do here'; tk.hidden = true; sum.append(tk, el('b', null, s.title + ' '), el('span', 'count', n0(s.items.length)), ' ', c); d.append(sum);
    const how = el('p', 'small how', s.how); how.hidden = true; const inf = ib('info', 'What is this list?', function (e) { e.preventDefault(); e.stopPropagation(); how.hidden = !how.hidden; }); sum.append(' ', inf); d.append(how);
    const live = s.items.filter(i => !asIs.has(i.key)), hits = q ? live.filter(i => hay(s, i).includes(q)) : live, cap = shownN.get(s.key) || 100;
    if (!s.items.length) d.append(el('p', 'small', 'Nothing to do here.'));
    const left = s.items.length - live.length; if (left) { const b = el('button', 'link', left + ' left as is: show them again'); b.onclick = () => { for (const i of s.items) { asIs.delete(i.key); dec.put(i.key, 'a', false); } d.dataset.open = '1'; drawFix(); }; d.append(b); }
    for (const i of hits.slice(0, cap)) d.append(fixRow(s, i));
    if (hits.length > cap) { const b = el('button', 'link', 'Show ' + Math.min(100, hits.length - cap) + ' more of ' + n0(hits.length - cap)); b.onclick = () => { shownN.set(s.key, cap + 100); d.dataset.open = '1'; drawFix(); }; d.append(b); }
    d.ontoggle = () => { d.dataset.open = d.open ? '1' : ''; };
    box.append(d); fixCount(s);
  };
  for (const g of fix.groups || FIXGROUPS) {                                                       // by what the reader has to do, then by kind
    const secs = g.sections.map(k => byKey.get(k)).filter(Boolean); if (!secs.length) continue;
    const total = secs.reduce((n, x) => n + x.items.length, 0), h = el('h3', 'fgroup'); h.dataset.keys = g.sections.join(','); const gt = el('span', 'tick', '\u2713'); gt.hidden = true; h.append(gt, g.title + ' ', el('span', 'count', n0(total)));
    box.append(h, el('p', 'small', g.how)); if (total) box.append(openAllBar(g, secs, q)); secs.forEach(section);
  }
  for (const s of fix.sections) if (!done.has(s.key)) section(s);
}
/* ---------- decisions kept on this device (opt-in, see decisions.js) ---------- */
let loaded = null;                                   // rows read from a file this session: applied, not kept unless the switch is on
function restoreDecisions(m) {
  let n = 0;
  for (const s of m.sections) for (const i of s.items) {
    const r = dec.get(i.key) || lookup(loaded, i.key); if (!r) continue;
    n++; if (r.a) asIs.add(i.key); if (r.d) ticked.add(i.key);
  }
  return n;
}
function decStatus(restored) {
  const on = $('#dec-on'); if (!on) return;
  $('#dec-said').classList.toggle('saved', dec.isOn() && dec.available());
  on.checked = dec.isOn(); on.disabled = !dec.available();
  const kept = dec.count();
  $('#dec-said').textContent = !dec.available() ? 'This browser has no storage for it (a private window?). Save the decisions to a file instead.'
    : (restored ? restored + ' earlier decision' + (restored === 1 ? '' : 's') + ' re-applied. ' : '')
      + (dec.isOn() ? (autoKept ? 'Kept from the start; untick to stop. ' : '') + '\u2713 Saved on this device: ' + kept + (kept === 1 ? ' decision' : ' decisions') + ', and the Fix list is summarised in My research.' : kept ? kept + ' loaded from a file are stored on this device; turn this on to keep new ones too.' : 'Not kept: ticks and "left as is" are lost when you close the page.');
}
const autoKept = dec.autoOn();   // keeping starts on unless the reader has switched it off (decisions.js)
/* The Atlas's own name catalogues (every form of a given name, every spelling of a surname), for the Tree canvas's search and name panel. Two static files from this
   site, the same for everyone: nothing about the tree is sent, and the canvas never asks for a name. Fetched once, when the canvas first needs it. */
let namesP = null;
const loadNames = () => namesP || (namesP = Promise.all(['/given-names.json', '/surname-families.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); }))).then(([gn, sn]) => ({ gn, sn })).catch(e => { namesP = null; throw e; }));
/* Hand the fix list to the Tree canvas, which marks a card with a "!" and lists the person's rows in a tab. In memory only: the canvas reads window.RR.fix. */
function shareFix(m) { if (!window.RR) return; try { window.RR.fix = issuesByPerson(m); } catch (e) { window.RR.fix = null; } const f = document.getElementById('canvasv'); if (f && f.contentWindow) f.contentWindow.postMessage({ tcFix: 1 }, location.origin); }
function fixlist(m) { fix = m; shareFix(m); opened.clear(); const n = restoreDecisions(m); drawFix(); decStatus(n); fixTab(); }
/* While the switch is on, a readable summary of this fix list is kept for My research (see decisions.js). Debounced: drawFix runs on every tick. */
let sumTimer = 0;
function keepSummary() { clearTimeout(sumTimer); sumTimer = setTimeout(() => { if (fix && curName && dec.isOn()) fixes.put(summarise(fix, asIs, ticked, curName)); }, 400); }
$('#dec-on').onchange = e => { dec.setOn(e.target.checked); dec.optOut(!e.target.checked); if (!e.target.checked) fixes.forget(); else keepSummary(); if (e.target.checked) { for (const k of asIs) dec.put(k, 'a', true); for (const k of ticked) dec.put(k, 'd', true); } decStatus(0); };
$('#dec-save').onclick = () => saveAs('fix-decisions-' + new Date().toISOString().slice(0, 10) + '.json', fileTextOf(rowsFrom(asIs, ticked)), 'application/json');
$('#dec-load').onclick = () => $('#dec-file').click();
$('#dec-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const text = await f.text(); loaded = parseRows(text); if (dec.isOn()) dec.load(text); const n = fix ? restoreDecisions(fix) : 0; drawFix(); decStatus(n); }
  catch { $('#dec-said').textContent = 'That is not a decisions file.'; }
};
$('#dec-forget').onclick = () => { dec.forget(); fixes.forget(); loaded = null; decStatus(0); };
$('#ffilter').oninput = () => drawFix();
$('#fliving').onchange = () => worker && askFix();
function saveAs(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type })), a = el('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
$('#ftext').onclick = () => fix && saveAs('fix-list.txt', checklistText(fix, new Date().toISOString().slice(0, 10)), 'text/plain;charset=utf-8');
$('#fcollapse').onchange = () => drawFix();
function setSite(v) { ancSite = v; saveSite(v); $('#fanc').value = v; $('#mhanc').value = v; askFix(); drawFix(); ancStatus(); tellCanvas(); }
$('#fanc').value = $('#mhanc').value = ancSite; $('#fanc').onchange = () => setSite($('#fanc').value); $('#mhanc').onchange = () => setSite($('#mhanc').value);
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
/* THE SAVED FIX LIST, WITHOUT OPENING A GEDCOM. «how do i see my saved fix list? if i dont open a gedcom?» It lives in My research
   (GEDCOM to fix); this is the door to it from the one page a reader is on when they ask. Reads the same summary My research reads. */
function savedFix() {
  const trees = fixes.all() || {}, names = Object.keys(trees), box = $('#savedfix'); if (!box) return;
  box.hidden = !names.length; if (!names.length) return;
  let left = 0; for (const n of names) for (const s of trees[n].sections || []) left += Math.max(0, s.total - s.done - s.asis);
  $('#savedfixtxt').textContent = names.length === 1 ? names[0] + ': ' + left + ' left to fix.' : names.length + ' family trees kept, ' + left + ' left to fix in all.';
}
async function refreshRecent() {
  savedFix();
  const items = await recent.list(), box = $('#recent'), ul = $('#recentlist'); ul.textContent = ''; box.hidden = !items.length;
  for (const f of items) {
    const li = el('li', 'rf'), open = el('button', 'btn', 'Fix list'), tree = el('button', 'btn ghost', 'Tree'), when = new Date(f.saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const go = to => async () => { const r = await recent.recall(f.id); if (r) { openTo = to; start(r.bytes, r.name); } else refreshRecent(); };
    open.onclick = go('fix'); tree.onclick = go(null); open.title = 'Open this file straight on its Fix list'; tree.title = 'Open this file on its tree';
    li.append(el('b', 'rn', f.name), el('span', 'muted', mb(f.size) + ' · kept ' + when), open, tree, ib('trash', 'Forget this file (removes it from this browser)', async () => { await recent.forget(f.id); refreshRecent(); }));
    ul.append(li);
  }
}
$('#rall').onclick = async () => { await recent.forgetAll(); refreshRecent(); };
/* The last files opened are kept in this browser unless the visitor ticked "Don't keep" (stored in recent.js). Nothing is sent anywhere. */
async function keepAuto() {
  try { if (!(await recent.auto())) return; await recent.remember(curName, curBytes.slice(0)); $('#keep').textContent = 'Kept on this device ✓'; refreshRecent(); } catch { /* storage refused: the button still says why when pressed */ }
}
async function showAuto() { const c = $('#autokeep'); c.checked = await recent.auto(); }
$('#autokeep').onchange = async function () { try { await recent.setAuto(this.checked); } catch { this.checked = false; } };
$('#keep').onclick = async function () {
  if (!curBytes || !curName) return; const b = this; b.disabled = true;
  try { await recent.remember(curName, curBytes.slice(0)); b.textContent = 'Kept on this device ✓'; } catch (e) { b.textContent = 'Could not keep it: ' + (e.message || 'storage refused'); }
  b.disabled = false; refreshRecent();
};
refreshRecent(); showAuto();
