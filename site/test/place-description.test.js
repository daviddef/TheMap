/* A PLACE PAGE'S DESCRIPTION SAYS THE SAME NUMBER OF VOLUMES AS ITS BODY.
 *
 * Found 22 Nov 2026: 38 of 45 live place pages sampled said «N record volumes» with N = 0 in the meta description (the snippet a search result
 * shows) while the paragraph under the title said «The atlas holds 9 record volumes». The description counted `cs.length`, the collections listed
 * on the page (capped at 20, and empty for a place whose books are in the detail file), and the paragraph counted `volumesTotal`.
 *
 * Three layers: the sentence itself (pure), the page's wiring (source), and real places read from public/p/ the way the page reads them, and,
 * when a build exists, the built HTML of every place page in it. The last two are skipped when their data is absent. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { placeDescription, MIN, MAX } from "../src/lib/place-description.js";

const base = { name: "Montenaken", whereFull: "Liège, Belgium", older: [], span: [1600, 1900] };

test("the sentence carries the count it is given, and never says 0 record volumes", () => {
  assert.match(placeDescription({ ...base, volumes: 9 }), /^Montenaken in Liège, Belgium\. 9 record volumes covering 1600–1900, and who holds them\.$/);
  assert.match(placeDescription({ ...base, volumes: 1 }), /\b1 record volume\b(?!s)/);
  assert.match(placeDescription({ ...base, volumes: 2140 }), /2,140 record volumes/);
  for (const d of [placeDescription({ ...base, volumes: 0, span: null }), placeDescription({ ...base, volumes: 0, older: ["Montenacken"] })]) {
    assert.ok(!/\b0 record volume/.test(d), d);
    assert.match(d, /No register volumes are listed/);
    assert.match(d, /Liège, Belgium/);
  }
});

test("former names are kept when they fit, trimmed from the end when they do not, and the line stays 70 to 160 characters", () => {
  const long = Array.from({ length: 12 }, (_, i) => `Oldname${i}`);
  const d = placeDescription({ name: "Donaghmore", whereFull: "County Limerick, Ireland", older: long, volumes: 33, span: [1700, 1900] });
  assert.ok(d.length <= MAX, `${d.length}: ${d}`);
  assert.match(d, /also written Oldname0, Oldname1/);
  assert.ok(!d.includes("Oldname11"));
  for (const v of [0, 1, 5, 300]) {
    for (const name of ["Ur", "Gračišće", "A very long place name indeed, with a long county too"]) {
      const s = placeDescription({ name, whereFull: "Istria, Croatia", older: ["Gallignana"], volumes: v, span: v ? [1757, 1888] : null });
      assert.ok(s.length >= MIN && s.length <= MAX + 12, `${s.length}: ${s}`);
    }
  }
});

test("two places of the same name are told apart by where they are", () => {
  const a = placeDescription({ name: "Donaghmore", whereFull: "County Limerick, Ireland", volumes: 4, span: [1800, 1880] });
  const b = placeDescription({ name: "Donaghmore", whereFull: "County Tyrone, Ireland", volumes: 4, span: [1800, 1880] });
  assert.notEqual(a, b);
});

test("the place page feeds the description and the body from one number", () => {
  const page = readFileSync(new URL("../src/pages/place/[id].astro", import.meta.url), "utf8");
  assert.match(page, /const volN = volumesTotal \|\| csAll\.length;/);
  assert.match(page, /placeDescription\(\{[^}]*volumes: volN/);
  assert.match(page, /<PlaceGlance[^>]*volumeCount=\{volN\}/);
  assert.ok(!/cs\.length\} record volume/.test(page), "the old count is back in the sentence");
});

/* REAL PLACES, read the way the page reads them: public/p/<id>.json's volumesTotal, else the collections the place lists. */
const P = new URL("../public/p/", import.meta.url);
const FULL = new URL("../src/data/places-full.json", import.meta.url);
const haveData = existsSync(P) && existsSync(FULL);

test("real places: the description's count is the body's count, including a place whose count was 0", { skip: !haveData }, () => {
  const full = JSON.parse(readFileSync(FULL, "utf8"));
  const by = new Map(full.places.map((p) => [p.id, p]));
  let checked = 0, wasZero = 0, none = 0;
  const files = readdirSync(P).filter((f) => f.endsWith(".json")), step = Math.max(1, Math.floor(files.length / 400));
  for (let i = 0; i < files.length; i += step) {                 // an even, repeatable spread over the whole directory
    const f = files[i];
    const id = f.slice(0, -5), place = by.get(id);
    if (!place) continue;
    const det = JSON.parse(readFileSync(new URL(f, P), "utf8"));
    const csAll = place.collections || [];
    const body = det.volumesTotal || csAll.length;               // PlaceGlance's volumeCount
    const old = Math.min(csAll.length, 20);                      // what the description used to say
    const d = placeDescription({ name: place.name, whereFull: "Somewhere", older: [], volumes: body, span: [1800, 1900] });
    if (body > 0) assert.ok(d.includes(`${body.toLocaleString("en-GB")} record volume`), `${id}: body ${body}, description "${d}"`);
    else { none++; assert.ok(!/record volume/.test(d.replace("No register volumes", "")), d); }
    if (old === 0 && body > 0) wasZero++;
    checked++;
  }
  assert.ok(checked >= 20, `only ${checked} places read`);
  console.log(`  ${checked} real places read; ${wasZero} would have said 0 before; ${none} truly hold none`);
});

/* THE BUILT PAGES: every place page in a build, the description against the paragraph. */
const DIST = new URL("../dist/place/", import.meta.url);
test("built: every place page's description count equals its paragraph's count", { skip: !existsSync(DIST) }, () => {
  let n = 0, bad = [];
  for (const id of readdirSync(DIST)) {
    const f = new URL(`${id}/index.html`, DIST);
    if (!existsSync(f)) continue;
    const html = readFileSync(f, "utf8");
    const dec = (x) => x.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const desc = dec((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
    const ogd = dec((html.match(/<meta property="og:description" content="([^"]*)"/) || [])[1] || "");
    const bodyN = (html.match(/The atlas holds <a href="#ra-vols"[^>]*>([\d,]+) record volume/) || [])[1];
    const descN = (desc.match(/\b([\d,]+) record volume/) || [])[1];
    if (desc !== ogd) bad.push(`${id}: og:description differs`);
    if (/\b0 record volume/.test(desc)) bad.push(`${id}: says 0 record volumes`);
    if (bodyN !== descN) bad.push(`${id}: body ${bodyN}, description ${descN}`);
    if (!bodyN && !/No register volumes/.test(desc)) bad.push(`${id}: no volumes but the description does not say so`);
    if (desc.length < 70 || desc.length > 175) bad.push(`${id}: ${desc.length} characters`);
    n++;
  }
  assert.ok(n > 0, "no built place pages");
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${n} built place pages disagree`);
});
