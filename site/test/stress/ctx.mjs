import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
/* Runs against the BUILT data in site/public (index.json, pi/, g/, given-names.json): `npm run build` or the dev server first. Not part of `npm test`. */
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (f) => fs.readFileSync(path.join(SITE, "public/js", f), "utf8");
const rd = (f) => JSON.parse(fs.readFileSync(path.join(SITE, "public", f), "utf8"));
export const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
export const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();
const idx = rd("index.json");
let rows = idx.places.slice();
const tailDir = idx.tail && idx.tail.dir;
if (idx.tail && idx.tail.cells) for (const k of Object.keys(idx.tail.cells)) { try { rows = rows.concat(rd(tailDir + k + ".json").places || []); } catch (e) {} }
try { rows = rows.concat(rd("index-quiet.json").places || []); } catch (e) {}
const g = rd("given-names.json");
export const ctx = { map: A.buildMap(rows), given: A.buildGiven(g.rows || []), skip: {}, countries: idx.countries || {} };
export const rowCount = rows.length;

/* the page's resolveMissing, run against the shard files on disk: a name after in/at/from/near/to that the index lacks is looked up in the worldwide gazetteer */
const win = {}; new Function("window", src("shard-key.js"))(win);
const shardInfo = rd("shards.json");
const gcache = {};
export function parse(text, c = ctx) {
  const fold = A.fold, want = [], re = /\b(?:in|at|from|near|to|en|nach|aus|von|iz|nel|nella)\s+(\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){0,2})/gu; let m;
  while ((m = re.exec(String(text || "")))) {
    const ws = m[1].split(/\s+/);
    for (let n = ws.length; n >= 1; n--) { const ph = fold(ws.slice(0, n).join(" ")); if (c.map[ph]) break; want.push(ph); }
  }
  const w2 = want.filter((ph, i) => ph.length >= 4 && want.indexOf(ph) === i && !c.map[ph] && !(c.given && c.given[ph])).slice(0, 6);
  const added = [];
  for (const ph of w2) {
    const key = win.raShardKey(ph, shardInfo.g || {}); if (!key) continue;
    let rows; try { rows = gcache[key] || (gcache[key] = JSON.parse(fs.readFileSync(path.join(SITE, "public/g", key + ".json"), "utf8"))); } catch (e) { continue; }
    const hit = rows.filter((r) => fold(r[0]) === ph || (r[4] || []).some((a) => fold(a) === ph)).slice(0, 4);
    if (!hit.length) continue;
    c.map[ph] = hit.map((r) => ({ i: "g-" + ph.replace(/ /g, "-") + "-" + String(r[3]).toLowerCase() + "-" + Math.round(r[1] * 100), n: r[0], y: r[1], x: r[2], cc: r[3], c: 0, gaz: 1 })); added.push(ph);
  }
  try { return F.parseStory(text, c); } finally { added.forEach((k) => delete c.map[k]); }
}
