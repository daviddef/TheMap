/* WALKING REACH: the shape that replaces the neighbours' circle. The computation takes plain arrays, so it is tested here on made-up ground:
   flat land, a strait, a ridge with one pass, a slope. The tile fetching and the map drawing are held by the markup checks further down. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "public/js/walking-reach.js"), "utf8");
const win = {};
new Function("window", src).call(win, win);
const R = win.raReach;
const W = 120, H = 120, CELL = 100;                       /* 12 km square, 100 m cells */
const grid = (f) => { const e = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) e[y * W + x] = f(x, y); return e; };
const at = (t, x, y) => t[y * W + x];

test("Tobler: about 5 km/h on the flat, slower uphill, fastest on a slight downhill", () => {
  assert.ok(Math.abs(R.tobler(0) - 5.04) < 0.05);
  assert.ok(R.tobler(0.2) < R.tobler(0) && R.tobler(0.4) < R.tobler(0.2));
  assert.ok(R.tobler(-0.05) > R.tobler(0) && R.tobler(-0.05) > R.tobler(-0.4));
});

test("flat ground: time out is distance over speed, the same in every direction (no octagon)", () => {
  const t = R.field(grid(() => 100), W, H, CELL, 60, 60, 1);
  assert.ok(Math.abs(at(t, 110, 60) - 5 / 5.04) < 0.01, "5 km east");
  assert.ok(Math.abs(at(t, 60, 10) - 5 / 5.04) < 0.01, "5 km north");
  const d = Math.hypot(35, 35) * 0.1;
  assert.ok(Math.abs(at(t, 95, 95) - d / 5.04) < 0.02, "on the diagonal");
  const r = [];
  for (let a = 0; a < 360; a += 22.5) {
    let n = 0;
    for (let i = 1; i < 80; i++) {
      const x = Math.round(60 + i * Math.cos(a * Math.PI / 180)), y = Math.round(60 + i * Math.sin(a * Math.PI / 180));
      if (x < 0 || y < 0 || x >= W || y >= H || !(at(t, x, y) <= 1)) break;
      n = i;
    }
    r.push(n);
  }
  assert.ok(Math.max(...r) - Math.min(...r) <= 2, "round within two cells: " + r.join(","));
});

test("the sea cannot be walked, and a strait is not jumped", () => {
  const e = grid((x) => (x >= 70 && x <= 71 ? -20 : 50));
  const t = R.field(e, W, H, CELL, 40, 60, 3);
  assert.ok(Number.isFinite(at(t, 69, 60)), "the near shore is reached");
  assert.equal(at(t, 72, 60), Infinity, "the far shore is not");
  assert.equal(at(t, 71, 60), Infinity, "the water itself is not");
});

test("a ridge with one pass: the walk goes through the pass, so the far side is slower than straight over", () => {
  const ridge = (x, y) => (x >= 70 && x <= 74 && !(y >= 20 && y <= 24) ? 900 : 100);
  const t = R.field(grid(ridge), W, H, CELL, 40, 80, 6);
  const direct = 4 / 5.04;
  assert.ok(Number.isFinite(at(t, 80, 80)), "it can be reached");
  assert.ok(at(t, 80, 80) > direct * 1.5, "but round by the pass, not straight over: " + at(t, 80, 80).toFixed(2));
});

test("uphill takes longer than the same slope downhill", () => {
  const e = grid((x) => 100 + x * 8);
  const up = at(R.field(e, W, H, CELL, 30, 60, 4), 80, 60), down = at(R.field(e, W, H, CELL, 90, 60, 4), 40, 60);
  assert.ok(up > down, `up ${up.toFixed(2)} h, down ${down.toFixed(2)} h`);
});

test("a time limit is respected", () => {
  const t = R.field(grid(() => 100), W, H, CELL, 60, 60, 0.5);
  assert.equal(at(t, 110, 60), Infinity);
  assert.ok(Number.isFinite(at(t, 80, 60)));
});

test("the outline is the outer loop, holes filled", () => {
  const t = R.field(grid((x, y) => (Math.hypot(x - 60, y - 60) < 6 ? -5 : 100)), W, H, CELL, 40, 60, 1.5);
  let cells = 0; for (const v of t) if (v <= 1.5) cells++;
  const filled = Math.abs(R.area(R.outline(t, W, H, 1.5)));
  assert.ok(filled >= cells, "the pond is filled");
  assert.ok(filled - cells < 150, "and only the pond");
});

test("simplifying keeps the shape: area changes little and the vertices fall a lot", () => {
  const t = R.field(grid(() => 100), W, H, CELL, 60, 60, 1);
  const loop = R.outline(t, W, H, 1), s = R.simplify(loop, 0.8);
  assert.ok(s.length < loop.length / 3, `${s.length} of ${loop.length}`);
  assert.ok(Math.abs(R.area(s) - R.area(loop)) / Math.abs(R.area(loop)) < 0.02);
});

test("times read as people say them", () => {
  assert.equal(R.hoursText(0.01), "a few minutes");
  assert.equal(R.hoursText(0.5), "30 min");
  assert.equal(R.hoursText(1.34), "1 h 20 min");
  assert.equal(R.hoursText(2), "2 h");
});

test("terrain comes from the CORS-enabled tile host, decoded the way Terrarium encodes it", () => {
  assert.match(src, /elevation-tiles-prod\.s3\.amazonaws\.com\/terrarium/);
  assert.match(src, /img\.crossOrigin = "anonymous"/);
});

/* the map side: v2 only, a circle first, the polygon when the ground is read, and a way back if it cannot be */
const map = readFileSync(join(root, "src/components/RecordMap.astro"), "utf8");
test("the reach belongs to the new front door only and falls back to the circle", () => {
  assert.match(map, /function reachFor\(d\) \{\s*if \(!TSV2/, "gated on v2");
  assert.match(map, /drawHoodCircle\(d, r\);\s*if \(TSV2\) reachFor\(d\);/, "the circle is drawn first, the reach follows");
  assert.match(map, /REACH\.state = "failed"/, "a failed terrain read is a state, not a silence");
  assert.match(map, /The terrain did not load, so this is a plain circle\./, "and it says so");
  assert.match(map, /sc\.src = BASE \+ "js\/walking-reach\.js"/, "the module is loaded on demand");
});
test("villages are listed by walking time, with the time on foot, when a reach is on", () => {
  assert.match(map, /RR\.timeAt\(p\.y, p\.x\)/);
  assert.match(map, /vs\.sort\(function \(a, b\) \{ return RR \? a\.wt - b\.wt : a\.km - b\.km; \}\)/);
  assert.match(map, /window\.raReach\.hoursText\(x\.wt\)/);
});
test("the hours are 1, 2, 4 and 6, with no button to turn the shape into an area: the shelf's On foot scope is the area", () => {
  assert.match(map, /REACH_HOURS = \[\[1, "1 h"\], \[2, "2 h"\], \[4, "4 h"\], \[6, "6 h"\]\]/);
  assert.doesNotMatch(map, /Use as my area/);
  assert.match(map, /segs\.push\(\["walk", "On foot"\]\)/);
  assert.match(map, /if \(P\.act === "walk"\) \{\s*areaEnsureCells\(L\.polygon\(REACH\.res\.ring\)\.getBounds\(\)\)\.then[\s\S]*?areaOverlay\("Within a "/, "See the list opens it");
});
test("clicking a drawn or saved area opens its area screen, and the card unfolds for it", () => {
  assert.match(map, /function areaShow\(\) \{[\s\S]*?areaRender\(\); areaAddUi\(\);[\s\S]*?fd2-folded/);
  assert.match(map, /pl\.on\("click", function \(e\) \{ if \(AREA\.mode \|\| AREA_ED\)[\s\S]*?areaShow\(\)/, "a draft shape");
  assert.match(map, /poly\.on\("click"[\s\S]*?areaOpenSaved\(id, true\)/, "a saved shape");
  assert.match(map, /pl\.bringToBack\(\)/, "behind the places, so a dot inside the shape is still the thing clicked");
});

/* THE SHELF: its place stays a scope when an area is added, and every scope opens the same area screen */
test("an area added after a place does not take the place off the shelf", () => {
  assert.match(map, /var lp = SH\.lastPl;\s*if \(lp && fold\(short\(typed\(\)\.text\)\) === fold\(short\(lp\.n\)\)\) return lp;/);
  assert.match(map, /window\.raShelfScope\("area"\)/, "a drawn area is what the shelf then shows");
  assert.match(map, /window\.raShelfScope\(null\);\s*if \(window\.raShelfPing\)/, "opening a place takes it back to the place");
  assert.match(map, /SH\.user = a; SH\.areaNew = false/, "picking the place segment sticks");
});
test("the shelf's \"See the list\" opens the area screen for the place, the view or the area", () => {
  assert.match(map, /data-sh="list"/);
  assert.match(map, /function shelfList\(\) \{[\s\S]*?areaShow\(\)[\s\S]*?areaOverlay\(short\(P\.pl\.n\)[\s\S]*?areaOverlay\("This view"/);
  assert.match(map, /function AR\(\) \{ return AREA\.ov \|\| AREA\.rows; \}/, "the drawn area is never overwritten by an overlay");
  assert.match(map, /areaAnalyse\(rings\) \{\s*AREA\.ov = null;/, "drawing an area retires the overlay");
});

/* THE PLACE CARD ON v2 is the area screen's look: one strip, the rest on the place page, the body drawn by the area code */
test("on v2 the place card shows one who-held strip, links to the place page for the rest, and draws its body with the area code", () => {
  assert.match(map, /if \(TSV2\) \{\s*var main = regs\.filter\(function \(r\) \{ return r\.id !== d\.region; \}\)\[0\] \|\| regs\[0\];/);
  assert.match(map, /"place\/" \+ esc\(d\.id\) \+ '\/#held">'/, "links to the table on the place page");
  assert.match(map, /if \(TSV2\) \{ h\.push\('<div class="ra-place-body" id="ra-place-body"><\/div>'\); return h\.join\(""\); \}/);
  assert.match(map, /if \(TSV2\) placeBody\(d\);/);
  assert.match(map, /if \(TSV2\) placeBody\(cache\[at\]\);/, "and again when the card is re-drawn for a year");
  assert.match(map, /if \(R\.place\) \{ areaRenderSolo\(R\); return; \}/);
  const page = readFileSync(join(root, "src/pages/place/[id].astro"), "utf8");
  assert.match(page, /<section[^>]*id="held"/, "the place page has the anchor the card links to");
});
test("the era's own text opens when a segment is tapped, and the events are one-line rows in a scrolling drawer", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-tl-v2:not\(\.open\) \.ra-tl-detail \{ display: none; \}/);
  assert.match(map, /tl\.classList\.add\("open"\)/);
  assert.match(css, /\.fd2-stage \.ra-mortnote \{ max-height: 240px; overflow: auto;/);
});

/* THE ICONS: one row of four on the place card; history in the map's icon column instead of the play pill */
test("the place card's four icons share one row and one design; history moves into the map's icon column", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /if \(TSV2\) h\.push\('<span class="at-tools">'\);/, "the mark, the page and the flag are wrapped together on v2");
  assert.match(map, /head\.querySelector\("\.at-tools"\) \|\| head\.querySelector\("\.at-placemark"\)/, "the mortality pill still finds its place");
  assert.match(css, /\.fd2-stage \.at-tools \.vm-pill, \.fd2-stage \.at-tools \.at-ico a \{[^}]*width: 32px; height: 32px;[^}]*border-radius: 99px;/);
  assert.match(map, /"leaflet-bar ra-histctl"/);
  assert.match(map, /var pb = document\.getElementById\("ra-play"\); if \(pb\) pb\.click\(\);/, "the icon does what the play button did");
  assert.match(css, /\.fd2-stage #ra-play \{ display: none; \}/, "the play button is gone from the pill");
  assert.match(css, /\.fd2-stage \.ra-histctl \{ display: block !important; \}/, "and the icon shows at every width");
});

/* FREEHAND DRAWING: the stroke is painted on its own canvas, never through the map's shared dot canvas */
test("the freehand pen paints on its own overlay canvas, one paint per frame, and cleans up on lift", () => {
  assert.match(map, /function freeCanvas\(\)/);
  assert.match(map, /function freePaint\(\)/);
  assert.match(map, /pointer-events:none;z-index:640/, "the overlay never takes the pointer");
  assert.match(map, /e\.getCoalescedEvents \? e\.getCoalescedEvents\(\) : null/, "every pen sample is used, not one per frame");
  assert.match(map, /requestAnimationFrame\(freePaint\)/);
  assert.match(map, /cancelAnimationFrame\(FREE\.raf\)/);
  assert.match(map, /var tol = 1\.4, s = L\.LineUtil\.simplify\(pts, tol\);/);
});

test("the shelf and history icons wear the same glass as the rest of the icon column; history is a play mark on a timeline, not a clock", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-areactl, \.fd2-stage \.ra-shelfctl, \.fd2-stage \.ra-histctl \{ border-radius: 14px/);
  assert.match(map, /<path d="M7 3\.6v7\.6l6\.2-3\.8z"\/>/, "a play triangle over a timeline");
  assert.doesNotMatch(map, /M3\.4 10a6\.6 6\.6 0 1 1 1\.9 4\.6/, "the clock-with-arrow glyph is gone");
});
test("the search box examples are Croatian places, surnames and stories, with the old names beside the new", () => {
  const js = readFileSync(join(root, "public/js/front-door-v2.js"), "utf8");
  for (const s of ["Dubrovnik, or Ragusa", "Rijeka, or Fiume", "Split, or Spalato", "Modrić", "Horvat", "Kovačević", "Smiljan, where Tesla was born", "Dalmatia for Chile"])
    assert.ok(js.includes(s), s);
  assert.ok(!js.includes("my grandmother came from Trieste in 1905"), "the Italian example is gone");
});

test("the area card keeps its small print in hover tips, not in paragraphs", () => {
  assert.doesNotMatch(map, /The places above are only where they sit\./);
  assert.doesNotMatch(map, /Add area draws another and keeps this one\.<\/p>/);
  assert.match(map, /Big area\. Draw a smaller one to see and add the rest\./);
  assert.match(map, /Not started: <b>/);
});
