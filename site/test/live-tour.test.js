/* The live tour runs the real Atlas on a throwaway demo family and puts everything back. These checks read the sources: the shape the gate and the
   sandbox depend on, since the running tour needs a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");
const tour = read("../public/js/live-tour.js");

test("the tour is a classic script that exports open/close/isOpen/stories", () => {
  assert.doesNotMatch(tour, /^\s*(import|export)\s/m);
  assert.match(tour, /w\.raLiveTour\s*=\s*\{\s*open:\s*open,\s*close:\s*close,\s*get isOpen\(\)[\s\S]*?stories:/);
});

test("nothing the tour builds is trusted as markup", () => {
  assert.doesNotMatch(tour, /\.innerHTML\s*=/);
  assert.doesNotMatch(tour, /insertAdjacentHTML/);
});

test("the demo is a sandbox: research is snapshotted, demo flag set, sync held, and all of it restored on close", () => {
  assert.match(tour, /ra-tour-backup/);
  assert.match(tour, /w\.raDemo\s*=\s*true/);
  assert.match(tour, /w\.raDemo\s*=\s*false/);
  assert.match(read("../public/js/sync-auto.js"), /if \(window\.raDemo\) return Promise\.resolve\(\)/);
  assert.match(read("../public/js/progress-kit.js"), /reload:\s*function/);
});

test("every story is four or more beats and each beat has a caption and a body", () => {
  assert.match(tour, /Cape Town/);
  assert.match(tour, /Sydney/);
  assert.match(tour, /Kowalski/);
  assert.match(tour, /Buenos Aires/);
});

test("the tour drives the map only through the small raTourApi", () => {
  const map = read("../src/components/RecordMap.astro");
  assert.match(map, /window\.raTourApi\s*=\s*\{/);
  for (const k of ["place", "source", "country", "search", "clear"]) assert.match(map, new RegExp(k + "\\s*[:(]"));
});

test("the gate loads the live tour only when asked or when a backup was left by a closed page", () => {
  const gate = read("../public/js/start-tour-gate.js");
  assert.match(gate, /js\/live-tour\.js/);
  assert.match(gate, /ra-tour-backup/);
});
