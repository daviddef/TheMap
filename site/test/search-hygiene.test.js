/* THE ATLAS'S OWN WORKING PAGES ARE NOT FOR A SEARCH ENGINE, and the front page and the place pages say true things in the HTML a crawler reads.
 *
 * After the second AdSense review (22 Nov 2026, «Low-value content») a read of 413 live pages found: /worklist/ (39,000 words, the atlas's own
 * to-do list), /errands/ (drafted letters) and /changelog/ (a commit log) public, in the sitemap and indexable; place descriptions that said
 * «0 record volumes» over pages that said nine; and a front page whose HTML was a header and «Loading the atlas…».
 *
 * Two layers. The SOURCE checks always run: they read the page files and the sitemap list. The BUILT checks read site/dist and are skipped when
 * there is none (a unit run before a build); scripts/check-built.py runs the same checks on the full build in the deploy. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const DIST = new URL("../dist/", import.meta.url);
const built = existsSync(new URL("index.html", DIST));

/* the pages that are the atlas's own working lists, each with the reason */
export const WORKING = {
  worklist: "the atlas's own to-do list, with the owner's messages quoted in it",
  errands: "letters the atlas has drafted to archives, and which have been sent",
  changelog: "a generated commit log",
  "my-research": "everything on it is read from the visitor's own browser; to a crawler it is an empty shell",
};

test("each working page asks not to be indexed, and still lets its links be followed", () => {
  for (const name of Object.keys(WORKING)) {
    const page = src(`pages/${name}.astro`);
    assert.match(page, /<Base\s+noindex\b/, `${name}.astro does not pass noindex to Base`);
  }
  /* the one place the site writes the tag, so «noindex» here is the same tag /countries/ and the empty place pages use */
  assert.match(src("layouts/Base.astro"), /noindex && <meta name="robots" content="noindex, follow"/);
});

test("none of the working pages is in the sitemap list", () => {
  const sm = src("pages/sitemap-index.xml.js");
  for (const name of ["worklist", "errands", "changelog"]) {
    assert.ok(!sm.includes(`"${name}/"`), `${name}/ is still in sitemap-index.xml.js`);
  }
});

test("the pages a reader comes for stay in the sitemap and stay indexable", () => {
  const sm = src("pages/sitemap-index.xml.js");
  for (const name of ["add", "connect", "coverage", "read", "help", "support", "data", "start", "privacy"]) {
    assert.ok(sm.includes(`"${name}/"`), `${name}/ should be in the sitemap`);
    const page = src(`pages/${name}.astro`);
    assert.ok(!/<Base\s+noindex\b/.test(page), `${name}.astro is noindex`);
  }
});

test("the ad list is flags only, and /country/ pages", () => {
  const base = src("layouts/Base.astro");
  assert.equal(base.match(/const AD_PAGES = \[([^\]]*)\]/)[1].trim(), '"/flags/"');
});

test("built: the working pages are noindex in the shipped HTML and in no sitemap", { skip: !built }, () => {
  for (const name of Object.keys(WORKING)) {
    const html = readFileSync(new URL(`${name}/index.html`, DIST), "utf8");
    assert.match(html, /<meta name="robots" content="noindex, follow"/, `${name}/ is not noindex in the built page`);
  }
  const maps = readdirSync(DIST).filter((f) => /^sitemap-.*\.xml$/.test(f));
  assert.ok(maps.length > 3);
  for (const f of maps) {
    const x = readFileSync(new URL(f, DIST), "utf8");
    for (const name of ["worklist", "errands", "changelog"]) {
      assert.ok(!x.includes(`/${name}/<`), `${f} lists /${name}/`);
    }
  }
});

test("built: the Help page's HTML holds the written section (moved off the front page), with real words and no ad", { skip: !built }, () => {
  const html = readFileSync(new URL("help/index.html", DIST), "utf8");
  const m = html.match(/<section class="[^"]*ra-about[^"]*" id="about-the-atlas"[\s\S]*?<\/section>/);
  assert.ok(m, "the section is not in the static HTML of the Help page");
  const text = m[0].replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 300 && words <= 520, `section has ${words} words`);
  assert.equal((m[0].match(/<h2/g) || []).length, 1, "exactly one h2");
  assert.ok(!/adsbygoogle|adslot/.test(m[0]), "no ad in the section");
  /* it comes after the page's own opening, inside the main landmark */
  assert.ok(html.indexOf('id="about-the-atlas"') > html.indexOf("<main"), "after the main landmark opens");
  for (const href of ["/start/", "/places/", "/countries/", "/surnames/", "/tree-canvas/", "/data/", "/privacy/"]) {
    assert.ok(m[0].includes(`href="${href}"`), `no link to ${href}`);
  }
});
