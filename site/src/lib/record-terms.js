// The terms for reading old registers (data/record-terms.json), read at build time.
import fs from "node:fs";
import path from "node:path";

export function recordTerms() {
  const p = path.resolve(process.cwd(), "..", "data", "record-terms.json");
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  let seen = { terms: {}, concepts: {} };
  try { seen = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "data", "record-terms-seen.json"), "utf8")); } catch (e) { /* the counts are optional: the cards just show less */ }
  // titleWords are how the counts were made, not something to ship to the reader
  const terms = (d.terms || []).map(({ titleWords, ...t }) => t).sort((a, b) => a.id.localeCompare(b.id, "en"));
  return { sources: d.sources || {}, terms, seen: { entries: seen.entries || 0, terms: seen.terms || {}, concepts: seen.concepts || {} } };
}
