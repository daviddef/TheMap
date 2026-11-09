/* Every page of the atlas that a reader can open is in the sitemap, or is on the short list of pages left out on purpose.
 *
 * The list of permanent pages in src/pages/sitemap-index.xml.js is written by hand, and it fell behind: Flags (with its 34
 * pages), History, Help, Errands, Survey and My Work were live, linked from the menu, and not in the sitemap, so Google found
 * them only by following links. This reads the pages folder and the list and fails when they disagree, so a new page has to be
 * listed or left out on purpose. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

const PAGES = new URL("../src/pages/", import.meta.url);
const sitemap = readFileSync(new URL("sitemap-index.xml.js", PAGES), "utf8");
const listed = new Set([...sitemap.matchAll(/\["([a-z0-9-]*\/?)",\s*"[0-9.]+"\]/g)].map((m) => m[1]));

/* Pages that are not meant to be found through search, each with its reason. */
const LEFT_OUT = {
  "my-research": "everything on it is read from this one browser; for a search engine it is an empty shell",
  "backup": "reads this one browser's storage and offers buttons; for a search engine it is an empty shell",
  "shared": "opens a research pack from the address or a dropped file; for a search engine it is an empty shell",
  "roots": "the GEDCOM page works on a file only the visitor has; the page is noindex",
  "jurisdictions": "redirects to the Whose archive view of /providers/; noindex",
  "survey": "redirects to Help check a source on /providers/; noindex",
};

const routes = [];
for (const f of readdirSync(PAGES)) {
  if (statSync(new URL(f, PAGES)).isDirectory()) continue;
  const m = /^([a-z0-9-]+)\.astro$/.exec(f);                       // plain pages; [dynamic] pages and .xml.js feeds are other sets
  if (m) routes.push(m[1] === "index" ? "" : `${m[1]}/`);
}

test("the folder holds the pages this test expects to see", () => {
  assert.ok(routes.includes("flags/") === false, "flags is a folder with its own index, checked below");
  assert.ok(routes.length > 12, `found only ${routes.length} pages`);
});

test("every plain page is listed in the sitemap or left out on purpose", () => {
  const missing = routes.filter((r) => !listed.has(r) && !(r.replace(/\/$/, "") in LEFT_OUT));
  assert.deepEqual(missing, [], `in src/pages but in neither the sitemap list nor LEFT_OUT: ${missing.join(", ")}`);
});

test("pages in folders with their own index are listed too", () => {
  for (const dir of ["flags"]) assert.ok(listed.has(`${dir}/`), `${dir}/ is not in the sitemap`);
});

test("a page left out is still a page, and is not also listed", () => {
  for (const k of Object.keys(LEFT_OUT)) {
    assert.ok(!listed.has(`${k}/`), `${k} is listed and also left out`);
  }
});

test("the flag pages come from the same list the pages are built from", () => {
  assert.match(sitemap, /flagSlugs\(\)\.map/);
  assert.match(sitemap, /from "\.\.\/lib\/flag-pages\.js"/);
});
