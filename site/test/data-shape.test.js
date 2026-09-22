/* The shapes the pages assume, asserted against the real files.
 *
 * check-data.py already guards the data it knows about. These are the
 * assumptions that live in JavaScript — the loaders that read from disk
 * because importing them killed the build, and the invariants a page
 * relies on without saying so. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { corpus } from "../src/lib/surname-corpus.js";
import { belgiumFor } from "../src/lib/belgium-surnames.js";
import { contextFor } from "../src/lib/surname-context.js";
import { atlas } from "../src/lib/atlas.js";

test("the corpus loads from disk and is whole", () => {
  const c = corpus();
  assert.ok(Array.isArray(c.surnames) && c.surnames.length > 100000,
    "a corpus this small means the loader found the wrong file");
  assert.ok(c.counts && typeof c.counts.surnames === "number");
});

test("the atlas is both halves of the split index", () => {
  /* index.json carries the places with something to show and
     index-quiet.json the rest; ten static pages import this instead of
     index.json because importing half a file and believing it whole cost
     4,904 places their pages. */
  const idx = JSON.parse(fs.readFileSync("public/index.json", "utf8"));
  const quiet = JSON.parse(fs.readFileSync("public/index-quiet.json", "utf8"));
  assert.equal(atlas.places.length, idx.places.length + quiet.places.length);
  assert.ok(atlas.places.length > idx.places.length, "the quiet half is not empty");
});

test("every place has somewhere to be and a name", () => {
  for (const p of atlas.places) {
    assert.ok(p.i, "a place with no id cannot have a page");
    assert.ok(typeof p.y === "number" && typeof p.x === "number", `${p.i} has no position`);
    assert.ok(p.y >= -90 && p.y <= 90 && p.x >= -180 && p.x <= 180, `${p.i} is off the earth`);
  }
});

test("Belgium answers by commune and the totals agree with the rows", () => {
  const rows = belgiumFor("Peeters");
  assert.ok(rows && rows.length > 100, "Peeters is in hundreds of communes");
  for (const r of rows) {
    assert.ok(typeof r.y === "number" && typeof r.x === "number");
    assert.ok(r.c > 0 && r.nl);
    assert.ok(r.y > 49 && r.y < 52 && r.x > 2 && r.x < 7, `${r.nl} is not in Belgium`);
  }
  assert.ok(rows[0].c >= rows[rows.length - 1].c, "commonest first");
  assert.equal(belgiumFor("Nosuchnameanywhere"), null);
});

test("surname context is attributed or it is not shipped", () => {
  const k = contextFor("Kowalski");
  assert.ok(k, "Kowalski should have context");
  assert.ok(k.q, "every claim carries the item that made it");
  assert.match(k.cite, /^https:\/\/www\.wikidata\.org\/wiki\//);
  /* Lexemes live at /wiki/Lexeme:L…, and a citation that 404s is worse
     than none. */
  const smith = contextFor("Smith");
  if (smith && smith.q.startsWith("L")) {
    assert.match(smith.cite, /\/wiki\/Lexeme:L/);
  }
  assert.equal(contextFor("Nosuchnameanywhere"), null);
});

test("nothing in the context file is presented as our own finding", () => {
  const raw = JSON.parse(fs.readFileSync("../data/surname-context.json", "utf8"));
  assert.match(raw.note, /Wikidata/);
  assert.ok(raw.licence && raw.source, "a copied claim needs its source named");
});
