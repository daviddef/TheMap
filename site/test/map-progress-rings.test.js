/* The progress rings on the map (RecordMap.astro). Repainting them after every story read was (places x marks) string tests, a two second
   freeze per read; the rings are now counted in one pass over the marks and looked up per place. These lines keep it that way. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/components/RecordMap.astro", import.meta.url), "utf8");

test("the rings are counted in one pass, and a place is looked up, not rescanned", () => {
  const f = /function paintProgressRings\(\) \{[\s\S]*?\n  \}\n/.exec(src);
  assert.ok(f, "paintProgressRings is there");
  assert.match(f[0], /progressCounts\(\)/, "it counts once");
  assert.doesNotMatch(f[0], /progressOf\(/, "and does not call the per-place scan for every marker");
});

test("progress announcements arrive in a burst and repaint once", () => {
  assert.match(src, /clearTimeout\(paintT\);\s*paintT = setTimeout\(function \(\) \{ paintProgressRings\(\)/);
});
