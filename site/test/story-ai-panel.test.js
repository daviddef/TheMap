/* The "Tidy the story with AI" panel: closed until asked for, and says why its button is off. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, "..", f), "utf8");

test("the panel's hidden attribute is not overridden by its own display rule", () => {
  const css = read("src/pages/read.astro");
  assert.match(css, /\.sp-aipanel\[hidden\][^{]*\{\s*display:\s*none/);
});

test("the panel shows what will be sent and says why the button is off", () => {
  const html = read("src/pages/read.astro"), js = read("public/js/story-ai.js");
  assert.match(html, /id="sp-aip-preview"/);
  assert.match(html, /id="sp-aip-why"/);
  assert.match(js, /Tick the box above/);
  assert.match(js, /preview\.textContent = text\.value\.trim\(\)/);
});
