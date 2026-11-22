/* Night dots: the pure half of the basemap (public/js/night-dots.js) and the guard that keeps its dots from ever being mistaken
   for data. On this atlas a GREY data dot means "nobody has looked"; a quiet dark basemap made of dots must not be readable as
   thousands of them. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = (f) => path.join(here, "../public", f);
const ND = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(pub("js/night-dots.js"), "utf8"))(m); return m.exports; })();
const world = (f) => ND.project(ND.decode(JSON.parse(fs.readFileSync(pub("vendor/natural-earth/" + f), "utf8"))));
const W110 = world("land-110m.json"), W50 = world("land-50m.json");

/* ---- colour arithmetic: WCAG contrast, CIE Lab distance and hue ---- */
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lab = (h) => {
  const [r, g, b] = rgb(h).map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const chroma = (h) => Math.hypot(lab(h)[1], lab(h)[2]);
const hue = (h) => (Math.atan2(lab(h)[2], lab(h)[1]) * 180 / Math.PI + 360) % 360;
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

const css = fs.readFileSync(pub("styles.css"), "utf8");
const ACCESS = Object.fromEntries([...css.matchAll(/--acc-([a-z]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const map = fs.readFileSync(path.join(here, "../src/components/RecordMap.astro"), "utf8");

test("the access colours are all found (the guard below is only as good as this list)", () => {
  assert.deepEqual(Object.keys(ACCESS).sort(), ["account", "catalogue", "free", "index", "mixed", "onsite", "paid", "unsurveyed"]);
});

test("the basemap dot is tone-on-tone: 1.5 to 2.0 against the ground, and blue-navy rather than a grey", () => {
  const c = contrast(ND.DOT, ND.GROUND);
  assert.ok(c >= 1.5 && c <= 2.0, "dot vs ground " + c.toFixed(2));
  assert.ok(chroma(ND.DOT) >= 15, "a navy, not a neutral grey: chroma " + chroma(ND.DOT).toFixed(1));
  assert.ok(lab(ND.DOT)[0] < 35, "dark");
});

test("no access colour, grey or otherwise, comes within reach of the dot", () => {
  const rims = { "hollow rim (no volumes)": "#8A8E86", "dashed rim (paper only)": "#6B7780" };
  for (const [name, hex] of Object.entries({ ...ACCESS, ...rims })) {
    assert.ok(dE(ND.DOT, hex) >= 24, name + " is only " + dE(ND.DOT, hex).toFixed(0) + " apart in Lab");
  }
  for (const [name, hex] of Object.entries(ACCESS)) {
    if (chroma(hex) >= 15) assert.ok(hueGap(ND.DOT, hex) >= 30, name + " shares a hue: " + hueGap(ND.DOT, hex).toFixed(0) + " degrees");
  }
});

test("the two greys that mean 'nobody has looked' stay clearly lighter than the dot, and a dot of theirs is not the dot's size", () => {
  for (const k of ["onsite", "unsurveyed"]) assert.ok(contrast(ND.DOT, ACCESS[k]) >= 2.5, k + " " + contrast(ND.DOT, ACCESS[k]).toFixed(2));
  assert.ok(contrast(ND.DOT, "#6B7780") >= 2.0, "the dashed paper-only rim, the darkest grey a data marker draws");
  const radii = [...map.matchAll(/radius: Math\.min\((\d+(?:\.\d+)?) \+ Math\.sqrt/g)].map((m) => Number(m[1]));
  assert.ok(radii.length >= 2, "RecordMap's marker radii were not found; update this guard if the marker code moved");
  const smallest = Math.min(...radii);
  assert.ok(ND.DOT_R * 2 <= smallest, "a basemap dot (" + ND.DOT_R * 2 + "px across) must be smaller than the smallest data marker's radius (" + smallest + ")");
});

test("on the dark ground every marker rim is clearly visible: the white halo, the grey rims, the cluster ink, the search ring", () => {
  for (const [name, hex] of Object.entries({ "white halo": "#ffffff", "hollow rim": "#8A8E86", "dashed rim": "#6B7780", "cluster ink on night": "#6FB6C6", "search ring (magenta)": "#E0218A" })) {
    assert.ok(contrast(hex, ND.GROUND) >= 3, name + " " + contrast(hex, ND.GROUND).toFixed(2) + ":1 against the night ground");
  }
  assert.match(map, /window\.raBasemaps\.isDark\(baseNow\) \? "#6FB6C6"/, "the cluster discs are inked for every dark ground");
});

test("the grid is a whole number of cells to a tile, so tiles join without a seam", () => {
  assert.equal(256 % ND.SPACING, 0);
  assert.ok(ND.SPACING >= 7 && ND.SPACING <= 9);
});

test("landCells is deterministic and the world's copies agree", () => {
  const a = ND.landCells(W50, 5, 17, 11), b = ND.landCells(W50, 5, 17, 11);
  assert.deepEqual(a, b);
  assert.deepEqual(ND.landCells(W50, 5, 17 + 32, 11), a);
  assert.deepEqual(ND.landCells(W50, 5, 17 - 32, 11), a);
  assert.equal(a.length, 32 * 32);
});

test("known places are dots and known seas are not, coarse and fine", () => {
  const land = [["Sahara", 23, 15], ["Kansas", 38.5, -98], ["Siberia", 62, 100], ["Zagreb", 45.8, 16], ["inland Bosnia", 44.2, 18]];
  const sea = [["mid Atlantic", 30, -40], ["mid Pacific", 0, -150], ["Indian Ocean", -20, 80], ["deep Adriatic", 42.6, 16.5]];
  for (const [n, la, lo] of land) {
    assert.ok(ND.dotAt(W110, lo, la, 3), n + " (110m, z3)");
    assert.ok(ND.dotAt(W50, lo, la, 7), n + " (50m, z7)");
  }
  for (const [n, la, lo] of sea) {
    assert.ok(!ND.dotAt(W110, lo, la, 3), n + " (110m, z3)");
    assert.ok(!ND.dotAt(W50, lo, la, 7), n + " (50m, z7)");
  }
});

test("a coast is recognisable at zoom 7: the Adriatic is a gap between two shores", () => {
  const row = [];
  for (let lon = 10; lon <= 20; lon += 0.1) row.push(ND.dotAt(W50, lon, 43.6, 7) ? 1 : 0);
  const s = row.join("").replace(/1{2,}/g, "L").replace(/0{2,}/g, "S");
  assert.match(s, /L.*S.*L/, "land, sea, land along 43.6 N; got " + s);
});

test("interior land is filled, not just its coast (a row whose exit crossing lies off the tile)", () => {
  const m = ND.landCells(W50, 7, 71, 46);   // the Pannonian plain: Hungary, Serbia, Romania
  let dots = 0; for (const v of m) dots += v;
  assert.ok(dots > 900, dots + " of 1024 cells");
});

test("the land share of the world at zoom 3 is about the real one", () => {
  let dots = 0, cells = 0;
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { const m = ND.landCells(W110, 3, x, y); for (const v of m) { dots += v; cells++; } }
  const f = dots / cells;
  assert.ok(f > 0.2 && f < 0.4, "land fraction " + f.toFixed(2));
});

test("the zoom plan: dots to 7, Esri's dark tiles from 8, names from 5, the fine outlines from 4", () => {
  assert.deepEqual([ND.plan(0), ND.plan(7)].map((p) => p.dots), [true, true]);
  assert.equal(ND.plan(7).dark, false);
  assert.deepEqual([ND.plan(8).dots, ND.plan(8).dark], [false, true]);
  assert.equal(ND.plan(4).labels, false);
  assert.equal(ND.plan(5).labels, true);
  assert.equal(ND.setFor(3), "coarse");
  assert.equal(ND.setFor(4), "fine");
});

test("the land files are the Natural Earth ones, said so, and only fetched on demand", () => {
  assert.match(fs.readFileSync(pub("vendor/natural-earth/NOTICE.txt"), "utf8"), /Natural Earth is in the public domain/);
  assert.doesNotMatch(map, /<script[^>]*night-dots\.js/, "the default load must not carry the Night dots script");
  assert.doesNotMatch(map, /land-(110|50)m/, "the land files are named only inside night-dots.js");
  assert.match(fs.readFileSync(pub("js/night-dots.js"), "utf8"), /attribution: "Land &copy; Natural Earth/, "the attribution is on the map");
});
