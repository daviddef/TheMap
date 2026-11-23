/* FRONT DOOR V2 must stay a new way in to the SAME map, not a second map that drifts.
   These tests hold the three promises the page makes: it renders the home page's own components with the home page's own settings (so every
   capability is there because it is the same code), the two front doors link to each other, and every door on its card goes somewhere
   that exists. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const home = read("src/pages/classic.astro");   /* the old layout, kept at /classic/ */
const v2 = read("src/pages/index.astro");       /* the front door, the home page since 23 Nov 2026 */

/* the props passed to <RecordMap ... />, as a sorted list of name=expression */
function mapProps(src) {
  const m = src.match(/<RecordMap([\s\S]*?)\/>/);
  assert.ok(m, "a <RecordMap /> element");
  return [...m[1].matchAll(/(\w+)=\{([^}]*(?:\([^)]*\))?[^}]*)\}/g)].map((x) => x[1] + "=" + x[2].replace(/\s+/g, "")).sort();
}

test("v2 renders the home page's own map with exactly the home page's data sources", () => {
  const a = mapProps(home), b = mapProps(v2);
  assert.ok(a.length >= 15, "the home page passes its sources to the map");
  assert.deepEqual(b, a);
});

test("v2 carries every component the home page carries, apart from the prose it repeats", () => {
  for (const c of ["RecordMap", "ProgressKit", "VolumeMarks", "StoryDrawer", "InventoryPill"]) {
    assert.match(home, new RegExp("<" + c + "[\\s/]"), c + " is on the home page");
    assert.match(v2, new RegExp("<" + c + "[\\s/]"), c + " is on v2");
  }
});

test("the front door is the indexed home page and the classic view is its not-indexed twin; /v2/ sends on", () => {
  assert.match(home, /href=\{u\("\/"\)\}/, "the classic view links back to the front door");
  assert.match(home, /<Base\b[^>]*\bnoindex\b/, "the classic view is not indexed");
  assert.match(v2, /href=\{u\("\/classic\/"\)\}[^>]*>Classic view/, "the front door offers the classic view");
  assert.doesNotMatch(v2, /<Base\b[^>]*\bnoindex\b/, "the home page is indexed");
  assert.match(v2, /title="Record Atlas"/);
  assert.doesNotMatch(v2, /Front door v2|fd2-top/, "no trial labels on the home page");
  assert.match(v2, /"@type": "SearchAction"/, "the structured data moved with the home page");
  assert.match(v2, /<HomeAbout \/>/, "the page's words are in the server-rendered HTML");
  assert.doesNotMatch(home, /SearchAction|<HomeAbout/, "the classic view carries neither");
  const old = read("src/pages/v2.astro");
  assert.match(old, /location\.replace\(home \+ location\.search \+ location\.hash\)/, "an old /v2/ link keeps its query");
  assert.match(old, /noindex/);
});

test("the map look is one button in the icon column, and the strip it opens is hidden until asked for", () => {
  const css = read("public/front-door-v2.css"), rm = read("src/components/RecordMap.astro");
  assert.match(rm, /ra-histctl ra-lookctl/);
  assert.match(rm, /classList\.toggle\("fd2-looks-on", on\)/);
  assert.match(rm, /\}, true\);   \/\* capture: the switcher stops the click/, "a pick closes the strip even though the switcher stops the click");
  assert.match(css, /\.fd2-stage:not\(\.fd2-looks-on\) \.ra-base \{ display: none !important; \}/);
});

test("on a phone the Year sits in the row of the bookmark and filter buttons while it is off", () => {
  const css = read("public/front-door-v2.css");
  assert.match(css, /\.fd2-stage \.ra-bar-find \.ra-time:not\(\.on\) \{ flex: 1 1 0; min-width: 0; margin: 0;/);
  assert.match(css, /\.fd2-stage \.ra-bar-find #ra-count \{ order: 10; \}/, "the full-width count line must not wedge between the buttons and the Year");
});

test("every door on the card goes somewhere that exists", () => {
  const js = read("public/js/front-door-v2.js");
  const hrefs = [...js.matchAll(/href: "(\/[a-z-]+\/)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 3, "the card's link doors");
  const more = [...js.matchAll(/url\("(\/[a-z-]+\/)"\)/g)].map((m) => m[1]);
  for (const h of new Set([...hrefs, ...more])) {
    const p = h.replace(/\//g, "");
    assert.ok(existsSync(join(root, "src/pages", p + ".astro")) || existsSync(join(root, "src/pages", p, "index.astro")), h + " is a page");
  }
});

test("the stylesheet and script v2 loads exist, and the skin is scoped so it cannot touch another page", () => {
  assert.ok(existsSync(join(root, "public/front-door-v2.css")));
  assert.ok(existsSync(join(root, "public/js/front-door-v2.js")));
  const css = read("public/front-door-v2.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const bad = css.split("}").map((b) => b.split("{")[0].trim()).filter((sel) => sel && !sel.startsWith("@") && !sel.startsWith("from") && !sel.startsWith("to") && !/^\d+%/.test(sel))
    .filter((sel) => sel.split(",").some((s) => s.trim() && !/^(body\.fd2|\.fd2-|body\.fd2-)/.test(s.trim())));
  assert.deepEqual(bad, [], "every selector starts with .fd2-… or body.fd2");
});

test("a closed search panel stays closed: the skin's display rule must not beat the hidden attribute", () => {
  const css = read("public/front-door-v2.css");
  assert.match(css, /\.fd2-stage \.at-body\[hidden\]\s*\{\s*display:\s*none\s*!important/, "hidden panel stays hidden");
});

test("the footer keeps the licence holders by name and sends the full credits to the sources page; every source is in the menu", () => {
  const base = read("src/layouts/Base.astro"), prov = read("src/pages/providers.astro"), nav = read("src/lib/nav.js");
  for (const n of ["OpenStreetMap", "GeoNames", "Statbel", "Istat", "National Records of Scotland", "Townlands.ie", "Trove", "Wikidata", "Wiktionary"]) {
    assert.ok(base.includes(n), "footer names " + n);
  }
  assert.match(base, /\/providers\/#credits/, "footer links to the credits section");
  assert.match(prov, /<DataCredits\s*\/>/, "the sources page carries the credits");
  assert.ok(existsSync(join(root, "src/components/DataCredits.astro")));
  assert.match(nav, /\["\/providers\/",\s*"Every source"\]/, "About menu lists every source");
});

test("on a phone the suggestion list and the answer card are never open together", () => {
  const css = read("public/front-door-v2.css");
  assert.match(css, /\.fd2-stage:has\(#ra-q:focus\):has\(\.ra-sug:not\(\[hidden\]\)\) \.at-panel\s*\{\s*display:\s*none/, "the answer waits while the list is open");
});
