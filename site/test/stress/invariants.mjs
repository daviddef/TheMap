/* THE CONSISTENCY CHECK OVER EVERYTHING: runs public/js/story-check.js (nothing lost, nothing invented, consistent) on every story in the three corpora and on the fuzz
   generator's stories, and prints how many are flagged, per code, and each flagged story with its problems. It asserts nothing and changes no pass/fail in run.mjs: it is the
   measuring stick, used to find the reader's real bugs and the checker's false positives.
     node test/stress/invariants.mjs            # per-code counts + every low-confidence story
     node test/stress/invariants.mjs v          # also the medium/info notes on stories that stay high-confidence
     node test/stress/invariants.mjs corpus     # only the hand corpora (no fuzz);  fuzz = only the fuzz;  life = only the life corpus
     node test/stress/invariants.mjs json       # machine-readable, for classification
   Needs the built public/ data like the rest of this folder. */
import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
import { A, ctx, parse } from "./ctx.mjs";
import { C as C1 } from "./corpus.mjs";
import { C as C2 } from "./corpus-adversarial.mjs";
import { L } from "./life-corpus.mjs";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const M = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js/story-check.js"), "utf8"))(M);
const K = M.exports;
const countryNames = new Set(Object.values(ctx.countries || {}).map((n) => A.fold(n)));
export const opts = { countries: ctx.countries, isPlace: (k) => !!(ctx.map[k] && ctx.map[k].length) || countryNames.has(k), isGiven: (k) => !!(ctx.given && ctx.given[k]) };

/* the same generator as fuzz.mjs (same seed), so the same 3000 stories */
function fuzzStories(n = 3000) {
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const pick = (a) => a[Math.floor(rnd() * a.length)];
  const V = {
    rel: ["My grandfather", "my grandmother", "My father", "my mum", "His father", "Her mother", "My great grandfather", "My uncle", "I", "We", "They", "He", "She", "my name is Anna", "My wife", "My son"],
    verb: ["was born in", "moved to", "came from", "lived in", "died in", "married in", "emigrated to", "left", "returned to", "settled in", "worked in", "was from", "went to", "arrived in", "grew up in"],
    place: ["Cork", "Dublin", "Boston", "Naples", "Zagreb", "Brisbane", "Perth", "Springfield", "Paris", "London", "Georgia", "Jordan", "Florence", "Victoria", "Sydney", "Rijeka", "Fiume", "Łódź"],
    year: ["1900", "in 1923", "1950s", "'45", "c. 1880", "1066", "1999.", "(1922)", "1900-1950"],
    name: ["Anton Kovac", "Maria Rossi", "John", "Ivan", "Giovanni Bianchi", "O'Brien", "van der Berg", "de la Cruz", "Mary-Jane"],
    occ: ["a stonemason", "a farmer", "a miner", "worked as a baker", "a priest", "a soldier"],
  };
  const parts = ["rel", "verb", "place", "year", "name", "occ"], out = [];
  for (let i = 0; i < n; i++) {
    const len = 1 + Math.floor(rnd() * 24), s = [];
    for (let j = 0; j < len; j++) { const k = pick(parts); s.push(pick(V[k])); if (rnd() < 0.3) s.push(pick([".", ",", ";", ".\n"])); }
    out.push({ id: "fuzz-" + i, t: s.join(" ") });
  }
  return out;
}

export function runOne(t) {
  let p; try { p = parse(t); } catch (e) { return { crash: e.message }; }
  return K.check(t, p, opts);
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);   /* importing this file (the unit tests and probes use `opts`, `runOne`) does not run the report */
function main() {
  const arg = process.argv.slice(2), verbose = arg.includes("v"), asJson = arg.includes("json");
  const only = ["corpus", "fuzz", "life"].find((x) => arg.includes(x));
  const sets = [];
  if (!only || only === "corpus") sets.push(["corpus", C1.concat(C2)]);
  if (!only || only === "life") sets.push(["life", L.map((x) => ({ id: x.id, t: x.t }))]);
  if (!only || only === "fuzz") sets.push(["fuzz", fuzzStories()]);

  const report = { sets: {}, flagged: [] };
  for (const [name, list] of sets) {
    const codes = {}, sev = {}; let n = 0, low = 0, crashed = 0, skipped = 0;
    for (const c of list) {
      if (!c.t || c.t.replace(/\s+/g, "").length < 8) { skipped++; continue; }
      n++;
      const r = runOne(c.t); if (r.crash) { crashed++; continue; }
      r.problems.forEach((x) => { codes[x.code + "/" + x.severity] = (codes[x.code + "/" + x.severity] || 0) + 1; });
      if (r.confidence === "low") { low++; report.flagged.push({ set: name, id: c.id, text: c.t, problems: r.problems.filter((x) => x.severity !== "info").map((x) => ({ code: x.code, sev: x.severity, words: x.words, what: x.what })) }); }
      else if (verbose && r.problems.length) report.flagged.push({ set: name, id: c.id, text: c.t, note: true, problems: r.problems.map((x) => ({ code: x.code, sev: x.severity, words: x.words, what: x.what })) });
    }
    report.sets[name] = { stories: n, lowConfidence: low, skipped, crashed, codes };
  }
  if (asJson) { console.log(JSON.stringify(report)); process.exit(0); }
  for (const [name, s] of Object.entries(report.sets)) {
    console.log(`\n${name}: ${s.stories} stories, ${s.lowConfidence} flagged low-confidence (${(100 * s.lowConfidence / Math.max(1, s.stories)).toFixed(1)}%)` + (s.skipped ? `, ${s.skipped} too short to check` : "") + (s.crashed ? `, ${s.crashed} crashed the reader` : ""));
    Object.entries(s.codes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log("   " + String(v).padStart(5) + "  " + k));
  }
  const show = report.flagged.filter((f) => f.set !== "fuzz" || verbose).slice(0, 400);
  for (const f of show) {
    console.log(`\n${f.note ? "· " : "✗ "}${f.set}/${f.id}: ${f.text.slice(0, 130).replace(/\n/g, " / ")}`);
    f.problems.forEach((x) => console.log(`     ${x.sev.padEnd(6)} ${x.code}: ${x.what}`));
  }

}
if (IS_MAIN) main();
