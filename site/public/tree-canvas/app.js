/* The page around the standalone Tree Canvas. It owns the GEDCOM reader (the roots page's own worker, so the tree is read exactly as Roots & Routes
   reads it) and nothing else: the canvas, in the iframe, draws everything and tells this page when its owner opens a file or ticks "Hide living
   people". The tree goes to the canvas in memory (window.RR, which canvas.html reads from its parent); nothing is stored and nothing is sent anywhere
   but the static Atlas files the reader fetches for the places the tree names (the same files, and the same note about the server log, as /roots/). */
import { makeSample } from '/roots/js/sample.js';

const $ = s => document.querySelector(s);
const base = new URL('/roots/', location.href).href;   // the reader fetches its place files relative to this, as it does on /roots/
const STAMP = Date.now();                              // a fresh canvas each time the page is opened, never an old cached copy
let worker = null, hide = false, example = true;

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
    else if (m.type === 'error') say('Sorry, that file could not be read: ' + m.msg, true);
    else if (m.type === 'done') {
      if (m.first && hide) { say('Hiding living people…'); worker.postMessage({ cmd: 'living', hide: true }); return; }   // keep the choice for the next file
      window.RR = { tree: m.tree, atlas: m.atlas };
      say(''); mount();
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
