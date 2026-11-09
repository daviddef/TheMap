import { parse } from "./ctx.mjs";
import { L } from "./life-corpus.mjs";
let pass = 0, fail = 0;
for (const c of L) {
  const p = parse(c.t), lf = p.life, probs = [];
  const gk = lf.groups.map((g) => g.key);
  (c.groups || []).forEach((k) => { if (!gk.includes(k)) probs.push("missing group " + k); });
  (c.none || []).forEach((k) => { if (gk.includes(k)) probs.push("unexpected group " + k + ": " + lf.groups.find((g) => g.key === k).items.join(" | ")); });
  if (c.married != null && lf.married !== c.married) probs.push("married " + lf.married + " want " + c.married);
  if (c.died === null && lf.died) probs.push("death invented: " + JSON.stringify(lf.died));
  if (c.died) {
    if (!lf.died) probs.push("no death read");
    else {
      if (c.died.cause && !String(lf.died.cause).includes(c.died.cause)) probs.push("cause '" + lf.died.cause + "' want '" + c.died.cause + "'");
      if (c.died.year != null && lf.died.year !== c.died.year) probs.push("year " + lf.died.year + " want " + c.died.year);
      if (c.died.age != null && lf.died.age !== c.died.age) probs.push("age " + lf.died.age + " want " + c.died.age);
    }
  }
  if (probs.length) { fail++; console.log("\n✗ " + c.id + ": " + c.t.slice(0, 90)); probs.forEach((x) => console.log("   - " + x)); if (process.argv[2] === "v") lf.groups.forEach((g) => console.log("     [" + g.title + "] " + g.items.join(" | "))); } else pass++;
}
console.log("\nlife stories: pass", pass, "fail", fail);
process.exitCode = fail ? 1 : 0;
