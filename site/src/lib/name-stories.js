// The sourced stories about names (data/name-stories.json), read at build time.
import fs from "node:fs";
import path from "node:path";

export function stories() {
  const p = path.resolve(process.cwd(), "..", "data", "name-stories.json");
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  return Object.entries(d.stories || {})
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => a.title.localeCompare(b.title, "en"));
}
