/* THE TIME STRIP on the new front door's place card: eras on a year scale, a ruler that writes the year into the search box, mass-mortality
   marks on the same scale. The strip's scale function is read out of the component's source and run here, so the maths is tested without a
   browser; the rest is held by the markup, hook and stylesheet checks. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "src/components/RecordMap.astro"), "utf8");
const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");

/* the text of one function declaration, by matching its braces */
function fnText(name) {
  const at = src.indexOf("function " + name + "(");
  assert.ok(at > -1, name + " exists");
  let i = src.indexOf("{", at), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(at, i + 1);
}
const TS_END = 2026;
const tsAxis = new Function("TS_END", fnText("tsAxis") + "; return tsAxis;")(TS_END);

test("the scale runs 0 to 1 from the table's first year to 2026, and inverts", () => {
  for (const a of [1200, 1553, 1700]) {
    const A = tsAxis(a);
    assert.equal(A.x(a), 0); assert.equal(A.x(TS_END), 1);
    for (let y = a; y <= TS_END; y += 37) assert.ok(Math.abs(A.inv(A.x(y)) - y) < 0.5, `round trip ${y} on a table from ${a}`);
    let prev = -1;
    for (let y = a; y <= TS_END; y += 5) { const x = A.x(y); assert.ok(x >= prev, "never goes backwards"); prev = x; }
  }
});

test("a table that starts before 1500 gives the years before 1650 only 14% of the width", () => {
  const A = tsAxis(1200);
  assert.ok(Math.abs(A.x(1650) - 0.14) < 1e-9);
  assert.deepEqual(A.br, [1650, 0.14]);
  assert.equal(tsAxis(1553).br, null, "a table from 1553 is linear");
});

test("years outside the table are held at its ends", () => {
  const A = tsAxis(1553);
  assert.equal(A.x(1000), 0); assert.equal(A.x(3000), 1);
});

test("the strip belongs to the new front door only", () => {
  assert.match(src, /var TSV2 = !!document\.getElementById\("fd2-stage"\)/);
  assert.match(src, /var A = TSV2 \? tsAxis\(first\) : null;/, "the band is only placed by year on v2");
  assert.match(src, /if \(TSV2\) tsEventLane\(hits, pill, box\)/, "the mortality marks only on v2");
  assert.match(src, /if \(TSV2\) tsPaintAll\(true\)/, "the box's year is painted when a card opens, only on v2");
});

test("the year lives in the search box: written after the place, without opening suggestions or closing the card", () => {
  const w = fnText("tsWrite");
  assert.match(w, /yearsIn\(qbox\.value\)\.text/, "the existing year is replaced, not stacked");
  assert.match(w, /panelQ = qbox\.value/, "the open card is kept");
  assert.match(w, /apply\(true\)/, "searches as a typed year does");
  assert.doesNotMatch(w, /dispatchEvent/, "no input event: it would open the suggestion list over the card");
  assert.match(src, /TSMIN = 1500/, "the box and the shelf take years from 1500");
});

test("the shelf can be turned on from the strip, and a year that is already in the box lights the strip", () => {
  assert.match(src, /window\.raShelfOn = function \(\) \{ setOn\(true\); \}/);
  assert.match(fnText("tsActs"), /raShelfOn/);
});

test("the ruler is a slider that can be used from the keyboard", () => {
  assert.match(src, /class="ra-ts-ruler" tabindex="0" role="slider"/);
  assert.match(src, /ArrowLeft: -1[\s\S]*PageUp: 10/);
  assert.match(src, /cur = tsDrag \|\| tsYears\(\)/, "fast key presses add up from the pending year");
});

test("every style the strip adds is under the front door's own stage, and hidden parts really hide", () => {
  const block = css.slice(css.lastIndexOf("/*", css.indexOf("THE TIME STRIP")));
  const sels = block.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0].trim()).filter((x) => x && !x.startsWith("@") && !/^(from|to|\d+%)$/.test(x));
  const outside = sels.filter((s) => s.split(",").some((p) => !p.trim().startsWith(".fd2-stage") && !p.trim().startsWith("@")));
  assert.deepEqual(outside, [], "no selector reaches another page");
  assert.match(css, /\.ra-ts-mk\[hidden\][^{]*\{\s*display:\s*none\s*!important/, "display:flex must not beat the hidden attribute");
});
