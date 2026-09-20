/* The birth timeline, loaded and indexed ONCE for the whole build.
 *
 * Written first as an IIFE in surname/[name].astro's frontmatter, which
 * meant every surname page re-read a 25 MB file and rebuilt a 363,574-key
 * fold index — thousands of times over. This project has made that mistake
 * three times now (a regex inside near(), a find() over fr.surnames, a
 * provider filter per page), and the fix is always the same: the work does
 * not depend on the page, so it does not belong in the page.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const foldKey = (x) => (x || "").normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

let WHEN = {};
let BY_FOLD = {};
try {
  /* Gzipped on disk: 25 MB of plain JSON timed out a push, and this is a
     tenth of it. Read once for the whole build, so the inflate costs
     nothing per page. */
  /* RESOLVED FROM THE WORKING DIRECTORY, NOT FROM import.meta.url.
     Vite bundles this module into dist/chunks/, so at build time
     import.meta.url points there and a path relative to the source file
     resolves to nothing — the read threw, the catch swallowed it, and
     every surname page rendered with no timeline while the data sat on
     disk and the module worked perfectly when run on its own. A silent
     catch around a path is how that stays hidden. Both candidates are
     tried and the failure is reported rather than swallowed. */
  const tries = [
    resolve(process.cwd(), "../data/surname-timeline.json.gz"),
    resolve(process.cwd(), "data/surname-timeline.json.gz"),
    fileURLToPath(new URL("../../../data/surname-timeline.json.gz", import.meta.url)),
  ];
  let raw = null, lastErr = null;
  for (const f of tries) {
    try { raw = readFileSync(f); break; } catch (e) { lastErr = e; }
  }
  if (!raw) throw lastErr || new Error("surname-timeline.json.gz not found");
  WHEN = JSON.parse(gunzipSync(raw).toString("utf8")).when;
  for (const k of Object.keys(WHEN)) (BY_FOLD[foldKey(k)] ||= []).push(k);
} catch (e) {
  /* Loud, because a silent failure here looks exactly like "this surname
     has no timeline" on every page at once. */
  console.warn("surname timeline unavailable: " + e.message);
  WHEN = {};
  BY_FOLD = {};
}

/* Every form of one name, counted together.
 *
 * Defranceski has no notable namesake anywhere; De Franceschi has eleven, in
 * Italy from the 1550s and Croatia from the 1800s — the same family, which
 * is the entire reason the variants exist. The fold matters as much as the
 * aggregation: the corpus writes "de Franceschi" and Wikidata writes "De
 * Franceschi", so a literal comparison finds nothing at all. */
export function timelineFor(name, variants) {
  if (!Object.keys(BY_FOLD).length) return null;
  const family = new Set([name, ...(variants || []).map((v) => v.n)]);
  const out = {};
  const used = new Set();
  for (const f of family) {
    for (const real of BY_FOLD[foldKey(f)] || []) {
      used.add(real);
      for (const [cc, decs] of Object.entries(WHEN[real])) {
        for (const [dec, n] of Object.entries(decs)) {
          out[cc] ||= {};
          out[cc][dec] = (out[cc][dec] || 0) + n;
        }
      }
    }
  }
  const total = Object.values(out).reduce(
    (a, d) => a + Object.values(d).reduce((x, y) => x + y, 0), 0);
  if (!total) return null;
  const decades = [...new Set(Object.values(out).flatMap((d) => Object.keys(d)))]
    .map(Number).sort((a, b) => a - b);
  const rows = Object.entries(out)
    .map(([cc, d]) => ({ cc, d, tot: Object.values(d).reduce((x, y) => x + y, 0) }))
    .sort((a, b) => b.tot - a.tot);
  return { rows, decades, total, names: [...used].sort() };
}
