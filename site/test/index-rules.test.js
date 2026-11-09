/* The generated tail keeps its pages but not the sitemap, and the ad sits only on written pages. (AdSense audit, 10 Nov 2026.) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeHasOwn, nameIndexable } from "../src/lib/index-rules.js";

test("a place with no volumes, collections or other names has nothing of its own", () => {
  assert.equal(placeHasOwn({ volumes: [], collections: [], names: [] }, { collections: [], names: [] }), false);
  assert.equal(placeHasOwn({}, {}), false);
  assert.equal(placeHasOwn({ volumes: [{}] }, {}), true);
  assert.equal(placeHasOwn({}, { collections: [{}] }), true);
  assert.equal(placeHasOwn({}, { names: ["Fiume"] }), true);
});

test("a given name is indexed only with a meaning, bearers or a story", () => {
  const N = { meanings: { anna: {} }, bearers: { boris: {} } };
  assert.equal(nameIndexable("anna", N, new Set()), true);
  assert.equal(nameIndexable("boris", N, new Set()), true);
  assert.equal(nameIndexable("hedwig", N, new Set(["hedwig"])), true);
  assert.equal(nameIndexable("beryl", N, new Set()), false);
});

test("the ad is on written pages and on a country's page, not on its generated sources page or a tool screen", () => {
  const base = readFileSync(new URL("../src/layouts/Base.astro", import.meta.url), "utf8");
  const list = base.match(/const AD_PAGES = \[([^\]]*)\]/)[1];
  for (const p of ["/about/", "/data/", "/coverage/", "/changelog/", "/flags/"]) assert.ok(list.includes(`"${p}"`), p);
  for (const p of ["/add/", "/my-research/", "/errands/", "/worklist/", "/countries/", "/help/", "/jurisdictions/"]) assert.ok(!list.includes(`"${p}"`), p);
  assert.match(base, /startsWith\("\/country\/"\) && !here\.replace\(\/\\\/\$\/, ""\)\.endsWith\("\/sources"\)/);
});

/* The fix list's "remember my decisions" starts on where the six words are, and an explicit off is never overridden. */
import { create } from "../public/roots/js/decisions.js";
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
test("keeping decisions starts on with online sync, once, and respects an explicit off", () => {
  let st = store(), d = create(st);
  assert.equal(d.autoOn(), false, "no six words, no change");
  st = store(); st.setItem("ra-sync-v1", "{}"); d = create(st);
  assert.equal(d.autoOn(), true); assert.equal(d.isOn(), true); assert.equal(d.autoOn(), false);
  d.setOn(false); d.optOut(true);
  assert.equal(d.autoOn(), false); assert.equal(d.isOn(), false);
  d.setOn(true); d.optOut(false); d.put("k", "d", true);
  assert.equal(d.count(), 1);
});
