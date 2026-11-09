/* STORIES OF EVERY SHAPE. David asked for the story reader to be tried on made-up stories: odd ones, ones with gaps, with and without dates,
   trades, names, places. Each story below is one that went wrong, or one that must stay right; the fixture holds the places a story would
   name AND the look-alikes that once came back instead (Young County for "died young", Miner County for "a coal miner", South March for a
   month, Three Rivers for "three boys", Lincoln for a man called Abraham). The same stories were also run against the real gazetteer; the
   ones that still fail there are listed in docs/story-reading-gaps-2026-11-09.md, not hidden. */
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
  P("Cork", "IE", -8.47, 51.9), P("Dublin", "IE", -6.26, 53.35, { c: 30 }), P("Dublin", "CA", -80.4, 43.6, { c: 0 }), P("Galway", "IE", -9.05, 53.27),
  P("Boston", "US", -71.06, 42.36, { c: 40 }), P("South Boston", "US", -71.04, 42.33, { c: 0 }), P("New York", "US", -74, 40.71, { c: 50 }), P("Brooklyn", "US", -73.95, 40.65),
  P("Chicago", "US", -87.6, 41.88), P("Pennsylvania", "US", -77.2, 40.9, { c: 0 }), P("Springfield", "US", -89.65, 39.8), P("Leeds", "GB", -1.55, 53.8), P("Hull", "GB", -0.34, 53.74),
  P("Liverpool", "GB", -2.99, 53.4), P("Dundee", "GB", -2.97, 56.46), P("Naples", "IT", 14.27, 40.85), P("Florence", "IT", 11.25, 43.77), P("Siena", "IT", 11.33, 43.32),
  P("Udine", "IT", 13.23, 46.06), P("Trieste", "IT", 13.77, 45.65), P("Verona", "IT", 10.99, 45.44), P("Zagreb", "HR", 15.98, 45.81), P("Senj", "HR", 14.9, 45), P("Karlovac", "HR", 15.55, 45.49),
  P("Riga", "LV", 24.1, 56.95), P("Berlin", "DE", 13.4, 52.52), P("Brisbane", "AU", 153.02, -27.47), P("Perth", "AU", 115.86, -31.95), P("Sydney", "AU", 151.2, -33.87),
  P("Buenos Aires", "AR", -58.38, -34.6), P("Johannesburg", "ZA", 28.04, -26.2), P("Harare", "ZW", 31.05, -17.83),
  /* the look-alikes */
  P("Young County", "US", -98.7, 33.2, { c: 0, v: 50 }), P("Miner County", "US", -97.6, 44, { c: 0, v: 50 }), P("Miller County", "US", -92.4, 38.2, { c: 0, v: 50 }), P("Mill", "NL", 5.8, 51.7, { c: 0 }),
  P("Fall River County", "US", -103.5, 43.2, { c: 0 }), P("Three Rivers", "US", -85.6, 41.9, { c: 0 }), P("South March", "CA", -75.9, 45.3, { c: 0 }), P("Small Isles", "GB", -6.3, 56.9, { c: 0 }),
  P("Lincoln", "US", -96.7, 40.8, { c: 0 }), P("Washington", "US", -77, 38.9, { c: 0 }), P("South Jordan", "US", -111.9, 40.5, { c: 0 }), P("Roden", "NL", 6.4, 53.1, { c: 0 }), P("Richmond County", "US", -77, 38, { c: 0 }),
  P("Ellis County", "US", -96.8, 32.4, { c: 0 }), P("Augusta", "US", -69.8, 44.3, { c: 0 }),
];
const given = [["Marco"], ["Lucia"], ["Ivan"], ["Anton"], ["Giovanni"], ["Maria"], ["Florence"], ["Victoria"], ["Sydney"], ["Charlotte"], ["Johan"], ["Abraham"], ["George"], ["Anna"], ["Cheryl"]]
  .map(([n]) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
const countries = { IE: "Ireland", GB: "United Kingdom", US: "United States of America", IT: "Italy", HR: "Croatia", AU: "Australia", ZA: "South Africa", DE: "Germany", LV: "Latvia", AR: "Argentina", ZW: "Zimbabwe" };
const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries };

const places = (p) => {
  if (p.stops && p.stops.length) return p.stops.map((s) => s.row.n);
  const o = [];
  (p.kin || []).forEach((kk) => kk.stops.forEach((x) => o.push(x.row.n)));
  (p.people || []).forEach((pe) => (pe.events || []).forEach((e) => { if (e.place && o.indexOf(e.place.row.n) < 0) o.push(e.place.row.n); }));
  return o;
};
const years = (p) => (p.stops || []).map((s) => s.year);

/* [text, places in order]: the look-alikes must NOT appear */
const PLACES = [
  ["My grandfather was born in Cork in 1900 and moved to Boston in 1923.", ["Cork", "Boston"]],
  ["My grandmother came from Naples and ended up in New York.", ["Naples", "New York"]],
  ["My great grandfather was called Anton Kovac and he died young.", []],
  ["I know nothing about my family.", []],
  ["", []],
  ["1923", []],
  ["My grandfather was a stonemason from Cork who moved to Boston in 1923.", ["Cork", "Boston"]],
  ["He worked as a coal miner in Pennsylvania.", ["Pennsylvania"]],
  ["My great-grandmother was a seamstress in Trieste.", ["Trieste"]],
  ["My grandfather had seven children, three boys and four girls.", []],
  ["My grandfather was a miller in a mill near the river on a hill by the church.", []],
  ["He was born in March and married in June, then went to Augusta.", ["Augusta"]],
  ["Born 12 March 1930 in Leeds.", ["Leeds"]],
  ["My grandfather Johan Berlin came from Riga.", ["Riga"]],
  ["Abraham Lincoln was my grandfather's friend in Springfield.", ["Springfield"]],
  ["My father George Washington Smith was born in Richmond County.", ["Richmond County"]],
  ["My grandmother Florence was born in Leeds in 1910.", ["Leeds"]],
  ["My mother Charlotte grew up in Dundee.", ["Dundee"]],
  ["My grandfather was not born in Cork, he was born in Galway.", ["Galway"]],
  ["He never went to Boston but his brother did.", []],
  ["Cork, Dublin, Liverpool, Boston.", ["Cork", "Dublin", "Liverpool", "Boston"]],
  ["He lived in Cork, Dublin, Liverpool and Boston.", ["Cork", "Dublin", "Liverpool", "Boston"]],
  ["He died in Boston. He had been born in Cork.", ["Cork", "Boston"]],
  ["MY GRANDFATHER CAME FROM UDINE TO BRISBANE IN 1950", ["Udine", "Brisbane"]],
  ["my grandfather came from udine to brisbane in 1950", ["Udine", "Brisbane"]],
  ["grandad born cork 1900 left 1923 boston never came back", ["Cork", "Boston"]],
  ["Mio nonno nacque a Udine nel 1900 e si trasferì a Buenos Aires nel 1925.", ["Udine", "Buenos Aires"]],
  ["Moj djed je rođen u Senj 1880. godine.", ["Senj"]],
  ["<script>alert(1)</script> My grandfather lived in <b>Cork</b>.", ["Cork"]],
  ["See https://www.example.com/cork for my grandfather from Perth.", ["Perth"]],
  ["\"My dad always said we came from Galway,\" she said, \"and then Boston.\"", ["Galway", "Boston"]],
  ["My father was from Cork. My mother was from Naples.", ["Cork", "Naples"]],
  ["My father Marco was born in Florence in 1930. My mother Lucia was born in Siena in 1934. They married in 1955.", ["Florence", "Siena"]],
  ["My grandfather was born in Cork. My grandfather died in Boston.", ["Cork", "Boston"]],
  ["My grandfather lived in Cork. ".repeat(60), ["Cork"]],
];
PLACES.forEach(([text, want], i) => {
  test("story " + (i + 1) + ": " + (text.slice(0, 60).replace(/\n/g, " ") || "(empty)") + "  →  " + JSON.stringify(want), () => {
    const got = places(F.parseStory(text, ctx));
    const uniq = got.filter((n, j) => got.indexOf(n) === j);
    assert.deepEqual(uniq, want);
  });
});

test("years beside places, written as '45 or with c., are theirs", () => {
  assert.deepEqual(years(F.parseStory("He left Dublin in '45 for Liverpool.", ctx)), [1945, null]);
  assert.deepEqual(years(F.parseStory("Born 3/4/1951 in Leeds and died 2/2/2010 in Hull.", ctx)), [1951, 2010]);
  assert.deepEqual(years(F.parseStory("Lived in Leeds 1930-1950 and then Hull 1950-1970.", ctx)).slice(0, 2), [1930, 1950]);
});

test("a trade the story gives is kept as told, and is never a place", () => {
  assert.deepEqual(F.parseStory("My grandfather was a stonemason from Cork.", ctx).occupations, ["stonemason"]);
  assert.deepEqual(F.parseStory("Giovanni Bianchi, farmer, born Udine 1890.", ctx).occupations, ["farmer"]);
  assert.deepEqual(F.parseStory("My grandfather came from Cork.", ctx).occupations, []);
});

test("a name given after married is the wife, and the person the story is about is still there", () => {
  const p = F.parseStory("He married Anna Horvat in Karlovac in 1925.", ctx);
  const sp = p.people.find((x) => x.role === "spouse");
  assert.equal(sp.name, "Anna Horvat");
  assert.ok(p.people.some((x) => x.role === "self" && x.unnamed));
  assert.deepEqual(places(p), ["Karlovac"]);
});

test("my father Marco / my mother Lucia are named, and 'was from' is not a name", () => {
  const a = F.parseStory("My father Marco was born in Florence in 1930. My mother Lucia was born in Siena in 1934.", ctx);
  assert.equal(a.name, "Marco");
  assert.equal(a.people.find((x) => x.role === "spouse").name, "Lucia");
  const b = F.parseStory("My father was from Cork. My mother was from Naples.", ctx);
  assert.ok(!b.people.some((x) => /from/i.test(x.name)), "nobody is called From");
  assert.equal(b.people.filter((x) => x.role === "father" || x.role === "mother").length, 2);
});

test("a long story is read in a moment, not seconds", () => {
  const t = "My grandfather Giovanni was born in Udine in 1890. He worked as a farmer. In 1912 he emigrated to Buenos Aires with his wife Maria. ".repeat(150);
  const t0 = Date.now(); F.parseStory(t, ctx);
  assert.ok(Date.now() - t0 < 1500, "took " + (Date.now() - t0) + " ms");
});

/* ---- the person, as told: looks, loves, character, marriages, hard times, weather, and how they died, kept in the story's words ---- */
const life = (t) => F.parseStory(t, ctx).life;
const groupOf = (lf, k) => (lf.groups.find((g) => g.key === k) || { items: [] }).items;

test("the grandfather from Senj who loved ice cream: every kind of detail is kept, as told, under its own heading", () => {
  const lf = life("My grandfather from Senj loved ice cream and had dark hair and was always a world class runner that loved his family but got married twice, and the second wife divorced him and took his money and he got angry and went to jail. One day he met his third wife in a huge snow storm after she slipped and it was love at first sight.");
  assert.deepEqual(groupOf(lf, "looks"), ["Had dark hair"]);
  assert.deepEqual(groupOf(lf, "loves"), ["Loved ice cream", "Loved his family"]);
  assert.ok(groupOf(lf, "character").some((x) => /world class runner/.test(x)));
  assert.ok(groupOf(lf, "character").some((x) => /angry/.test(x)));
  assert.ok(groupOf(lf, "romance").some((x) => /second wife divorced him/.test(x)));
  assert.ok(groupOf(lf, "romance").some((x) => /love at first sight/.test(x)));
  assert.ok(groupOf(lf, "hard").some((x) => /jail/i.test(x)) && groupOf(lf, "hard").some((x) => /took his money/i.test(x)));
  assert.ok(groupOf(lf, "world").some((x) => /snow storm/.test(x)));
  assert.equal(lf.married, 3, "married twice, then a third wife");
});

test("how they died: the cause, the year and the age are read as told, and a death is never invented", () => {
  const cases = [
    ["My grandfather died of tuberculosis in Trieste in 1921.", "tuberculosis", 1921, null],
    ["My grandmother died in childbirth in Senj in 1932, aged 29.", "childbirth", 1932, 29],
    ["She died from the Spanish flu in Brisbane in 1919.", "spanish flu", 1919, null],
    ["He died of a heart attack in Perth in 1975, aged 62.", "heart attack", 1975, 62],
    ["He was killed in the war at Tobruk in 1942.", "killed in the war", 1942, null],
    ["My father was murdered in Johannesburg in 1988.", "murdered", 1988, null],
    ["Grandad died in 1950 after a long illness.", "a long illness", 1950, null],
  ];
  cases.forEach(([t, cause, year, age]) => {
    const d = life(t).died;
    assert.ok(d, t);
    assert.equal(d.cause, cause, t); assert.equal(d.year, year, t); assert.equal(d.age, age, t);
  });
  assert.equal(life("My grandfather was born in Cork in 1900 and moved to Boston in 1923.").died, null);
  assert.equal(life("").n, 0);
});

test("a person called From or Murdered is never made of 'my father was from Cork' or 'my father was murdered'", () => {
  const p = F.parseStory("My father was murdered in Johannesburg in 1988.", ctx);
  assert.ok(!p.people.some((x) => /murdered/i.test(x.name)));
});

test("words that only look like details are not details: a street called Warwick, a name called Firestone", () => {
  assert.deepEqual(life("My grandfather lived on Warwick Street and worked in a campsite near Boston.").groups.filter((g) => g.key === "hard"), []);
  assert.deepEqual(life("Their family name was Firestone and he came from Saint Paul.").groups.filter((g) => g.key === "world"), []);
});

/* ---- the gaps that were fixed on 9 Nov (docs/story-reading-gaps-2026-11-09.md) ---- */
test("a near miss is offered, never used: Brisban, Melborne in a list, Senju", () => {
  const p = F.parseStory("My grandfather came from Brisban and Melborne.", { ...ctx, map: A.buildMap(rows.concat([P("Melbourne", "AU", 144.96, -37.81)])) });
  assert.deepEqual(places(p), []);
  assert.deepEqual(p.suggest.map((x) => x.typed), ["Brisban", "Melborne"]);
  assert.deepEqual(p.suggest[0].options.map((o) => o.n), ["Brisbane"]);
  assert.deepEqual(F.parseStory("Moj djed je rođen u Senju 1880.", ctx).suggest.map((x) => x.typed), ["Senju"]);
  assert.deepEqual(F.parseStory("He came from Cork.", ctx).suggest, []);
});

test("a word that sits inside the names of several places is not a place (Friuli)", () => {
  const map = A.buildMap(rows.concat([P("Pozzuolo del Friuli", "IT", 13.2, 45.97, { c: 0, q: "Friuli Venezia" }), P("Cividale del Friuli", "IT", 13.43, 46.09, { c: 0, q: "Friuli Venezia" })]));
  const p = F.parseStory("My family are from Friuli, in the north of Italy.", { ...ctx, map });
  assert.ok(!places(p).some((n) => /friuli/i.test(n)));
  assert.equal(p.suggest[0].kind, "partial");
});

test("a town the Atlas holds only in other countries is found through the gazetteer when the story names its state (Dublin, Ohio)", () => {
  const map = A.buildMap(rows.concat([P("Ohio", "US", -82.9, 40.4, { c: 0 })]));
  const want = F.gazWants("They settled in Dublin, Ohio.", map, ctx.given);
  assert.deepEqual(want, [{ ph: "dublin", ccs: ["US"] }]);
  assert.equal(F.gazMerge(map, want[0], [["Dublin", 40.1, -83.1, "US", []], ["Dublin", 53.3, -6.2, "IE", []]]), 1);
  const p = F.parseStory("They settled in Dublin, Ohio.", { ...ctx, map });
  assert.equal(p.stops[0].row.cc, "US");
  assert.deepEqual(F.gazWants("They settled in Cork.", map, ctx.given), []);
});

test("'he' goes to the person it can be: what a mother tells is about the man, and a mother is never 'he'", () => {
  const p = F.parseStory("I never met my grandfather. My mother told me he was born near Naples in 1898 and left for New York in 1921. After the war he moved to Brooklyn. He died in 1974.", ctx);
  const mo = p.people.find((x) => x.role === "mother");
  assert.deepEqual((mo.events || []).filter((e) => e.place), []);
  assert.deepEqual(places(p), ["Naples", "New York", "Brooklyn"]);
});

test("the spouse's name, three marriages, per-person trades and counts", () => {
  const p = F.parseStory("My grandfather from Senj got married twice and then a third time, and his third wife was Anna.", ctx);
  assert.ok(p.people.some((x) => /anna/i.test(x.name)));
  const q = F.parseStory("My dad was a fisherman in Cork and my mum was a nurse in Boston.", ctx);
  assert.deepEqual(q.people.filter((x) => x.occupation).map((x) => x.role + ":" + x.occupation).sort(), ["father:fisherman", "mother:nurse"]);
});

test("a place told twice is two stops, and a story told backwards keeps its order of telling", () => {
  assert.deepEqual(places(F.parseStory("He lived in Cork, left for Boston, and returned to Cork.", ctx)), ["Cork", "Boston", "Cork"]);
  assert.deepEqual(places(F.parseStory("He ended up in Perth. Before that he lived in Cork.", ctx)), ["Cork", "Perth"]);
});

test("a place is found by a name it was filed under (Fiume, Pola), the one with records first; a name that is only a word is left out", () => {
  const base = rows.concat([P("Fiume", "IT", 12.7, 45.9, { c: 0 }), P("Rijeka", "HR", 14.44, 45.33, { c: 69, i: "rijeka" }), P("Pola", "PH", 121.5, 14.2, { c: 0 }), P("Pula", "HR", 13.85, 44.87, { c: 40, i: "pula" })]);
  const map = A.buildMap(base);
  const n = F.aliasMerge(map, base, { fiume: ["rijeka"], pola: ["pula"], young: ["pula"], mill: ["pula"], missing: ["no-such-id"] }, ctx.given);
  assert.ok(n >= 2);
  const c = { ...ctx, map };
  assert.deepEqual(places(F.parseStory("My grandfather was born in Fiume in 1910 and his wife in Pola.", c)), ["Rijeka", "Pula"]);
  assert.equal(map.young, undefined);
  assert.equal(map.missing, undefined);
});

test("a country that no longer exists chooses among places of one name, and is no stop (Salisbury, Rhodesia)", () => {
  const base = rows.concat([P("Salisbury", "US", -80.5, 35.7, { c: 20 }), P("Harare", "ZW", 31.05, -17.83, { c: 0, i: "harare-zw" })]);
  const map = A.buildMap(base); F.aliasMerge(map, base, { salisbury: ["harare-zw"] }, ctx.given);
  const p = F.parseStory("He lived in Salisbury, Rhodesia until 1975.", { ...ctx, map, countries: { ...countries } });
  assert.deepEqual(places(p), ["Harare"]);
});

test("texting shorthand: 'frm', 'moved 2' and NYC read as from, to and New York", () => {
  assert.deepEqual(places(F.parseStory("gran frm leeds, moved 2 hull in 1950", ctx)), ["Leeds", "Hull"]);
  assert.deepEqual(places(F.parseStory("my grandad was born in Cork, emigrated to NYC 1912", ctx)), ["Cork", "New York"]);
});

test("a name that is also a given name, last in a plain list of places, is a place", () => {
  assert.deepEqual(places(F.parseStory("Places: Cork, Galway, Dublin, Sydney", ctx)), ["Cork", "Galway", "Dublin", "Sydney"]);
});

test("a wife who is from somewhere else keeps her own place, on her own card", () => {
  const p = F.parseStory("My mother Maria was born in Cork. She married Joe in Dublin. He was from Leeds.", ctx);
  const joe = (p.kin || []).filter((k) => k.key === "S")[0];
  assert.ok(joe && joe.stops.some((s) => s.row.n === "Leeds"), "Leeds is on the husband's card");
});
