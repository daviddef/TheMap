/* FIX-IT DECISIONS: what the visitor has ticked "done" or left "as is", kept on this device only if they ask.

   The second of the two modules allowed to keep anything in the browser (the other is recent.js, which keeps a file on a
   button press); the privacy test names both. Off until the visitor ticks "Remember my decisions on this device"; ticking it
   off again forgets everything. Nothing is sent anywhere.

   WHAT IS KEPT, AND WHAT IS NOT. A fix-list row is identified by a key such as `p|<place text>` or `s|<person id>|<reasons>`,
   which can carry a place as typed or a file's person id. Those are never stored. Only a hash of the key is, with the kind
   of decision and a day. A hash makes the stored data unreadable at a glance and nothing more: it is not encryption, and a
   person id is short enough to be guessed. No name, no date of birth and no place text is ever written.

   MATCHING ACROSS FILES. The key is the same wherever the same row comes up, so a decision made on one export of a tree is
   found again on the next export of the same tree, and on another device that loads the decisions file. The hash carries no
   per-device secret on purpose: that is what lets a file move between devices.

   Decisions: a = left as is, d = ticked done. `t` is the day it was decided.

   THE SUMMARY ON "MY RESEARCH". The hashes above are unreadable on purpose, so by themselves they cannot show anything on another
   page. While the same switch is on, a plain SUMMARY of each fix list is kept too, so /my-research/ can list the tree as research
   still to do: the file's name, the day, per kind of fix how many there are, how many are done or left as is, and, for the three
   place sections only, the place text as typed (with the standard form suggested), never more than 150. A place text is where
   something happened, not who it happened to. People are only ever counted: no name, id or date of birth is written. The summary
   follows the switch: off, or "Forget", removes it. */

const KEY = 'ra-fix-decisions-v1';

/* cyrb53: a small, stable 53-bit hash. Not a security primitive; see above. */
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const hashKey = key => cyrb53('ra-fix|' + key);

const fresh = () => ({ v: 1, on: false, rows: {} });
const day = () => new Date().toISOString().slice(0, 10);

/* a row decided on either device stays decided; the later day wins */
export function mergeRows(mine, theirs) {
  const out = JSON.parse(JSON.stringify(mine || {}));
  for (const [h, b] of Object.entries(theirs || {})) {
    const a = out[h]; if (!a) { out[h] = { ...b }; continue; }
    if (b.a) a.a = 1; if (b.d) a.d = 1; if (b.t && (!a.t || b.t > a.t)) a.t = b.t;
  }
  return out;
}

/* The decisions of the page as it stands (the sets of row keys), as hashed rows: what "Save decisions to a file" writes, whether
   or not the visitor has asked to have them kept. */
export function rowsFrom(asIs, ticked, when) {
  const rows = {};
  for (const k of asIs) rows[hashKey(k)] = { ...(rows[hashKey(k)] || {}), a: 1, t: when || day() };
  for (const k of ticked) rows[hashKey(k)] = { ...(rows[hashKey(k)] || {}), d: 1, t: when || day() };
  return rows;
}
export const fileTextOf = rows => JSON.stringify({ kind: 'record-atlas-fix-decisions', v: 1, exported: day(), rows }, null, 1);
/* Rows out of a decisions file or a research file, without keeping anything. */
export function parseRows(text) {
  const j = JSON.parse(text), rows = j && (j.kind === 'record-atlas-fix-decisions' ? j.rows : j.decisions);
  if (!rows || typeof rows !== 'object') throw new Error('not a decisions file');
  return rows;
}
export const lookup = (rows, key) => (rows && rows[hashKey(key)]) || null;

/* The store is a factory over any storage with getItem/setItem/removeItem, so the tests need no browser. */
export function create(storage) {
  const read = () => { try { const r = storage && storage.getItem(KEY); const d = r && JSON.parse(r); return d && d.rows ? d : fresh(); } catch { return fresh(); } };
  const write = d => { try { storage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } };
  return {
    available: () => !!storage,
    isOn: () => read().on === true,
    /* Turning it off forgets everything: "off" must mean nothing is kept. */
    setOn(on) { if (on) { const d = read(); d.on = true; return write(d); } try { storage.removeItem(KEY); } catch { /* nothing to forget */ } return true; },
    /* Recorded only while it is on. Returns whether it was kept. */
    put(key, kind, yes, when) {
      const d = read(); if (!d.on) return false;
      const h = hashKey(key), r = d.rows[h] || {};
      if (yes) r[kind] = 1; else delete r[kind];
      if (!r.a && !r.d) delete d.rows[h]; else { r.t = when || day(); d.rows[h] = r; }
      return write(d);
    },
    /* Read whether or not it is on: decisions loaded from a file still apply. */
    get(key) { return read().rows[hashKey(key)] || null; },
    count: () => Object.keys(read().rows).length,
    forget() { const on = read().on; try { storage.removeItem(KEY); } catch { /* nothing to forget */ } if (on) { const d = fresh(); d.on = true; write(d); } },
    fileText: () => fileTextOf(read().rows),
    /* Merge a decisions file, or the `decisions` of a research file, into what is kept. Returns the number of rows read. */
    load(text) { const rows = parseRows(text), d = read(); d.rows = mergeRows(d.rows, rows); write(d); return Object.keys(rows).length; },
  };
}

/* ---- the readable summary of a fix list (see above) ---- */
const FKEY = 'ra-gedcom-fixes-v1', PLACE_SECTIONS = ['places', 'check', 'decide'], PLACE_CAP = 150;
export function summarise(fix, asIs, ticked, name, when) {
  const gOf = k => { const g = (fix.groups || []).find(x => x.sections.includes(k)); return g ? g.title : ''; };
  const sections = [], places = [];
  for (const sec of fix.sections) {
    const state = i => (asIs.has(i.key) ? 'a' : ticked.has(i.key) ? 'd' : 'o');
    const total = sec.items.length, done = sec.items.filter(i => state(i) === 'd').length, asis = sec.items.filter(i => state(i) === 'a').length;
    if (!total) continue;
    sections.push({ key: sec.key, title: sec.title, group: gOf(sec.key), total, done, asis });
    if (PLACE_SECTIONS.includes(sec.key)) for (const i of sec.items) if (places.length < PLACE_CAP) places.push({ k: sec.key, t: String(i.raw || '').slice(0, 160), to: i.to ? String(i.to).slice(0, 160) : '', s: state(i) });
  }
  return { name: String(name || '').slice(0, 200), saved: when || day(), sections, places };
}
export function createFixes(storage) {
  const read = () => { try { const r = storage && storage.getItem(FKEY); const d = r && JSON.parse(r); return d && d.trees ? d : { v: 1, trees: {} }; } catch { return { v: 1, trees: {} }; } };
  const write = d => { try { storage.setItem(FKEY, JSON.stringify(d)); return true; } catch { return false; } };
  return {
    all: () => read().trees,
    put(sum) { if (!sum || !sum.name) return false; const d = read(); d.trees[sum.name] = sum; const names = Object.keys(d.trees).sort((a, b) => String(d.trees[b].saved).localeCompare(String(d.trees[a].saved))); for (const n of names.slice(8)) delete d.trees[n]; return write(d); },
    forget(name) { const d = read(); if (name) delete d.trees[name]; else d.trees = {}; if (!Object.keys(d.trees).length) { try { storage.removeItem(FKEY); } catch { /* nothing to forget */ } return true; } return write(d); },
  };
}

/* the default store: this browser's own, if it has one (a private window may not) */
const browserStorage = (() => { try { return typeof document !== 'undefined' ? localStorage : null; } catch { return null; } })();
export const store = create(browserStorage);
export const fixes = createFixes(browserStorage);
