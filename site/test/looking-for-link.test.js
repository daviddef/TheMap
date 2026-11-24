/* /looking-for/ opens already filled in from a link, and can make one. The values ride after the # so no server sees a name. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const js = fs.readFileSync(path.join(here, "../public/js/looking-for.js"), "utf8");
const page = fs.readFileSync(path.join(here, "../src/pages/looking-for.astro"), "utf8");

test("the link is read from the hash, not the query string, and only fills boxes", () => {
  assert.match(js, /location\.hash/);
  assert.doesNotMatch(js, /location\.search/);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  for (const k of ["rel", "name", "surname", "from", "to", "left", "born", "holds"]) assert.match(js, new RegExp('"' + k + '"'));
});

test("a link with a place runs the page by itself, and one with nothing recognised does not", () => {
  assert.match(js, /if \(fromHash\(\)\) setTimeout\(function \(\) \{ \$\("lf-go"\)\.click\(\)/);
  assert.match(js, /return any && !!\(\$\("lf-from"\)\.value \|\| \$\("lf-to"\)\.value \|\| \$\("lf-name"\)\.value\)/);
});

test("a surname on its own is a surname, not a given name", () => {
  assert.match(js, /onlySur/);
  assert.match(js, /givenWord: \(onlySur/);
});

test("the page offers a button that copies the link", () => {
  assert.match(page, /id="lf-link"/);
  assert.match(js, /navigator\.clipboard\.writeText/);
});
