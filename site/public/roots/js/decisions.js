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

   Decisions: a = left as is, d = ticked done. `t` is the day it was decided. */

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

/* the default store: this browser's own, if it has one (a private window may not) */
export const store = create((() => { try { return typeof document !== 'undefined' ? localStorage : null; } catch { return null; } })());
