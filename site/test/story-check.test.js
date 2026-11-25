/* THE STORY CHECK: «nothing lost, nothing invented, consistent» (public/js/story-check.js). Run on REAL readings captured by test/stress/make-check-fixtures.mjs, so it needs none
   of the built data. Three kinds of test:
     1. the story David pasted, read the way it is read now (the check says nothing) and the way it was read before #257 (the check says what was wrong);
     2. realistic messy stories the reader still gets wrong: each expectation names the real defect found by reading the output, so a reader fix MOVES the expectation on purpose;
     3. clean stories the check must stay quiet about, and the check's own guarantees (pure, never throws, «info» never lowers confidence). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js", f), "utf8"))(m); return m.exports; };
const K = load("story-check.js");
const fx = (id) => JSON.parse(fs.readFileSync(path.join(here, "fixtures/story-check", id + ".json"), "utf8"));
const optsOf = (f) => { const P = new Set(f.places), G = new Set(f.given); return { isPlace: (k) => P.has(k), isGiven: (k) => G.has(k), countries: f.countries }; };
const run = (id) => { const f = fx(id); return K.check(f.text, f.reading, optsOf(f)); };
const codes = (r, sev) => r.problems.filter((x) => !sev || x.severity === sev).map((x) => x.code);
const serious = (r) => r.problems.filter((x) => x.severity !== "info");

test("the story as the reader reads it now: nothing lost, nothing invented", () => {
  const r = run("ancestor-line");
  assert.equal(r.confidence, "high");
  assert.deepEqual(serious(r), [], "no high or medium problem: " + JSON.stringify(serious(r)));
});

test("the same story read the way it was read before #257 is flagged, and says what is wrong", () => {
  const f = fx("ancestor-line"), o = optsOf(f);
  /* the reading as it was: no great-grandparents, the grandmother as the subject of everything, Macedonia as West Macedonia, Bosnia dropped */
  const broken = {
    rel: "", name: "", surname: "", stops: [], others: [],
    people: [{ role: "self", name: "", events: [] }, { role: "father", name: "", events: [] }, { role: "mother", name: "", events: [] }, { role: "grandmother", name: "", events: [{ type: "born", year: 1942 }] }],
    kin: [
      { key: "GM", label: "your grandmother", stops: [{ row: { n: "Slovenia", cc: "SI" }, word: "slovenia", role: "move" }, { row: { n: "West Macedonia", cc: "GR" }, word: "macedonia", role: "move" }] },
      { key: "X", label: "also named in the story", stops: [{ row: { n: "Drežnik", cc: "HR" }, word: "dreznik", role: "mention" }, { row: { n: "Nova Gradiška", cc: "HR" }, word: "nova gradiska", role: "mention" }, { row: { n: "Croatia", cc: "HR" }, word: "croatia", role: "mention" }] },
    ],
  };
  const r = K.check(f.text, broken, o);
  assert.equal(r.confidence, "low");
  const by = (c) => r.problems.filter((x) => x.code === c);
  assert.ok(by("relation-missing").some((x) => /great-grand/.test(x.words[0])), "the great-grandparents are in the words and not on the tree: " + JSON.stringify(codes(r)));
  assert.ok(by("unread-name").some((x) => x.words[0] === "Mila") && by("unread-name").some((x) => x.words[0] === "Manda"), "the children named in the words are lost");
  assert.ok(by("unread-name").some((x) => /^(?:Ivan|MIHALJEVIĆ|Lucija|FRATROVIĆ)$/.test(x.words[0])), "the great-grandparents' names are lost");
  assert.ok(by("unread-place").some((x) => x.words[0] === "Bosnia"), "Bosnia is dropped");
  assert.ok(by("country-name").some((x) => /West Macedonia/.test(x.words[0]) && /North Macedonia/.test(x.words[1])), "Macedonia read as West Macedonia though it is the name of a country");
  assert.ok(by("unread-year").length >= 1, "the decades are in the words and not on the page");
  /* each problem says it in plain words, to the visitor, and points at the words */
  r.problems.forEach((x) => { assert.ok(x.what && x.what.length > 8, x.code + " has a sentence"); });
});

/* ---- stories the reader still gets wrong: the defect named is the one found by reading the output ---- */
const MESSY = [
  ["named-grandfather-kids", ["unread-name", "unread-year"], "the surname Rossi, three of the four children and the 1946 marriage and 1952 move are lost"],
  ["mums-side", ["invented-date"], "a year the story never says (1956) is on the page, and the mother's and the grandmother's are mixed"],
  ["step-family", ["subject-mismatch"], "«my dad's stepfather Franz Huber» (a grandparent) is read as the teller's father"],
  ["argentina", ["unread-name"], "the two sons are lost; Ovaro is where she was born, not Udine"],
  ["maiden-priest", ["fact-misattached", "relation-missing"], "the grandmother's husband is made the great-aunt's, and the brother's Senj is put on her route"],
  ["partial-dates", ["relation-missing"], "the brother and the three sisters are lost, and «Galicia» is read as a village in Spain"],
  ["nickname", ["fact-misattached"], "the brother's move to Canada is put on the grandfather"],
  ["several-countries", ["aside-as-stop"], "«when it was Italy» is counted as a place she lived"],
  ["facebook-post", ["place-inside-name", "unread-name"], "«Sullivan» is cut out of O'Sullivan and put on the map; the three children are lost"],
];
for (const [id, want, why] of MESSY) {
  test(`${id}: low confidence, because ${why}`, () => {
    const r = run(id);
    assert.equal(r.confidence, "low", JSON.stringify(r.problems.map((x) => x.severity + " " + x.code)));
    for (const c of want) assert.ok(codes(r).includes(c), `expected ${c}; got ${JSON.stringify(codes(r))}`);
  });
}

test("a nickname is told as a note and never lowers confidence on its own", () => {
  const r = run("nickname");
  const nick = r.problems.filter((x) => x.code === "unread-name");
  assert.ok(nick.length >= 2 && nick.every((x) => x.severity === "info"), JSON.stringify(nick));
  assert.ok(nick.some((x) => /Nino/.test(x.what)) && nick.some((x) => /Bepi/.test(x.what)));
  const only = K.check("My grandfather Giovanni, who everyone called Nino, was born in Trieste in 1915.", { rel: "grandfather", name: "Giovanni", people: [{ role: "self", rel: "grandfather", name: "Giovanni", events: [] }], stops: [{ row: { n: "Trieste", cc: "IT" }, word: "trieste", role: "born", year: 1915 }], kin: [] }, { isPlace: (k) => k === "trieste", isGiven: () => false });
  assert.equal(only.confidence, "high");
});

/* ---- clean stories ---- */
for (const id of ["clean-grandfather", "clean-full-name", "clean-occupation", "clean-photo"]) {
  test(`${id}: the check stays quiet`, () => {
    const r = run(id);
    assert.equal(r.confidence, "high"); assert.deepEqual(serious(r), [], JSON.stringify(serious(r)));
  });
}

/* ---- the invariants, one at a time, on small readings ---- */
const P0 = (o) => Object.assign({ rel: "", name: "", surname: "", stops: [], kin: [], others: [], people: [] }, o);
const placeSet = (...a) => { const s = new Set(a); return { isPlace: (k) => s.has(k), isGiven: () => false }; };

test("NOTHING LOST: a name, a place and a year in the words must be somewhere in the reading", () => {
  const r = K.check("My grandfather Ivan Horvat was born in Senj in 1880 and moved to Zagreb.", P0({ rel: "grandfather", name: "Ivan Horvat", surname: "Horvat", people: [{ role: "self", rel: "grandfather", name: "Ivan Horvat", events: [] }], stops: [{ row: { n: "Senj", cc: "HR" }, word: "senj", role: "born", year: 1880 }] }), placeSet("senj", "zagreb"));
  assert.ok(r.problems.some((x) => x.code === "unread-place" && x.words[0] === "Zagreb"), "Zagreb was dropped: " + JSON.stringify(codes(r)));
  assert.equal(r.confidence, "low");
  const y = K.check("My grandfather Ivan Horvat was born in Senj in 1880.", P0({ rel: "grandfather", name: "Ivan Horvat", people: [{ role: "self", rel: "grandfather", name: "Ivan Horvat", events: [] }], stops: [{ row: { n: "Senj", cc: "HR" }, word: "senj", role: "born" }] }), placeSet("senj"));
  assert.ok(y.problems.some((x) => x.code === "unread-year" && x.words[0] === "1880"), "the year is not on the page");
});

test("NOTHING LOST: a count of children is reconciled with the children listed", () => {
  const kids = (n) => Array.from({ length: n }, (_, i) => ({ role: "child", name: "K" + i, events: [] }));
  const base = (n) => P0({ rel: "grandfather", name: "Ivan", people: [{ role: "self", rel: "grandfather", name: "Ivan", events: [] }].concat(kids(n)) });
  const t = "My grandfather Ivan had 2 children, K0, K1 and K2.";
  assert.ok(K.check(t, base(3), placeSet()).problems.some((x) => x.code === "count-over" && x.severity === "high"), "three listed, two said");
  assert.ok(!K.check("My grandfather Ivan had 3 children, K0, K1 and K2.", base(3), placeSet()).problems.some((x) => /^count-/.test(x.code)));
  assert.ok(K.check("My grandfather Ivan had 5 children, K0, K1 and K2.", base(3), placeSet()).problems.some((x) => x.code === "count-short"), "five said, three listed");
});

test("NOTHING INVENTED: a name, a place or a year on the page that the words never say", () => {
  const t = "My grandfather Ivan was born in Senj in 1880.";
  const mk = (extra) => P0(Object.assign({ rel: "grandfather", name: "Ivan", people: [{ role: "self", rel: "grandfather", name: "Ivan", events: [] }], stops: [{ row: { n: "Senj", cc: "HR" }, word: "senj", role: "born", year: 1880 }] }, extra));
  assert.deepEqual(serious(K.check(t, mk({}), placeSet("senj"))), []);
  assert.ok(K.check(t, mk({ people: [{ role: "self", rel: "grandfather", name: "Ivan", events: [] }, { role: "spouse", name: "Marija Kos", events: [] }] }), placeSet("senj")).problems.some((x) => x.code === "invented-name"), "a spouse the words never name");
  assert.ok(K.check(t, mk({ stops: [{ row: { n: "Senj", cc: "HR" }, word: "senj", role: "born", year: 1880 }, { row: { n: "Rijeka", cc: "HR" }, word: "rijeka", role: "lived" }] }), placeSet("senj")).problems.some((x) => x.code === "invented-place"), "a place the words never say");
  assert.ok(K.check(t, mk({ stops: [{ row: { n: "Senj", cc: "HR" }, word: "senj", role: "born", year: 1956 }] }), placeSet("senj")).problems.some((x) => x.code === "invented-date" && x.words[0] === "1956"), "a year the words never say");
  /* an unnamed, factless parent card is the path between an ancestor and the teller, not an invention */
  assert.deepEqual(serious(K.check(t, mk({ people: [{ role: "self", rel: "grandfather", name: "Ivan", events: [] }, { role: "father", name: "", events: [] }, { role: "mother", name: "", events: [] }] }), placeSet("senj"))), []);
});

test("CONSISTENT: a place is read as a country when the word is a country's name, and the teller is not given another's facts", () => {
  const t = "My grandmother went to Macedonia.";
  const r = K.check(t, P0({ rel: "grandmother", people: [{ role: "self", rel: "grandmother", name: "", events: [] }], stops: [{ row: { n: "West Macedonia", cc: "GR" }, word: "macedonia", role: "move" }] }), { isPlace: (k) => k === "macedonia", isGiven: () => false, countries: { MK: "North Macedonia", GR: "Greece" } });
  assert.ok(r.problems.some((x) => x.code === "country-name"), JSON.stringify(codes(r)));
  const me = K.check("My grandfather came from Cork.", P0({ rel: "", people: [{ role: "self", me: true, name: "", events: [{ type: "born", year: 1980, place: { row: { n: "Cork", cc: "IE" }, word: "cork" } }] }], stops: [{ row: { n: "Cork", cc: "IE" }, word: "cork", role: "origin" }] }), placeSet("cork"));
  assert.ok(me.problems.some((x) => x.code === "teller-assigned"), "the teller was given a birth the words never tell: " + JSON.stringify(codes(me)));
});

test("what the reader does on purpose is not flagged: a qualifier, a place not gone to, an address, the teller's own name", () => {
  const ok = (t, p, o) => assert.deepEqual(serious(K.check(t, p, o || placeSet("paris", "texas", "boston", "cork", "main", "david"))), [], t);
  ok("My grandfather was born in Paris, Texas in 1920.", P0({ rel: "grandfather", people: [{ role: "self", rel: "grandfather", events: [] }], stops: [{ row: { n: "Paris", cc: "US" }, word: "paris", role: "born", year: 1920 }] }));
  ok("He planned to go to Boston but stayed in Cork.", P0({ people: [{ role: "self", name: "", events: [] }], stops: [{ row: { n: "Cork", cc: "IE" }, word: "cork", role: "lived" }] }));
  ok("My name is David Defranceski. My grandfather came from Cork.", P0({ rel: "grandfather", people: [{ role: "self", rel: "grandfather", events: [] }], stops: [{ row: { n: "Cork", cc: "IE" }, word: "cork", role: "origin" }] }));
});

test("the check is pure, never throws, and only «high» or two «medium» lower confidence", () => {
  const f = fx("maiden-priest"), before = JSON.stringify(f.reading);
  K.check(f.text, f.reading, optsOf(f));
  assert.equal(JSON.stringify(f.reading), before, "the reading was not changed");
  for (const [t, p] of [["", null], ["   ", {}], ["x", undefined], ["My grandfather Ivan.", { people: [null, 3, "x"], kin: "no", stops: [{}], others: {} }], ["I have​ a story about Ĉ", {}]]) assert.doesNotThrow(() => K.check(t, p, {}));
  assert.deepEqual(K.check("", {}, {}), { ok: true, confidence: "high", problems: [] });
  const r = run("nickname");
  const sev = r.problems.map((x) => x.severity), hi = sev.filter((s) => s === "high").length, med = sev.filter((s) => s === "medium").length;
  assert.equal(r.confidence, hi > 0 || med >= 2 ? "low" : "high");
});
