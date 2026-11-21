// The What's new sparkle icon: made by theme.js beside the Tree Canvas icon, labelled twin in the phone drawer, same news dot.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("theme.js makes the What's new icon, before the light/dark toggle", () => {
  const s = read("public/js/theme.js");
  assert.match(s, /className = "ra-news"/);
  assert.match(s, /"whats-new\/"/);
  assert.ok(s.indexOf('"ra-news"') < s.indexOf('make("ra-theme")'), "icon is added before the toggle");
  assert.match(s, /aria-label/);
});
test("the drawer has the labelled twin and the news dot reaches both", () => {
  const b = read("src/layouts/Base.astro");
  assert.match(b, /class="dq dq-news"/);
  assert.match(b, /nav\.querySelector\("\.ra-news"\)/);
  assert.match(b, /querySelector\("\.dq-news"\)/);
});
test("styles: round, same size as the Reader, six drawer columns", () => {
  const c = read("public/styles.css");
  assert.match(c, /header\.site nav \.ra-news \{[^}]*width: 38px; height: 38px[^}]*border-radius: 50%/);
  assert.match(c, /\.drawer \.dquick\{display:grid;grid-template-columns:repeat\(6,/);
});
