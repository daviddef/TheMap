/* The people of the family are named in the left rail, and each box carries the flag of the time at birth and at death.
   David: "could we add the names of the people on left pane"; "the flag at the time of that persons birth and death". */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const rd = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const page = rd("public/js/story-page.js"), eng = rd("public/js/story-engine.js"), astro = rd("src/pages/read.astro");

test("the rail lists each named person under The family, and the places list is not wiped by it", () => {
  assert.match(page, /function peopleRail\(\)/);
  assert.match(page, /querySelectorAll\("a\.sub:not\(\.psub\)"\)/, "redrawing the places leaves the people alone");
  assert.match(page, /\.lf-card\[data-person\]/);
  assert.match(page, /tbox\.append\(tr\);[^\n]*peopleRail\(\)/, "drawn with the tree, so an edit redraws it");
  assert.match(eng, /c\.setAttribute\("data-person", pe\.name\)/);
});

test("a box shows the flag of the year told at birth and at death, and today's flag, faint and said so, when no year is told", () => {
  assert.match(eng, /ev: x\.ev \}; \}\) \}; \}\)\.filter/, "the death event survives onto the stop the card reads");
  assert.match(eng, /flagFor\(m\.st\.info, yr\)/);
  assert.match(eng, /rd\.append\(document\.createTextNode\(r1\)\); if \(flagOf\.start\) rd\.append\(flagOf\.start\)/, "the birth flag sits inside the route line, after where they began");
  assert.match(eng, /e\.type === "died" && flagOf\.died/, "the death flag sits on the death line, not in a row of its own");
  assert.doesNotMatch(eng, /lf-card-flags/, "no separate From / Died row");
  assert.match(eng, /year not told: this is today's flag/);
  assert.match(astro, /\.lf-cflag-now \{ opacity/);
});
