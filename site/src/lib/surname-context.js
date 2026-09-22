/* WHAT WIKIDATA SAYS A NAME IS — read from disk, cited, never adopted.

   Loaded the same way as the corpus, for the same reason: importing a
   large JSON asks Vite to inline it into a module and V8 dies
   stringifying it. See lib/surname-corpus.js, where that cost three
   wrong diagnoses.

   Everything this returns is somebody else's claim. The page must
   attribute it — «Wikidata records this as a Polish surname» — and not
   present it as the atlas's own finding, because Wikidata is
   crowd-sourced and wrong in places and the whole point of putting a
   citation next to every row is that a reader can go and check. */
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  path.join(process.cwd(), "..", "data", "surname-context.json"),
  path.join(process.cwd(), "data", "surname-context.json"),
];

let INDEX = null;

function load() {
  if (INDEX) return INDEX;
  INDEX = {};
  for (const f of CANDIDATES) {
    try {
      INDEX = JSON.parse(fs.readFileSync(f, "utf8")).surnames || {};
      break;
    } catch { /* absent is fine — this is context, not a dependency */ }
  }
  return INDEX;
}

export function contextFor(name) {
  const k = String(name || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").trim();
  return load()[k] || null;
}
