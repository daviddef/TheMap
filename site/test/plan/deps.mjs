/* The data the page hands the plan, loaded from public/ the way the page's fetches would. */
import fs from "node:fs"; import path from "node:path";
import { PUB, SITE, A } from "./harness.mjs";
import { buildArchivesNear } from "../../src/lib/archives-near.js";
/* the classic script, loaded the way test/stress/ctx.mjs loads the engine */
export const todo = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(PUB, "js/story-todo.js"), "utf8"))(m); return m.exports; })();
const rd = (f) => JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8"));
const here = path.join(SITE, "..", "data");
let cache = null;
export function deps(g) {
  if (!cache) {
    const an = buildArchivesNear(JSON.parse(fs.readFileSync(path.join(here, "providers.json"), "utf8")), JSON.parse(fs.readFileSync(path.join(here, "provider-contacts.json"), "utf8")));
    const archives = an.rows.map((r) => ({ id: r[0], name: r[1], kind: r[2], access: r[3], cc: r[4], lat: r[5], lon: r[6], url: r[7], email: r[8], post: r[9], tel: r[10] }));
    const idx = rd("index.json");
    let allRows = idx.places.slice(); const td = idx.tail && idx.tail.dir; if (idx.tail && idx.tail.cells) for (const k of Object.keys(idx.tail.cells)) { try { allRows = allRows.concat(rd(td + k + ".json").places || []); } catch (e) {} } try { allRows = allRows.concat(rd("index-quiet.json").places || []); } catch (e) {}
    const prov = rd("providers.json"), pl = prov.providers || prov;
    cache = { archives, regions: rd("regions.json"), rows: allRows, countries: Object.fromEntries(Object.entries(idx.countries || {}).map(([k, v]) => [k, typeof v === "string" ? v : v.name || v.n || k])),
      provById: Object.fromEntries(archives.map((a) => [a.id, a]).concat(pl.map((p) => [p.id, p]))), base: "/" };
  }
  const at = todo.anchorOf(g), on = at && (at.village || at.info);   /* as the page does: the ground is the village's, where the story names one beside the town */
  return Object.assign({}, cache, { pickVolumes: A.pickVolumes, mort: g.mort, cemeteries: on && on.lat != null ? cemeteries(on.lat, on.lon) : null });
}
/* the burial-ground squares around a place, read from public/cem/ the way the page fetches them */
export function cemeteries(lat, lon) {
  const get = (f) => (fs.existsSync(path.join(PUB, f)) ? rd(f) : null), index = get("cem/index.json");
  if (!index) return { failed: true };
  const files = todo.cellsFor(lat, lon, index);
  return todo.cemeteriesFrom(index, files, files.map((f) => get(f.path)));
}
