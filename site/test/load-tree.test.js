/* The tree-growing loading screen (public/js/load-tree.js): which reader message belongs to which stage, that it is wired into both pages that read a file, that the
   pages' policy did not widen, and that the script makes no request and keeps nothing: its people are invented, never from the visitor's file. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const src = read("../public/js/load-tree.js");
const mod = { exports: {} };
new Function("module", src)(mod);
const { stageOf, STAGES } = mod.exports;

test("every message the reader says lands on its stage, and the places step reports how far it is", () => {
  const cases = [["Reading the file…", 0], ["Reading your file…", 0], ["Finding people and places…", 1], ["Reading the Atlas…", 2], ["Placing 412 different places…", 3], ["Building the tree…", 4], ["Drawing flags and regimes…", 5]];
  for (const [m, i] of cases) assert.equal(stageOf(m)?.i, i, m);
  const p = stageOf("Loading the IT places (30 of 65)…");
  assert.equal(p.i, 3); assert.ok(p.p > 0.4 && p.p < 0.5);
  assert.ok(stageOf("Loading the IT places (65 of 65)…").p <= 0.95, "the places step never reads as finished before the next message says so");
  for (const m of ["Hiding living people…", "Starting…", "Loaded from localhost. Read in this browser", ""]) assert.equal(stageOf(m), null, m);
});

test("the pipeline still says the messages this maps (so a renamed step cannot silently stop the tree)", () => {
  const pipe = read("../public/roots/js/pipeline.js");
  for (const m of ["Reading the file", "Finding people and places", "Reading the Atlas", "Placing ", "Building the tree", "Drawing flags and regimes"]) assert.ok(pipe.includes(`'${m}`), m);
  assert.match(pipe, /'Loading the ' \+ cc \+ ' places \('/);
  assert.equal(STAGES.length, 6);
  for (const s of STAGES) assert.equal(s.j.length, 3, s.k + " has its three jokes");
});

test("both pages that read a file load it, and send their progress to it", () => {
  assert.match(read("../src/pages/roots/index.astro"), /<script is:inline src="\/js\/load-tree\.js"><\/script>\s*<script is:inline src="js\/app\.js"/);
  assert.match(read("../src/pages/tree-canvas/index.astro"), /<script is:inline src="\/js\/load-tree\.js"><\/script>/);
  const r = read("../public/roots/js/app.js"), t = read("../public/tree-canvas/app.js");
  assert.match(r, /RALoad\.say\(m\.msg \+ '…'\)/); assert.match(r, /RALoad\.hide\(\)/); assert.match(r, /RALoad\.off\(\)/);
  assert.match(t, /L\.wants\(text\)\) \{ m\.hidden = true; L\.say\(text\)/); assert.match(t, /if \(isError\) L\.off\(\); else L\.hide\(\)/);
});

test("the pages' policy did not widen: scripts and styles stay 'self'", () => {
  for (const f of ["../src/pages/roots/index.astro", "../src/pages/tree-canvas/index.astro"]) {
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(read(f))[1];
    assert.match(csp, /script-src 'self';/); assert.match(csp, /style-src 'self';/); assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
  }
});

test("the loading screen makes no request, keeps nothing and uses no name from the file", () => {
  for (const bad of ["fetch(", "XMLHttpRequest", "localStorage", "sessionStorage", "indexedDB", "postMessage", "sendBeacon", "eval("]) assert.ok(!src.includes(bad), bad);
  assert.match(src, /var NM = \['Maria'/, "the names on the cards are a fixed list");
  const css = read("../public/js/load-tree.css");
  assert.ok(!/url\(/.test(css), "the stylesheet loads nothing else");
});

test("a reader who asks for less motion gets the words and the bar, not the drawing", () => {
  assert.match(src, /prefers-reduced-motion: reduce/);
  assert.match(src, /if \(still\) cv\.hidden = true/);
});
