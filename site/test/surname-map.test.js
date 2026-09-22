/* The surname maps.
 *
 * Every bug this file has had was geometric and invisible to a build:
 *   - public/c stores [minLat, minLon, maxLat, maxLon] and the first cut
 *     read it as x,y pairs, so every frame was computed from latitudes
 *     treated as longitudes;
 *   - France's box runs -61° to +51° longitude because Réunion is France,
 *     so framing on outlines drew an ocean to show a French name;
 *   - clamping the viewBox height squashed Belgium;
 *   - 0.25° of padding put the reader inside a single Spanish town.
 * None of those threw. All of them are assertions here. */
import test from "node:test";
import assert from "node:assert/strict";
import { surnameMap, placesMap } from "../src/lib/surname-map.js";

/* The libs read from process.cwd(); the suite runs from site/. */
const box = (svg) => svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
const circles = (svg) => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)]
  .map((m) => ({ x: +m[1], y: +m[2], r: +m[3] }));

test("nothing to draw returns null rather than an empty picture", () => {
  assert.equal(surnameMap([]), null);
  assert.equal(surnameMap([{ cc: "ZZ", n: 5 }]), null, "an unknown country is not a map");
  assert.equal(placesMap([]), null);
  assert.equal(placesMap([{ y: null, x: null, c: 1 }]), null);
});

test("every drawn point lands inside the viewBox", () => {
  for (const ccs of [[{ cc: "BE", n: 100 }],
                     [{ cc: "BE", n: 1 }, { cc: "US", n: 9 }, { cc: "NZ", n: 3 }],
                     [{ cc: "SI", n: 7 }, { cc: "HR", n: 7 }]]) {
    const m = surnameMap(ccs);
    const [w, h] = box(m.svg);
    for (const c of circles(m.svg)) {
      assert.ok(c.x >= 0 && c.x <= w, `x ${c.x} outside 0..${w}`);
      assert.ok(c.y >= 0 && c.y <= h, `y ${c.y} outside 0..${h}`);
    }
  }
});

test("a counted country is bigger than an uncounted one", () => {
  const m = surnameMap([{ cc: "BE", n: 20000 }, { cc: "DK" }]);
  assert.match(m.svg, /class="sm-c"/, "a count is drawn filled");
  assert.match(m.svg, /class="sm-u"/, "no count is drawn hollow");
  assert.equal(m.counted, 1);
  assert.equal(m.drawn, 2);
});

test("France does not drag the frame to Réunion", () => {
  /* Framed on centroids, not on outline boxes: France's box spans
     -61° to +51° longitude and would draw the Atlantic. */
  const m = surnameMap([{ cc: "FR", n: 1000 }]);
  const [w, h] = box(m.svg);
  assert.ok(h / w < 2.2 && h / w > 0.2,
    `a single European country should be roughly page-shaped, got ${w}x${h}`);
});

test("a name in two hemispheres still frames without inverting", () => {
  const m = surnameMap([{ cc: "IE", n: 5 }, { cc: "NZ", n: 5 }]);
  const [w, h] = box(m.svg);
  assert.ok(w > 0 && h > 0);
  assert.equal(circles(m.svg).length, 2);
});

test("placesMap keeps true aspect instead of clamping it", () => {
  /* Belgium is 219 km north-south against 268 km east-west; clamping the
     height to 460 squashed it. */
  const be = [{ y: 51.2, x: 4.4, c: 2000, nl: "Antwerpen" },
              { y: 50.6, x: 5.5, c: 300, nl: "Liège" },
              { y: 50.8, x: 3.2, c: 120, nl: "Kortrijk" }];
  const m = placesMap(be, { cc: "BE" });
  const [w, h] = box(m.svg);
  assert.ok(h > 120 && h < 900, `height ${h} should follow the ground`);
  assert.equal(m.drawn, 3);
  assert.equal(m.omitted, 0);
});

test("one place gets room to be seen, not a frame inside itself", () => {
  const one = [{ y: 38.23, x: -6.02, c: 5716, nl: "Llerena" }];
  const tight = placesMap(one, { cc: "ES" });
  const roomy = placesMap(one, { cc: "ES", minPad: 3 });
  const land = (s) => (s.match(/class="sm-land"/g) || []).length;
  assert.ok(land(roomy.svg) >= land(tight.svg),
    "more context should show at least as much coastline");
  assert.equal(roomy.drawn, 1);
});

test("placesMap takes several countries, because a name is a place in several", () => {
  const pts = [{ y: 38.2, x: -6.0, c: 100, nl: "Llerena" },
               { y: 46.1, x: 13.2, c: 90, nl: "Udine" }];
  const m = placesMap(pts, { cc: ["ES", "IT"] });
  assert.ok(m.svg.includes("sm-land"), "outlines for both countries");
  assert.equal(m.drawn, 2);
});

test("the commonest are kept and the rest are counted, not dropped silently", () => {
  const many = Array.from({ length: 200 }, (_, i) =>
    ({ y: 50 + (i % 20) * 0.05, x: 4 + (i % 13) * 0.07, c: 200 - i, nl: "c" + i }));
  const m = placesMap(many, { cc: "BE", max: 60 });
  assert.equal(m.drawn, 60);
  assert.equal(m.omitted, 140);
  const rs = circles(m.svg).map((c) => c.r);
  assert.ok(Math.max(...rs) > Math.min(...rs), "dots are sized by count");
});
