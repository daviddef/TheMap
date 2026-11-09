import { parse } from "./ctx.mjs";
for (const q of process.argv.slice(2)) {
  const p = parse(q);
  console.log("\n» " + q.slice(0, 110));
  console.log("  rel=" + p.rel + " name=" + JSON.stringify(p.name) + " stops=" + p.stops.map(s => s.row.n + "/" + s.row.cc + "/" + (s.year ?? "-") + "/" + s.role).join(" > "));
  console.log("  people=" + (p.people || []).map(x => x.role + ":" + (x.name || "?") + (x.events && x.events.length ? "[" + x.events.map(e => e.type + (e.year || "") + (e.place ? "@" + e.place.row.n : "")).join(",") + "]" : "")).join(" | ") + (p.kin ? "\n  kin=" + p.kin.map(k => k.label + ":" + k.stops.map(x => x.row.n + "/" + (x.year ?? "-") + "/" + x.role).join(">")).join(" | ") : ""));
}
