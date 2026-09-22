/* THE CORPUS IS READ FROM DISK, NOT IMPORTED.

   Four build entrypoints used to `import surn from "../data/surnames.json"`
   — three pages and the sitemap. The sitemap was missed on the first
   attempt at this fix, and the build failed identically, which is the
   useful part: ONE surviving import is enough. The import asks Vite to
   inline the whole corpus into a JavaScript module. At 110 MB
   that worked. At 152 MB — the size after Denmark's 294,496 names — it
   does not, and the way it fails is worth recording because it sent this
   project after the wrong thing twice.

     FATAL ERROR: Zone Allocation failed - process out of memory
       v8::internal::FastJsonStringifier<…>::TrySerializeSimpleObject

   Fifty-five seconds in, at «Building static entrypoints», with the heap
   at 1.4 GB. Not the page loop, not the 16,138 pages, and nowhere near
   --max-old-space-size, which had been raised twice by someone assuming
   the ceiling was the problem. V8 was stringifying the corpus into a
   module's source text and ran out of ZONE memory — a compiler arena the
   heap flag does not govern. Raising the ceiling could never have fixed
   it.

   Read from disk, the corpus never enters the module graph: no inlining,
   no stringify, one parse, cached for the build. It is also strictly
   better for the 110 MB case, which was paying the same cost quietly.

   Static output only. This runs at build time, on a machine that has the
   file; nothing here reaches the browser. */
import fs from "node:fs";
import path from "node:path";

/* RESOLVED FROM THE PROJECT ROOT, NOT FROM THIS FILE.

   The first version used import.meta.url, which is correct in source and
   wrong once Vite has bundled: at build time this module runs from
   dist/chunks/, so "../data/surnames.json" resolved to dist/data and the
   build died with ENOENT. The corpus is an input that sits at a known
   place relative to the Astro project, and `astro build` runs with that
   project as its working directory, so that is what to ask. */
const CANDIDATES = [
  path.join(process.cwd(), "src", "data", "surnames.json"),
  path.join(process.cwd(), "site", "src", "data", "surnames.json"),
];

let cached = null;

export function corpus() {
  if (cached !== null) return cached;
  for (const f of CANDIDATES) {
    if (fs.existsSync(f)) {
      cached = JSON.parse(fs.readFileSync(f, "utf8"));
      return cached;
    }
  }
  // Loud, and naming every place looked. A silent {} here becomes
  // «cannot read properties of undefined» four steps away in a page,
  // which is how this project lost an afternoon once before.
  throw new Error(
    "surnames.json not found — looked in:\n  " + CANDIDATES.join("\n  ") +
    "\nRun `npm run data` (scripts/build-surnames.py writes it).");
}

export default corpus;
