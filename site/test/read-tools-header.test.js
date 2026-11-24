/* /read/ IS THE STORY; THE THREE TOOLS ARE SMALL BUTTONS IN THE HEADER. David: «these 3 can they be small buttons on the right of the header, theme aligned? and the
   "start with a story" button can then disappear. so this is all about telling the story and providing tools.» */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(here, "../src/pages/read.astro"), "utf8");
const base = fs.readFileSync(path.join(here, "../src/layouts/Base.astro"), "utf8");
const css = fs.readFileSync(path.join(here, "../public/styles.css"), "utf8");

test("the header has a slot for tools, and the page puts its three tools there", () => {
  assert.match(base, /Astro\.slots\.has\("headtools"\)/);
  assert.match(base, /<slot name="headtools" \/>/);
  assert.match(page, /<div slot="headtools" class="rd-tools" role="tablist"/);
  for (const t of ["ask", "date", "word"]) assert.match(page, new RegExp('data-tool="' + t + '"'));
});

test("there is no «Start with your story» tab: the story is the page", () => {
  assert.doesNotMatch(page, /id="tab-story"/);
  assert.doesNotMatch(page, /Start with your story/);
  assert.doesNotMatch(page, /class="rd-pick"/);
});

test("a tool opens over the story and a second press goes back to it", () => {
  assert.match(page, /if \(name === now && name !== "story"\) name = "story";/);
  assert.match(page, /document\.getElementById\("tool-story"\)\.hidden = name !== "story"/);
});

test("the tools are the site's pills: small, rounded, the accent wash when on, stacked under the header on a phone", () => {
  assert.match(css, /\.rd-tab \{ display: inline-flex;[^}]*border-radius: 999px/);
  assert.match(css, /\.rd-tab\.is-on \{[^}]*var\(--accent-wash\)/);
  assert.match(css, /@media \(min-width: 900px\) \{ \.pagehead-tools \{ position: absolute; right: 0;/);
});
