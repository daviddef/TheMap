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
  assert.match(map, /function areaShow\(i\) \{[\s\S]*?areaRender\(\); areaAddUi\(\);[\s\S]*?fd2-folded/);
  assert.match(map, /pl\.on\("click", function \(e\) \{ if \(AREA\.mode \|\| AREA_ED\)[\s\S]*?areaShow\(AREA\.polys\.indexOf\(pl\)\)/, "a draft shape");
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
test("on v2 the place card shows one who-held strip, leaves the rest to the place page (the page icon), and draws its body with the area code", () => {
  assert.match(map, /if \(TSV2\) \{\s*var main = regs\.filter\(function \(r\) \{ return r\.id !== d\.region; \}\)\[0\] \|\| regs\[0\];/);
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

test("years typed in the box switch the Year pill on, and only the box's own switching is undone when they go", () => {
  assert.match(map, /function syncTypedYears\(\) \{/);
  assert.match(map, /if \(!yon\.checked\) TYPED_Y = true;/, "a pill the reader set by hand is not claimed");
  assert.match(map, /qbox\._yt = setTimeout\(syncTypedYears, 400\)/, "after the typing settles");
  assert.match(map, /panelQ = qbox\.value;\s*syncTypedYears\(\);/, "the history strip's years sync as well");
});

test("on v2 the Year strip moves into the search bar, right of the filter button, and the history theatre still mounts on the map", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /fbar\.parentNode\.insertBefore\(timeEl, fbar\.nextSibling\)/);
  assert.match(map, /var host = document\.getElementById\("ra-map"\);/, "the theatre no longer assumes the strip's parent is the map");
  assert.match(css, /\.fd2-stage \.ra-bar-find \.ra-time \{ position: static !important;[^}]*order: 9;/);
  assert.match(css, /\.fd2-stage:has\(\.ra-th\) \.ra-bar-find \.ra-time \{ display: none; \}/);
});

test("the footer's GoatCounter link sits tight inside its brackets, and the removed v2 extras stay removed", () => {
  const base = readFileSync(join(root, "src/layouts/Base.astro"), "utf8");
  assert.match(base, /no cookies \(<a href="https:\/\/www\.goatcounter\.com\/" rel="noopener" style="margin: 0">GoatCounter<\/a>\)/);
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-base \{ display: none !important; \}/);
  assert.match(css, /body\.fd2 #ra-mywork \{ display: none !important; \}/);
  assert.doesNotMatch(map, /Zoom in, or draw a box round the ground you mean/);
  assert.match(map, /if \(b\.getNorth\(\) - b\.getSouth\(\) > 9\) \{ el\.innerHTML = head\(""\); sized\(\); return; \}/);
});

test("the surname card is dressed like the place and area cards on v2: flat hairline sections, mono section labels, quiet chips", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-surn \{[^}]*background: none; border: 0; border-top: 1px solid/);
  assert.match(css, /\.fd2-stage \.ra-surn \.lab \{ font: 700 11px\/1\.4 var\(--mono/);
  assert.match(css, /\.fd2-stage \.ra-surn \.ra-chip \{[^}]*background: transparent;/);
});

test("on v2 a surname's Where to read list is a section of its card; the side pane stays shut", () => {
  assert.match(map, /return '<details class="ra-check-b ra-in-card"><summary class="lab">'/, "folded until asked for");
  assert.match(map, /function nameCheckCard\(byCC, order\) \{[\s\S]*?class="ra-area-g ra-area-rd" open[\s\S]*?class="ra-area-p"/, "drawn with the area list's own classes");
  assert.match(map, /var inCardList = buildNameCheck\(canon \|\| term, byCC, order, rank\);\s*if \(TSV2 && inCardList\) h\.push\(inCardList\);/);
  assert.match(map, /if \(!TSV2\) h\.push\('<p class="at-sub at-sub-wide">'/, "the sentence that pointed at the pane is not needed");
  assert.match(map, /:global\(:is\(#ra-check-b, \.ra-in-card\) li\.ra-ck-r\)/, "the rows keep their look inside the card");
});

/* SEVERAL AREAS: per-area counts, a tick to show only some, and a click on a shape for its detail */
test("each area lists its own places, volumes and sources, and a tick filters the card, the shelf and the add button to the ticked areas", () => {
  assert.match(map, /var per = rings\.map\(function \(r\) \{/);
  assert.match(map, /allPlaces: inside, allArch: arch, per: per/);
  assert.match(map, /function areaApplyTicks\(\) \{/);
  assert.match(map, /data-sa="tick" data-i="/);
  assert.match(map, /else if \(a === "tick"\) areaTick\(i\);/);
  assert.match(map, /else if \(a === "all"\) areaTickAll\(\);/);
  assert.match(map, /a book-reading pass still running for the old selection sees AR\(\) !== R and stops/);
  assert.match(map, /" sources"|"source" : "sources"/);
});
test("clicking one area on the map (its shape or its number) ticks that one alone and shows its detail", () => {
  assert.match(map, /areaShow\(AREA\.polys\.indexOf\(pl\)\)/);
  assert.match(map, /m\.on\("click", function \(e\) \{ L\.DomEvent\.stopPropagation\(e\); areaShow\(i\); \}\);/);
  assert.match(map, /AREA\.pick = \(a\.rings \|\| \[a\.ring\]\)\.length > 1 \? i : null; areaOpenSaved\(id, true\);/, "a saved group's shape too");
  assert.match(map, /return \(t\.length === 1 \? "Area " : "Areas "\) \+ t\.join\(", "\) \+ " of " \+ ns;/);
});

test("the surname card on v2 is a glance: name, languages, origin and the country timeline, with the long notes left to the name's own page", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /class="ra-tw-r ra-tw-nd"/, "a country with no dates is marked so v2 can leave it out");
  assert.match(css, /> \.ra-surn ~ \.ra-surn,[\s\S]*?> \.ra-note,[\s\S]*?> \.ra-juris,[\s\S]*?> \.at-sec \{ display: none; \}/);
  assert.match(css, /\.ra-surn \.ra-tw-nd \{ display: none; \}/);
  assert.match(css, /\.ra-surn \.ra-chips > :nth-child\(n\+5\) \{ display: none; \}/);
});

test("the card's fold control is a chevron, a surname's two icons share the place card's top-right row, and the map credits sit under the map", () => {
  const js = readFileSync(join(root, "public/js/front-door-v2.js"), "utf8");
  assert.match(js, /M5 12\.5l5-5 5 5/, "a chevron up to fold");
  assert.match(js, /M5 7\.5l5 5 5-5/, "a chevron down to bring it back");
  assert.doesNotMatch(js, /textContent = f \? "\+" : "–"/, "no plus or minus");
  assert.match(map, /if \(TSV2\) h\.push\('<span class="at-tools">'\);[\s\S]*?if \(TSV2\) h\.push\("<\/span>"\);/);
  assert.match(js, /wrap\.className = "fd2-credits"; wrap\.setAttribute\("aria-label", "Map credits"\);\s*wrap\.appendChild\(at\); stage\.insertAdjacentElement\("afterend", wrap\);/);
});

test("the Year pill is spaced like its neighbours: no extra margin beside the flex gap", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /order: 9; align-self: flex-start; max-width: none; margin: 0;/);
});

test("source rows carry a + like the books do, access is a picture with its words as the tooltip, and the surname card does not repeat its own page link", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /function srcAttrs\(id, name, where, href\)/);
  assert.equal((map.match(/'<li' \+ srcAttrs\(/g) || []).length, 3, "the place card, the archives and the country-wide lists");
  assert.match(map, /'<li' \+ \(pv\.id \? srcAttrs\(pv\.id/, "the Where to read rows");
  assert.match(map, /function accTxt\(a\)[\s\S]*?if \(!TSV2 \|\| !ACC_SVG\[a\]\) return esc\(label\);/, "words stay off v2");
  assert.match(map, /role="img" title="' \+ esc\(label\) \+ '" aria-label="'/, "the words are the tooltip and the name");
  assert.match(map, /if \(!TSV2\) h\.push\('<a class="at-go"/, "no Read more line beside the page icon");
  assert.match(css, /^\.fd2-stage \.ra-acc \{/m);
});


test("a number in Where to read flies the map to its pin and pulses it, instead of opening the archive", () => {
  assert.match(map, /closest\("\.ra-in-card \.ra-ck-i"\)[\s\S]*?e\.preventDefault\(\); e\.stopPropagation\(\);[\s\S]*?map\.flyTo\(\[pin\.y, pin\.x\]/);
  assert.match(map, /\}, true\);\n/, "in the capture phase, ahead of the link round it");
  assert.match(map, /@keyframes ra-pin-hit/);
});

test("a source with no place on the map shows a globe in Where to read, and the numbers on pins run without a gap", () => {
  assert.match(map, /if \(pv\.at\) \{ pinN\+\+; checkPins\.push\(\{ n: pinN,/);
  assert.match(map, /" ra-ck-web"[\s\S]*?\(pv\.at \? pinN : '<svg viewBox="0 0 20 20"/);
});

test("on v2 the place card's Visiting list is a folded section of the card, not a second overlay, and its rows put the + first", () => {
  assert.match(map, /if \(TSV2\) \{\s*pane\.hidden = true;\s*var mount = panel\.querySelector\("#ra-place-body"\);[\s\S]*?class="ra-check-b ra-in-card ra-visit"/);
  assert.match(map, /visitOpen = visitOld\.map\(function \(x\) \{ return x\.open; \}\)/, "each fold keeps its open or shut state while the walk changes");
  assert.match(map, /return '<li class="ra-vrow"' \+ at[\s\S]*?'<span class="ra-vy">'/, "a Visiting row is a book row: the figure at the right");
  assert.match(map, /replace\(\/<ul>\/g, '<ul class="ra-vl">'\)/);
});

test("every list in a v2 card shares one type scale, and each access icon explains itself", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-area-g > summary, \.fd2-stage \.ra-visit h4 \{ font: 700 11px/);
  assert.match(css, /\.fd2-stage \.ra-vl > li, \.fd2-stage \.ra-vt \{ font-size: 13px; \}/);
  assert.match(map, /unsurveyed: \["Not checked yet", "Nobody has looked at what this source holds/);
});

test("the card has no «full table of who held it» button: the page icon is that door", () => {
  assert.doesNotMatch(map, /class="ra-held-more"/);
});

test("the Visiting header is one line: the note and the walk's hours share a row, and 'working out the walk' is a pulse, not a line", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /class="ra-reach-s ra-reach-ld" role="status"/);
  assert.match(css, /\.fd2-stage \.ra-visit \.ra-hood \{ display: flex;/);
  assert.match(css, /\.ra-reach-ld \{ position: absolute; width: 1px;/);
  assert.match(css, /@keyframes fd2-walk/);
});

test("on v2 the neighbours button opens the walk's hours (and a switch for the ring); a card that is still on screen keeps its walk when the search settles", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /if \(tg && TSV2\) \{ e\.preventDefault\(\); reachPopToggle\(tg\); return; \}/);
  assert.match(map, /className = "fd2-reachpop"/);
  assert.doesNotMatch(map, /ctl = '<span class="ra-reach" role="group"/, "the hours are no longer in the card's note");
  assert.match(map, /if \(!panelAt \|\| panel\.hidden\) clearHood\(\);/);
  assert.match(css, /^\.fd2-stage \.fd2-reachpop \{/m);
  assert.doesNotMatch(map, /DBGREACH/);
});

test("every foldable section of a v2 card carries the same chevron and no coloured dot", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /details\.ra-area-solo-l > summary::before, \.fd2-stage details\.ra-area-cov > summary::before/);
  assert.match(css, /details\.ra-area-cov > summary > i, \.fd2-stage details\.ra-area-rd > summary > i \{ display: none; \}/);
  assert.doesNotMatch(css, /content: "\\25B8"/, "the old triangle is gone");
});

test("the count in a foldable card section's head sits at the right, in one style", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /details\.ra-area-cov > summary > b, \.fd2-stage details\.ra-area-rd > summary > b, \.fd2-stage details\.ra-in-card > summary\.lab > b \{ margin-left: auto;/);
  assert.match(map, /"<\/span><b>" \+ n \+ "<\/b><\/summary>"/);
});

test("while the walk is worked out the villages' heading pulses, and only a failure keeps a line of its own", () => {
  assert.match(map, /ld && vill \? ' class="ra-sum-ld"'/);
  assert.match(map, /class="at-sub ra-visit-bad"/);
});

test("the v2 place card names only the region above its who-held band, not the words «Who held this ground»", () => {
  assert.match(map, /if \(TSV2\) \{\s*var main = [\s\S]*?h\.push\('<p class="at-lab">' \+ esc\(String\(main\.label\)/);
});

test("v2 lists share one spacing, and the walking time is not repeated on the villages", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /var walk = x\.wt != null && !TSV2 \?/);
  assert.match(css, /\.fd2-stage \.ra-area-g > ul > li\[data-src\] \{ padding: 7px 0; border-bottom: 1px solid/);
  assert.match(css, /\.fd2-stage \.ra-area-pl\.ra-area-solo-l > \.ra-vl, \.fd2-stage \.ra-visit > \.ra-vl \{ margin: 4px 0 10px; \}/);
});

test("source rows use the books' dot size and gaps, and the access icon has no stray margin", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /^\.fd2-stage \.ra-acc \{ margin: 0; \}/m);
  assert.match(css, /li\[data-src\] > \.ra-area-p > i \{ width: 8px; height: 8px; \}/);
});

test("the dot sits in a slot as wide as a number, so book, source and visiting names start on one line", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(css, /\.fd2-stage \.ra-vl > li > i, \.fd2-stage \.ra-area-g > ul > li\[data-src\] > \.ra-area-p > i \{ margin: 0 5px; \}/);
});

test("on v2 the Visiting list's headings are top-level folds of the card, each with its own count", () => {
  assert.match(map, /split\(\/\(\?=<h4>\)\/\)/);
  assert.match(map, /class="ra-check-b ra-in-card ra-visit"' \+ \(visitOpen\[gi\] \? " open" : ""\)/);
  assert.doesNotMatch(map, /esc\(T\("Visiting"\)\) \+ "<\/span>"/, "no single Visiting wrapper");
});

test("a village in the Visiting list folds out to its books and catalogues, shut until asked, using the primary place's rows", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.match(map, /function areaVolRows\(p, vs\)/);
  assert.match(map, /var li = areaVolRows\(e\.p, vs\);/, "the area lists use the same rows");
  assert.match(map, /class="ra-vn ra-vexp" data-vplace=/);
  assert.match(map, /\(VEXP\[mark\.id\.slice\(6\)\] \? "" : " hidden"\)/, "shut by default");
  assert.match(map, /areaPlaceVols\(d, true\)/);
  assert.match(css, /^\.fd2-stage \.ra-vl > li\.ra-vrow > \.ra-vbk \{/m);
});

test("every top-level section of a v2 place card starts shut and carries a + that adds everything in it", () => {
  const css = readFileSync(join(root, "public/front-door-v2.css"), "utf8");
  assert.doesNotMatch(map, /ra-area-solo-l" data-vols="' \+ esc\(pp\.i\) \+ '" open>/, "the books are shut by default");
  assert.match(map, /h\.push\('<details class="ra-area-g ra-area-cov"><summary><i style="background:#5B7A8C"><\/i>Sources that cover all of/, "so are the country-wide sources");
  assert.match(map, /var GRP_SEL = "details\.ra-area-solo-l, details\.ra-area-cov, details\.ra-visit";/);
  assert.match(map, /className = "ra-grp-add vm-pill"/);
  assert.match(map, /P\.setState\(x\.id, "planned"\)/);
  assert.match(css, /^\.fd2-stage \.ra-grp-add \{/m);
});
