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
  assert.match(page, /data-tool="read"/, "the three tools are one: Interpret a record");
  for (const t of ["ask", "date", "word"]) assert.doesNotMatch(page, new RegExp('data-tool="' + t + '"'));
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

/* THE TOOLS MENU. David: «a new menu "Tools", and add the read register, decode a date, find a word, tell a story and the 2 data items»; then «add the tree canvas to that menu». */
test("the Tools menu holds the tools, the Tree Canvas and the two data links, and About no longer does", async () => {
  const { nav } = await import("../src/lib/nav.js");
  const tools = nav.find(([l]) => l === "Tools"), about = nav.find(([l]) => l === "About");
  assert.ok(tools && Array.isArray(tools[1]));
  const hrefs = tools[1].map((r) => r[0]);
  for (const h of ["/read/#story", "/read/#read", "/tree-canvas/", "/data/", "/connect/"]) assert.ok(hrefs.includes(h), h);
  assert.equal(tools[1].find((r) => r[0] === "/tree-canvas/")[2].newTab, true);
  const aboutHrefs = about[1].map((r) => r[0]);
  for (const h of ["/read/#story", "/data/", "/connect/"]) assert.ok(!aboutHrefs.includes(h), h);
  assert.ok(nav.findIndex(([l]) => l === "Tools") < nav.findIndex(([l]) => l === "About"));
});

test("a menu row may open in a new tab, in the bar and in the drawer", () => {
  for (const f of ["../src/layouts/Base.astro", "../src/pages/roots/index.astro"]) {
    const s = fs.readFileSync(path.join(here, f), "utf8");
    assert.equal((s.match(/links\.map\(\(\[h, l, o\]\)/g) || []).length, 2, f);
    assert.match(s, /href=\{u\(h\)\}[^>]*target=\{o\?\.newTab/);
  }
});

test("with the reader open the one header button says «Tell a story» and goes back; with the story open it says «Interpret a record»", () => {
  assert.match(page, /<span class="rd-lbl">Interpret a record<\/span>/);
  assert.match(page, /lbl\.textContent = on \? "Tell a story" : "Interpret a record"/);
  assert.match(page, /t\.classList\.remove\("is-on"\)/, "it is where you go next, not where you are");
});
