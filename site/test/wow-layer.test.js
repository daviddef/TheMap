/* THE WOW LAYER. David, 25 Nov 2026: «more colour, better fonts, pills, cards... the rest of its pages, really dull, boring. no colour, too
   wordy, searches that should be unified... they need to be way more wow.» These hold the parts that let every page pick the look up without
   writing a colour of its own: a hue per part of the atlas, one search look, the flags atlas in the same dress, and Names as ONE search. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
const base = read("src/layouts/Base.astro");
const kit = read("src/styles/kit.css");
const tokens = read("public/styles.css");

test("every part of the atlas has a hue, and kit.css defines each one in light and dark", () => {
  const map = base.match(/const HUE_OF = \{([\s\S]*?)\};/)[1];
  const keys = new Set([...map.matchAll(/:\s*"([a-z]+)"/g)].map((m) => m[1]));
  assert.ok(keys.size >= 7, "teal, terra, rose, gold, plum, green and blue are all in use");
  for (const k of keys) {
    assert.match(kit, new RegExp(`main\\.hue-${k}\\s*\\{\\s*--hue:\\s*var\\(--h-${k}\\)`), `main.hue-${k} sets --hue`);
    const defs = kit.match(new RegExp(`--h-${k}:`, "g")) || [];
    assert.ok(defs.length >= 3, `--h-${k} is defined for light, for the OS dark preference and for the explicit dark choice`);
  }
  assert.match(base, /class=\{"hue-" \+ hueKey\}/, "<main> carries the hue class");
});

test("the three big sections are coloured differently (names, places, flags)", () => {
  const get = (seg) => base.match(new RegExp(`(?:"${seg}"|\\b${seg}):\\s*"([a-z]+)"`))[1];
  assert.equal(get("your-name"), "teal");
  assert.equal(get("places"), "terra");
  assert.equal(get("flags"), "rose");
});

test("the page header is a tinted card that reads the part's hue, and the pill, card and search parts exist", () => {
  assert.match(kit, /main \.pagehead \{[^}]*radial-gradient/);
  for (const c of [".k-card", ".k-pill", ".k-search", ".k-bar", ".k-ico", ".k-grid"]) assert.ok(kit.includes(c + " {") || kit.includes(c + ","), c + " is in the kit");
  assert.match(kit, /main \.k-search input\[type="search"\]/, "a page's own input rule cannot un-style the shared search box");
});

test("the body face is Figtree, loaded with Fraunces at its soft setting, and the lifted flag sheets follow it", () => {
  assert.match(tokens, /--sans:"Figtree","Source Sans 3"/);
  assert.match(base, /family=Figtree:wght@400\.\.800/);
  assert.match(base, /Fraunces:ital,opsz,wght,SOFT@/);
  const fp = read("src/lib/flag-pages.js");
  assert.match(fp, /replace\(\/"Source Sans 3"\/g, "var\(--sans\)"\)/);
  assert.match(fp, /\.flagpage \.country-card \.swatch-strip\{height:7px\}/);
});

test("Names is ONE search: the whole-name box is first and visible, the one-at-a-time finders sit folded under it", () => {
  const page = read("src/pages/your-name.astro");
  const first = page.indexOf("<SayYourFullName");
  const fold = page.indexOf('<details id="yn-one"');
  assert.ok(first > 0 && fold > first, "the whole-name box comes before the fold");
  assert.ok(page.indexOf("<SayYourName") > fold && page.indexOf("<SayYourSurname") > fold && page.indexOf("<SmartFind") > fold, "the other three searches are inside the fold");
  assert.doesNotMatch(page.slice(0, fold), /<SayYourName|<SayYourSurname|<SmartFind/);
  assert.match(page, /d\.open = true/, "an old ?n= or ?s= link opens the fold");
  const comp = read("src/components/SayYourFullName.astro");
  assert.match(comp, /class="k-search"/);
  assert.match(comp, /is-given/);
});

test("Places and the country cards: a flag-coloured edge, pills for the numbers, one search", () => {
  const cc = read("src/components/CountryCards.astro");
  assert.match(cc, /--cc:\$\{c\.flag\.color\}/);
  assert.match(cc, /<b>\{c\.places/);
  assert.match(cc, /border-top: 6px solid var\(--cc\)/);
  const pl = read("src/pages/places/[...page].astro");
  assert.doesNotMatch(pl, /<details class="cdir"/, "the country directory is not folded away");
  assert.match(pl, /<SmartFind/);
});

test("Flags: the hubs come before the 211 country cards, and the page uses the shared header", () => {
  const f = read("src/pages/flags/index.astro");
  assert.match(f, /html\.slice\(hi, ai\) \+ html\.slice\(ci, hi\)/, "hubs are moved above the countries");
  assert.match(f, /<Base title="Flags" wide/);
  assert.doesNotMatch(f, /\bbare\b/);
});

test("/read/ says which job the header is doing and the story box wears the search look", () => {
  const r = read("src/pages/read.astro");
  assert.match(r, /h1\.textContent = name === "story" \? "Tell a story" : HEAD0\.h1/);
  assert.match(r, /class="k-search"/);
  assert.match(r, /\.sp-drop \{ border: 2px solid/);
});

test("A to Z names, dated place names and the sources page: a filter or search in the shared look, and short titles", () => {
  const nm = read("src/pages/name/index.astro");
  assert.match(nm, /id="nm-q"/);
  assert.match(nm, /class="k-pill"/);
  const pn = read("src/pages/place-names.astro");
  assert.match(pn, /id="pn-q"/);
  assert.match(pn, /border-top: 5px solid var\(--c\)/);
  assert.match(read("src/pages/providers.astro"), /title="Sources"/);
  assert.match(read("src/pages/coverage.astro"), /title="Gaps"/);
});
