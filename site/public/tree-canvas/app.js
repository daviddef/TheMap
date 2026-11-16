/* The page around the standalone Tree Canvas. It owns the GEDCOM reader (the roots page's own worker, so the tree is read exactly as Roots & Routes
   reads it) and nothing else: the canvas, in the iframe, draws everything and tells this page when its owner opens a file or ticks "Hide living
   people". The tree goes to the canvas in memory (window.RR, which canvas.html reads from its parent); nothing is sent anywhere and the only thing kept on the device is, if the visitor pastes it, the tree's MyHeritage link (as on /roots/)
   but the static Atlas files the reader fetches for the places the tree names (the same files, and the same note about the server log, as /roots/). */
import { makeSample } from '/roots/js/sample.js';
import { issuesByPerson } from '/roots/js/checklist.js';
import { parseLink, profileUrl, treeUrl } from '/roots/js/myheritage.js';
import { personUrl } from '/roots/js/ancestry.js';
import { loadTrees, saveTreeLink, loadSite, saveSite } from '/roots/js/remember.js';

const $ = s => document.querySelector(s);
const base = new URL('/roots/', location.href).href;   // the reader fetches its place files relative to this, as it does on /roots/
const STAMP = Date.now();                              // a fresh canvas each time the page is opened, never an old cached copy
let worker = null, hide = false, example = true;

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
  old.replaceWith(f);
}

function start(bytes) {
  say('Reading your file…');
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
    else if (m.type === 'error') say('Sorry, that file could not be read: ' + m.msg, true);
    else if (m.type === 'done') {
      if (m.first && hide) { say('Hiding living people…'); worker.postMessage({ cmd: 'living', hide: true }); return; }   // keep the choice for the next file
      const prevMh = mhFile; mhFile = m.mh || null; anc = m.anc || null;
      if (!prevMh || !mhFile || prevMh.guid !== mhFile.guid) { mhc = null; mhText = ''; mhNote = ''; applyTreeLink(); }   // a different tree: start from what is remembered or known for it
      window.RR = { tree: m.tree, atlas: m.atlas, loadNames, links };
      say(''); mount();
      worker.postMessage({ cmd: 'checklist', living: !hide, ancestry: 'com' });   // the fix list, for the "!" marks; it follows a moment after the canvas is drawn
    }
  };
  worker.onerror = e => say('The reader crashed: ' + (e.message || 'unknown error'), true);
  worker.postMessage({ cmd: 'load', bytes, base }, [bytes]);
}

addEventListener('message', e => {
  if (e.origin !== location.origin) return;   // only the canvas, which is this site's own page
  const d = e.data || {};
  if (d.tcOpen && d.tcOpen.bytes instanceof ArrayBuffer) { example = false; start(d.tcOpen.bytes); }
  else if (typeof d.tcLiving === 'boolean') {
    hide = d.tcLiving;
    if (worker) { say(hide ? 'Hiding living people…' : 'Showing everyone…'); worker.postMessage({ cmd: 'living', hide }); }
  }
});

start(new TextEncoder().encode(makeSample()).buffer);   // open on the invented sample family, so there is a tree to look at straight away
