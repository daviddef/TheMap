/* WHICH GENERATED PAGES ARE WORTH A SEARCH ENGINE'S TIME, decided once for the pages and for the sitemap.
 *
 * The AdSense audit of 10 Nov 2026 measured the generated tail: a surname page that exists only because its spelling links to another
 * name and three registers counted it is one sentence of its own inside about 5,000 words of template (98% of its six-word runs are on
 * other surname pages); a given-name page with no meaning and no bearers is the same; a place with no volumes, no collections and no
 * other name is a map pin and a neighbours list. They keep their pages for the visitor who arrives from the atlas, and are kept out of
 * the sitemap and marked noindex, follow, until they have something of their own to say. Nothing is deleted.
 *
 * ONE RULE PER KIND, imported by the page and by sitemap-index.xml.js, because two copies of a derived set is how the sitemap once
 * listed 3,577 of 17,961 surname pages. */
import fs from "node:fs";
import path from "node:path";
import { holdsMember } from "./surname-families.js";

/* A place has something of its own when a book or a collection is catalogued for it, or it is known by another name. */
export function placeHasOwn(det, place) {
  const d = det || {}, p = place || {};
  return ((d.volumes || []).length + (d.collections || []).length + (d.names || []).length
        + (p.collections || []).length + (p.names || []).length) > 0;
}
const _memo = new Map();   // the sitemap asks for the same set several times
export function placeIndexable(place) {
  if (_memo.has(place.id)) return _memo.get(place.id);
  const v = placeIndexableRead(place); _memo.set(place.id, v); return v;
}
function placeIndexableRead(place) {
  let det = {};
  try { det = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "p", place.id + ".json"), "utf8")); }
  catch (e) { return true; }   // no detail file: do not hide a page on a guess
  return placeHasOwn(det, place);
}

/* A surname earns the index when somebody checked (curated variants), a family archive placed it, or it is in the Atlas's catalogue of
   spellings. The bare "spelling" tier, the great majority, keeps its page and stays out of the sitemap. */
export function surnameIndexable(r) {
  if (!r) return false;
  return (r.variants || []).some((x) => x.how === "curated")
      || (r.countries || []).some((c) => c.how === "archive")
      || holdsMember(r.n);
}

/* A given name earns the index when it has a sourced meaning, a bearers chart or a story. */
export function nameIndexable(id, N, storyIds) {
  return !!(N.meanings && N.meanings[id]) || !!(N.bearers && N.bearers[id]) || !!(storyIds && storyIds.has(id));
}
