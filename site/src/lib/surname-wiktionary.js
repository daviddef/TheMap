/* WHAT WIKTIONARY SAYS A NAME IS — read from disk, cited, never adopted.

   The twin of surname-context.js, loaded the same way and for the same
   reason: importing a large JSON asks Vite to inline it into a module and
   V8 dies stringifying it.

   TWO SOURCES, NOT ONE MERGED ANSWER. Wikidata's structured fields reach
   about a tenth of this atlas's names and that is its ceiling; the
   standard printed authority is not openly licensed. Wiktionary is CC
   BY-SA 4.0 and far wider. They can and do disagree about a name, and the
   pages show them disagreeing, each with its own citation, rather than
   folding both into one confident sentence with nobody's name on it.

   SHARE-ALIKE. CC BY-SA obliges attribution wherever this is shown.
   check-data.py refuses a build whose /data/ page does not name the
   licence, and check-built.py refuses one whose SHIPPED home and surname
   pages do not name Wiktionary. Both are gates rather than habits. */
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  path.join(process.cwd(), "..", "data", "surname-wiktionary.json"),
  path.join(process.cwd(), "data", "surname-wiktionary.json"),
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

export function wiktionaryFor(name) {
  const k = String(name || "").toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").trim();
  return load()[k] || null;
}
