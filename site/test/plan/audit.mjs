import { read, PUB } from "./harness.mjs"; import { STORIES } from "./stories.mjs"; import fs from "node:fs";
const hav = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const cem = JSON.parse(fs.readFileSync(PUB + "/cemeteries-osm.json")).features, cwd = JSON.parse(fs.readFileSync(PUB + "/cemeteries-wikidata.json")).features;
const only = process.argv[2];
for (const s of STORIES) { if (only && s.id !== only) continue;
  const { g } = await read(s.t); const f = g.facts || {};
  console.log("\n=== " + s.id);
  const stops = (f.route || []).concat((f.kin || []).flatMap(k => (k.stops || []).map(x => Object.assign({ via: k.label }, x))));
  for (const x of stops) { const i = x.info; if (!i) continue;
    const arch = (i.provs || []).filter(p => p.at && p.at.lat != null && i.lat != null).map(p => ({ n: p.name, km: Math.round(hav(i.lat, i.lon, p.at.lat, p.at.lon)), k: p.kind })).sort((a, b) => a.km - b.km).slice(0, 3);
    const c1 = cem.filter(c => hav(i.lat, i.lon, c.y, c.x) <= 15).length, c2 = cwd.filter(c => hav(i.lat, i.lon, c.y, c.x) <= 15).length;
    console.log(`  ${x.via ? "[" + x.via + "] " : ""}${i.name}/${i.cc} @${i.lat},${i.lon} role=${x.role} year=${x.year || "-"} cols=${(i.cols || []).length} near=${(i.near || []).length} region=${i.region && (i.region.n || i.region.name || JSON.stringify(i.region).slice(0, 40))} eras=${(i.eras || []).length} regimes=${(i.regimes || []).length}`);
    console.log(`      archives<150km: ${arch.map(a => a.n + " " + a.km + "km").join(" | ") || "none"}; cemeteries<=15km: osm ${c1}, wikidata ${c2}`); }
  console.log(`  mort events: ${JSON.stringify(g.mort).slice(0, 160)}; life groups: ${((g.life && g.life.groups) || []).map(x => x.title).join(", ")}`);
}
