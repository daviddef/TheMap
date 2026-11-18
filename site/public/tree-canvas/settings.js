/* The Tree Canvas's settings: the choices about the PAGE and the device, kept on this device, in one place (the Settings drawer).

   Three choices, each a short list and nothing else, so they can be carried in the six-word copy without carrying anything about a person:
     living    1 = hide the names of people who may be alive when a GEDCOM is read; 0 = show them as the file gives them. Absent = not chosen = shown (today's default, on this
               page and on Roots & Routes).
     look      the canvas's look: auto (light or dark to suit the device) or one of its six looks. Absent = auto.
     remember  1 = keep the last three files on this device so they open in one click; 0 = do not. Absent = 1 (today's default).
   Two links to other sites are also set in the drawer (the MyHeritage link and the Ancestry site). They are NOT here: /roots/js/remember.js keeps them and
   public/js/research-file.js already carries them as `sites`; this file never writes them a second time.

   A choice is stored only once it is made (so "nothing chosen" is different from "chose the default"), in `ra-settings-v1` as
   { v: 1, living?, look?, remember? }. `look` and `remember` are also written to the keys the canvas itself has always read (`loamTheme`, `tcRemember`), so the
   canvas needs no second way to learn them, and a device that chose them in the canvas's old menu keeps its choice.

   The rule for a setting that arrives from another device (public/js/research-file.js): it only FILLS a choice this device has not made; it never replaces one.
   So the living filter can never be switched off from another device. This file is the page's copy of the cleaning rule; test/tree-canvas-settings.test.js
   checks it agrees with research-file.js. Pure but for the storage handed in (default: localStorage, every use in try/catch). */

export const KEY = 'ra-settings-v1';
export const LOOKS = ['auto', 'sticker', 'paper', 'ground', 'lanes', 'countries', 'names'];
const THEMES = LOOKS.slice(1);                     // the names the canvas itself uses (loamTheme)
export const LOOK_NAMES = { auto: 'Automatic: light or dark to suit this device', sticker: 'Sticker', paper: 'Paper', ground: 'Ground (dark)', lanes: 'Lanes', countries: 'Countries', names: 'Names' };

/* The one-click Look button on the canvas (the canvas draws it, public/tree-canvas/app.js keeps the choice). It cycles the COLOUR looks; Lanes, Countries and Names are layouts and
   are chosen in the drawer, and from one of those the button goes to automatic. The canvas holds its own copy of this list (LOOK_CYCLE); test/tree-canvas-theme.test.js checks they agree. */
export const CYCLE = ['auto', 'sticker', 'paper', 'ground'];
export const nextLook = cur => { const i = CYCLE.indexOf(cur); return i < 0 ? 'auto' : CYCLE[(i + 1) % CYCLE.length]; };
/* what the page around the canvas wears for a look: 'dark' for Ground, 'light' for every other look, null (the device decides) for automatic or anything unknown.
   public/tree-canvas/theme-boot.js is the same rule written for a classic script that runs before the page paints (the test checks it too). */
export const shellScheme = look => (LOOKS.indexOf(look) < 1 ? null : look === 'ground' ? 'dark' : 'light');

const store = st => { if (st) return st; try { return localStorage; } catch (e) { return null; } };
const get = (s, k) => { try { return s ? s.getItem(k) : null; } catch (e) { return null; } };

/* anything that is not exactly one of the three short choices is dropped */
export function clean(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || x.v !== 1) return null;
  const out = { v: 1 };
  if (x.living === 0 || x.living === 1) out.living = x.living;
  if (LOOKS.indexOf(x.look) >= 0) out.look = x.look;
  if (x.remember === 0 || x.remember === 1) out.remember = x.remember;
  return Object.keys(out).length > 1 ? out : null;
}

/* what this device has chosen: the record, then the choices the canvas's old menu made (loamTheme, tcRemember). Only the keys that were chosen are present. */
export function chosen(st) {
  const s = store(st), out = {}; let rec = null;
  try { rec = clean(JSON.parse(get(s, KEY))); } catch (e) { rec = null; }
  if (rec) for (const k of ['living', 'look', 'remember']) if (rec[k] !== undefined) out[k] = rec[k];
  if (out.look === undefined) { const t = get(s, 'loamTheme'); if (THEMES.indexOf(t) >= 0) out.look = t; }
  if (out.remember === undefined) { const r = get(s, 'tcRemember'); if (r === '0' || r === '1') out.remember = +r; }
  return out;
}

/* what applies: the choices, with today's defaults for what was not chosen */
export function effective(st) {
  const c = chosen(st);
  return { living: c.living === 1, look: c.look || 'auto', remember: c.remember !== 0 };
}

/* make a choice. A value of null forgets that choice (back to the default). Returns { ok, chosen }: ok is false when storage refused, and the page then keeps the
   choice for this visit only and says so. */
export function write(patch, st) {
  const s = store(st); const next = chosen(s);
  for (const k of ['living', 'look', 'remember']) {
    if (!(k in patch)) continue;
    if (patch[k] === null || patch[k] === undefined) delete next[k]; else next[k] = patch[k];
  }
  const rec = clean({ v: 1, ...next });
  let ok = !!s;
  try {
    if (rec) s.setItem(KEY, JSON.stringify(rec)); else s.removeItem(KEY);
    /* the keys the canvas reads on its own */
    if ('look' in patch) { if (next.look && next.look !== 'auto') s.setItem('loamTheme', next.look); else s.removeItem('loamTheme'); }
    if ('remember' in patch) { if (next.remember === 0 || next.remember === 1) s.setItem('tcRemember', String(next.remember)); else s.removeItem('tcRemember'); }
  } catch (e) { ok = false; }
  return { ok, chosen: next };
}
