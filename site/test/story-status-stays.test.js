/* "I tried, nothing happened." The button that has Claude read the writing on a photo did its work (or failed with a reason) and said so in #sp-status; the page then re-read the
   story, which cleared that line within a moment, and the line sat far below the box anyway. Now: the status line is inside the box, under the buttons, and what a button said
   stays until the reader types or starts over. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const js = fs.readFileSync(path.join(here, "../public/js/story-page.js"), "utf8");
const page = fs.readFileSync(path.join(here, "../src/pages/read.astro"), "utf8");

test("the status line is inside the story box, under the buttons", () => {
  const drop = page.slice(page.indexOf('<div class="sp-drop"'), page.indexOf('<section class="sp-aipanel"'));
  assert.match(drop, /id="sp-status"/);
  assert.equal((page.match(/id="sp-status"/g) || []).length, 1);
});

test("a message a button gave is held, and the page's own re-reading does not wipe it", () => {
  assert.match(js, /function sayDone\(\) \{ if \(hold\) say\(hold\.m, hold\.bad\); else say\(""\); \}/);
  assert.doesNotMatch(js, /then\(function \(g\) \{ say\(""\); last = g/);
  assert.match(js, /hold = \{ bad: !!res\.failed/);
  assert.match(js, /text\.addEventListener\("input", function \(\) \{\s*hold = null;/);
});

test("while Claude reads the button says so", () => {
  assert.match(js, /btn\.textContent = "Reading…"; say\("Reading the picture/);
  assert.match(js, /btn\.textContent = btnWas/);
});
