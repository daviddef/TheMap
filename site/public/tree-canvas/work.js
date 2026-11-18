/* THE TREE CANVAS'S SAVED WORK: what the page around the canvas keeps for each tree, in this browser, and what the six-word copy carries.

   WHAT IS KEPT, per tree: which people are on the canvas, where each card sits, the view (pan and zoom), the path being shown, the bridge decisions made
   between two archives' people, a few switches, and WHERE THE TREE CAME FROM: the https link it was opened from, or the name of the file on the device, or
   the archive's key. That is all. The tree itself (names, dates, places, who is whose child) is never in a record: the file is read in the browser and is
   not kept here, and a record names a person only by a short hash of the id the file gave them, salted with the tree's key. The canvas hands over the real
   ids in memory (pack), and gets them back in memory (unpack, which needs the real ids of the tree that is open to match the hashes against). A hash that
   matches no one in the open tree is ignored, so a record made for a different file brings nobody back.

   WHERE IT LIVES: localStorage `ra-canvas-v1` = { v, items: {treeKey: record}, gone: {treeKey: ISO} }. The same key is read by public/js/research-file.js
   (which puts a cleaned, size-capped copy in the research file the six-word sync saves, and merges the other device's records back in: the later `upd` wins
   a record, and a deletion on one device is not undone by a copy that is older than it). This module only ever writes whole records it made itself; the
   strict checking of anything that arrives from outside is research-file.js's cleanCanvas, and test/tree-canvas-work.test.js proves a record made here passes it
   unchanged. Everything touching storage is in try/catch: blocked storage means nothing is kept, and the page says so.

   Pure functions, no DOM: tested in node. */

export const KEY = 'ra-canvas-v1';
export const MAX_ITEMS = 12;           // trees kept; the oldest is dropped past this
export const MAX_CARDS = 3000;         // people on one canvas that are kept
export const MAX_PAIR_DEC = 400;       // accepted / rejected pairings kept per tree (Compare in pairs)
export const ARCHIVES = ['defranceski', 'booyzen', 'luwinski', 'lerena', 'falco', 'blazevic', 'darcy', 'mazza'];

/* a small string hash (cyrb53): not a secret, an opaque reference that does not spell a name */
export function h53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const H = (key, id) => h53(key + '\u0001' + id).toString(36);
const fin = n => (typeof n === 'number' && isFinite(n) ? n : 0);
const clip = (n, lim) => Math.max(-lim, Math.min(lim, fin(n)));

/* ---- which tree is this? ---- */
/* src: {t:'link', ref: the address the file was fetched from} | {t:'file', ref: the file's name, size, people} | {t:'archive', ref: the archive's key}. null when there is nothing to keep (the invented example). */
export function treeKey(src) {
  if (!src || typeof src !== 'object') return null;
  if (src.t === 'link') { const r = String(src.ref || '').split('#')[0]; return /^https:\/\/[^\s<>"'\\]{4,2000}$/.test(r) ? 'l:' + r : null; }
  if (src.t === 'archive') return ARCHIVES.includes(src.ref) ? 'a:' + src.ref : null;
  if (src.t === 'file') { const n = String(src.ref || '').slice(0, 200); return n ? 'f:' + n + '|' + (src.size | 0) + '|' + (src.people | 0) : null; }
  return null;
}
export function cleanSrc(src) {
  if (!src) return null;
  if (src.t === 'link') return { t: 'link', ref: String(src.ref).split('#')[0] };
  if (src.t === 'archive') return { t: 'archive', ref: src.ref };
  if (src.t === 'file') return { t: 'file', ref: String(src.ref).slice(0, 200), size: src.size | 0, people: src.people | 0 };
  return null;
}
/* "raw.githubusercontent.com / family.tree.json": the host and the last part of the address, for a list; never a person */
export function linkLabel(url) { try { const u = new URL(url); const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || ''); return (u.hostname + (last ? ' / ' + last : '')).slice(0, 100); } catch (e) { return String(url).slice(0, 100); } }

/* ---- the canvas's state <-> a record's arrangement ---- */
/* plain: the canvas's own serialise(): {cards:[[key,x,y,pinned,up,down,sp,stopG,from]], view, decisions:[[bridgeId, value]], opts, path:[a,b]|null, filter:[archive index]} */
export function pack(plain, key) {
  const p = plain || {}, cards = (Array.isArray(p.cards) ? p.cards : []).slice(0, MAX_CARDS);
  const v = p.view || {};
  return {
    v: 1,
    c: cards.map(r => [H(key, r[0]), Math.round(clip(r[1], 1e6)), Math.round(clip(r[2], 1e6)), r[3] ? 1 : 0, r[4] | 0, r[5] | 0, r[6] | 0, r[7] ? 1 : 0, r[8] ? H(key, r[8]) : '']),
    view: { x: Math.round(clip(v.x, 1e6)), y: Math.round(clip(v.y, 1e6)), k: Math.max(0.05, Math.min(8, fin(v.k) || 1)) },
    path: Array.isArray(p.path) && p.path.length === 2 ? [H(key, p.path[0]), H(key, p.path[1])] : null,
    dec: (Array.isArray(p.decisions) ? p.decisions : []).slice(0, 500).filter(r => typeof r[1] === 'string').map(r => [H(key, r[0]), String(r[1]).slice(0, 16)]),
    opts: { stopAtNotProven: !!(p.opts && p.opts.stopAtNotProven), suggested: !(p.opts && p.opts.suggested === false), gens: !!(p.opts && p.opts.gens) },
    filter: (Array.isArray(p.filter) ? p.filter : []).filter(i => Number.isInteger(i) && i >= 0 && i < 9).slice(0, 9),
  };
}
/* known: the real person keys of the tree that is open; bridges: the real bridge ids. Returns the canvas's own serialise() shape, or null. `matched`: how many people were found. */
export function unpack(w, key, known, bridges) {
  if (!w || w.v !== 1 || !Array.isArray(w.c)) return null;
  const back = new Map(); for (const k of known || []) back.set(H(key, k), k);
  const bb = new Map(); for (const k of bridges || []) bb.set(H(key, k), k);
  const cards = [];
  for (const r of w.c) { const k = back.get(r[0]); if (k) cards.push([k, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8] ? (back.get(r[8]) || '') : '']); }
  const path = w.path && back.get(w.path[0]) && back.get(w.path[1]) ? [back.get(w.path[0]), back.get(w.path[1])] : null;
  return { v: 1, cards, view: w.view, decisions: (w.dec || []).filter(r => bb.has(r[0])).map(r => [bb.get(r[0]), r[1]]), opts: w.opts || {}, path, filter: w.filter || [], matched: cards.length, of: w.c.length };
}

/* ---- Compare in pairs: the visitor's own pairing choices, kept beside the canvas arrangement in the same record (field `pr`) ----
   p: the canvas's pairing {on, ar:[archive keys], an:[person keys of the starting people], whole, d:[[personKeyA, personKeyB, 'y'|'n']]}. A person is named only by a hash
   (as above); the archives are named by their public keys (defranceski, booyzen …), which spell no one. Nothing else is kept: not who was compared with whom beyond these choices,
   not a name, a date or a place. */
export function packPairing(p, key) {
  if (!p || typeof p !== 'object') return null;
  const ar = [...new Set((Array.isArray(p.ar) ? p.ar : []).filter(a => ARCHIVES.includes(a)))].slice(0, ARCHIVES.length);
  const d = (Array.isArray(p.d) ? p.d : []).filter(r => Array.isArray(r) && r.length === 3 && typeof r[0] === 'string' && typeof r[1] === 'string' && (r[2] === 'y' || r[2] === 'n')).slice(-MAX_PAIR_DEC).map(r => [H(key, r[0]), H(key, r[1]), r[2]]);
  const an = (Array.isArray(p.an) ? p.an : []).filter(k => typeof k === 'string' && k).slice(0, 9).map(k => H(key, k));
  if (!p.on && !d.length) return null;
  return { on: p.on ? 1 : 0, ar, an, whole: p.whole ? 1 : 0, d };
}
/* known: the real person keys of the comparison that is open (the file's and each archive's). Anything that matches no one is dropped. */
export function unpackPairing(pr, key, known) {
  if (!pr || typeof pr !== 'object') return null;
  const back = new Map(); for (const k of known || []) back.set(H(key, k), k);
  return { on: !!pr.on, ar: Array.isArray(pr.ar) ? pr.ar.filter(a => ARCHIVES.includes(a)) : [], whole: !!pr.whole,
    an: (pr.an || []).map(h => back.get(h)).filter(Boolean),
    d: (pr.d || []).map(r => [back.get(r[0]), back.get(r[1]), r[2]]).filter(r => r[0] && r[1] && (r[2] === 'y' || r[2] === 'n')) };
}
/* Set this tree's pairing choices without touching its canvas arrangement; makes a record (with no cards) if there is none. Returns false if storage would not keep it. */
export function savePairing(src, label, pairing, st, now) {
  const s = cleanSrc(src), k = treeKey(s); if (!k) return false;
  const pr = packPairing(pairing, k), old = get(k, st);
  if (!old && !pr) return true;
  if (old && JSON.stringify(old.w.pr || null) === JSON.stringify(pr)) return true;     // nothing changed
  const rec = old ? JSON.parse(JSON.stringify(old)) : makeRecord(s, label, { cards: [] }, now);
  if (!rec) return false;
  if (pr) rec.w.pr = pr; else delete rec.w.pr;
  rec.upd = new Date(now == null ? Date.now() : now).toISOString();
  return put(rec, st);
}

/* ---- records ---- */
export function makeRecord(src, label, plain, now) {
  const s = cleanSrc(src), k = treeKey(s); if (!k) return null;
  const w = pack(plain, k);
  return { k, label: String(label || '').slice(0, 120), src: s, upd: new Date(now == null ? Date.now() : now).toISOString(), n: w.c.length, w };
}

/* ---- the store (in this browser) ---- */
const emptyStore = () => ({ v: 1, items: {}, gone: {} });
export function readStore(st) {
  try {
    const s = st === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : st;
    const raw = s && s.getItem(KEY), d = raw ? JSON.parse(raw) : null;
    return d && d.v === 1 && d.items && typeof d.items === 'object' ? { v: 1, items: d.items, gone: d.gone && typeof d.gone === 'object' ? d.gone : {} } : emptyStore();
  } catch (e) { return emptyStore(); }
}
function writeStore(d, st) {
  try {
    const s = st === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : st; if (!s) return false;
    const keys = Object.keys(d.items).sort((a, b) => String(d.items[b].upd).localeCompare(String(d.items[a].upd)));
    keys.slice(MAX_ITEMS).forEach(k => { delete d.items[k]; });      // the oldest go; no tombstone, so another device's copy of it is not deleted by this
    s.setItem(KEY, JSON.stringify(d)); return true;
  } catch (e) { return false; }
}
export const get = (key, st) => readStore(st).items[key] || null;
export function list(st) { const d = readStore(st); return Object.keys(d.items).map(k => d.items[k]).sort((a, b) => String(b.upd).localeCompare(String(a.upd))); }
/* false when the browser would not keep it (storage blocked or full) */
export function put(rec, st) { const d = readStore(st); d.items[rec.k] = rec; if (d.gone[rec.k] && d.gone[rec.k] < rec.upd) delete d.gone[rec.k]; return writeStore(d, st); }
/* forget a tree's canvas; the deletion is dated so a copy from another device that is older than it does not bring it back */
export function remove(key, st, now) { const d = readStore(st); delete d.items[key]; d.gone[key] = new Date(now == null ? Date.now() : now).toISOString(); return writeStore(d, st); }

/* ---- how the page words things ---- */
export function agoText(iso, now) {
  const t = Date.parse(iso); if (!t) return '';
  const s = Math.max(0, Math.round(((now == null ? Date.now() : now) - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + (m === 1 ? ' minute' : ' minutes') + ' ago';
  const h = Math.round(m / 60); if (h < 36) return h + (h === 1 ? ' hour' : ' hours') + ' ago';
  const d = Math.round(h / 24); return d + ' days ago';
}
/* The words on the Keep your work button and in the canvas menu. `sync`: {on, saved (ISO of the last online save), failed}; `rec`: this tree's record, if any. */
export function keepStatus(sync, rec, now) {
  if (!sync || !sync.on) return { on: false, text: 'Saved in this browser. Six words keep it on every device: no email, no account.' };
  if (sync.failed) return { on: true, text: 'Your six words are on, but the online copy could not be reached just now. Your canvas is still saved in this browser.' };
  if (sync.canvas === 'left-out') return { on: true, text: 'Your six words are on, but your saved canvases are too large to keep online. They are still saved in this browser.' };
  if (!sync.saved || (rec && rec.upd > sync.saved)) return { on: true, text: 'Saving with your six words…' };
  return { on: true, text: 'Saved with your six words · ' + agoText(sync.saved, now) + (sync.canvas === 'capped' ? '. The newest canvases fit; older ones stay in this browser.' : '') };
}
