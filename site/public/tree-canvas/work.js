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

   NAMED VIEWS are kept in the same store, as records of their own: key `v:<id>`, the arrangement as above plus a name the visitor typed, the look (one of the six),
   and `tk`, the key of the tree they belong to. So they ride the same copy, the same merge (the later change wins, a deletion is dated) and the same strict cleaning.
   A view can also be SHARED as a link: the same arrangement (the people as salted hashes, never a name) plus the tree's source, packed into the link's #fragment,
   which a browser never sends to a server. Whoever opens it needs the tree: an archive opens by itself, a link or a file is asked for first.

   Pure functions, no DOM: tested in node. */

export const KEY = 'ra-canvas-v1';
export const MAX_ITEMS = 12;           // trees kept; the oldest is dropped past this
export const MAX_VIEWS = 40;           // named views kept in all, and
export const MAX_VIEWS_PER_TREE = 12;  // for one tree
export const isViewKey = k => typeof k === 'string' && /^v:[0-9a-z]{1,16}$/.test(k);
export const LOOKS = ['sticker', 'paper', 'ground', 'lanes', 'countries', 'names'];   // the canvas's looks; a view remembers one
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
    ...(LOOKS.includes(p.look) ? { look: p.look } : {}),
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
  return { v: 1, cards, view: w.view, decisions: (w.dec || []).filter(r => bb.has(r[0])).map(r => [bb.get(r[0]), r[1]]), opts: w.opts || {}, path, filter: w.filter || [], look: LOOKS.includes(w.look) ? w.look : '', matched: cards.length, of: w.c.length };
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
    keys.filter(k => !isViewKey(k)).slice(MAX_ITEMS).forEach(k => { delete d.items[k]; });      // the oldest go; no tombstone, so another device's copy of it is not deleted by this
    keys.filter(isViewKey).slice(MAX_VIEWS).forEach(k => { delete d.items[k]; });
    s.setItem(KEY, JSON.stringify(d)); return true;
  } catch (e) { return false; }
}
export const get = (key, st) => readStore(st).items[key] || null;
export function list(st) { const d = readStore(st); return Object.keys(d.items).filter(k => !isViewKey(k)).map(k => d.items[k]).sort((a, b) => String(b.upd).localeCompare(String(a.upd))); }
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


/* ---------------- named views ---------------- */
export const newViewId = () => Array.from({ length: 8 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
export const cleanName = n => String(n == null ? '' : n).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
/* a view of the canvas as it is now: plain is the canvas's serialise() plus {look}. null when the tree has no key (the invented example) or there is nothing on the canvas. */
export function makeView(src, label, plain, name, now, id) {
  const s = cleanSrc(src), tk = treeKey(s); if (!tk) return null;
  const w = pack(plain, tk); if (!w.c.length) return null;
  const vid = id || newViewId();
  return { k: 'v:' + vid, tk, name: cleanName(name) || 'My view', label: String(label || '').slice(0, 120), src: s, upd: new Date(now == null ? Date.now() : now).toISOString(), n: w.c.length, w };
}
/* a view's id from its key */
export const viewId = k => String(k).slice(2);
/* newest first; `tk` narrows to one tree */
export function listViews(st, tk) {
  const d = readStore(st);
  return Object.keys(d.items).filter(isViewKey).map(k => d.items[k]).filter(v => !tk || v.tk === tk).sort((a, b) => String(b.upd).localeCompare(String(a.upd)));
}
/* true when kept; 'full' when the tree already has MAX_VIEWS_PER_TREE (replacing one of its own is always fine); false when the browser would not keep it */
export function putView(v, st) {
  const d = readStore(st);
  if (!d.items[v.k] && Object.keys(d.items).filter(k => isViewKey(k) && d.items[k].tk === v.tk).length >= MAX_VIEWS_PER_TREE) return 'full';
  d.items[v.k] = v; if (d.gone[v.k] && d.gone[v.k] < v.upd) delete d.gone[v.k];
  return writeStore(d, st) ? true : false;
}
export function renameView(key, name, st, now) {
  const d = readStore(st), v = d.items[key]; if (!v || !isViewKey(key)) return false;
  v.name = cleanName(name) || v.name; v.upd = new Date(now == null ? Date.now() : now).toISOString(); return writeStore(d, st);
}
/* the visitor's own words about a view, as for a kept file: up to 120 characters, no markup. Empty clears it. Naming and noting is one change (the later `upd` wins on another device). */
export const cleanNote = n => String(n == null ? '' : n).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
export function editView(key, patch, st, now) {
  const d = readStore(st), v = d.items[key]; if (!v || !isViewKey(key) || !patch) return false;
  if (patch.name != null) v.name = cleanName(patch.name) || v.name;
  if (patch.note != null) { const t = cleanNote(patch.note); if (t) v.note = t; else delete v.note; }
  v.upd = new Date(now == null ? Date.now() : now).toISOString(); return writeStore(d, st);
}

/* ---------------- the opening page's list: one card per tree, its views nested under it ---------------- */
/* kept: the files kept on this device ({name, when, ...}); recs: list(); views: listViews(). Returns [{id, kind: 'file'|'archive'|'link', ref, kept, canvas, views, last}] newest first.
   A file's views and canvas are matched to a kept file by its NAME (the same rule as reopening it); a tree whose file is not kept still gets a card, with `kept: null`. */
export function groupTrees(kept, recs, views) {
  const g = new Map(), at = (src, label) => {
    const id = src.t + ':' + src.ref; if (!g.has(id)) g.set(id, { id, kind: src.t, ref: src.ref, label: '', src, kept: null, canvas: null, views: [], last: 0 });
    const x = g.get(id); if (label && !x.label) x.label = label; return x;
  };
  const ms = iso => Date.parse(iso) || 0;
  for (const k of kept || []) {
    const x = at(k.url ? { t: 'link', ref: String(k.url).split('#')[0] } : { t: 'file', ref: k.name });   // a file fetched from a link is that link's tree
    if (!x.kept || (k.when || 0) > (x.kept.when || 0)) x.kept = k; x.last = Math.max(x.last, k.when || 0);
  }
  for (const r of recs || []) { if (!r.src) continue; const x = at(r.src, r.label); if (!x.canvas || ms(r.upd) > ms(x.canvas.upd)) x.canvas = r; x.last = Math.max(x.last, ms(r.upd)); }
  for (const v of views || []) { if (!v.src) continue; const x = at(v.src, v.label); x.views.push(v); x.last = Math.max(x.last, ms(v.upd)); }
  const out = [...g.values()];
  for (const x of out) x.views.sort((a, b) => String(b.upd).localeCompare(String(a.upd)));
  return out.sort((a, b) => b.last - a.last);
}

/* ---------------- sharing a view as a link ---------------- */
/* The link carries: a name, where the tree comes from, and the arrangement as salted hashes. Never a name from the tree. It goes in the #fragment, which is not sent to any server. */
const ID_RE = /^[0-9a-z]{1,16}$/;
/* any `w` from outside (a link, a copy) made safe: the same rules as public/js/research-file.js's cleanCanvasItem, for a record that has already been packed */
export function normW(w) {
  if (!w || w.v !== 1 || !Array.isArray(w.c)) return null;
  const c = [];
  for (const r of w.c.slice(0, MAX_CARDS)) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !ID_RE.test(r[0])) continue;
    c.push([r[0], Math.round(clip(r[1], 1e6)), Math.round(clip(r[2], 1e6)), r[3] ? 1 : 0, r[4] | 0, r[5] | 0, r[6] | 0, r[7] ? 1 : 0, typeof r[8] === 'string' && ID_RE.test(r[8]) ? r[8] : '']);
  }
  const v = w.view || {}, o = w.opts || {}, ok = x => typeof x === 'string' && ID_RE.test(x);
  return {
    v: 1, c, view: { x: Math.round(clip(v.x, 1e6)), y: Math.round(clip(v.y, 1e6)), k: Math.max(0.05, Math.min(8, fin(v.k) || 1)) },
    path: Array.isArray(w.path) && w.path.length === 2 && ok(w.path[0]) && ok(w.path[1]) ? [w.path[0], w.path[1]] : null,
    dec: (Array.isArray(w.dec) ? w.dec : []).slice(0, 500).filter(r => Array.isArray(r) && ok(r[0]) && typeof r[1] === 'string').map(r => [r[0], r[1].slice(0, 16)]),
    opts: { stopAtNotProven: !!o.stopAtNotProven, suggested: o.suggested !== false, gens: !!o.gens },
    filter: (Array.isArray(w.filter) ? w.filter : []).filter(i => Number.isInteger(i) && i >= 0 && i < 9).slice(0, 9),
    ...(LOOKS.includes(w.look) ? { look: w.look } : {}),
  };
}
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = t => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function pipe(bytes, stream, limit) {
  const out = new Blob([bytes]).stream().pipeThrough(stream), rd = out.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > limit) { try { await rd.cancel(); } catch (e) { /* done */ } throw new Error('too large'); } parts.push(value); }
  const all = new Uint8Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; } return all;
}
export const SHARE_MAX_DECODED = 600000;   // a link that unpacks to more than this is refused
export async function shareEncode(view) {
  const text = JSON.stringify({ v: 1, n: view.name, s: cleanSrc(view.src), w: view.w }), raw = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'function') { try { return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'), SHARE_MAX_DECODED)); } catch (e) { /* plain below */ } }
  return 'j' + b64u(raw);
}
/* {name, src, tk, w} or null. Never throws: whatever arrives in a link is untrusted. */
export async function shareDecode(code) {
  try {
    if (typeof code !== 'string' || code.length < 3 || code.length > 400000 || !/^[zj][A-Za-z0-9_-]+$/.test(code)) return null;
    const bytes = unb64u(code.slice(1));
    const raw = code[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw'), SHARE_MAX_DECODED) : bytes;
    if (raw.length > SHARE_MAX_DECODED) return null;
    const d = JSON.parse(new TextDecoder().decode(raw)); if (!d || d.v !== 1) return null;
    const src = cleanSrc(d.s), tk = treeKey(src), w = normW(d.w); if (!src || !tk || !w || !w.c.length) return null;
    return { name: cleanName(d.n) || 'A shared view', src, tk, w };
  } catch (e) { return null; }
}
