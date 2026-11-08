/* Tell us who you're looking for: the pure half of the page (public/js/looking-for.js). It must only ever name what the data holds,
   and must say so when the data holds nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();

const rows = [
  { i: "gracisce", n: "Gračišće", cc: "HR", c: 32, q: "gallignana" },
  { i: "gracac", n: "Gračac", cc: "HR", c: 3 },
  { i: "hamilton-oh", n: "Hamilton", cc: "US", c: 0, v: 5 },
  { i: "hamilton-ca", n: "Hamilton", cc: "CA", c: 0, v: 9 },
  { i: "pazin", n: "Pazin", cc: "HR", c: 40, q: "mitterburg" },
];

test("a year is four digits in range, else nothing", () => {
  assert.equal(F.toYear("1905"), 1905);
  assert.equal(F.toYear(" 1905 "), 1905);
  assert.equal(F.toYear("05"), null);
  assert.equal(F.toYear("1066"), null);
  assert.equal(F.toYear("2099"), null);
  assert.equal(F.toYear(""), null);
});

test("places are offered by name, by older name and by a word, the most held first", () => {
  assert.deepEqual(F.suggest(rows, "gra", 8).map((s) => s.r.i), ["gracisce", "gracac"]);
  const old = F.suggest(rows, "Gallignana", 8);
  assert.equal(old[0].r.i, "gracisce");
  assert.equal(old[0].via, "gallignana", "an older name says it matched on that name");
  assert.deepEqual(F.suggest(rows, "hamilton", 8).map((s) => s.r.i), ["hamilton-ca", "hamilton-oh"], "ties are broken by volumes held");
  assert.deepEqual(F.suggest(rows, "g", 8), [], "one letter offers nothing");
  assert.equal(F.suggest(rows, "gra", 1).length, 1);
});

test("the window of years is exact when the birth year is known and a flagged guess when it is not", () => {
  const known = F.windows(1905, 1880);
  assert.equal(known.guessed, false);
  assert.deepEqual(known.birth, [1879, 1881]);
  const guess = F.windows(1905, null);
  assert.equal(guess.guessed, true);
  assert.deepEqual(guess.birth, [1860, 1890]);
  assert.equal(F.windows(null, null), null);
  assert.ok(F.windows(2020, null).marriage[1] <= 2026, "never into the future");
});

test("volumes are chosen by kind and overlap, in date order", () => {
  const cols = [
    { title: "Births 1850-1880", kinds: ["b"], from: 1850, to: 1880 },
    { title: "Births 1700-1800", kinds: ["b"], from: 1700, to: 1800 },
    { title: "Marriages 1850-1900", kinds: ["m"], from: 1850, to: 1900 },
    { title: "Births 1881-1900", kinds: ["b"], from: 1881, to: 1900 },
  ];
  assert.deepEqual(F.volumesFor(cols, "b", [1860, 1890]).map((c) => c.title), ["Births 1850-1880", "Births 1881-1900"]);
  assert.deepEqual(F.volumesFor(cols, "m", null).map((c) => c.title), ["Marriages 1850-1900"]);
  assert.deepEqual(F.volumesFor(cols, "d", [1860, 1890]), []);
});

test("a volume's years are not repeated when the title already has them", () => {
  assert.equal(F.volLabel({ title: "Births 1841-1899", from: 1841, to: 1899 }), "Births 1841-1899");
  assert.equal(F.volLabel({ title: "Births (Rođeni)", from: 1841, to: 1899 }), "Births (Rođeni) (1841–1899)");
});

const eras = [
  { from: 1815, to: 1918, regime: "habsburg", polity: "Austria–Hungary — Küstenland", filedUnder: ["dapa", "anno"], note: "Parish registers to Pazin." },
  { from: 1918, to: 1943, regime: "italy", polity: "Italy — Provincia dell'Istria", filedUnder: ["familysearch"], note: "THE TRAP." },
];
const regimes = { habsburg: { label: "Habsburg" }, italy: { label: "Italy" } };

test("who held the ground: the era of the year, or an honest 'no table'", () => {
  const info = { name: "Gračišće", countryName: "Croatia", eras, regimes };
  assert.equal(F.captionAt(info, 1905).polity, "Austria–Hungary — Küstenland");
  assert.equal(F.captionAt(info, 1905).regime, "Habsburg");
  assert.deepEqual(F.captionAt(info, 1930).filedUnder, ["familysearch"]);
  assert.deepEqual(F.captionAt({ ...info, pname: { dapa: "State Archives in Pazin" } }, 1905).filedUnder, ["State Archives in Pazin", "anno"], "a source id is shown by its name when the catalogue has one");
  assert.equal(F.captionAt(info, 1918).polity, "Italy — Provincia dell'Istria", "an era ends where the next begins");
  const none = F.captionAt({ name: "Hamilton", countryName: "United States", eras: null, regimes: null }, 1905);
  assert.equal(none.tracked, false);
  assert.equal(none.polity, "United States");
  assert.match(none.note, /no era table/);
  assert.equal(F.captionAt(info, 1700).tracked, false, "before the table begins is not guessed");
});

test("the traveller waits, crosses over two years, then stays", () => {
  assert.equal(F.progress(1905, 1890), 0);
  assert.equal(F.progress(1905, 1904), 0);
  assert.equal(F.progress(1905, 1905), 0.5);
  assert.equal(F.progress(1905, 1906), 1);
  assert.equal(F.progress(1905, 1930), 1);
  assert.equal(F.progress(null, 1930), 0);
  assert.deepEqual(F.between([0, 0], [10, 20], 0.5), [5, 10]);
});

const given = [{ canon: "Giovanni", id: "giovanni", langs: { latin: [{ form: "Joannes", status: "rule" }, { form: "Zorzi", status: "lead" }], italian: [{ form: "Giovanni", status: "same" }, { form: "Zuane", status: "attested" }] } }];

test("only forms with positive evidence are offered as spellings", () => {
  assert.deepEqual(F.givenForms(given[0]), ["Giovanni", "Joannes", "Zuane"]);
});

const from = {
  name: "Gračišće", countryName: "Croatia", older: ["Gallignana"], eras, regimes, href: "/place/gracisce/",
  cols: [{ title: "Births 1850-1880", kinds: ["b"], from: 1850, to: 1880, held: "ŽU Gračišće", access: "onsite" }, { title: "Marriages 1860-1900", kinds: ["m"], from: 1860, to: 1900 }],
};

test("the plan is ordered, numbered, and every item with a link is from the data", () => {
  const plan = F.buildPlan({ holds: "photo", name: "Ivan Kosina", left: 1905, born: null, from, to: { name: "Hamilton", countryName: "United States", eras: null, regimes: null, lat: 0, lon: 0 },
    providers: [{ id: "x", name: "Z Archive", kind: "national-archive", access: "free", url: "https://z.example/" }, { id: "y", name: "A Index", kind: "index", access: "account", url: "https://a.example/" }],
    given: A.givenIn("Ivan", A.buildGiven([{ canon: "Ivan", id: "ivan", langs: { croatian: [{ form: "Ivan", status: "same" }, { form: "Joannes", status: "rule" }] } }]), null), base: "/" });
  assert.deepEqual(plan.map((s) => s.id), ["hold", "name", "place", "births", "family", "arrival", "neighbours", "keep"]);
  assert.deepEqual(plan.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  const births = plan.find((s) => s.id === "births");
  assert.match(births.items[0].text, /Births 1850-1880/);
  assert.match(births.not, /guess from the year/, "a guessed window is said to be a guess");
  assert.match(plan.find((s) => s.id === "place").items.map((i) => i.text).join(" "), /Gallignana/);
  assert.match(plan.find((s) => s.id === "place").items.map((i) => i.text).join(" "), /Austria–Hungary/);
  const arrival = plan.find((s) => s.id === "arrival").items.filter((i) => i.href).map((i) => i.href);
  assert.deepEqual(arrival, ["https://a.example/", "https://z.example/"], "sources are alphabetical, not by size");
  const external = plan.flatMap((s) => s.items).filter((i) => i.href && /^https?:/.test(i.href)).map((i) => i.href);
  assert.deepEqual(external.sort(), ["https://a.example/", "https://z.example/"], "no external link that the provider catalogue did not supply");
});

test("a gap is reported as a gap in the Atlas, never as 'there are none'", () => {
  const bare = { ...from, cols: [], older: [] };
  const plan = F.buildPlan({ holds: "story", name: "", left: 1905, born: 1880, from: bare, to: null, providers: [], given: [], base: "/" });
  const births = plan.find((s) => s.id === "births");
  assert.match(births.items[0].text, /lists no birth or baptism volume/);
  assert.match(births.items[0].text, /gap in the Atlas/);
  assert.equal(births.not.includes("guess"), false, "a known birth year is not described as a guess");
  assert.match(plan.find((s) => s.id === "arrival").items[0].text, /Choose where/);
});

test("with no origin place the plan asks for one rather than inventing a register", () => {
  const plan = F.buildPlan({ holds: "letter", name: "", left: null, born: null, from: null, to: null, providers: [], given: [], base: "/" });
  assert.deepEqual(plan.map((s) => s.id), ["hold", "name", "place", "arrival", "neighbours", "keep"]);
  assert.equal(plan.some((s) => s.id === "births"), false);
});

test("the page uses textContent only and never parses a place name or a note as markup", () => {
  const js = src("looking-for.js") + src("story-engine.js");
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(js), false);
});

test("nothing typed on the page is stored or sent", () => {
  const js = src("looking-for.js") + src("story-engine.js");
  assert.equal(/localStorage|sessionStorage|indexedDB|XMLHttpRequest|method:\s*["']POST|navigator\.sendBeacon/.test(js), false);
  assert.equal(/fetch\(BASE \+ path\)/.test(js), true, "the only fetches are the site's own files");
});

test("the page is in the sitemap and the menu and is linked from Start here", () => {
  const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
  assert.match(read("src/pages/sitemap-index.xml.js"), /\["looking-for\/"/);
  assert.match(read("src/lib/nav.js"), /"\/looking-for\/"/);
  assert.match(read("src/pages/start.astro"), /\/looking-for\//);
});

/* ---- reading a story from free text ---- */
const prow = [
  { i: "gracisce", n: "Gračišće", cc: "HR", c: 32, q: "gallignana" },
  { i: "hamilton-oh", n: "Hamilton", cc: "US", c: 0, v: 5 },
  { i: "hamilton-ca", n: "Hamilton", cc: "CA", c: 0, v: 9 },
  { i: "ivan-ba", n: "Ivan", cc: "BA", c: 1 },
  { i: "ellis", n: "Ellis Island", cc: "US", c: 2 },
];
const ctx = { map: A.buildMap(prow), given: A.buildGiven([{ canon: "Ivan", id: "ivan", langs: { croatian: [{ form: "Ivan", status: "same" }, { form: "Joannes", status: "rule" }] } }]), skip: {} };

test("a story is read into who, from where, to where, and when", () => {
  const p = F.parseStory("My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905. All I have is this photo.", ctx);
  assert.equal(p.rel, "great-grandfather");
  assert.equal(p.given, "Ivan");
  assert.equal(p.surname, "Kosina");
  assert.equal(p.name, "Ivan Kosina", "the name is as typed, not the catalogue's headline form");
  assert.equal(p.from.row.i, "gracisce");
  assert.equal(p.to.row.i, "hamilton-ca", "the place the Atlas holds more for is offered first");
  assert.deepEqual(p.to.alts.map((r) => r.i), ["hamilton-oh"], "the other Hamilton is kept as an alternative");
  assert.equal(p.left, 1905);
  assert.equal(p.born, null);
  assert.equal(p.holds, "photo");
});

test("a given name is the person, unless a marker word makes it the place", () => {
  const man = F.parseStory("Ivan came from Gallignana to Hamilton in 1905", ctx);
  assert.equal(man.from.row.i, "gracisce");
  assert.equal(man.given, "Ivan");
});

test("born and left years are told apart by their words", () => {
  const p = F.parseStory("Born 1880 in Gallignana, he went to Hamilton in 1905", ctx);
  assert.equal(p.born, 1880);
  assert.equal(p.left, 1905);
  const q = F.parseStory("from Gallignana to Hamilton 1905", ctx);
  assert.equal(q.left, 1905);
  assert.equal(q.born, null);
});

test("a story with one place is read as where they started", () => {
  const p = F.parseStory("my grandmother from Gallignana", ctx);
  assert.equal(p.from.row.i, "gracisce");
  assert.equal(p.to, null);
  assert.equal(p.holds, "story");
  const none = F.parseStory("hello", ctx);
  assert.equal(none.from, null);
});

test("an attached picture sets what they hold even when the words do not say it", () => {
  assert.equal(F.parseStory("from Gallignana", ctx, "photo").holds, "photo");
});

test("starting a family adds a line and marks the volumes and sources of the plan as planned, once", () => {
  const marks = {}, lines = [];
  const P = {
    addLine: (n, w) => { lines.push([n, w]); return "kosina"; },
    get: (id) => marks[id] || null,
    setWhat: (id, w) => { marks[id] = { ...(marks[id] || {}), what: w }; },
    setState: (id, s) => { marks[id] = { ...(marks[id] || {}), state: s }; },
  };
  const facts = { holds: "photo", name: "Ivan Kosina", left: 1905, born: 1880, from, to: { name: "Hamilton", countryName: "United States", eras: null, regimes: null },
    providers: [{ id: "nara", name: "National Archives Catalog", kind: "national-archive", access: "free", url: "https://nara.example/" }], given: [], base: "/" };
  const plan = F.buildPlan(facts);
  const r = F.startFamily(P, facts, plan);
  assert.equal(r.slug, "kosina");
  assert.deepEqual(lines, [["Kosina", "Gračišće"]]);
  assert.ok(r.added >= 2, "at least a volume and a source");
  assert.equal(marks["source:nara"].state, "planned");
  assert.ok(Object.keys(marks).some((k) => k.startsWith("volume:")));
  const again = F.startFamily(P, facts, plan);
  assert.equal(again.added, 0, "marks already set are left as they were");
});

test("a family can be given its own name, or the plan added to a research family that already exists", () => {
  const marks = {}, lines = [], active = [];
  const P = {
    addLine: (n, w) => { lines.push([n, w]); return "chosen"; }, lines: () => [{ slug: "old-one", name: "Old one", where: "" }], setActive: (s) => active.push(s),
    get: (id) => marks[id] || null, setWhat: (id, w) => { marks[id] = { ...(marks[id] || {}), what: w }; }, setState: (id, s) => { marks[id] = { ...(marks[id] || {}), state: s }; },
  };
  const facts = { holds: "story", name: "Ivan Kosina", from, to: null, providers: [], given: [], base: "/" };
  const plan = F.buildPlan(facts);
  assert.equal(F.startFamily(P, facts, plan, { name: "  Kosina of Istria " }).name, "Kosina of Istria");
  assert.deepEqual(lines, [["Kosina of Istria", "Gračišće"]]);
  const r = F.startFamily(P, facts, plan, { line: "old-one" });
  assert.equal(r.slug, "old-one"); assert.equal(r.name, "Old one");
  assert.deepEqual(active, ["old-one"]); assert.equal(lines.length, 1, "no new line was made");
});

test("a family is kept under the surname, or under the place when the story gave none", () => {
  assert.equal(F.familyName({ name: "Ivan Kosina", from }), "Kosina");
  assert.equal(F.familyName({ name: "Ivan", from }), "Gračišće");
  assert.equal(F.familyName({ name: "", from: null }), "Research");
});

test("the home page carries the drawer, the map is handed to it, and the first-visit opening spares automated browsers", () => {
  const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
  assert.match(read("src/pages/index.astro"), /<StoryDrawer \/>/);
  assert.match(read("src/components/RecordMap.astro"), /window\.raHomeMap = map;/);
  const d = src("story-drawer.js");
  assert.match(d, /navigator\.webdriver/);
  assert.equal(/indexedDB|sessionStorage|XMLHttpRequest|method:\s*["']POST|sendBeacon/.test(d), false);
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(d + src("story-guide.js")), false);
});

test("the guided Ask on /read/ keeps the old Ask card and every id its script needs", () => {
  const r = fs.readFileSync(path.join(here, "../src/pages/read.astro"), "utf8");
  ["ask", "ask-drop", "ask-text", "ask-go", "ask-photo", "ask-tray", "ask-where", "ask-read-docs", "ask-read-lines", "ask-clear", "ask-ts", "ask-status", "ask-out", "ask-hand", "ask-sum", "ask-atlas"]
    .forEach((id) => assert.ok(r.includes(`id="${id}"`), `id ${id} is still on the page`));
  ["sg", "sg-stage", "sg-text", "sg-next1", "sg-plan", "sg-fam-btn"].forEach((id) => assert.ok(r.includes(`id="${id}"`), `guide id ${id}`));
  assert.match(r, /story-engine\.js/);
  assert.match(r, /story-guide\.js/);
});

test("the flag in use in a year comes from the country's flag eras, and nothing when there are none", () => {
  const info = { flagRows: [[1868, 1918, "hr--a"], [1918, 1929, "hr--b"]] };
  assert.equal(F.flagFor(info, 1905), "hr--a");
  assert.equal(F.flagFor(info, 1920), "hr--b");
  assert.equal(F.flagFor(info, 1700), null);
  assert.equal(F.flagFor({}, 1905), null);
});

test("a leader is named only where a term covers the year; silence is not 'nobody ruled'", () => {
  const rows = [["A", "Q1", 1990, 1999, "", ""], ["B", "Q2", 1995, 1996, "", ""], ["C", "Q3", 2020, null, "", ""]];
  assert.equal(F.leaderAt(rows, 1995)[0], "B");
  assert.equal(F.leaderAt(rows, 1905), null);
  assert.equal(F.leaderAt(rows, 2026)[0], "C");
  assert.deepEqual(F.leadersBetween(rows, 1994, 1996).map((r) => r[0]), ["A", "B"]);
  assert.deepEqual(F.leadersBetween(null, 1900, 1910), []);
});

test("first-name forms are grouped by language, positive evidence apart from leads", () => {
  const row = { canon: "Giovanni", langs: { italian: [{ form: "Giovanni", status: "same" }, { form: "Nane", status: "lead" }], croatian: [{ form: "Ivan", status: "attested" }], latin: [{ form: "Joannes", status: "rule" }] } };
  const g = F.givenGroups(row, { italian: "Italian", croatian: "Croatian", latin: "Latin" });
  assert.deepEqual(g.map((x) => x.label), ["Croatian", "Italian", "Latin"]);
  assert.deepEqual(g.find((x) => x.lang === "italian").forms, ["Giovanni"]);
  assert.deepEqual(g.find((x) => x.lang === "italian").leads, ["Nane"]);
});

test("a surname block separates the catalogue from computed leads, and invents nothing", () => {
  const fams = [{ id: "lerena", name: "Lerena", forms: [["Lerena", "same"], ["Llerena", "attested"], ["Serena", "lead"]], notSame: [["Herencia", "the Spanish word for inheritance"]] }];
  const b = F.surnameBlock("Llerena", fams, { variants: [{ n: "Lerenna", how: "spelling" }, { n: "Lorena", how: "sounds" }], countries: [{ cc: "UY" }] });
  assert.equal(b.family.headline, "Lerena");
  assert.deepEqual(b.family.by.attested, ["Llerena"]);
  assert.deepEqual(b.family.by.lead, ["Serena"]);
  assert.deepEqual(b.spelling, ["Lerenna"]);
  assert.deepEqual(b.sounds, ["Lorena"]);
  const none = F.surnameBlock("Zzyzx", fams, null);
  assert.equal(none.family, null);
  assert.deepEqual(none.spelling, []);
  assert.equal(F.surnameBlock("L'erena", fams, null).family.headline, "Lerena");
});

test("the three front doors show flags, events and name forms, and every file they read is built", () => {
  const read = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
  const e = src("story-engine.js");
  ["flag-map.json", "leaders.json", "mortality.json", "surname-families.json", "given-names.json"].forEach((f) => assert.ok(e.includes(f), f));
  assert.match(e, /lf-flag/);
  assert.match(e, /namesBlock/);
  assert.match(src("story-drawer.js"), /namesBlock/);
  assert.match(src("story-guide.js"), /namesBlock/);
  assert.match(src("looking-for.js"), /namesBlock/);
  assert.match(read("src/pages/read.astro"), /shard-key\.js/);
  assert.match(read("src/pages/looking-for.astro"), /shard-key\.js/);
  assert.match(read("src/components/StoryDrawer.astro"), /sd-names/);
  assert.match(read("package.json"), /build-surname-families\.py/);
  assert.equal(/innerHTML|insertAdjacentHTML/.test(e), false);
});

test("a long story is read whole: every place in order with its age, the father's place apart, and the people named", () => {
  const rs = [
    { i: "crikvenica", n: "Crikvenica", cc: "HR", c: 5 }, { i: "senj", n: "Senj (Senj)", cc: "HR", c: 10, q: "(senj) segna zengg" },
    { i: "croatia", n: "Croatia", cc: "HR", c: 1 }, { i: "harare", n: "Harare", cc: "ZW", c: 3 }, { i: "south-africa", n: "South Africa", cc: "ZA", c: 1 },
    { i: "brisbane", n: "Brisbane", cc: "AU", c: 4 }, { i: "australia", n: "Australia", cc: "AU", c: 1 }, { i: "born-nl", n: "Born", cc: "NL", c: 0 },
  ];
  const given = A.buildGiven([{ canon: "Giovanni", langs: { croatian: [{ form: "Ivan", status: "same" }] } }, { canon: "Hedwig", langs: { croatian: [{ form: "Hedviga", status: "same" }] } }]);
  const text = "my father ivan defranceski was born in crikvenica to a father from senj, croatia when he was 3 years old he moved to harare, rhodesia and then to south africa, and when he was 45 years old he moved to brisbane australia. his fathers name was ivan and his mother was hedviga blazevic.";
  const p = F.parseStory(text, { map: A.buildMap(rs), given, skip: Object.create(null) });
  assert.deepEqual(p.route.map((s) => [s.row.i, s.role, s.age, s.approx]), [["crikvenica", "born", 0, false], ["harare", "move", 3, false], ["south-africa", "move", 24, true], ["brisbane", "move", 45, false]]);
  assert.deepEqual(p.stops.filter((s) => /-from$/.test(s.role)).map((s) => [s.row.i, s.role]), [["senj", "father-from"]]);
  assert.equal(p.stops.some((s) => s.row.i === "born-nl"), false, "'born' is a word, not the village Born");
  assert.equal(p.name, "Ivan Defranceski");
  const [self, father, mother] = p.people;
  assert.equal(self.role, "self");
  assert.equal(father.name, "Ivan Defranceski"); assert.equal(father.presumed, true);
  assert.equal(mother.name, "Hedviga Blazevic"); assert.equal(mother.presumed, false);
  assert.equal(F.parseStory("ivan was born in crikvenica", { map: A.buildMap(rs), given, skip: Object.create(null) }).route.length, 1);
});

test("a name typed in lower case still gets its surname, and ordinary words never become one", () => {
  const given = A.buildGiven([{ canon: "Giovanni", langs: { croatian: [{ form: "Ivan", status: "same" }] } }]);
  const c = { map: A.buildMap([]), given, skip: Object.create(null) };
  assert.equal(F.parseStory("my grandfather ivan kosina came over", c).surname, "Kosina");
  assert.equal(F.parseStory("my grandfather ivan came over", c).surname, "");
  assert.equal(F.parseStory("my grandfather ivan then moved", c).surname, "");
});

test("the tree draws only the people the story named, and the names panel groups by person", () => {
  const src2 = src("story-engine.js");
  assert.match(src2, /treeBlock/);
  assert.match(src2, /lf-askyear/);
  ["story-guide.js", "story-drawer.js"].forEach((f) => { assert.match(src(f), /treeBlock/); assert.match(src(f), /onBorn/); });
});

test("a role label never prints an object: the gathered given name is {typed, canon, groups}", () => {
  assert.match(src("story-engine.js"), /typeof self\.given === "object" \? self\.given\.typed/);
});

test("the home map keeps only the play bar; the story sits below it in sections", () => {
  const astro = fs.readFileSync(path.join(here, "../src/components/StoryDrawer.astro"), "utf8"), js = src("story-drawer.js");
  for (const k of ["rep-places", "rep-names", "rep-family", "rep-setting", "rep-plan"]) assert.match(astro, new RegExp('id="' + k + '"'));
  assert.doesNotMatch(astro, /sdk-tab/);
  assert.match(js, /J\.stops\(/);
  assert.match(js, /stopItems/);
});

/* ---- a family told in a few sentences: the people, their dated events, and the journeys the ancestors make ---- */
const frow = [
  { i: "senj", n: "Senj", cc: "HR", c: 40 }, { i: "crikvenica", n: "Crikvenica", cc: "HR", c: 20 },
  { i: "harare", n: "Harare", cc: "ZW", c: 0 }, { i: "johannesburg", n: "Johannesburg", cc: "ZA", c: 0 }, { i: "brisbane", n: "Brisbane", cc: "AU", c: 1 },
  { i: "beijing", n: "Beijing", cc: "CN", c: 0 },
  { i: "london", n: "London", cc: "GB", c: 0, q: "londinium" }, { i: "g-new-london-ca", n: "New London", cc: "CA", c: 0, q: "london new" }, { i: "g-london-ca", n: "London", cc: "CA", c: 0 },
];
const fctx = { map: A.buildMap(frow), given: A.buildGiven([
  { canon: "Ivan", id: "ivan", langs: { croatian: [{ form: "Ivan", status: "same" }] } }, { canon: "Anton", id: "anton", langs: { croatian: [{ form: "Anton", status: "same" }] } },
  { canon: "Cheryl", id: "cheryl", langs: { english: [{ form: "Cheryl", status: "same" }] } }, { canon: "Hedviga", id: "hedviga", langs: { croatian: [{ form: "Hedviga", status: "same" }] } },
  { canon: "Juro", id: "juro", langs: { croatian: [{ form: "Juro", status: "same" }] } }]), skip: {} };
const FAMILY = "my father is ivan from senj, he moved to crikveNICa, then to harare, then johannesburg then brisbane. he married my other cheryl in 1975 in johannesburg, and he died in 2026 in brisbane frmo brain cancer. his mother was hedviga born in London in 1928 and father was ivan born in  beijing in 1914. his father father was anton and his mothers father was Juro.";

test("a family story names everyone, with the years and places told of each", () => {
  const p = F.parseStory(FAMILY, fctx), by = Object.fromEntries(p.people.map((x) => [x.key, x]));
  assert.deepEqual(p.people.map((x) => x.name), ["Ivan", "Ivan", "Hedviga", "Cheryl", "Anton", "Juro"]);
  assert.equal(by.F.role, "self"); assert.equal(by.FF.role, "father"); assert.equal(by.FM.role, "mother"); assert.equal(by.S.role, "spouse");
  assert.equal(by.FFF.label, "father's father", "his father father is his father's father");
  assert.equal(by.FMF.label, "mother's father", "his mothers father is his mother's father");
  const ev = (k, t) => by[k].events.filter((e) => e.type === t)[0];
  assert.equal(ev("FM", "born").year, 1928); assert.equal(ev("FM", "born").place.row.i, "london", "London is London, not New London");
  assert.equal(ev("FF", "born").year, 1914); assert.equal(ev("FF", "born").place.row.i, "beijing");
  assert.equal(ev("F", "married").year, 1975); assert.equal(ev("F", "married").place.row.i, "johannesburg");
  assert.equal(ev("F", "died").year, 2026); assert.equal(ev("F", "died").place.row.i, "brisbane"); assert.equal(ev("F", "died").cause, "brain cancer");
});

test("the person's route gets a year at every place: the told ones kept, the rest worked out and marked about", () => {
  const p = F.parseStory(FAMILY, fctx);
  assert.deepEqual(p.route.map((r) => r.row.i), ["senj", "crikvenica", "harare", "johannesburg", "brisbane"]);
  assert.equal(p.bornApprox, true); assert.equal(p.born, 1954, "his mother was born in 1928: about 26 years on");
  const jo = p.route[3]; assert.equal(jo.year, 1975); assert.equal(jo.yearTold, true);
  assert.equal(p.route[1].approx, true); assert.equal(p.route[1].yearTold, false);
  assert.ok(p.route.every((r) => r.year != null));
  assert.equal(p.endYear, 2026);
});

test("the ancestors travel too, each at the year told", () => {
  const p = F.parseStory(FAMILY, fctx);
  assert.deepEqual(p.kin.map((k) => [k.name, k.stops[0].row.i, k.stops[0].year]), [["Hedviga", "london", 1928], ["Ivan", "beijing", 1914]]);
});

test("a one-person story is still read as before", () => {
  const p = F.parseStory("My great-grandfather Ivan Kosina came from Gallignana to Hamilton around 1905.", ctx);
  assert.equal(p.kin, undefined);
  assert.equal(p.people.length, 1);
});

test("a name told as a person is never read as a place, and the place that bears the typed name wins", () => {
  const rows = [
    { i: "g-san-giovanni-gemini-it", n: "San Giovanni Gemini", cc: "IT", c: 0, q: "giovanni" },
    { i: "launceston", n: "Launceston", cc: "AU", c: 1, q: "australia launceston, tasmania," },
    { i: "tasmania", n: "Tasmania", cc: "AU", c: 0, q: "diemen's land van" },
  ];
  const c2 = { map: A.buildMap(rows), given: A.buildGiven([{ canon: "Ivan", id: "ivan", langs: { croatian: [{ form: "Ivan", status: "same" }] } }]), skip: {} };
  const p = F.parseStory("MY NAME IS DAVID AND MY DAD IS IVAN AND HIS DAD IS GIOVANNI AND WERE ALL FROM TASMANIA", c2);
  assert.deepEqual(p.stops.map((s) => s.row.i), ["tasmania"], "Giovanni is a person, Tasmania is Tasmania");
  assert.equal(p.teller, "David", "'And' is not his surname");
});

test("a family told from the middle: children, unnamed parents, and where the parents married", () => {
  const rows = [{ i: "brisbane", n: "Brisbane", cc: "AU", c: 1 }, { i: "argentina", n: "Argentina", cc: "AR", c: 3 }, { i: "senj", n: "Senj", cc: "HR", c: 40 },
    { i: "croatia", n: "Croatia", cc: "HR", c: 0 }, { i: "johannesburg", n: "Johannesburg", cc: "ZA", c: 0 }];
  const c3 = { map: A.buildMap(rows), given: A.buildGiven([]), skip: {} };
  const p = F.parseStory("I HAVE TWO CHILDREN, ALESSIO AND MATEO, BOTH ARE BORN IN BRISBANE. MY MUM IS FROM ARGENTINA AND MY DAD FROM SENJ, CROATIA. THEY WERE MARRIED IN JOHANNESBURG.", c3);
  assert.deepEqual(p.people.map((x) => [x.role, x.name]), [["self", ""], ["father", ""], ["mother", ""], ["child", "Alessio"], ["child", "Mateo"]]);
  const by = Object.fromEntries(p.people.map((x) => [x.key, x]));
  assert.equal(by.C1.events[0].place.row.i, "brisbane"); assert.equal(by.C2.events[0].place.row.i, "brisbane");
  assert.equal(by.F.events[0].type, "married"); assert.equal(by.F.events[0].place.row.i, "johannesburg"); assert.equal(by.M.events[0].place.row.i, "johannesburg");
  const k = Object.fromEntries(p.kin.map((x) => [x.key, x.stops.map((s) => s.row.i + ":" + s.role)]));
  assert.deepEqual(k.F, ["senj:origin", "johannesburg:married"]); assert.deepEqual(k.M, ["argentina:origin", "johannesburg:married"]);
  assert.deepEqual(p.route, [], "the teller's own route was not told, so none is drawn");
});

test("an unnamed grandparent in the story gets a place on the tree and a pin at the year told", () => {
  const rows = [{ i: "crikvenica", n: "Crikvenica", cc: "HR", c: 20 }, { i: "brisbane", n: "Brisbane", cc: "AU", c: 1 }, { i: "argentina", n: "Argentina", cc: "AR", c: 3 }];
  const c4 = { map: A.buildMap(rows), given: A.buildGiven([]), skip: {} };
  const p = F.parseStory("I have two children, Alessio and Mateo, both are born in Brisbane. My mum is from Argentina. My gransfether lived in Crikvenica in 1990", c4);
  const g = p.people.filter((x) => x.role === "grandfather")[0];
  assert.ok(g, "the grandfather is on the tree"); assert.equal(g.label, "your grandfather");
  const k = p.kin.filter((x) => x.key === "G1")[0];
  assert.deepEqual([k.stops[0].row.i, k.stops[0].year], ["crikvenica", 1990]);
});
