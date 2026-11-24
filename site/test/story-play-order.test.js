/* A STORY WITH NO DATES STILL PLAYS. David's story ("My father was from Senj. He moved to Botswana. Then he moved to Salisbury ... Johannesburg ... Brisbane") puts five
   pins on the map and no Play bar, because the journey player only knew years and ages. It now plays the places in the order they were told (Stop 2 of 5, no year
   claimed), and when the one who travels is a relative (the story has no route of its own) the relative's journey is the one that plays. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();
const eng = src("story-engine.js");

test("the player has an order mode: stops spaced by position, no year shown, «Stop k of n»", () => {
  assert.match(eng, /mode: "order", stops: route\.map\(function \(x, i\) \{ return \{ info: x\.info, t: i \* 6/);
  assert.match(eng, /tl\.mode === "order" \? \(stops\.length \? "Stop " \+ \(at\.idx \+ 1\) \+ " of " \+ stops\.length/);
  assert.match(eng, /tl\.mode === "order" \? "stop " \+ \(at\.idx \+ 1\)/, "the slider says the stop, not a made-up number");
});

test("a relative's journey is the route that plays when the story has none of its own", () => {
  assert.match(eng, /function asTraveller\(f\)[\s\S]{0,400}\(f\.route && f\.route\.length\) \|\| f\.from \|\| f\.to\) return f/);
  assert.match(eng, /f = asTraveller\(f\);\s*var tl = timeline\(f\)/);
});

test("the reader gives that story as one relative with five undated places", () => {
  let n = 0;
  const P = (nm, cc, x, y) => ({ i: nm.toLowerCase() + "-" + cc.toLowerCase() + "-" + (++n), n: nm, cc, c: 5, x, y });
  const rows = [P("Senj", "HR", 14.9, 45), P("Botswana", "BW", 24.6, -22.5), P("Harare", "ZW", 31, -17.8), P("Johannesburg", "ZA", 28, -26.2), P("Brisbane", "AU", 153, -27.5)];
  const given = ["Ivan", "Cheryl"].map((n) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
  const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries: { HR: "Croatia", BW: "Botswana", ZW: "Zimbabwe", ZA: "South Africa", AU: "Australia" } };
  const p = F.parseStory("My father was Ivan. My father was from Senj. My father moved to Botswana. He then moved to Johannesburg. Then he moved to Brisbane. My mother was Cheryl. My mother's father was Nuno.", ctx, null);
  assert.equal(p.route.length, 0, "no route of its own");
  const k = p.kin.find((x) => x.key === "F");
  assert.deepEqual(k.stops.map((s) => s.row.n), ["Senj", "Botswana", "Johannesburg", "Brisbane"]);
  assert.ok(k.stops.every((s) => s.year == null), "and no year was told");
});
