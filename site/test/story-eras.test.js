/* ONLY THE ERAS THAT MATTER. David: «why am i still seeing all eras expanded, e.g. croatia? when were talking about early 1900's? collapse the ones not relevant». A stop with no
   year of its own is read over the story's years, decades told in words included. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = ["public/index.json", "public/given-names.json", "public/regions.json"].every((f) => fs.existsSync(path.join(SITE, f)));

test("the story's years take in a decade told in words", { skip: !BUILT && "needs the built public/ data" }, async () => {
  const { read } = await import("./plan/harness.mjs");
  const { g } = await read(fs.readFileSync(path.join(SITE, "test/plan/drezhik-story.txt"), "utf8").trim());
  assert.deepEqual(g.facts.told, [1910, 1942]);
});

test("a stop with no year hides the eras outside the story's years, behind a button that opens them", () => {
  const eng = fs.readFileSync(path.join(SITE, "public/js/story-engine.js"), "utf8");
  assert.match(eng, /story = !years\.length && storyYears\(\) \|\| null/);
  assert.match(eng, /else if \(inStory\) \{ lo = story\[0\]; hi = story\[1\]; \}/);
  assert.match(eng, /Show only your story's years/);
});
