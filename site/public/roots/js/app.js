/* The page: drop a file, hand it to the worker, and show the tree views. Roots & Routes is only Tree views now (19 Nov 2026): the Fix list, Orphans, Places to review,
   the import report and the export are in the Tree Canvas (/tree-canvas/), which reads files with the same reader (worker.js).
   Everything from the GEDCOM reaches the DOM through textContent, never innerHTML: it is untrusted text. */
import { makeSample } from './sample.js';
import * as recent from './recent.js';
import { BUILD } from './build.js';
import { parseLink, toHash, fromHash } from './myheritage.js';
import { loadLink, saveLink, loadSite, saveSite, loadTrees, saveTreeLink } from './remember.js';
import { el, n0, pct } from './report-view.js';   // the helpers the Tree Canvas's "Your file" page shares

const $ = s => document.querySelector(s);

let curBytes = null, curName = null;   // a private copy, only so the visitor can choose to keep the file on this device
let worker = null;
const base = new URL('./', location.href).href;

function show(id) { if (window.RALoad && id !== 'busy') RALoad.hide(); for (const s of ['start', 'busy', 'work']) $('#' + s).hidden = s !== id; document.body.classList.toggle('loaded', id === 'work'); document.body.classList.toggle('wide', id === 'work'); }
function fail(msg) { if (window.RALoad) RALoad.off(); const e = $('#err'); e.textContent = msg; e.hidden = false; show('start'); }

function start(bytes, name) {
  curBytes = bytes.slice(0); curName = name || null; $('#keep').hidden = !curName; $('#keep').textContent = 'Keep on this device';
  if (curName) keepAuto();
  $('#err').hidden = true; show('busy'); $('#busymsg').textContent = 'Starting…'; if (window.RALoad) RALoad.say('Starting…');
  if (worker) worker.terminate();
  worker = new Worker('js/worker.js', { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') { $('#busymsg').textContent = m.msg + '…'; if (window.RALoad) RALoad.say(m.msg + '…'); }
    else if (m.type === 'error') fail('Sorry, that file could not be read: ' + m.msg);
    else if (m.type === 'done') done(m);
    else if (m.type === 'who') mhWho(m);
  };
  worker.onerror = e => fail('The reader crashed: ' + (e.message || 'unknown error'));
  worker.postMessage({ cmd: 'load', bytes, base }, [bytes]);
}

const hideLiv = () => $('#hideliving').checked;
$('#hideliving').onchange = () => { worker && worker.postMessage({ cmd: 'living', hide: hideLiv() }); };
function done(m) {
  const stale = !m.build || m.build.pipeline !== BUILD || m.build.model !== BUILD; $('#stale').hidden = !stale;
  window.RR = { tree: m.tree, atlas: m.atlas };   // what viewer.html reads from its parent (window.parent.RR)
  anc = m.anc || null; ancStatus(); mhFile = m.mh || null; applyTreeLink();
  show('work'); chips(m); mountViewer();
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
  f.id = 'viewer'; f.title = old.title; f.src = 'viewer.html?v=' + STAMP + '&shell=1' + h; old.replaceWith(f); f.onload = pushMh;   // shell=1: Orphans is not drawn here (it is in the Tree Canvas's Fix list), so the viewer drops its in-page tab
}
function pushMh() { try { $('#viewer').contentWindow.postMessage({ mh: mhc && mhc.site ? { site: mhc.site, tree: mhc.tree, slug: mhc.treeSlug } : null }, '*'); } catch (e) { /* not loaded yet */ } }

/* The viewer can still send us two things from places that moved. «Copy» on the Atlas map copies a place text. «Fix this text» (it opened Places to review) now copies the text too and
   says where Places went. A tile or link inside the viewer that opens its Orphans view is sent straight back to the view before it, with the same pointer. Only messages from our own viewer are heard. */
function hint(t) { const s = $('#rrhint'); if (s) s.textContent = t; }
window.addEventListener('message', e => {
  const v = $('#viewer'); if (!v || e.source !== v.contentWindow || !e.data) return;
  if (e.data.type === 'ra-roots-view') {
    if (e.data.view === 'orphans') { try { v.contentWindow.postMessage({ raView: 'tree' }, '*'); } catch (x) { /* gone */ } hint('Orphans are in the Tree Canvas now, on its Fix list.'); }
    return;
  }
  if (typeof e.data.fixplace === 'string') { try { navigator.clipboard.writeText(e.data.fixplace); } catch (x) { /* clipboard refused */ } hint('Copied. Places to review is in the Tree Canvas now: open its Fix list, then Places, and search for the text.'); }
  else if (typeof e.data.copytxt === 'string') { try { navigator.clipboard.writeText(e.data.copytxt); } catch (x) { /* clipboard refused */ } }
});

/* ---------- the file ---------- */
$('#again').onclick = () => { document.body.classList.remove('wide'); if (worker) worker.terminate(); worker = null; curBytes = null; window.RR = null; hint(''); show('start'); refreshRecent(); };

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

/* ---------- links back to MyHeritage ---------- */
let mhc = fromHash(location.hash), mhRemembered = false, mhFile = null;
{ const kept = loadLink(), c = kept && parseLink(kept);                       // the last link pasted on this device, unless the address already carries one
  if (c) { $('#mhin').value = kept; if (!mhc) { mhc = c; mhRemembered = true; history.replaceState(null, '', toHash(c)); } } }
/* the Ancestry tree an Ancestry export came from: its number is in the file's header. The site chosen here is the one the Tree Canvas uses for its Ancestry links (the same stored choice). */
let anc = null, ancSite = loadSite();
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
function ancStatus() { $('#ancstat').textContent = anc ? 'This is an Ancestry export (tree ' + anc.tree + '). The Tree Canvas makes a link to each person in that tree on ancestry.' + ancSite + ', read from the file itself. Nothing is sent.' : 'Not an Ancestry export (or no tree number in its header), so no Ancestry links are made.'; }
function refreshMh() { pushMh(); }
if (mhc) mhStatus();
function setSite(v) { ancSite = v; saveSite(v); $('#mhanc').value = v; ancStatus(); }
$('#mhanc').value = ancSite; $('#mhanc').onchange = () => setSite($('#mhanc').value);

/* ---------- files kept on this device (opt-in, see recent.js) ---------- */
const mb = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
async function refreshRecent() {
  const items = await recent.list(), box = $('#recent'), ul = $('#recentlist'); ul.textContent = ''; box.hidden = !items.length;
  for (const f of items) {
    const li = el('li', 'rf'), tree = el('button', 'btn', 'Open'), when = new Date(f.saved).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    tree.onclick = async () => { const r = await recent.recall(f.id); if (r) start(r.bytes, r.name); else refreshRecent(); };
    tree.title = 'Open this file on its tree views';
    li.append(el('b', 'rn', f.name), el('span', 'muted', mb(f.size) + ' · kept ' + when), tree, forgetBtn(f.id));
    ul.append(li);
  }
}
/* an icon-only button: always has a title and an aria-label, so a screen reader and a hover both say what it does */
function forgetBtn(id) {
  const b = el('button', 'ib'); b.type = 'button'; b.title = 'Forget this file (removes it from this browser)'; b.setAttribute('aria-label', b.title);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6'); svg.append(path); b.append(svg);
  b.onclick = async () => { await recent.forget(id); refreshRecent(); }; return b;
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
