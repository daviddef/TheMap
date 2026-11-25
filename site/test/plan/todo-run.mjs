import { read } from "./harness.mjs"; import { STORIES } from "./stories.mjs"; import { deps } from "./deps.mjs"; import { todo as T } from "./deps.mjs";
const only = process.argv[2];
for (const s of STORIES) { if (only && s.id !== only) continue; const { g } = await read(s.t); const plan = T.build(g, deps(g));
  console.log("\n=== " + s.id + " — anchor: " + (plan.anchor && plan.anchor.where) + (plan.anchor && plan.anchor.region ? " | region: " + plan.anchor.region : "") + (plan.anchor && plan.anchor.years ? " | years " + plan.anchor.years.lo + "–" + plan.anchor.years.hi : ""));
  plan.notes.forEach((n) => console.log("  NOTE: " + n));
  plan.today.forEach((t) => console.log(`  TODAY ${t.n} ${t.title}: ${t.text}`));
  if (process.env.BRIEF) { for (const sec of plan.sections) console.log("  [" + sec.title + "] " + sec.items.length + ": " + sec.items.slice(0, 3).map((i) => (i.gap ? "(gap) " : "") + i.title.slice(0, 60)).join(" | ")); continue; }
  for (const sec of plan.sections) { console.log("  [" + sec.title + "]"); for (const i of sec.items) console.log(`    ${i.gap ? "·" : "•"} ${i.title}${i.tag ? " {" + i.tag + "}" : ""}\n        why: ${i.why}${i.detail ? "\n        " + i.detail : ""}${i.draft ? "\n        DRAFT(" + i.draft.language + "): " + i.draft.text.slice(0, 90) + "…" : ""}`); } }
