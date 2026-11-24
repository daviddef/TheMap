/* The journey map shows the events (war, genocide, epidemic, famine...) as small slow animations, can hide them, and is the first thing under the story's words. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const engine = read("../public/js/story-engine.js");
const page = read("../src/pages/read.astro");
const js = read("../public/js/story-page.js");

test("every kind of event in the data has a colour and a movement of its own", () => {
  const d = JSON.parse(read("../../data/mass-death-events.json"));
  const types = [...new Set(d.events.map((e) => e.type))];
  const colours = engine.match(/var EVC = \{([^}]*)\}/)[1];
  for (const ty of types) {
    assert.match(colours, new RegExp("\\b" + ty + ":"), ty + " has a colour");
    assert.ok(engine.includes(".ev-t-" + ty + "{--c:"), ty + " has its colour for the legend and rings");
  }
  for (const ty of ["war", "epidemic", "famine", "genocide"]) assert.ok(engine.includes(".ev-pg.ev-t-" + ty + ".ev-on"), ty + " moves its own way");
});

test("nothing flashes: every animation is slow, and the grave kinds do not move their edge", () => {
  const css = engine.match(/var EV_CSS = ([\s\S]*?);\n  function ensureEvStyle/)[1];
  for (const m of css.matchAll(/animation:([^;}]*)/g))
    for (const part of m[1].split(",")) {
      const secs = Number((part.match(/([\d.]+)s\b/) || [])[1]);
      if (part.includes("evIn") || /^\s*none/.test(part)) continue;
      assert.ok(secs >= 1.4, "no animation under 1.4 s: " + part.trim());
    }
  const grave = css.match(/\.ev-pg\.ev-t-genocide\.ev-on[^{]*\{([^}]*)\}/)[1];
  assert.doesNotMatch(grave, /evMarch|dasharray/, "a genocide, massacre or atrocity glows and does not march");
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.ev-pg\.ev-on\{animation:none!important/, "still, not gone, under reduce motion");
});

test("the legend names what is on the map for the year shown, can be hidden, and is not read out twice", () => {
  assert.match(engine, /function paintEvents\(t\)/);
  assert.match(engine, /act\.slice\(0, 3\)/);
  assert.match(engine, /ra-journey-events/);
  assert.match(engine, /"Hide events" : "Show events"/);
  assert.match(engine, /setAttribute\("aria-hidden", "true"\)/, "the caption already says the same in words");
  assert.match(engine, /if \(layers\.legend\) layers\.legend\.remove\(\)/, "a redraw leaves no legend behind");
});

test("the map draws the events of the years it plays, the same as the list under it", () => {
  assert.match(engine, /y0 = Math\.min\(y0, t0\); y1 = Math\.max\(y1, t1\)/);
  assert.doesNotMatch(engine, /color: "#000", weight: 1\.6, opacity: \.85/, "the plain black outline is gone");
});

test("the journey is the first thing under the words, and plays once when first seen, never under reduced motion", () => {
  const order = [...page.matchAll(/<section class="sp-sec[^"]*" id="(sp-[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(order.indexOf("sp-places") >= 0 && order.indexOf("sp-places") < order.indexOf("sp-family"), "the map comes before the family tree");
  const rail = [...page.matchAll(/data-go="(sp-[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(rail.indexOf("sp-places") < rail.indexOf("sp-family"), "and so does the rail");
  assert.match(js, /function playOnce\(\)/);
  assert.match(js, /if \(played \|\| reduce/);
  assert.match(js, /played = true; watcher\.disconnect\(\)/);
});
