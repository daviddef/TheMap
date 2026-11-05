// The terms for reading old registers (data/record-terms.json), read at build time.
import fs from "node:fs";
import path from "node:path";

export function recordTerms() {
  const p = path.resolve(process.cwd(), "..", "data", "record-terms.json");
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return { sources: d.sources || {}, terms: (d.terms || []).slice().sort((a, b) => a.id.localeCompare(b.id, "en")) };
}
