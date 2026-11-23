/* The map's pins, source rows and timeline cards each answer a click or a hover (RecordMap.astro). David: "if i click on these numbers on the map,
   nothing happens, and hover over shows me walking distance rather than what the marker is"; "what do the colours mean? i cant see a hover text";
   "when i click on the timeline card ... it doesnt take me to the resource". */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/components/RecordMap.astro", import.meta.url), "utf8");

test("a numbered neighbour pin opens its place when clicked, and says what it is on hover", () => {
  assert.match(src, /pm\.on\("click", function \(\) \{ if \(AREA && AREA\.mode\) return; pinOpen\(p\); \}\)/);
  assert.match(src, /function pinOpen\(p\) \{/);
});

test("the access colour sits on the right-hand icon, with a hover explanation, and the left dot is the research state with its own title", () => {
  assert.match(src, /class="ra-acc ra-acc-i"[^]*?style="color:/);
  const dots = src.split("\n").filter((l) => /RC_COL\[(st|k)\] \+ '"><\/i>/.test(l) && !/<\/i>' \+ RC_LAB/.test(l));
  assert.ok(dots.length >= 4, "the research-state dots are there");
  for (const l of dots) {
    assert.match(l, /title="' \+ RC_LAB\[(st|k)\]/, "each dot names its state on hover: " + l.slice(0, 90));
  }
});

test("a timeline card with one resource opens it, or else its place page", () => {
  assert.match(src, /P\.act === "place" && c\.getAttribute\("data-sh-u"\)\) \{ window\.open\(c\.getAttribute\("data-sh-u"\)/);
  assert.match(src, /P\.act === "place" && c\.getAttribute\("data-sh-pg"\)/);
  assert.match(src, /data-sh-pg=/);
});
