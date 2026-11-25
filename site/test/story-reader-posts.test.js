/* READER BUGS THE STORY CHECK FOUND (November 2026), each kept as a test: surnames that are also places, particles, listed children and counts, years nobody
   wrote, step- and god- relatives, facts told of another relative, "near X called Y", places several towns share, asides, and names kept as written.
   A small made-up gazetteer holds the places and the look-alikes; the same stories run against the real one in test/stress/corpus-posts.mjs. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();

let k = 0;
const P = (n, cc, x, y, extra) => Object.assign({ i: n.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + cc.toLowerCase() + "-" + (++k), n, cc, c: 5, x, y }, extra || {});
const rows = [
  P("Cork", "IE", -8.47, 51.9), P("Boston", "US", -71.06, 42.36, { c: 40 }), P("Berlin", "DE", 13.4, 52.52, { c: 30 }), P("Hamburg", "DE", 10, 53.55), P("Murphy", "US", -84, 35, { c: 0 }),
  P("Rossi", "IT", 11, 45, { c: 0 }), P("Fiume", "HR", 14.44, 45.33), P("Adelaide", "AU", 138.6, -34.9), P("Sydney", "AU", 151.2, -33.87), P("Graz", "AT", 15.44, 47.07), P("Vienna", "AT", 16.37, 48.2),
  P("Idrija", "SI", 14.03, 46.0), P("Ljubljana", "SI", 14.5, 46.05), P("Melbourne", "AU", 144.96, -37.81), P("Udine", "IT", 13.23, 46.06), P("Ovaro", "IT", 12.87, 46.48), P("Buenos Aires", "AR", -58.38, -34.6),
  P("Pula", "HR", 13.85, 44.87), P("Zadar", "HR", 15.23, 44.12), P("Chicago", "US", -87.6, 41.88), P("Zagreb", "HR", 15.98, 45.81), P("Senj", "HR", 14.9, 45), P("Trieste", "IT", 13.77, 45.65),
  P("Lugo", "ES", -7.55, 43.0, { al: ["Galicia"] }), P("Galicia", "ES", -7.9, 42.8, { c: 0 }), P("Bavaria", "IT", 12.2, 45.8, { c: 0, v: 2 }), P("Bavaria", "DE", 11.4, 48.9, { c: 0 }),
  P("Glasgow", "GB", -4.25, 55.86), P("New Glasgow", "CA", -62.65, 45.59, { c: 0, v: 131 }), P("Halifax", "CA", -63.57, 44.65), P("Montevideo", "UY", -56.2, -34.9), P("Montevideo", "US", -95.7, 44.9, { c: 0 }),
  P("Butte", "US", -121.6, 39.2, { c: 1, v: 404 }), P("Naples", "IT", 14.27, 40.85), P("Przemyśl", "PL", 22.77, 49.78), P("New York", "US", -74, 40.71, { c: 50 }), P("Leeds", "GB", -1.55, 53.8), P("York", "GB", -1.08, 53.96),
  P("Cobh", "IE", -8.3, 51.85), P("Connor", "GB", -6.2, 54.8, { c: 0 }), P("Ennis", "IE", -8.98, 52.84), P("Geelong", "AU", 144.36, -38.15), P("Kraków", "PL", 19.94, 50.06), P("Ohio", "US", -82.9, 40.4, { c: 0 })
];
const given = [["Johan"], ["Anna"], ["Maria"], ["Antonio"], ["Giovanni"], ["Luisa"], ["Paolo"], ["Franz"], ["Marija"], ["Giuseppina"], ["Luigi"], ["Pietro"], ["Mario"], ["Katarina"], ["Josip"], ["Ivan"], ["Michael"], ["Mary"], ["Patrick"], ["Joan"], ["Tony"]]
  .map(([n]) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
const countries = { IE: "Ireland", GB: "United Kingdom", US: "United States of America", IT: "Italy", HR: "Croatia", AU: "Australia", DE: "Germany", AT: "Austria", SI: "Slovenia", AR: "Argentina", ES: "Spain", CA: "Canada", UY: "Uruguay", PL: "Poland" };
const read = (t) => F.parseStory(t, { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries });
const stops = (p) => (p.stops || []).map((s) => s.row.n);
const allStops = (p) => stops(p).concat((p.kin || []).flatMap((x) => x.stops.map((s) => s.row.n)));
const names = (list) => (list || []).map((x) => x.name);
const years = (p) => JSON.stringify([p.stops, p.kin, p.born, p.left]).match(/\b1[89]\d\d\b/g) || [];

test("a surname that is also a town stays a surname", () => {
  for (const [t, n, town] of [["Johan Berlin was born in Hamburg in 1870.", "Johan Berlin", "Berlin"], ["My mum was Peg Murphy and she was born in Cork.", "Peg Murphy", "Murphy"]]) {
    const p = read(t); assert.equal(p.name, n, t); assert.ok(!allStops(p).includes(town), t);
  }
});
test("surnames with particles are kept whole", () => {
  assert.equal(read("My dad Jan van der Berg was born in Hamburg.").name, "Jan van der Berg");
  assert.equal(read("Maria de la Cruz came from Boston.").name, "Maria de la Cruz");
  assert.equal(read("Giovanni Di Marco was born in Naples.").name, "Giovanni Di Marco");
  const p = read("My nan Mary O'Connor sailed from Cobh to Boston."); assert.equal(p.name, "Mary O'Connor"); assert.ok(!allStops(p).includes("Connor"));
});
test("listed children are each told, and a count is reconciled", () => {
  const p = read("My grandfather Antonio Rossi was born in 1921 in Fiume. He married Maria Bianchi in 1946 and they had four children: Giovanni, Luisa, Paolo and my mother Anna. They left for Adelaide in 1952.");
  assert.deepEqual((p.others || []).filter((o) => o.kin === "child").map((o) => o.name), ["Giovanni", "Luisa", "Paolo"]);
  const g = p.people.find((x) => x.role === "grandfather"); assert.equal(g.name, "Antonio Rossi"); assert.ok(g.events.some((e) => e.year === 1946));
  assert.ok((p.kin || []).some((x) => x.stops.some((s) => s.year === 1952 && s.row.n === "Adelaide")));
  const q = read("He had five children: Tom, Peg and Mary."); assert.equal(q.others.filter((o) => o.kin === "child").length, 5); assert.equal(q.others.filter((o) => o.name === "").length, 2);
  const s = read("He had a brother who stayed behind and three sisters.").siblings; assert.deepEqual([s.length, s.filter((x) => x.rel === "sister").length, s.every((x) => !x.name)], [4, 3, true]);
});
test("no year the words do not hold", () => {
  const p = read("My mum's side is from Slovenia. Her mother, Marija Kos, was born in Idrija in 1930 and her father Jože Kos was a miner.");
  assert.deepEqual(years(p).filter((y) => y !== "1930"), []);
  const mum = p.people.find((x) => x.role === "mother"); assert.equal(mum.name, "Marija Kos"); assert.notEqual(p.name, "Marija Kos", "her mother is not the person the story is about");
});
test("a step-father is his own person, beside the parent", () => {
  const p = read("My dad's stepfather Franz Huber came from Graz. Dad's real father died in the war in 1944. Dad's mum Anna remarried in 1947 and they moved to Vienna.");
  assert.notEqual((p.people.find((x) => x.role === "father") || {}).name, "Franz Huber");
  assert.ok(p.people.some((x) => x.role === "inlaw" && x.name === "Franz Huber"));
  assert.ok(p.kin.some((x) => x.label === "your dad's stepfather" && x.stops[0].row.n === "Graz"));
  assert.equal(read("My dad's stepfather came from Graz. My dad was born in Vienna.").rel, "father");
  assert.equal(read("My dad's stepfather Franz Huber came from Graz.").rel, "step-grandfather");
});
test("what is told of a brother stays with the brother", () => {
  const p = read("My grandfather Giovanni was born in Trieste in 1915. His brother Mario went to Boston.");
  assert.deepEqual(stops(p), ["Trieste"]); assert.ok(p.kin.some((x) => x.label === "his brother" && x.stops[0].row.n === "Boston"));
  const q = read("My great aunt Katarina Horvat was a nun in Zagreb. Her brother, Father Josip Horvat, was a priest in Senj.");
  assert.equal(q.name, "Katarina Horvat"); assert.deepEqual(stops(q), ["Zagreb"]);
});
test("near X called Y is Y near X, and an aside about who ruled is no stop", () => {
  const p = read("My nonna Giuseppina was born in a small village near Udine called Ovaro in 1899."); assert.deepEqual(stops(p), ["Ovaro"]);
  assert.deepEqual(stops(read("My grandmother was born in Pula in 1928 when it was Italy, grew up in Zadar, then went to Chicago in 1956.")), ["Pula", "Zadar", "Chicago"]);
});
test("a name several places share is the usual one unless the story says otherwise", () => {
  assert.match(stops(read("My great grandfather came from Galicia to Boston."))[0], /central Europe/);
  assert.equal(read("Our family left Galicia in Spain for Boston.").stops[0].row.cc, "ES");
  assert.equal(read("She came from Bavaria to Boston.").stops[0].row.cc, "DE");
  assert.equal(read("He was born in Glasgow and moved to Halifax, Canada.").stops[0].row.cc, "GB");
  assert.equal(read("He left New Glasgow, Nova Scotia.").stops[0].row.cc, "CA");
  assert.equal(read("Nonno sailed to Montevideo.").stops[0].row.cc, "UY");
  assert.equal(read("He worked in the copper mines at Butte, Montana.").stops[0].row.x, -112.53);
});
test("a hyphenated name is kept as written", () => {
  assert.equal(read("My great grandmother Mary-Jane Kelly was born in Cork.").name, "Mary-Jane Kelly");
});
test("born near X in a village called Y is born in Y, near X", () => {
  for (const t of ["My grandmother Anna was born near Udine in a village called Ovaro.", "My grandmother Anna was born in the village of Ovaro near Udine.", "My grandmother Anna was born near Udine, in the village of Ovaro."]) {
    const p = read(t); assert.deepEqual(stops(p), ["Ovaro"], t); assert.equal(p.people[0].place.row.n, "Ovaro", t);
  }
});
test("a husband or wife keeps the whole surname and stands in one box", () => {
  for (const t of ["My grandmother Anna was born in Ovaro. She married Giovanni de la Cruz and they had three daughters.",
    "My grandmother Anna was born in Ovaro. She married a man called Giovanni de la Cruz.", "My grandmother Anna was born in Ovaro. Her husband was Giovanni de la Cruz.",
    "My grandmother Anna was born in Ovaro. She wed a man named Giovanni de la Cruz."]) {
    const p = read(t), sp = p.people.filter((x) => x.role === "spouse"); assert.deepEqual(names(sp), ["Giovanni de la Cruz"], t);
    assert.ok(!(p.others || []).some((o) => o.kin === "spouse"), t); assert.ok(!allStops(p).includes("Cruz"), t);
  }
});
test("children counted and not named stand there unnamed, as sons or daughters where said", () => {
  const kids = (t) => (read(t).others || []).map((o) => o.kin + ":" + o.name);
  assert.deepEqual(kids("My grandmother Anna was born in Ovaro. She married Giovanni de la Cruz and they had three daughters."), ["daughter:", "daughter:", "daughter:"]);
  assert.deepEqual(kids("My grandmother Anna was born in Ovaro and had 2 sons."), ["son:", "son:"]);
  assert.deepEqual(kids("My great grandmother Anna had four daughters: Maria and Luisa."), ["daughter:Maria", "daughter:Luisa", "daughter:", "daughter:"]);
  assert.deepEqual(kids("My grandfather Ivan was born in Senj. His brother had five children."), []);
});
test("one of N: the others are brothers and sisters of that person, beside them", () => {
  const p = read("My dad's stepfather Franz Huber came from Bavaria to Chicago in 1952. My mum was Peg Murphy, one of four children: Tom, Peg, Mary and Paddy, born near Cork.");
  const sib = p.people.filter((x) => x.role === "psib");
  assert.deepEqual(names(sib), ["Tom", "Mary", "Paddy"]); assert.ok(sib.every((x) => x.side === "mother" && x.label === "your mother's brother or sister"));
  assert.ok(!(p.others || []).some((o) => o.kin === "child"));
  const step = p.people.find((x) => x.role === "inlaw"); assert.deepEqual([step.name, step.up, step.side], ["Franz Huber", true, "father"]);
  const q = read("My grandmother was Anna de Luca. She was one of 6, with brothers Mario and Pietro.");
  assert.deepEqual(q.siblings.map((x) => x.rel + ":" + x.name), ["brother:Mario", "brother:Pietro", "sibling:", "sibling:", "sibling:"]);
  const r = read("My grandfather was one of 8 children."); assert.equal(r.siblings.length, 7); assert.ok(!r.people[0].counts, "not a count of his own children");
  const s = read("My dad is from Cork. My mum was one of five daughters."); assert.equal(s.people.filter((x) => x.role === "psib" && x.kin === "sister").length, 4);
  assert.notEqual(s.people.find((x) => x.role === "mother").name, "One");
  assert.ok(read("My grandmother Mary was born in Cork. Her mother was one of three.").others.every((o) => o.poss === "her mother's"));
});
test("the page keeps what the tree needs to place a person: the born word, the near place, and a step-parent's row", () => {
  const js = src("story-engine.js");
  for (const k of ["placeRole:", "placeNear:", "side: pe.side", "up: !!pe.up"]) assert.ok(js.includes(k), k);
});
