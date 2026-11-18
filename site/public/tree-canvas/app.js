/* The page around the standalone Tree Canvas. It owns the GEDCOM reader (the roots page's own worker, so the tree is read exactly as Roots & Routes
   reads it) and nothing else: the canvas, in the iframe, draws everything and tells this page when its owner opens a file or ticks "Hide living
   people". The tree goes to the canvas in memory (window.RR, which canvas.html reads from its parent); nothing is sent anywhere and the only thing kept on the device is, if the visitor pastes it, the tree's MyHeritage link (as on /roots/)
   but the static Atlas files the reader fetches for the places the tree names (the same files, and the same note about the server log, as /roots/). */
import { makeSample } from '/roots/js/sample.js';
import { issuesByPerson } from '/roots/js/checklist.js';
import { parseLink, profileUrl, treeUrl } from '/roots/js/myheritage.js';
import { personUrl } from '/roots/js/ancestry.js';
import { loadTrees, saveTreeLink, loadSite, saveSite } from '/roots/js/remember.js';
import { parseLink as parseFileLink, fetchBytes, fileNameOf } from '/roots/js/openlink.js';   // (parseLink above is the MyHeritage one)

const $ = s => document.querySelector(s);
const base = new URL('/roots/', location.href).href;   // the reader fetches its place files relative to this, as it does on /roots/
const STAMP = Date.now();                              // a fresh canvas each time the page is opened, never an old cached copy
let worker = null, hide = false, example = false;

/* The Atlas's own name catalogues, for the canvas's search by any form of a name and its panel of name forms: two static files from this site, the same for
   everyone. Nothing about the tree is sent. Fetched once, when the canvas first asks. */
let namesP = null;
const loadNames = () => namesP || (namesP = Promise.all(['/given-names.json', '/surname-families.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); }))).then(([gn, sn]) => ({ gn, sn })).catch(e => { namesP = null; throw e; }));

/* Links back to the tree the file came from, for the canvas's \"Open on MyHeritage / Ancestry\" buttons and its Options box. The same rule as /roots/: the file's
   header names its tree, a link the visitor pasted for that tree before (kept on this device only) or one the Atlas already knows fills it in, otherwise ONE pasted
   profile or tree link gives the site code and tree number. An Ancestry export needs nothing pasted. Plain links; the page sends nothing. */
let mhc = null, mhFile = null, anc = null, mhText = '', mhNote = '', ancSite = loadSite();
const knownP = fetch(new URL('known-sites.json', base)).then(r => r.ok ? r.json() : {}).catch(() => ({}));
const tellCanvas = () => { const f = $('#cv'); if (f && f.contentWindow) f.contentWindow.postMessage({ tcLinks: 1 }, location.origin); };
const links = {
  get: () => ({ mh: !!mhc, mhFile: !!mhFile, text: mhText, note: mhNote, anc: !!anc, ancTree: anc ? anc.tree : '', ancSite }),
  url: (id, name) => { const p = profileUrl(mhc, id, name), t = treeUrl(mhc, id), a = personUrl(anc, id, ancSite); return p || a ? { mh: p, tree: t, anc: a } : null; },
  set(text) {
    mhText = String(text || ''); const c = parseLink(mhText), t = mhText.trim();
    if (!c) { mhc = null; mhNote = t ? 'That does not look like a MyHeritage profile or tree link.' : ''; if (!t && mhFile) saveTreeLink(mhFile.guid, ''); }
    else { mhc = c; mhNote = 'Links are on (tree ' + c.tree + '). Open one or two people to check they are the right ones. The link is remembered for this tree on this device only; nothing is sent.'; if (mhFile) saveTreeLink(mhFile.guid, t); }
    tellCanvas(); return mhNote;
  },
  setSite(v) { ancSite = v; saveSite(v); tellCanvas(); },
};
function applyTreeLink() {
  if (!mhFile) return; const guid = mhFile.guid, mine = loadTrees();
  knownP.then(K => {
    if (!mhFile || mhFile.guid !== guid) return;
    const own = guid in mine, kept = own ? mine[guid] : ((K[guid] && K[guid].link) || ''), c = kept && parseLink(kept);
    if (!c) return;
    mhText = kept; mhc = c; mhNote = own ? 'Remembered for this tree on this device, so you will not be asked again. Clear the box to forget it.' : 'This is a tree the Atlas already knows, so the link was filled in for you. Nothing to paste.';
    tellCanvas();
  });
}

function say(text, isError) { const m = $('#msg'); m.textContent = text; m.hidden = !text; m.classList.toggle('err', !!isError); }

function mount() {
  const old = $('#cv'), f = document.createElement('iframe');
  f.id = 'cv'; f.title = old.title;
  f.src = '/roots/canvas.html?sa=1&v=' + STAMP + (hide ? '&liv=1' : '') + (example ? '&ex=1' : '');
  f.hidden = false; old.replaceWith(f);
}

let curName = null, curHead = null, curVia = null;   // curVia: the site a file was fetched from, when it came from a link
/* A Roots & Routes tree.json is JSON; a GEDCOM never starts with a brace. Told apart by the first character, not the name, so a renamed file still opens. */
const isTreeJson = bytes => { try { return /^\uFEFF?\s*\{/.test(new TextDecoder('utf-8').decode(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)))); } catch (e) { return false; } };
function start(bytes, name, via) {
  const json = isTreeJson(bytes);
  curName = name || null; curVia = via || null; curHead = name && !json ? headInfo(bytes) : (json ? { from: 'tree.json', tree: '' } : null);
  if (curVia && curHead) curHead = { ...curHead, from: curVia };   // the last-used list says where a file came from
  $('#start').hidden = true; say('Reading your file…');
  if (worker) worker.terminate();
  worker = new Worker('/roots/js/worker.js', { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress') say(m.msg + '…');
    else if (m.type === 'checklist') {
      if (!window.RR) return;
      try { window.RR.fix = issuesByPerson(m); } catch (e) { window.RR.fix = null; }
      const f = $('#cv'); if (f && f.contentWindow) f.contentWindow.postMessage({ tcFix: 1 }, location.origin);
    }
    else if (m.type === 'error') { say((json ? 'That file could not be opened as a tree.json. ' : 'Sorry, that file could not be read: ') + m.msg, true); if (!window.RR) showStart(); }
    else if (m.type === 'done') {
      if (m.first && hide && m.kind !== 'tree') { say('Hiding living people…'); worker.postMessage({ cmd: 'living', hide: true }); return; }   // keep the choice for the next file (a tree.json already shows its living people by name and family only)
      const prevMh = mhFile; mhFile = m.mh || null; anc = m.anc || null;
      if (!prevMh || !mhFile || prevMh.guid !== mhFile.guid) { mhc = null; mhText = ''; mhNote = ''; applyTreeLink(); }   // a different tree: start from what is remembered or known for it
      window.RR = { tree: m.tree, atlas: m.atlas, loadNames, links };
      if (curName && m.report && m.report.people) recentMeta(curName, { people: m.report.people.individuals, from: curHead ? curHead.from : '', tree: curHead ? curHead.tree : '' });
      say(''); mount();
      /* where it came from (a link) and what was left out of a tree.json, in the visitor's words; it clears itself, the canvas keeps the screen */
      const said = [curVia ? 'Loaded from ' + curVia + '. Read in this browser; nothing from it was sent anywhere.' : '', m.kind === 'tree' && m.say && m.say.length ? 'Opened as a tree.json: ' + m.say.join('; ') + '.' : ''].filter(Boolean).join(' ');
      if (said) { say(said); setTimeout(() => say(''), curVia ? 14000 : 9000); }
      if (m.kind !== 'tree') worker.postMessage({ cmd: 'checklist', living: !hide, ancestry: 'com' });   // the fix list, for the "!" marks; it follows a moment after the canvas is drawn (a tree.json has no GEDCOM to check)
    }
  };
  worker.onerror = e => { say('The reader crashed: ' + (e.message || 'unknown error'), true); if (!window.RR) showStart(); };
  worker.postMessage({ cmd: json ? 'loadTree' : 'load', bytes, base }, [bytes]);
}

/* ---- an archive's own tree. Coming from an archive (its header icon, which carries ?archive=<key>, or the page it came from), or choosing one below, the canvas draws
   THAT archive's published tree directly: the same roots page the archive serves, whose tree and Atlas extract are read in this browser. Nothing is sent but a plain
   request for that public page; the archive already leaves its living people out, and the canvas applies its own second lock as well. ---- */
const ARCH = {
  defranceski: { name: 'Defranceski', host: 'archive.defranceski.com', color: '#D2493A', graded: true, lines: true },
  booyzen: { name: 'Booyzen', host: 'booyzen.defranceski.com', color: '#4E9A3E', graded: true },
  luwinski: { name: 'Luwinski', host: 'luwinski.defranceski.com', color: '#3A74C9', graded: false },
  lerena: { name: 'Lerena', host: 'lerena.defranceski.com', color: '#8A5CC2', graded: false },
  falco: { name: 'Falco', host: 'falco.defranceski.com', color: '#D39A12', graded: true },
  blazevic: { name: 'Blažević', host: 'blazevic.defranceski.com', color: '#1E9C97', graded: false },
  darcy: { name: "D'Arcy", host: 'darcy.defranceski.com', color: '#C9508F', graded: false },
  mazza: { name: 'Mazza', host: 'mazza.defranceski.com', color: '#8E7B5E', graded: false },
};
/* the JSON value that follows `marker` in the page's script: scan to its matching brace, minding strings */
function jsonAfter(html, marker) {
  const i = html.indexOf(marker); if (i < 0) throw new Error('not found');
  const s = i + marker.length; let depth = 0, str = false, esc = false;
  for (let j = s; j < html.length; j++) {
    const c = html[j];
    if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === '{' || c === '[') depth++; else if (c === '}' || c === ']') { depth--; if (depth === 0) return JSON.parse(html.slice(s, j + 1)); }
  }
  throw new Error('unterminated');
}
/* an archive's published roots page: its tree and its Atlas extract, read here (a plain request for a public page; no credentials, no referrer) */
async function fetchArchive(key) {
  const a = ARCH[key];
  const r = await fetch('https://' + a.host + '/roots/', { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  return { tree: jsonAfter(html, 'const TREE='), atlas: jsonAfter(html, 'const ATLAS='), archive: { key, name: a.name, host: a.host, color: a.color, graded: a.graded }, lines: a.lines ? await fetchLines(a) : null };
}
/* an archive's drawing of its research lines (/roots/lines.json), if it publishes one: read here and handed to the canvas in memory, where it is cleaned before use. It is optional,
   so a missing or malformed file is simply no Lines view, never an error. */
async function fetchLines(a) {
  try {
    const r = await fetch('https://' + a.host + '/roots/lines.json', { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
    const j = await r.json();
    return j && j.kind === 'lines' && j.v === 1 && Array.isArray(j.lanes) ? j : null;
  } catch (e) { return null; }
}
async function openArchive(key) {
  const a = ARCH[key]; if (!a) return;
  curName = null; curHead = null; example = false;
  $('#start').hidden = true; say('Opening the ' + a.name + ' archive…');
  try {
    const f = await fetchArchive(key);
    mhFile = null; mhc = null; anc = null;
    window.RR = { tree: f.tree, atlas: f.atlas, loadNames, links, archive: f.archive };
    if (f.lines) { window.RR.lines = f.lines; window.RR.linesArch = key; }
    /* ?p=<slug>: an archive's link to one person's page; the canvas puts that person on and selects them (only a plain slug is passed on) */
    { const pp = new URLSearchParams(location.search).get('p'); if (pp && /^[a-z0-9-]{1,120}$/.test(pp)) window.RR.carryPerson = pp; }
    say(''); mount();
  } catch (err) { say('The ' + a.name + ' archive could not be opened just now (' + (err && err.message || 'error') + '). You can open a GEDCOM instead.', true); showStart(); }
}

/* Compare: the visitor's file beside an archive's tree. The canvas asks (tcCompare: {key, mark}); the archive is read here and the canvas is drawn again with both, keeping the
   marked person. key null stops comparing. The file never leaves the browser. */
async function compareWith(key, mark) {
  if (!window.RR) return;
  if (key && !ARCH[key]) return;
  if (!key) { delete window.RR.compare; window.RR.carryMark = mark || null; window.RR.carryTab = 'compare'; mount(); return; }
  say('Reading the ' + ARCH[key].name + ' archive…');
  try {
    const f = await fetchArchive(key);
    window.RR.compare = { tree: f.tree, atlas: f.atlas, archive: f.archive }; window.RR.carryMark = mark || null; window.RR.carryTab = 'compare';
    say(''); mount();
  } catch (err) { say('The ' + ARCH[key].name + ' archive could not be read just now (' + (err && err.message || 'error') + '). Your canvas is unchanged.', true); setTimeout(() => say(''), 6000); }
}
addEventListener('message', e => {
  if (e.origin !== location.origin) return;   // only the canvas, which is this site's own page
  const d = e.data || {};
  if (d.tcHome) { $('#cv').hidden = true; showStart(); return; }   // the canvas's folder button: back to the opening screen (the canvas keeps its own state)
  if (d.tcCompare !== undefined && !d.tcOpen) { compareWith(d.tcCompare && d.tcCompare.key, d.tcCompare && d.tcCompare.mark); return; }
  if (d.tcOpen && d.tcOpen.bytes instanceof ArrayBuffer) { example = false; start(d.tcOpen.bytes, d.tcOpen.name); }
  else if (typeof d.tcLiving === 'boolean') {
    hide = d.tcLiving;
    if (worker) { say(hide ? 'Hiding living people…' : 'Showing everyone…'); worker.postMessage({ cmd: 'living', hide }); }
  }
});

/* ---- the page it opens on: nothing is read until the visitor chooses. Two buttons, and the files used before (kept in this browser's own storage by the canvas
   too: the same database, so "Last used" in the canvas menu and here are one list). Nothing is sent anywhere. ---- */
const RKEEP = 3;
const rdb = () => new Promise((ok, no) => { try { const r = indexedDB.open('tcRecent', 1); r.onupgradeneeded = () => { r.result.createObjectStore('m', { keyPath: 'name' }); r.result.createObjectStore('b'); }; r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } });
const rreq = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const rememberOn = () => { try { return localStorage.getItem('tcRemember') !== '0'; } catch (e) { return true; } };
const done = tx => new Promise(ok => { tx.oncomplete = ok; tx.onerror = ok; tx.onabort = ok; });
async function recentList() { try { const db = await rdb(), a = await rreq(db.transaction('m').objectStore('m').getAll()); db.close(); return a.sort((x, y) => y.when - x.when); } catch (e) { return []; } }
async function recentSave(name, bytes) {
  if (!rememberOn()) return;
  try {
    const db = await rdb(), tx = db.transaction(['m', 'b'], 'readwrite'), mm = tx.objectStore('m'), bb = tx.objectStore('b');
    const old = await rreq(mm.get(name)); mm.put({ ...(old || {}), name, size: bytes.byteLength, when: Date.now() }); bb.put(bytes, name);
    const all = (await rreq(mm.getAll())).sort((x, y) => y.when - x.when); all.slice(RKEEP).forEach(o => { mm.delete(o.name); bb.delete(o.name); });
    await done(tx); db.close();
  } catch (e) { /* storage full or blocked: the file still opens, it just is not kept */ }
}
/* what the page learns about a kept file once it has read it: how many people, where it came from (the header's software and tree name) and the visitor's own note */
async function recentMeta(name, patch) {
  if (!name || !rememberOn()) return;
  try { const db = await rdb(), tx = db.transaction('m', 'readwrite'), mm = tx.objectStore('m'), old = await rreq(mm.get(name)); if (old) mm.put({ ...old, ...patch }); await done(tx); db.close(); } catch (e) { /* ignore */ }
}
/* the file's header, read from its first bytes: the program that wrote it (MyHeritage, Ancestry ...) and, where the header names it, the tree */
function headInfo(bytes) {
  try {
    const t = new TextDecoder('utf-8').decode(new Uint8Array(bytes, 0, Math.min(8192, bytes.byteLength))).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    let inHead = false, from = '', tree = '', lastSour = false;
    for (const ln of t) {
      const m = /^(\d+)\s+(\S+)\s*(.*)$/.exec(ln); if (!m) continue;
      if (m[1] === '0') { if (m[2] === 'HEAD') { inHead = true; continue; } if (inHead) break; }
      if (!inHead) continue;
      if (m[1] === '1') lastSour = m[2] === 'SOUR';
      if (m[1] === '1' && m[2] === 'SOUR') from = m[3].trim();
      else if (lastSour && m[1] === '2' && m[2] === 'NAME' && m[3].trim()) from = m[3].trim();
      else if (m[2] === '_TREE' && m[3].trim()) tree = m[3].trim();
    }
    from = from.replace(/\b(family tree builder|family trees?|member trees?|online)\b/ig, '').replace(/\s{2,}/g, ' ').replace(/[.\s]+$/, '').trim();
    return { from: from.slice(0, 40), tree: tree.slice(0, 60) };
  } catch (e) { return { from: '', tree: '' }; }
}
async function recentForget(name) {
  try { const db = await rdb(), tx = db.transaction(['m', 'b'], 'readwrite'); if (name) { tx.objectStore('m').delete(name); tx.objectStore('b').delete(name); } else { tx.objectStore('m').clear(); tx.objectStore('b').clear(); } await done(tx); db.close(); } catch (e) { /* ignore */ }
}
const fmtBytes = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
const fmtWhen = t => { const d = new Date(t), same = d.toDateString() === new Date().toDateString(); return same ? 'today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
async function showStart() {
  say(''); $('#start').hidden = false;
  const rec = rememberOn() ? await recentList() : [], ul = $('#stList'); ul.textContent = '';
  $('#stRecent').hidden = !rec.length;
  for (const r of rec) {
    const li = document.createElement('li'), b = document.createElement('button'), x = document.createElement('button'), n = document.createElement('b'), sm = document.createElement('small');
    b.type = x.type = 'button'; b.className = 'recopen'; x.className = 'recx'; x.textContent = '×'; x.title = 'Forget ' + r.name; x.setAttribute('aria-label', 'Forget ' + r.name);
    n.textContent = r.name; sm.textContent = [r.people ? r.people.toLocaleString('en') + (r.people === 1 ? ' person' : ' people') : '', r.tree || (r.from ? 'from ' + r.from : ''), fmtBytes(r.size || 0), fmtWhen(r.when)].filter(Boolean).join(' · '); b.append(n, sm); b.title = 'Open ' + r.name + ' again';
    if (r.note) { const nt = document.createElement('em'); nt.className = 'recnote'; nt.textContent = r.note; b.append(nt); }
    const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'recx recedit'; ed.textContent = '✎'; ed.title = r.note ? 'Edit the note' : 'Add a note'; ed.setAttribute('aria-label', ed.title + ' for ' + r.name);
    ed.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'recin'; inp.maxLength = 80; inp.value = r.note || ''; inp.placeholder = 'A note, e.g. Mum\'s side, from MyHeritage'; inp.setAttribute('aria-label', 'Note for ' + r.name);
      let fin = false; const save = async keep => { if (fin) return; fin = true; if (keep) await recentMeta(r.name, { note: inp.value.trim() }); showStart(); };
      inp.onkeydown = e => { if (e.key === 'Enter') save(true); else if (e.key === 'Escape') save(false); };
      inp.onblur = () => save(true);
      b.replaceWith(inp); inp.focus(); inp.select();
    };
    b.onclick = async () => {
      try { const db = await rdb(), bytes = await rreq(db.transaction('b').objectStore('b').get(r.name)); db.close(); if (!bytes) throw 0; example = false; recentSave(r.name, bytes.slice(0)); start(bytes, r.name); }
      catch (e) { say('That file is no longer kept here. Open it again from your device.', true); await recentForget(r.name); showStart(); }
    };
    x.onclick = async () => { await recentForget(r.name); showStart(); };
    li.append(b, ed, x); ul.append(li);
  }
}
/* ---- a file from a link. The visitor's own browser asks the other site for the file (nothing goes through this site), after the address has been checked
   (openlink.js: https only, a public name, no sign-in details). The site it came from is shown while the canvas opens. A link on the page's own address
   (/tree-canvas/?url=…) only fills the box: nothing is fetched until the visitor presses Open link. ---- */
const linkMsg = (t, err) => { const m = $('#stLinkMsg'); m.textContent = t || ''; m.hidden = !t; m.classList.toggle('err', !!err); };
async function openLink(text, own) {   // own: the page's own example files, allowed by origin
  const opt = own ? { origin: location.origin } : {}, p = parseFileLink(text, opt);
  if (!p.ok) return linkMsg(p.error, true);
  const go = $('#stGo'); go.disabled = true; go.textContent = 'Opening…'; linkMsg('Asking ' + p.host + ' for the file…');
  try {
    const r = await fetchBytes(p.url, opt);
    if (!r.ok) return linkMsg(r.error, true);
    example = false; linkMsg('');
    const name = fileNameOf(p.url, p.host), via = r.finalHost && r.finalHost !== r.host ? r.host + ' (via ' + r.finalHost + ')' : r.host;
    recentSave(name, r.bytes.slice(0)); start(r.bytes, name, via);
  } catch (e) { linkMsg('That link could not be opened: ' + String(e && e.message || e).slice(0, 160), true); }
  finally { go.disabled = false; go.textContent = 'Open link'; }
}
$('#stGo').onclick = () => openLink($('#stUrl').value);
document.querySelectorAll('#stLink [data-ex]').forEach(b => { b.onclick = () => openLink(new URL(b.dataset.ex, location.origin).href, true); });
$('#stUrl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); openLink($('#stUrl').value); } };
$('#stUrl').oninput = () => { const p = $('#stUrl').value.trim() ? parseFileLink($('#stUrl').value) : null; linkMsg(p && p.ok && p.note ? p.note : '', false); };
$('#stOpen').onclick = () => $('#stFile').click();
$('#stFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const bytes = await f.arrayBuffer(); example = false; recentSave(f.name, bytes.slice(0)); start(bytes, f.name); } catch (err) { say('That file could not be read.', true); }
};
$('#stDemo').onclick = () => { example = true; start(new TextEncoder().encode(makeSample()).buffer); };   // the invented family is only built when asked for
document.querySelectorAll('#stArchBtns button').forEach(b => { b.onclick = () => openArchive(b.dataset.k); });
$('#stForget').onclick = async () => { await recentForget(); showStart(); };
for (const ev of ['dragenter', 'dragover']) addEventListener(ev, e => { if (!$('#start').hidden) e.preventDefault(); });
addEventListener('drop', e => { if ($('#start').hidden) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) f.arrayBuffer().then(b => { example = false; recentSave(f.name, b.slice(0)); start(b, f.name); }); });
{
  /* from an archive: its icon sends ?archive=<key>; failing that, the page the visitor came from (some browsers send only its origin, which is enough) */
  let want = new URLSearchParams(location.search).get('archive');
  if (!ARCH[want]) { want = null; try { const h = new URL(document.referrer).hostname; want = Object.keys(ARCH).find(k => ARCH[k].host === h) || null; } catch (e) { /* no referrer */ } }
  const asked = new URLSearchParams(location.search).get('url');
  if (asked) {
    showStart(); const box = $('#stUrl'); box.value = asked.slice(0, 2000); const p = parseFileLink(box.value);
    linkMsg(p.ok ? 'This page was opened with a link to a file on ' + p.host + '. Nothing has been fetched yet: press Open link if you want it.' : p.error, !p.ok);
    $('#stGo').focus();
  } else if (want) openArchive(want); else showStart();
}
