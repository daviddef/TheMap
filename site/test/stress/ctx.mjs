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
  /* the page's own rule (F.gazWants / F.gazMerge), against the shard files on disk */
  const added = [];
  for (const w of F.gazWants(text, c.map, c.given)) {
    const key = win.raShardKey(w.ph, shardInfo.g || {}); if (!key) continue;
    let rows; try { rows = gcache[key] || (gcache[key] = JSON.parse(fs.readFileSync(path.join(SITE, "public/g", key + ".json"), "utf8"))); } catch (e) { continue; }
    const before = (c.map[w.ph] || []).slice();
    if (F.gazMerge(c.map, w, rows)) added.push([w.ph, before]);
  }
  try { return F.parseStory(text, c); } finally { added.forEach(([k, b]) => { if (b.length) c.map[k] = b; else delete c.map[k]; }); }
}
