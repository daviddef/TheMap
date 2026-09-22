/* BELGIUM, BY COMMUNE — the one country this atlas can draw properly.

   Every other surname register answers «how many people in this country
   carry this name». Statbel answers it for each of 565 communes, and
   Wikidata's P1567 gives each commune's coordinates, so for Belgian
   names the map can stop pointing at a country and point at towns.

   INVERTED ONCE PER BUILD. The file on disk is keyed by commune —
   510,811 rows of [surname, count] under 565 headings — which is the
   right shape for the source and the wrong one for a page about one
   name. Inverting it costs a couple of seconds and is then free for all
   19,779 pages; doing it per page would be 19,779 passes over half a
   million rows.

   MATCHED ON A FOLDED NAME, because the corpus and Statbel disagree
   about case and accents and nothing else. Anything cleverer — a
   spelling tier, a phonetic guess — would put people in towns on the
   strength of an algorithm, and the whole point of this layer is that a
   state counted them. */
import fs from "node:fs";
import path from "node:path";

const CANDIDATES = [
  path.join(process.cwd(), "..", "data", "belgium-by-municipality.json"),
  path.join(process.cwd(), "data", "belgium-by-municipality.json"),
];

let INDEX = null;

export function fold(s) {
  return String(s || "").normalize("NFKD")
    .replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function build() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  let raw = null;
  for (const f of CANDIDATES) {
    try { raw = JSON.parse(fs.readFileSync(f, "utf8")); break; } catch { /* next */ }
  }
  /* Absent is fine and must stay fine: this is one country's bonus, not
     a dependency. A missing file means no Belgian panel, not a failed
     build. */
  if (!raw) return INDEX;
  for (const m of raw.municipalities || []) {
    if (m.y == null || m.x == null) continue;   // undrawable, so skip
    for (const [name, c] of m.s || []) {
      const k = fold(name);
      let a = INDEX.get(k);
      if (!a) INDEX.set(k, (a = []));
      a.push({ m: m.m, nl: m.nl, fr: m.fr, y: m.y, x: m.x, c });
    }
  }
  return INDEX;
}

/** Communes where a surname is counted, commonest first. */
export function belgiumFor(name) {
  const rows = build().get(fold(name));
  if (!rows || !rows.length) return null;
  return rows.slice().sort((a, b) => b.c - a.c);
}
