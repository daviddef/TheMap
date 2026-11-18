/* The two example files published at /examples/ (and on raw.githubusercontent.com) for the Tree Canvas: every person invented, nobody living, both open through the
   reader the canvas uses, and both load by link. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGedcom } from "../public/roots/js/gedcom.js";
import { readPeople, prepare } from "../public/roots/js/model.js";
import { readTreeJson } from "../public/roots/js/treejson.js";
import { fetchBytes, parseLink } from "../public/roots/js/openlink.js";

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const GED = path.join(PUB, "examples", "example-family.ged"), TJ = path.join(PUB, "examples", "example-family.tree.json"), README = path.join(PUB, "examples", "README.md");
const fold = s => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

test("both files and a README exist, and each says in its own words that the people are invented", () => {
  for (const f of [GED, TJ, README]) assert.ok(fs.existsSync(f), f);
  assert.match(fs.readFileSync(GED, "utf8"), /1 NOTE THIS FILE IS AN EXAMPLE\. Every person in it is invented/);
  assert.match(JSON.parse(fs.readFileSync(TJ, "utf8")).meta.note, /Every person in it is invented/);
  assert.match(fs.readFileSync(README, "utf8"), /Every person in them is invented/);
});

test("the GEDCOM opens: 11 people, every one with a death year, nobody living", () => {
  const parsed = parseGedcom(new Uint8Array(fs.readFileSync(GED)));
  const { people, mentions } = readPeople(parsed);
  prepare(people);
  assert.equal(people.size, 11);
  for (const p of people.values()) { assert.equal(p.liv, false, p.id + " is living"); assert.ok(p.deathKnown, p.id + " has no death"); assert.ok(p.by && p.by < 1920, p.id + " born " + p.by); }
  assert.equal(mentions.size, 10, "ten different places");
  assert.ok(![...mentions.keys()].some(k => /street|road|avenue|\d{2,}/i.test(k)), "no street or house in a place");
});

test("the tree.json opens through the canvas's reader: 11 people, nothing living, no broken links, places carried", () => {
  const r = readTreeJson(fs.readFileSync(TJ, "utf8"));
  assert.equal(r.ok, true, r.error);
  assert.equal(r.tree.meta.source, "tree.json");
  assert.equal(r.tree.people.length, 11);
  assert.deepEqual({ ...r.notes, people: 11 }, { people: 11, skipped: 0, badYears: 0, brokenLinks: 0, mended: 0, living: 0, pageDropped: 0, duplicates: 0 });
  assert.ok(r.tree.people.every(p => !p.living && p.dy));
});

test("it is the same family in both files, and every place the tree.json names is one it also lists with coordinates", () => {
  const g = readPeople(parseGedcom(new Uint8Array(fs.readFileSync(GED)))).people;
  const gnames = [...g.values()].map(p => fold(p.given + " " + p.sur)).sort();
  const t = JSON.parse(fs.readFileSync(TJ, "utf8"));
  assert.deepEqual(t.people.map(p => fold(p.given + " " + p.sur)).sort(), gnames);
  const listed = new Set(t.places.map(p => p.n));
  for (const p of t.people) for (const k of [p.bp, p.dp]) if (k) assert.ok(listed.has(k), k + " is not in places");
  for (const pl of t.places) { assert.ok(Math.abs(pl.lat) <= 90 && Math.abs(pl.lon) <= 180 && /^[A-Z]{2}$/.test(pl.cn), pl.n); }
});

test("both load by link, as the page's example buttons do: allowed by the page's own origin, refused for the same address typed in from nowhere", async () => {
  const origin = "http://127.0.0.1:4802";
  for (const [file, head] of [[GED, "0 HEAD"], [TJ, "{"]]) {
    const url = origin + "/examples/" + path.basename(file), body = fs.readFileSync(file);
    const f = async u => ({ ok: true, status: 200, url: u, headers: { get: () => null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
    const r = await fetchBytes(url, { fetchImpl: f, origin });
    assert.equal(r.ok, true, url);
    assert.ok(new TextDecoder().decode(new Uint8Array(r.bytes, 0, 8)).startsWith(head));
    assert.equal(parseLink(url).ok, false, "a local address is not opened unless it is the page's own");
  }
  assert.equal(parseLink("https://recordatlas.org/examples/example-family.ged").ok, true);
  assert.equal(parseLink("https://raw.githubusercontent.com/daviddef/TheMap/main/site/public/examples/example-family.ged").ok, true);
});

test("the opening page offers both examples, and each address is a file that is published", () => {
  const html = fs.readFileSync(path.join(PUB, "..", "src", "pages", "tree-canvas", "index.astro"), "utf8");
  for (const p of ["/examples/example-family.ged", "/examples/example-family.tree.json"]) { assert.ok(html.includes('data-ex="' + p + '"'), p); assert.ok(fs.existsSync(path.join(PUB, p)), p); }
});
