import { parse } from "./ctx.mjs";
const S = process.argv.slice(2);
for (const t of S) {
  const p = parse(t);
  console.log("\n» " + t.slice(0, 110));
  console.log("  rel=" + p.rel + " name=" + JSON.stringify(p.name) + " stops=" + p.stops.map(s => s.row.n + "/" + (s.year ?? "-") + "/" + s.role).join(">"));
  console.log("  people=" + (p.people || []).map(x => x.role + ":" + (x.name || "?") + (x.events ? "[" + x.events.map(e => e.type + (e.year || "") + (e.cause ? "~" + e.cause : "")).join(",") + "]" : "")).join(" | "));
  if (p.life) { console.log("  life: died=" + JSON.stringify(p.life.died) + " married=" + p.life.married); p.life.groups.forEach(g => console.log("    [" + g.title + "] " + g.items.join(" | "))); }
  const extra = Object.keys(p).filter(k => !["rel","given","surname","name","holds","left","born","from","to","teller","holdsAll","stops","route","people","occupations","occupation","givenWord","kin","life"].includes(k));
  if (extra.length) console.log("  other keys: " + extra.join(","));
}
