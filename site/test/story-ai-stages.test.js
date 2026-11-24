/* The AI ready panel put away its question once it has an answer: David's screen showed the tick box, the "what will be sent" copy and the button still sitting
   above "The story box now holds the AI ready version". The panel is in three stages (ask, result, done), set by story-ai.js and read by the CSS. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const js = fs.readFileSync(path.join(here, "../public/js/story-ai.js"), "utf8");
const page = fs.readFileSync(path.join(here, "../src/pages/read.astro"), "utf8");

test("the panel moves ask -> result -> done", () => {
  assert.match(js, /panel\.setAttribute\("data-stage", "ask"\)/);
  assert.match(js, /function drawTidy[\s\S]{0,120}data-stage", "result"/);
  assert.match(js, /function drawPost[\s\S]{0,120}data-stage", "result"/);
  assert.match(js, /function drawUndo[\s\S]{0,120}data-stage", "done"/);
});

test("once there is an answer the tick box, the copy of what was sent and the button are hidden", () => {
  for (const stage of ["result", "done"]) {
    assert.match(page, new RegExp('\\.sp-aipanel\\[data-stage="' + stage + '"\\] \\.sp-aip-ok'));
    assert.match(page, new RegExp('\\.sp-aipanel\\[data-stage="' + stage + '"\\] \\.sp-aip-act'));
    assert.match(page, new RegExp('\\.sp-aipanel\\[data-stage="' + stage + '"\\] \\.sp-aip-send'));
  }
});

test("the panel is as wide as the story box, not a narrower column beside it", () => {
  const rule = page.match(/\.sp-aipanel \{[^}]*\}/)[0];
  assert.doesNotMatch(rule, /max-width/);
});
