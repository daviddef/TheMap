/* WHO TO CONTACT: the store and its adapters (scripts/contacts/) and the reader the pages use (public/js/contacts-near.js). Made-up rows,
   except the last two, which hold the committed store to its own rules and check that the page still asks for the script. No network. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.join(SITE, "..");
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(SITE, "public/js/contacts-near.js"), "utf8"))(mod);
const C = mod.exports;
const py = (code, input) => JSON.parse(execFileSync("python3", ["-c", `import json, sys\nsys.path.insert(0, "scripts")\nfrom contacts import core, harvest_osm, build\n${code}`],
  { cwd: ROOT, input: JSON.stringify(input ?? null), encoding: "utf8" }));

const OSM = { elements: [
  { type: "node", id: 1, lat: 45.1, lon: 17.2, tags: { amenity: "townhall", name: "Općina Primjer", "contact:email": "info@primjer.example;ana.horvat@primjer.example",
    phone: "+385 34 111 222; 12", website: "www.primjer.example", "addr:street": "Trg", "addr:housenumber": "1", "addr:postcode": "10000", "addr:city": "Primjer", wikidata: "Q5" } },
  { type: "way", id: 2, center: { lat: 45.2, lon: 17.3 }, tags: { landuse: "cemetery", operator: "Komunalac d.o.o." } },
  { type: "way", id: 3, center: { lat: 45.2, lon: 17.3 }, tags: { amenity: "grave_yard", operator: "Ivan Horvat" } },
  { type: "node", id: 4, lat: 45.1, lon: 17.2, tags: { amenity: "place_of_worship", "contact:email": "marko.horvat@gmail.com" } },
  { type: "node", id: 5, lat: 45.1, lon: 17.2, tags: { amenity: "cafe", email: "info@cafe.example" } }] };

test("an OpenStreetMap answer becomes rows: organisations and their own mailboxes, never a person", () => {
  const rows = py("print(json.dumps(sorted(harvest_osm.rows_from(json.load(sys.stdin), 'HR'), key=lambda r: r['id'])))", OSM);
  assert.deepEqual(rows.map((r) => r.id), ["osm:n1", "osm:w2"], "a person's name, a free-mail address and a café leave nothing");
  const hall = rows[0];
  assert.deepEqual(hall.email, ["info@primjer.example"]);
  assert.deepEqual(hall.tel, ["+385 34 111 222"]);
  assert.deepEqual(hall.web, ["https://www.primjer.example"]);
  assert.equal(hall.post, "Trg 1, 10000 Primjer");
  assert.deepEqual(hall.ids, ["osm:n1", "wd:Q5"]);
  assert.equal(hall.kind, "town-hall");
  assert.equal(rows[1].operator, "Komunalac d.o.o.");
});

test("the store is written the same way twice, and refuses a row an adapter could not have written", () => {
  const out = py(`import tempfile, os
d = tempfile.mkdtemp()
rows = harvest_osm.rows_from(json.load(sys.stdin), "HR")
p = core.write_source("osm", "HR", rows, "2026-01-01", d); a = open(p, "rb").read()
core.write_source("osm", "HR", list(reversed(rows)), "2026-02-02", d); b = open(p, "rb").read()
clean = core.check(d)
rows[0]["email"] = ["ana.horvat@primjer.example"]
core.write_source("osm", "SI", [dict(rows[0], id="osm:n99")], "2026-01-01", d)
print(json.dumps({"same": a == b, "clean": clean, "bad": core.check(d)}))`, OSM);
  assert.equal(out.same, true, "no new rows, no new bytes");
  assert.deepEqual(out.clean, []);
  assert.match(out.bad.join("\n"), /osm\/SI\.json\.gz osm:n99: holds something/);
});

test("the Atlas's own and Wikidata rows keep apart, a dead address is dropped, and coverage joins on identifiers only", () => {
  const out = py(`P = [{"id": "a", "name": "State Archives", "kind": "regional-archive", "countries": ["HR"], "url": "https://a.example/", "at": {"lat": 45, "lon": 16}, "wikidata": "Q1"},
     {"id": "shop", "name": "A shop", "kind": "commercial", "countries": ["HR"], "url": "https://s.example/"}]
own = {"emails": [{"email": "info@a.example", "state": "listed", "providers": ["a"]}, {"email": "old@a.example", "state": "dead", "providers": ["a"]}], "offices": []}
rows = build.atlas_rows(P, own, {"Q1": {"email": "old@a.example", "tel": "+385 1 222 333"}})
known = [("archive", ["wd:Q1"]), ("archive", ["provider:a", "wd:Q1"]), ("cemetery", ["osm:w2"]), ("cemetery", ["wd:Q9"])]
rows.append(("osm", {"id": "osm:w2", "kind": "cemetery", "ids": ["osm:w2"], "operator": "Komunalac d.o.o."}))
print(json.dumps({"rows": rows, "cov": build.coverage(known, rows)}))`);
  assert.deepEqual(out.rows.map((r) => r[0]), ["own", "wikidata", "osm"]);
  assert.deepEqual(out.rows[0][1].email, ["info@a.example"]);
  assert.equal(out.rows[1][1].email, undefined);
  const k = Object.fromEntries(out.cov.map((c) => [c.kind, c]));
  assert.deepEqual([k.archive.known, k.archive.reach, k.archive.email], [1, 1, 1], "one archive, listed twice");
  assert.deepEqual([k.cemetery.known, k.cemetery.reach, k.cemetery.managerOnly], [2, 0, 1]);
});

const SOURCES = { own: { rank: 1, title: "Record Atlas", licence: "x", url: "https://r.example/" }, osm: { rank: 3, title: "OpenStreetMap", licence: "ODbL 1.0", attribution: "© OpenStreetMap contributors", url: "https://o.example/" }, wikidata: { rank: 4, title: "Wikidata", licence: "CC0 1.0", url: "https://w.example/" } };
const ROWS = [
  { id: "wikidata:a", src: "wikidata", kind: "archive", name: "Wikidata name", y: 45.1, x: 17.2, ids: ["provider:a", "wd:Q1"], email: ["INFO@a.example"], tel: ["+385 (1) 222-333"] },
  { id: "osm:n7", src: "osm", kind: "archive", name: "Arhiv", y: 45.1001, x: 17.2001, ids: ["osm:n7", "wd:Q1"], email: ["info@a.example", "reading@a.example"], tel: ["+385 1 222 333"], web: ["https://a.example"] },
  { id: "osm:n8", src: "osm", kind: "church", name: "<img src=x onerror=1>", y: 45.12, x: 17.2, ids: ["osm:n8"], web: ["javascript:alert(1)"], post: ["x"] },
  { id: "osm:n9", src: "osm", kind: "church", name: "Far away", y: 46.5, x: 17.2, ids: ["osm:n9"], email: ["f@far.example"] }];

test("rows sharing an identifier become one institution, values said once, the better source first", () => {
  const list = C.entities(ROWS, SOURCES), arch = list.find((e) => e.kind === "archive");
  assert.equal(list.length, 3);
  assert.equal(arch.name, "Arhiv");
  assert.deepEqual(arch.email.map((h) => [h.v, h.src]), [["info@a.example", "osm"], ["reading@a.example", "osm"]]);
  assert.equal(arch.tel.length, 1);
  assert.deepEqual(arch.srcs, ["osm", "wikidata"]);
});

test("the section lists what is near, credits its sources, and writes nothing a source says as markup or as a script link", () => {
  const near = C.near(C.entities(ROWS, SOURCES), 45.1, 17.2, 20);
  assert.deepEqual(near.map((e) => e.kind), ["archive", "church"]);
  const html = C.section(near, SOURCES);
  assert.match(html, /Who to contact near here/);
  assert.match(html, /mailto:info@a\.example/);
  assert.match(html, /OpenStreetMap contributors<\/a> \(ODbL 1\.0\)/);
  assert.ok(!/<img|href="javascript:/i.test(html), html);
  assert.equal(C.section([], SOURCES), "", "nothing held is no heading, not an empty one");
});

test("only the squares the circle touches are asked for, with every part", () => {
  const index = { groups: { open: { "45_17": 2, "46_17": 1, "10_10": 1 }, odbl: { "45_16": 1 } } };
  assert.deepEqual(C.filesFor(45.5, 17.5, 20, index), ["open/45_17.json", "open/45_17-1.json"]);
  assert.deepEqual(C.filesFor(45.5, 17.01, 20, index).sort(), ["odbl/45_16.json", "open/45_17-1.json", "open/45_17.json"]);
});

test("loading reads the index, then those squares, and a square that fails is a failure and not «nobody here»", async () => {
  const asked = [], files = { "/contacts/index.json": { groups: { odbl: { "45_17": 1 } }, sources: SOURCES }, "/contacts/odbl/45_17.json": { rows: ROWS.slice(0, 3) } };
  const get = (u) => { asked.push(u); return files[u] ? Promise.resolve(files[u]) : Promise.reject(new Error(u)); };
  const r = await C.load("/", 45.1, 17.2, 20, get);
  assert.deepEqual(asked, Object.keys(files));
  assert.equal(r.list.length, 2);
  const box = {};
  await C.fill(box, "/", 45.1, 17.2, "wd:Q1", get);
  assert.match(box.innerHTML, /mailto:info@a\.example/);
  delete files["/contacts/odbl/45_17.json"];
  await assert.rejects(C.load("/", 45.1, 17.2, 20, get));
});

test("the committed store is sound", () => {
  assert.deepEqual(py("print(json.dumps(core.check()))"), []);
});

test("the place page carries the section and the script, and no contacts of its own", () => {
  const page = fs.readFileSync(path.join(SITE, "src/pages/place/[id].astro"), "utf8");
  assert.match(page, /<section id="contacts-near" data-lat=\{place\.lat\} data-lon=\{place\.lon\}/);
  assert.match(page, /js\/contacts-near\.js/);
});
