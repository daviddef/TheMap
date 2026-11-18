/* The page around the standalone Tree Canvas. It owns the GEDCOM reader (the roots page's own worker, so the tree is read exactly as Roots & Routes
   reads it) and nothing else: the canvas, in the iframe, draws everything and tells this page when its owner opens a file or ticks "Hide living
   people". The tree goes to the canvas in memory (window.RR, which canvas.html reads from its parent); nothing is sent anywhere and the only thing kept on the device is, if the visitor pastes it, the tree's MyHeritage link (as on /roots/)
   but the static Atlas files the reader fetches for the places the tree names (the same files, and the same note about the server log, as /roots/). */
import { makeSample } from '/roots/js/sample.js';
import { issuesByPerson } from '/roots/js/checklist.js';
import { parseLink, profileUrl, treeUrl } from '/roots/js/myheritage.js';
import { personUrl } from '/roots/js/ancestry.js';
import { loadTrees, saveTreeLink, loadSite, saveSite } from '/roots/js/remember.js';
import { parseLink as parseFileLink, fetchBytes, fileNameOf } from '/roots/js/openlink.js';
import * as CS from '/tree-canvas/compare-set.js';   // reading several archives for the paired Compare view
import * as W from '/tree-canvas/work.js';   // (parseLink above is the MyHeritage one)
import { reportInto, el, n0 } from '/roots/js/report-view.js';   // the import report, drawn by the same code as /roots/
import { treeMetrics, metricTiles } from '/roots/js/metrics.js';   // the five counts of the tree views, worked out here
import * as ST from '/tree-canvas/settings.js';   // the Settings drawer's choices, kept on this device

const $ = s => document.querySelector(s);
const base = new URL('/roots/', location.href).href;   // the reader fetches its place files relative to this, as it does on /roots/
const STAMP = Date.now();                              // a fresh canvas each time the page is opened, never an old cached copy
let worker = null, hide = ST.effective().living, example = false;   // hide: the living filter, from what this device chose (today's default, nothing chosen, is to show them as the file gives them)
let lastM = null;   // the reader's last 'done' message (its report and timings), for the "Your file" page; null for an archive, which is published already read

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

/* ---- keeping the visitor's work. Per tree (the link it was opened from, the archive, or the file's name, size and people), the canvas's arrangement is kept in this
   browser (work.js says what, and why it holds no name) and, when the visitor has turned on the six words on the Connection & Backup page, the same records go into the
   encrypted copy that page keeps (public/js/research-file.js carries them; public/js/sync-auto.js saves them). The tree file itself is never in either. The canvas
   (in the iframe) hands its state to this page in memory; this page keeps it, and hands the saved arrangement back when the same tree is opened again. ---- */
const BACKUP = '/backup/#canvas';
let cur = null, wt = 0, pt = 0, noteT = 0, syncFailed = false;      // cur: {key, src, label, loadedUpd, plain, dirty, saw, paused, cmp}
const syncState = () => { let st = null; try { st = JSON.parse(localStorage.getItem('ra-sync-v1')); } catch (e) { /* none */ } let c = null; try { c = localStorage.getItem('ra-canvas-sync'); } catch (e) { /* none */ }
  return { on: !!(st && st.phrase), saved: st && st.saved || null, failed: syncFailed, canvas: c }; };
const keepStatus = () => W.keepStatus(syncState(), cur ? W.get(cur.key) : null);
function setCur(src, label) {
  flushWork();
  const key = W.treeKey(src);
  cur = key ? { key, src: W.cleanSrc(src), label: label || '', loadedUpd: (W.get(key) || {}).upd || '', plain: null, dirty: false, saw: false, paused: false, cmp: false } : null;
}
/* what the canvas is handed when it is drawn: this tree's saved arrangement (if any) and a few words for its menu. The Compare view is not kept. */
function attachKeep() {
  if (!window.RR) return;
  const c = cur && !cur.cmp ? cur : null, rec = c ? W.get(c.key) : null, key = c ? c.key : null;
  window.RR.work = rec ? rec.w : null;
  window.RR.keep = c ? { status: keepStatus, unpack: (known, bridges) => rec ? W.unpack(rec.w, key, known, bridges) : null, href: BACKUP } : null;
  /* Compare in pairs: the visitor's saved pairing choices for this file (hashes), turned back into person keys by the canvas once it knows who is in the comparison */
  window.RR.pairKeep = cur ? { unpack: known => { const r = W.get(cur.key); return r && r.w.pr ? W.unpackPairing(r.w.pr, cur.key, known) : null; } } : null;
  if (c) { c.saw = false; c.dirty = false; }
}
function onWork(plain) {
  if (cur && cur.cmp && plain && plain.pairing !== undefined) { cur.pairing = plain.pairing; clearTimeout(pt); pt = setTimeout(flushPairing, 1000); return; }   // in Compare only the pairing choices are kept, never the comparison canvas
  if (!cur || cur.cmp || !plain || !Array.isArray(plain.cards)) return;
  cur.plain = plain; cur.dirty = true; if (plain.cards.length) cur.saw = true;
  if (cur.paused) return;
  clearTimeout(wt); wt = setTimeout(flushWork, 1000);
}
/* the visitor's pairing choices (Compare in pairs) go into this tree's record beside its canvas arrangement; the arrangement itself is left as it was */
function flushPairing() {
  clearTimeout(pt); const c = cur;
  if (!c || !c.pairing) return;
  const p = c.pairing; c.pairing = null;
  if (W.savePairing(c.src, c.label, p)) { document.dispatchEvent(new CustomEvent('ra-progress-changed')); renderKeep(); }
  else note('This browser would not keep your pairing choices (its storage is blocked or full).', []);
}
function flushWork() {
  flushPairing(); clearTimeout(wt); const c = cur;
  if (!c || !c.dirty || c.paused || !c.plain) return;
  c.dirty = false;
  if (!c.plain.cards.length) { if (c.saw) { const old = W.get(c.key); if (old && old.w.pr) { const r2 = JSON.parse(JSON.stringify(old)); r2.w.c = []; r2.n = 0; r2.upd = new Date().toISOString(); W.put(r2); } else W.remove(c.key); c.loadedUpd = ''; c.saw = false; } }   // a saved pairing outlives a cleared canvas      // cleared on purpose: the saved one goes too (an empty canvas at start-up changes nothing)
  else {
    const rec = W.makeRecord(c.src, c.label, c.plain), old = rec && W.get(rec.k);
    if (rec && old && old.w.pr) rec.w.pr = old.w.pr;   // the canvas never carries the pairing choices; they stay as they were
    if (old && old.label === rec.label && JSON.stringify(old.w) === JSON.stringify(rec.w)) { c.loadedUpd = old.upd; return; }   // opening a tree and changing nothing is not a new save
    if (rec && W.put(rec)) c.loadedUpd = rec.upd; else { note('This browser would not keep your canvas (its storage is blocked or full).', []); return; }
  }
  document.dispatchEvent(new CustomEvent('ra-progress-changed'));   // sync-auto.js: save online about 15 seconds after the last change
  renderKeep();
}
/* the line at the bottom of the page: a sentence and up to two buttons */
function note(text, actions, ms) {
  const n = $('#keepNote'); if (!n) return; clearTimeout(noteT);
  $('#knText').textContent = text; const box = $('#knBtns'); box.textContent = '';
  for (const a of actions || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = a.label; b.onclick = () => { n.hidden = true; a.fn(); }; box.append(b); }
  n.hidden = !text; if (ms) noteT = setTimeout(() => { n.hidden = true; }, ms);
}
$('#knX').onclick = () => { $('#keepNote').hidden = true; };
function startFresh() {
  if (!cur) return;
  W.remove(cur.key); cur.loadedUpd = ''; cur.saw = false; cur.dirty = false; cur.plain = null; attachKeep();
  if ($('#cv') && !$('#cv').hidden) mount();
  note('Started fresh. The saved canvas for this tree was removed' + (syncState().on ? ', and from your six-word copy' : '') + '.', [], 9000);
  document.dispatchEvent(new CustomEvent('ra-progress-changed')); renderKeep();
}
function onRestored(r) {
  if (!cur || cur.cmp || !r || !(r.of > 0)) return;
  if (r.n > 0) { cur.saw = true; note('Your saved canvas came back: ' + r.n.toLocaleString('en') + (r.n === 1 ? ' person' : ' people') + ', where you left them.', [{ label: 'Start fresh', fn: startFresh }], 20000); }
  else note('You have a saved canvas for this tree, but none of its people are in this file, so nothing was brought back. It is kept; nothing was changed.', [], 14000);
}
/* another device (or another tab) saved a newer canvas for this tree: never replace it with an older one without saying so */
function checkNewer() {
  if (!cur || cur.cmp || cur.paused) return;
  const rec = W.get(cur.key); if (!rec || !(rec.upd > (cur.loadedUpd || ''))) return;
  cur.paused = true;
  note('A newer canvas for this tree was saved elsewhere (' + W.agoText(rec.upd) + '). Your changes here are held until you choose.', [
    { label: 'Use the newer one', fn: () => { cur.paused = false; cur.loadedUpd = rec.upd; cur.dirty = false; attachKeep(); mount(); } },
    { label: 'Keep mine', fn: () => { cur.paused = false; cur.dirty = !!cur.plain; flushWork(); } }]);
}
function renderKeep() {
  const st = W.keepStatus(syncState(), null), t = $('#stKeepSt'); if (t) t.textContent = st.text;
  const b = $('#stKeepBtn'); if (b) b.classList.toggle('on', st.on && !syncFailed);
  const t2 = $('#yfKeepSt'); if (t2) t2.textContent = st.text;
  const b2 = $('#yfKeepBtn'); if (b2) b2.classList.toggle('on', st.on && !syncFailed);
  const f = $('#cv'); if (f && f.contentWindow && !f.hidden) f.contentWindow.postMessage({ tcKeep: 1 }, location.origin);
}
function savedWhere(r) { return r.src.t === 'link' ? 'from a link' : r.src.t === 'archive' ? 'an archive' : 'from a file on this device'; }
async function renderSaved() {
  const recs = W.list();
  let kept = []; try { kept = rememberOn() ? await recentList() : []; } catch (e) { kept = []; }
  /* one list, drawn twice: on the opening screen and on the "Your file" page */
  for (const [boxId, ulId] of [['stWork', 'stWorkList'], ['yfWork', 'yfWorkList']]) {
    const box = $('#' + boxId), ul = $('#' + ulId); if (!box || !ul) continue; ul.textContent = ''; box.hidden = !recs.length;
    for (const r of recs) {
      const li = document.createElement('li'), b = document.createElement('button'), n = document.createElement('b'), sm = document.createElement('small');
      b.type = 'button'; b.className = 'recopen'; n.textContent = r.label || 'A saved canvas';
      const onDevice = r.src.t === 'file' && !kept.some(k => k.name === r.src.ref);
      sm.textContent = [r.n ? r.n.toLocaleString('en') + (r.n === 1 ? ' person' : ' people') + ' on the canvas' : 'your pairing choices (no canvas)', savedWhere(r), 'saved ' + W.agoText(r.upd), onDevice ? 'open the same file to bring it back' : ''].filter(Boolean).join(' \u00b7 ');
      b.append(n, sm);
      b.onclick = async () => {
        if (r.src.t === 'archive') return openArchive(r.src.ref);
        if (r.src.t === 'link') { $('#stUrl').value = r.src.ref; return openLink(r.src.ref); }
        const k = kept.find(x => x.name === r.src.ref);
        if (k) { try { const db = await rdb(), bytes = await rreq(db.transaction('b').objectStore('b').get(k.name)); db.close(); if (bytes) { example = false; start(bytes, k.name); return; } } catch (e) { /* fall through to the picker */ } }
        closeYF(true); if ($('#start').hidden) showStart();
        linkMsg('Choose ' + r.src.ref + ' to bring this canvas back. It is matched by its name, size and number of people.'); $('#stFile').click();
      };
      li.append(b); ul.append(li);
    }
  }
  noFiles();
}
document.addEventListener('ra-canvas-changed', () => { checkNewer(); renderSaved(); renderKeep(); });
document.addEventListener('ra-sync-done', e => { syncFailed = !(e.detail && e.detail.ok); renderKeep(); });
addEventListener('storage', e => {
  if (e.key === 'ra-canvas-v1') { checkNewer(); renderSaved(); }
  if (e.key === ST.KEY) onSettingsChanged();   // another tab changed a setting
  if (e.key === 'ra-sync-v1') { document.dispatchEvent(new CustomEvent('ra-conn-refresh')); renderKeep(); }   // the six words were turned on (or off) in another tab: conn.js then loads the sync
});
addEventListener('pagehide', flushWork);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushWork(); });

function mount() {
  const old = $('#cv'), f = document.createElement('iframe');
  f.id = 'cv'; f.title = old.title;
  f.src = '/roots/canvas.html?sa=1&v=' + STAMP + (hide ? '&liv=1' : '') + (example ? '&ex=1' : '');
  f.hidden = false; old.replaceWith(f); if (!$('#yf').hidden || !$('#sg').hidden) f.inert = true;
}

let curName = null, curHead = null, curVia = null;   // curVia: the site a file was fetched from, when it came from a link
/* A Roots & Routes tree.json is JSON; a GEDCOM never starts with a brace. Told apart by the first character, not the name, so a renamed file still opens. */
const isTreeJson = bytes => { try { return /^\uFEFF?\s*\{/.test(new TextDecoder('utf-8').decode(new Uint8Array(bytes, 0, Math.min(64, bytes.byteLength)))); } catch (e) { return false; } };
let curLink = null, curSize = 0;   // the address a file was fetched from (if it was), and the file's size
function start(bytes, name, via, link) {
  closeYF(true); lastM = null;
  const json = isTreeJson(bytes);
  curName = name || null; curVia = via || null; curLink = link || null; curSize = bytes.byteLength; curHead = name && !json ? headInfo(bytes) : (json ? { from: 'tree.json', tree: '' } : null);
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
    else if (m.type === 'exported') exported(m);
    else if (m.type === 'error') {
      if (exporting) { exporting = false; $('#yfBusy').hidden = true; $('#yfGo').disabled = false; $('#yfSum').textContent = 'The file could not be made: ' + m.msg; $('#yfOut').hidden = false; $('#yfFile').hidden = $('#yfLog').hidden = true; return; }
      say((json ? 'That file could not be opened as a tree.json. ' : 'Sorry, that file could not be read: ') + m.msg, true); if (!window.RR) showStart();
    }
    else if (m.type === 'done') {
      if (m.first && hide && m.kind !== 'tree') { say('Hiding living people…'); worker.postMessage({ cmd: 'living', hide: true }); return; }   // keep the choice for the next file (a tree.json already shows its living people by name and family only)
      const prevMh = mhFile; mhFile = m.mh || null; anc = m.anc || null;
      if (!prevMh || !mhFile || prevMh.guid !== mhFile.guid) { mhc = null; mhText = ''; mhNote = ''; applyTreeLink(); }   // a different tree: start from what is remembered or known for it
      window.RR = { tree: m.tree, atlas: m.atlas, loadNames, links };
      lastM = m; if (!$('#yf').hidden) drawYF(); if (!$('#sg').hidden) drawSG(true);
      if (m.first || !cur) { const ppl = m.report && m.report.people && m.report.people.individuals | 0; setCur(example ? null : curLink ? { t: 'link', ref: curLink } : curName ? { t: 'file', ref: curName, size: curSize, people: ppl } : null, curLink ? W.linkLabel(curLink) : curName); }
      else flushWork();
      attachKeep();
      if (curName && m.report && m.report.people) recentMeta(curName, { people: m.report.people.individuals, from: curHead ? curHead.from : '', tree: curHead ? curHead.tree : '' });
      say('');
      { const pw = m.first ? pairsWanted() : null; if (pw) compareWith(pw.ar, null, { resume: true }).then(ok => { if (!ok) mount(); }); else mount(); }
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
async function fetchArchive(key, signal, o) {
  const a = ARCH[key];
  const r = await fetch('https://' + a.host + '/roots/', { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  return { tree: jsonAfter(html, 'const TREE='), atlas: jsonAfter(html, 'const ATLAS='), archive: { key, name: a.name, host: a.host, color: a.color, graded: a.graded }, lines: a.lines && !(o && o.lines === false) ? await fetchLines(a) : null };
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
  closeYF(true); lastM = null;
  curName = null; curHead = null; example = false;
  $('#start').hidden = true; say('Opening the ' + a.name + ' archive…');
  try {
    const f = await fetchArchive(key);
    mhFile = null; mhc = null; anc = null;
    window.RR = { tree: f.tree, atlas: f.atlas, loadNames, links, archive: f.archive };
    setCur({ t: 'archive', ref: key }, a.name + ' archive'); attachKeep();
    if (f.lines) { window.RR.lines = f.lines; window.RR.linesArch = key; }
    /* ?p=<slug>: an archive's link to one person's page; the canvas puts that person on and selects them (only a plain slug is passed on) */
    { const pp = new URLSearchParams(location.search).get('p'); if (pp && /^[a-z0-9-]{1,120}$/.test(pp)) window.RR.carryPerson = pp; }
    say(''); mount();
  } catch (err) { say('The ' + a.name + ' archive could not be opened just now (' + (err && err.message || 'error') + '). You can open a GEDCOM instead.', true); showStart(); }
}

/* Compare: the visitor's file beside one archive, several, or all eight, in pairs. The canvas asks (tcCompare: {keys, mark}); the archives are read here, a few at a time, each with its own
   time limit (compare-set.js), and the canvas is drawn again with the file and every archive that answered, keeping the marked person. One archive failing never stops the others: the
   canvas is told which could not be read, and says so. keys empty or null stops comparing. The file never leaves the browser; each archive is a plain request for its own public page. */
const archCache = new Map();     // archive key -> what was read, for this visit only (never stored)
async function compareWith(keys, mark, opt) {
  if (!window.RR) return false;
  opt = opt || {};
  const list = CS.cleanKeys(keys, Object.keys(ARCH));
  flushWork();
  if (!list.length) {
    if (cur && cur.cmp) { cur.cmp = false; if (cur.pairing) { cur.pairing.on = false; flushPairing(); } }
    delete window.RR.compare; delete window.RR.compares; delete window.RR.compareFailed; window.RR.carryMark = mark || null; window.RR.carryTab = 'compare'; attachKeep(); mount(); return true;
  }
  say('Reading the ' + (list.length === 1 ? ARCH[list[0]].name + ' archive' : list.length + ' archives') + '…');
  const res = await CS.loadSet(list, (k, signal) => fetchArchive(k, signal, { lines: false }), { cache: archCache, concurrency: 3, allowed: Object.keys(ARCH), onProgress: (d, n) => { if (n > 1) say('Reading the archives… ' + d + ' of ' + n); } });
  if (!res.ok.length) {
    say((list.length === 1 ? 'The ' + ARCH[list[0]].name + ' archive' : 'None of the archives') + ' could not be read just now (' + (res.failed[0] ? res.failed[0].why : 'error') + '). Your canvas is unchanged.', true); setTimeout(() => say(''), 7000); return false;
  }
  if (cur) cur.cmp = true;   // the comparison canvas is not kept; the file's own canvas comes back when it stops
  window.RR.compares = res.ok.map(r => r.value); delete window.RR.compare;
  window.RR.compareFailed = res.failed.map(f => ({ key: f.key, name: ARCH[f.key].name, why: f.why }));
  window.RR.carryMark = mark || null; window.RR.carryTab = 'compare';
  attachKeep(); say(''); mount();
  if (res.failed.length) note(res.failed.map(f => ARCH[f.key].name).join(', ') + (res.failed.length === 1 ? ' could not be read' : ' could not be read') + ' just now, so ' + (res.ok.length === 1 ? 'only ' + ARCH[res.ok[0].key].name + ' is' : 'the other ' + res.ok.length + ' are') + ' compared. Nothing is assumed about the ones that failed.', [], 16000);
  else if (opt.resume) note('Your comparison with ' + (res.ok.length === 1 ? ARCH[res.ok[0].key].name : res.ok.length + ' archives') + ' came back, with the choices you made.', [{ label: 'Stop comparing', fn: () => compareWith(null) }], 14000);
  window.__cmpTiming = { ms: res.ms, ok: res.ok.map(r => [r.key, r.ms, !!r.cached]), failed: res.failed.map(f => [f.key, f.why]) };
  return true;
}
/* a file opened again that was being compared: put the comparison back (the choices are the visitor's own, in this tree's record) */
function pairsWanted() { const r = cur ? W.get(cur.key) : null, p = r && r.w.pr; return p && p.on && p.ar && p.ar.length ? p : null; }
addEventListener('message', e => {
  if (e.origin !== location.origin) return;   // only the canvas, which is this site's own page
  const d = e.data || {};
  if (d.tcWork) { onWork(d.tcWork); return; }
  if (d.tcYourFile) { openYF(); return; }   // the canvas menu's "Your file"
  if (d.tcSettings) { openSG(); return; }   // the canvas menu's "Settings"
  if (d.tcRestored) { onRestored(d.tcRestored); return; }
  if (d.tcHome) { flushWork(); $('#cv').hidden = true; showStart(); return; }   // the canvas's folder button: back to the opening screen (the canvas keeps its own state)
  if (d.tcCompare !== undefined && !d.tcOpen) { const q = d.tcCompare || {}; compareWith(Array.isArray(q.keys) ? q.keys : q.key ? [q.key] : null, q.mark); return; }
  if (d.tcOpen && d.tcOpen.bytes instanceof ArrayBuffer) { example = false; start(d.tcOpen.bytes, d.tcOpen.name); }
  else if (typeof d.tcLiving === 'boolean') setLiving(d.tcLiving);   // the canvas's eye button: the same setting as in Settings
});

/* ---- "Your file": what was read, the numbers, what is kept on this device, and the export, in one place. It is a page over the canvas (the canvas stays loaded underneath, with its
   state), reached from the canvas menu and from the opening screen once a file is open. Nothing here is a second copy: the report is drawn by /roots/'s own report code, the five
   counts by metrics.js (tested against the tree views' own code), the two lists by the functions the opening screen uses, and the export is the reader's own. ---- */
let exporting = false, xurls = [];
const REVIEW_TIERS = ['ambiguous', 'review-skipped-part', 'review-other-country', 'not-found'];
function fileWhat() {
  const a = window.RR && window.RR.archive;
  if (a) return 'The ' + a.name + ' archive’s published tree, read in this browser from ' + a.host + '. The archive left its living people out.';
  if (example) return 'An invented family, drawn so you can see how the canvas works. Nobody in it is real.';
  return [curName || 'Your file', curLink ? 'opened from a link' + (curVia ? ' (' + curVia + ')' : '') : 'from a file on this device', curSize ? fmtBytes(curSize) : ''].filter(Boolean).join(' · ');
}
function drawYF() {
  const RR = window.RR; if (!RR) return;
  $('#yfWhat').textContent = fileWhat();
  /* the five counts */
  const M = treeMetrics(RR.tree, RR.atlas), box = $('#yfMetrics'); box.textContent = '';
  for (const [n, l, sm] of metricTiles(M)) { const d = el('div', 'yfm'); d.append(el('b', null, n0(n)), el('span', null, l), el('small', null, sm)); box.append(d); }
  const q = lastM && lastM.report && lastM.report.people;
  $('#yfMetNote').textContent = 'The same counts as the top of Tree views, counted from the people in this file.' + (q && (q.birthYearEstimated || q.deathYearEstimated) ? ' ' + n0(q.birthYearEstimated || 0) + ' birth years and ' + n0(q.deathYearEstimated || 0) + ' death years in it are the reader’s estimates (shown as “c.” in the views); nothing on this page treats an estimate as recorded.' : '');
  /* what was read */
  const rep = $('#yfReport'); rep.textContent = '';
  if (lastM && lastM.report) {
    reportInto(lastM, rep, { h: 'h3' });
    const need = (lastM.review || []).filter(i => REVIEW_TIERS.includes(i.tier)).length;
    if (need) { const p = el('p', 'small', n0(need) + ' place texts need a look: the Atlas could not settle them. Choosing a place for each is done on Places to review in Roots & Routes, where you open the same file again. '); const a = el('a', null, 'Open Roots & Routes'); a.href = '/roots/'; a.target = '_blank'; a.rel = 'noopener'; p.append(a); rep.append(p); }
  } else rep.append(el('p', 'small', RR.archive ? 'An archive publishes its tree already read, so there is no import report for it: its own site holds the sources and the method.' : 'There is no report for this file.'));
  /* the export: a GEDCOM read here has one; a tree.json and an archive's tree do not */
  const on = !!(lastM && lastM.kind !== 'tree' && worker), off = $('#yfExpOff');
  $('#yfExpOn').hidden = !on; off.hidden = on;
  if (!on) off.textContent = RR.archive ? 'Nothing to export: this is the archive’s published tree, and its own site holds the data.' : lastM && lastM.kind === 'tree' ? 'A tree.json is our own format and is not made again here: your file is unchanged, and the copy you opened is the one to keep.' : 'There is nothing to export for this file.';
  $('#yfOut').hidden = true; $('#yfBusy').hidden = true; $('#yfGo').disabled = false;
  renderKeep(); renderSaved(); drawLists();
}
function openYF() {
  if (!window.RR) return;
  drawYF();
  $('#yf').hidden = false; $('#cv').inert = true; $('#start').inert = true;
  $('#yfBack').textContent = $('#cv').hidden ? '← Back' : '← Back to the canvas';
  $('#yf').scrollTop = 0; $('#yfTitle').focus();
}
function closeYF(quiet) {
  const y = $('#yf'); if (!y || y.hidden) return;
  y.hidden = true; $('#cv').inert = false; $('#start').inert = false;
  if (!quiet) { const f = $('#cv'); if (f && !f.hidden) { try { f.focus(); } catch (e) { /* no focus to give */ } } else { const b = $('#stCurFile'); if (b && !b.closest('[hidden]')) b.focus(); } }
}
$('#yfBack').onclick = () => closeYF();
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#yf').hidden) closeYF(); });
$('#yfGo').onclick = () => {
  if (!worker) return; exporting = true; $('#yfBusy').hidden = false; $('#yfGo').disabled = true; $('#yfOut').hidden = true; $('#yfFile').hidden = $('#yfLog').hidden = false;
  worker.postMessage({ cmd: 'export', mode: document.querySelector('input[name=yfxm]:checked').value });
};
function exported(m) {
  exporting = false;
  for (const u of xurls) URL.revokeObjectURL(u); xurls = [];
  const f = URL.createObjectURL(new Blob([m.text], { type: 'text/plain;charset=utf-8' })), l = URL.createObjectURL(new Blob([m.logText], { type: 'text/plain;charset=utf-8' }));
  xurls.push(f, l);
  const a = $('#yfFile'), b = $('#yfLog'); a.href = f; a.download = 'tree-' + m.mode + '.ged'; b.href = l; b.download = 'tree-' + m.mode + '-change-log.txt'; a.hidden = b.hidden = false;
  const s = m.stats, bits = [];
  if (s.coords) bits.push(n0(s.coords) + ' places given coordinates'); if (s.applied) bits.push(n0(s.applied) + ' place texts replaced');
  if (s.redacted) bits.push(n0(s.redacted) + ' living people reduced to a bare record');
  if (s.textRedacted) bits.push(n0(s.textRedacted) + ' lines with a living name changed'); if (s.recoded) bits.push(n0(s.recoded) + ' lines re-read from Windows-1252 to UTF-8');
  $('#yfSum').textContent = m.changed ? 'Made: ' + n0(m.from) + ' lines became ' + n0(m.lines) + '. ' + bits.join('; ') + '.' : 'No changes: the file is the same as the one you gave us.';
  $('#yfOut').hidden = false; $('#yfBusy').hidden = true; $('#yfGo').disabled = false;
}
/* the opening screen, once a file is open: the way back to the canvas, and to this page */
function renderCurrent() {
  const c = $('#stCur'); if (!c) return; c.hidden = !window.RR;
  if (window.RR) $('#stCurWhat').textContent = fileWhat();
}
$('#stCurBack').onclick = () => { $('#start').hidden = true; const f = $('#cv'); if (f) { f.hidden = false; try { f.focus(); } catch (e) { /* ok */ } } };
$('#stCurFile').onclick = () => openYF();

/* ---- Settings: one drawer for what is chosen about the page and the device. Living people, the two links back to MyHeritage and Ancestry, the look of the canvas, and whether the last files are
   kept. Each is changed here and nowhere else (the canvas's own menu and Options only point here; its eye button is the same living setting, a quick switch). The choices are kept on this device
   (settings.js) and, when the six words are on, go into the same encrypted copy (research-file.js carries them: three short choices, no names, and a choice made on another device only fills
   one this device has not made). The two links are kept as before (remember.js) and were already in that copy. Nothing here is sent anywhere. ---- */
let sgFrom = null, sgWas = null, sgWriteFailed = false;
function storageOk() { try { localStorage.setItem('ra-probe', '1'); localStorage.removeItem('ra-probe'); return true; } catch (e) { return false; } }
/* the living filter, as one function for the eye button and the drawer: remember the choice, and apply it to the file that is open */
function setLiving(on) {
  hide = !!on; sgWriteFailed = !ST.write({ living: hide ? 1 : 0 }).ok;
  if (worker) { say(hide ? 'Hiding living people…' : 'Showing everyone…'); worker.postMessage({ cmd: 'living', hide }); }
  if (!$('#sg').hidden) drawSG();
}
function livingNote() {
  const a = window.RR && window.RR.archive;
  if (a) return 'The ' + a.name + ' archive’s tree is published with its living people already left out, so this changes nothing for it. It applies to the next GEDCOM you open.';
  if (!window.RR || !lastM) return 'It applies when you open a GEDCOM.';
  if (lastM.kind === 'tree') return 'This file is a tree.json, which already shows its living people by family and relationship only, so this changes nothing for it. It applies to the next GEDCOM you open.';
  const n = lastM.report && lastM.report.people && lastM.report.people.living | 0;
  return n ? n.toLocaleString('en') + (n === 1 ? ' person in this file is' : ' people in this file are') + ' possibly living (an estimate: see What “living” means here). ' + (hide ? 'They are drawn without a name.' : 'They are shown as the file gives them.') : 'Nobody in this file is possibly living.';
}
function drawSG(open) {
  const e = ST.effective(), L = links.get();
  $('#sgLiv').checked = hide; $('#sgLivNote').textContent = livingNote();
  const mh = $('#sgMh'), can = !!(window.RR && window.RR.links);
  mh.disabled = !can;
  if (open || mh !== document.activeElement) mh.value = can ? L.text : '';
  $('#sgMhSt').textContent = !can ? 'Open a file first: the link belongs to one tree, and is kept for it on this device.' : (L.note || (L.mh ? 'Links are on.' : 'Off: no link yet.'));
  const sel = $('#sgAnc'); if (open || sel !== document.activeElement) sel.value = L.ancSite;
  $('#sgAncSt').textContent = L.anc ? 'This file is an Ancestry export (tree ' + L.ancTree + '), so every person already links into it on ancestry.' + L.ancSite + '. Nothing is sent.' : 'Used for the “Open on Ancestry” links of an Ancestry export; not needed for other files.';
  const lk = $('#sgLook'); if (open || lk !== document.activeElement) lk.value = e.look;
  $('#sgRem').checked = e.remember;
  const ok = storageOk() && !sgWriteFailed;
  $('#sgStore').textContent = ok ? '' : 'This browser is not letting the page keep settings, so your choices last until you close the page.';
  $('#sgSync').textContent = syncState().on ? 'The six words are on, so these choices go into your encrypted copy: three short choices, no names and nothing from your tree. A choice already made on another device is never replaced.' : 'These choices stay in this browser. If you turn on the six words (Connection & Backup), they travel with your copy as three short choices, with no names and nothing from your tree.';
}
function openSG() {
  sgFrom = document.activeElement; sgWriteFailed = false;
  drawSG(true);
  sgWas = { cv: $('#cv').inert, yf: $('#yf').inert, start: $('#start').inert };
  $('#sg').hidden = false; $('#cv').inert = $('#yf').inert = $('#start').inert = true;
  $('#sgTitle').focus();
}
function closeSG() {
  const g = $('#sg'); if (g.hidden) return;
  g.hidden = true; const w = sgWas || {}; $('#cv').inert = !!w.cv; $('#yf').inert = !!w.yf; $('#start').inert = !!w.start;
  const back = sgFrom && sgFrom !== document.body && sgFrom.isConnected && !sgFrom.closest('[hidden]') ? sgFrom : null;
  if (back) { try { back.focus(); } catch (e) { /* nothing to give focus back to */ } }
  else { const f = $('#cv'); if (f && !f.hidden) { try { f.focus(); } catch (e) { /* ok */ } } }
  sgFrom = null;
}
$('#sgClose').onclick = $('#sgBack').onclick = () => closeSG();
$('#stSettings').onclick = $('#yfSettings').onclick = () => openSG();
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sg').hidden) { e.preventDefault(); e.stopPropagation(); closeSG(); } }, true);   // before the Your file page's own Escape
$('#sgLiv').onchange = e => setLiving(e.target.checked);
$('#sgMh').oninput = e => { $('#sgMhSt').textContent = links.set(e.target.value) || (e.target.value.trim() ? '' : 'Off: no link yet.'); };
$('#sgAnc').onchange = e => { links.setSite(e.target.value); drawSG(); };
$('#sgLook').onchange = e => {
  sgWriteFailed = !ST.write({ look: e.target.value }).ok;
  const f = $('#cv'); if (f && f.contentWindow && !f.hidden) f.contentWindow.postMessage({ tcLook: e.target.value }, location.origin);
  drawSG();
};
$('#sgRem').onchange = async e => {
  sgWriteFailed = !ST.write({ remember: e.target.checked ? 1 : 0 }).ok;
  if (!e.target.checked) await recentForget();   // as before: turning it off forgets the files kept now
  drawLists(); drawSG();
};
/* a setting arrived from the six-word copy, or was changed in another tab: take it up. The living filter only ever goes towards hiding here, because a copy only fills a choice not made on this device. */
function onSettingsChanged() {
  const e = ST.effective();
  if (e.living !== hide) { if (worker && window.RR) setLiving(e.living); else hide = e.living; }
  const f = $('#cv'); if (f && f.contentWindow && !f.hidden) f.contentWindow.postMessage({ tcLook: e.look }, location.origin);
  drawLists(); renderSaved(); if (!$('#sg').hidden) drawSG();
}
document.addEventListener('ra-settings-changed', onSettingsChanged);

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
  say(''); $('#start').hidden = false; renderKeep(); renderSaved(); renderCurrent(); await drawLists();
}
/* "Last used": the same rows on the opening screen and on the "Your file" page, so there is one list and one place it is kept (this browser's tcRecent) */
async function drawLists() {
  const rec = rememberOn() ? await recentList() : [];
  for (const [boxId, ulId] of [['stRecent', 'stList'], ['yfRecent', 'yfList']]) drawRecent($('#' + boxId), $('#' + ulId), rec);
  noFiles();
}
function drawRecent(box, ul, rec) {
  if (!box || !ul) return; ul.textContent = ''; box.hidden = !rec.length;
  for (const r of rec) {
    const li = document.createElement('li'), b = document.createElement('button'), x = document.createElement('button'), n = document.createElement('b'), sm = document.createElement('small');
    b.type = x.type = 'button'; b.className = 'recopen'; x.className = 'recx'; x.textContent = '\u00d7'; x.title = 'Forget ' + r.name; x.setAttribute('aria-label', 'Forget ' + r.name);
    n.textContent = r.name; sm.textContent = [r.people ? r.people.toLocaleString('en') + (r.people === 1 ? ' person' : ' people') : '', r.tree || (r.from ? 'from ' + r.from : ''), fmtBytes(r.size || 0), fmtWhen(r.when)].filter(Boolean).join(' \u00b7 '); b.append(n, sm); b.title = 'Open ' + r.name + ' again';
    if (r.note) { const nt = document.createElement('em'); nt.className = 'recnote'; nt.textContent = r.note; b.append(nt); }
    const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'recx recedit'; ed.textContent = '\u270e'; ed.title = r.note ? 'Edit the note' : 'Add a note'; ed.setAttribute('aria-label', ed.title + ' for ' + r.name);
    ed.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'recin'; inp.maxLength = 80; inp.value = r.note || ''; inp.placeholder = 'A note, e.g. Mum\'s side, from MyHeritage'; inp.setAttribute('aria-label', 'Note for ' + r.name);
      let fin = false; const save = async keep => { if (fin) return; fin = true; if (keep) await recentMeta(r.name, { note: inp.value.trim() }); drawLists(); };
      inp.onkeydown = e => { if (e.key === 'Enter') save(true); else if (e.key === 'Escape') save(false); };
      inp.onblur = () => save(true);
      b.replaceWith(inp); inp.focus(); inp.select();
    };
    b.onclick = async () => {
      try { const db = await rdb(), bytes = await rreq(db.transaction('b').objectStore('b').get(r.name)); db.close(); if (!bytes) throw 0; example = false; recentSave(r.name, bytes.slice(0)); start(bytes, r.name, undefined, r.url); }
      catch (e) { say('That file is no longer kept here. Open it again from your device.', true); await recentForget(r.name); drawLists(); }
    };
    x.onclick = async () => { await recentForget(r.name); drawLists(); };
    li.append(b, ed, x); ul.append(li);
  }
}
/* the file page says so when nothing at all is kept, rather than showing an empty heading */
function noFiles() { const n = $('#yfNoFiles'); if (n) n.hidden = !($('#yfWork').hidden && $('#yfRecent').hidden); }
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
    recentSave(name, r.bytes.slice(0)).then(() => recentMeta(name, { url: p.url })); start(r.bytes, name, via, p.url);
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
$('#stForget').onclick = async () => { await recentForget(); drawLists(); };
$('#yfForget').onclick = async () => { await recentForget(); drawLists(); };
/* the drop zone lights up while a file is dragged over the page (a class only; the drop itself is handled below) */
const dragging = on => $('#stDrop').classList.toggle('over', on);
for (const ev of ['dragenter', 'dragover']) addEventListener(ev, e => { if ($('#start').hidden) return; e.preventDefault(); dragging(!!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')); });
addEventListener('dragleave', e => { if (!e.relatedTarget) dragging(false); });
addEventListener('drop', e => { dragging(false); if ($('#start').hidden) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) f.arrayBuffer().then(b => { example = false; recentSave(f.name, b.slice(0)); start(b, f.name); }); });
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
