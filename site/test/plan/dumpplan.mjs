import { read } from "./harness.mjs"; import { STORIES } from "./stories.mjs";
const only = process.argv[2];
for (const s of STORIES) { if (only && s.id !== only) continue; const { g } = await read(s.t);
  console.log("\n=== " + s.id + "  steps=" + (g.plan || []).length);
  for (const st of g.plan || []) { console.log(` ${st.n}. ${st.title} — ${st.why}`); for (const it of st.items || []) console.log(`     • ${it.text}${it.href ? "  -> " + it.href : ""}`); for (const l of st.links || []) console.log(`     ↪ ${l.text} -> ${l.href}`); if (st.ask) console.log("     ASK: " + st.ask); if (st.not) console.log("     NOT: " + st.not); } }
