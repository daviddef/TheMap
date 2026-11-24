/* A name's sources come as a plan in order, not a wall of per-country folds: steps of ten, a country chooser, the full lists kept in one closed fold. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "../src/components/RecordMap.astro"), "utf8");

test("the name panel puts the plan first and keeps every country's list in one closed fold", () => {
  assert.match(src, /h\.push\(namePlan\(withSrc, term\)\);/);
  assert.match(src, /class="ra-area-g ra-plan-all"><summary>/);
  const i = src.indexOf("h.push(namePlan(withSrc, term));"), j = src.indexOf("T(\"The sources for\") + \" \" + (CNAME[cc] || cc), undefined", i);
  assert.ok(i > 0 && j > i, "the per-country folds are still there, after the plan");
});

test("the steps are ordered by rule: free and searched by name, then images, then trees, then paper", () => {
  const f = src.slice(src.indexOf("function planSteps(cc)"), src.indexOf("function planRows"));
  assert.match(f, /var s1 = /);
  assert.ok(f.indexOf("s1 =") < f.indexOf("s2 =") && f.indexOf("s2 =") < f.indexOf("s3 =") && f.indexOf("s3 =") < f.indexOf("s4 ="));
  assert.match(f, /access === "onsite" \|\| p\.access === "catalogue"/);
  assert.match(f, /used\[p\.id\]/, "a source is in one step only");
});

test("a step shows ten, then the next ten, to thirty", () => {
  const f = src.slice(src.indexOf("function planRows"), src.indexOf("function namePlan"));
  assert.match(f, /list\.slice\(0, 30\)/);
  assert.match(f, /i \+= 10/);
  assert.match(f, /T\("The next"\)/);
});

test("the plan says it is an order to try things in, not a ranking", () => {
  assert.match(src, /not a ranking of which is best/);
});

test("the surname header drops an empty label and folds countries past the fourth", () => {
  assert.match(src, /:global\(\.ra-surn > \.lab\) \{ display: none; \}/);
  assert.match(src, /\.ra-surn:has\(> \.ra-tw\) > \.ra-tw\) \{ display: contents; \}/, "the chips and the origin share a row");
  assert.match(src, /if \(ri === 4\) wh\.push\('<details class="ra-tw-more">/);
});

test("the next ten are siblings of the first ten, so they keep the list's own row style", () => {
  const f = src.slice(src.indexOf("function planRows"), src.indexOf("function planBooks"));
  assert.match(f, /class="ra-plan-next"/);
  assert.doesNotMatch(f, /<details class="ra-plan-more"/);
  assert.match(src, /var nx = ev\.target\.closest && ev\.target\.closest\("\.ra-plan-next"\)/);
});

test("a books step lists the places with the most registers, and says it does not claim the name is in them", () => {
  const f = src.slice(src.indexOf("function planBooks"), src.indexOf("function namePlan"));
  assert.match(f, /b\.v - a\.v/);
  assert.match(f, /ra-near/);
  assert.match(src, /Not shown to hold this name/);
});

test("a row links to the site's own results for the name where the address is known to take one", () => {
  const f = src.slice(src.indexOf("var PLAN_SEARCH"), src.indexOf("function planBooks"));
  for (const id of ["familysearch", "findagrave", "geni", "wikitree"]) assert.match(f, new RegExp(id + ": \"https://"));
  assert.ok(f.includes("surname|q|SURNAME"), "and any directory row with a name template");
  assert.match(f, /class="ra-plan-go"/);
  assert.match(f, /Your browser sends the name to that site when you click/);
});
