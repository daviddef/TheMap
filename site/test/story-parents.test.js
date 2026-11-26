/* ONE SENTENCE OFTEN TELLS THE WHOLE FAMILY (public/js/story-engine.js, toldKin): «our maternal grandmother was born on DATE in PLACE to A and B, née C», then «her 2
   sisters» and «A was alive in a photo around 1983». The reader lost both parents, the mother's birth name, the date, the side, the sisters and the living year.
   Every name here is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const opts = { skip: !BUILT && "needs the built public/ data" };

async function read(text) {
  const h = await import("./plan/harness.mjs"), { p, g } = await h.read(text), people = p.people || [];
  const one = (role) => people.find((x) => x.role === role);
  return { p, g, people, self: one("self"), father: one("father"), mother: one("mother"), parents: people.filter((x) => x.role === "parent") };
}

const WHOLE = "Our maternal grandmother, Katica Perković, was born on July 17, 1928, in Fužine, Croatia, to Josip Perković and Barbara Perković, née Lončar.\n"
  + "Josip was alive in the attached photo taken around 1983 with Katica (in glasses) surrounded by her 2 sisters and their families";

test("the whole family of one told story: parents, birth name, date, side, sisters and the year a parent was alive", opts, async () => {
  const r = await read(WHOLE);
  assert.equal(r.p.rel, "grandmother");
  assert.equal(r.self.name, "Katica Perković");
  assert.equal(r.self.bornText, "July 17, 1928");
  assert.equal(r.self.parentSide, "mother");
  assert.equal(r.father.name, "Josip Perković");
  assert.equal(r.mother.given, "Barbara");
  assert.equal(r.mother.maiden, "Lončar");
  assert.deepEqual(r.p.siblings.map((s) => s.rel), ["sister", "sister"]);
  assert.ok(r.p.siblings.every((s) => !s.name), "no name is made up for a sister");
  const alive = r.father.events.find((e) => e.type === "alive");
  assert.equal(alive.year, 1983);
  assert.equal(alive.approx, true);
  assert.deepEqual(r.p.route.map((s) => s.row.n), ["Fužine"], "no parent's surname becomes a place");
});

test("what is told reaches the family drawing", opts, async () => {
  const r = await read(WHOLE), by = (role) => r.g.people.find((x) => x.role === role);
  assert.equal(by("self").bornText, "July 17, 1928");
  assert.equal(by("self").parentSide, "mother");
  assert.ok(by("mother"), "the mother is in the family");
  const alive = by("father").events.find((e) => e.type === "alive");
  assert.equal(alive.year, 1983);
  assert.equal(alive.approx, true);
});

for (const [text, want] of [
  ["My grandmother Ana Kovačić was born 17 July 1928 in Delnice to Marko and Marija Kovačić (née Babić).",
    { born: "17 July 1928", father: "Marko Kovačić", mother: "Marija Kovačić", maiden: "Babić" }],
  ["My great-grandmother Luce Marić was the daughter of Ivan Marić and Kata Marić, born Jurić. She was born in 1899 in Otočac.",
    { father: "Ivan Marić", mother: "Kata Marić", maiden: "Jurić" }],
  ["My grandfather Peter Novak was born in Karlovac, Croatia on 4.5.1920 to Franz Novak and Theresia Novak née Haas.",
    { born: "4.5.1920", father: "Franz Novak", mother: "Theresia Novak", maiden: "Haas" }],
  ["Our grandmother Katica Perković was born in Lokve to Josip Perković and Barbara Perković (born Lončar) on 17 July 1928.",
    { born: "17 July 1928", father: "Josip Perković", mother: "Barbara Perković", maiden: "Lončar" }],
  ["My grandmother, born 1 January 1915 in Senj to Nikola Tomić and Jelena Tomić, née Vuković, was a teacher.",
    { born: "1 January 1915", father: "Nikola Tomić", mother: "Jelena Tomić", maiden: "Vuković" }],
  ["Tom Reilly was born in Cork in 1902, son of Patrick Reilly and his wife Bridget. He moved to Boston.",
    { father: "Patrick Reilly", mother: "Bridget" }]]) {
  test("parents read: " + text.slice(0, 60), opts, async () => {
    const r = await read(text);
    assert.equal(r.father && r.father.name, want.father);
    assert.equal(r.mother && r.mother.name, want.mother);
    if (want.maiden) assert.equal(r.mother.maiden, want.maiden);
    if (want.born) assert.equal(r.self.bornText, want.born);
  });
}

test("two parents the words do not tell apart are both shown, and neither is called the mother", opts, async () => {
  const r = await read("My mother's mum, Rosa Bianchi, was born 12 March 1930 in Udine. Her parents were Carlo and Giulia Bianchi.");
  assert.equal(r.p.rel, "grandmother");
  assert.equal(r.self.name, "Rosa Bianchi");
  assert.equal(r.self.parentSide, "mother");
  assert.deepEqual(r.parents.map((x) => x.name), ["Carlo Bianchi", "Giulia Bianchi"]);
  assert.ok(!r.mother && !r.father);
});

test("«on my mum's side» says the line and adds no mother", opts, async () => {
  const r = await read("My grandmother on my mum's side, Vera Pavić, was born in Sisak in 1925.");
  assert.equal(r.p.rel, "grandmother");
  assert.equal(r.self.name, "Vera Pavić");
  assert.equal(r.self.parentSide, "mother");
  assert.ok(!r.mother);
});

for (const text of [
  "John Smith was born in 1900 to a farmer and a seamstress in York.",
  "Mary Jones was born in 1890 and moved to Perth and Sydney.",
  "My grandfather was born in Split. He had a daughter of Ana and Marko.",
  "Katica was born in Rijeka. Her son was born on 5 June 1955 to Katica and Pero Barić."]) {
  test("no parents are made of: " + text.slice(0, 60), opts, async () => {
    const r = await read(text);
    assert.ok(!r.father && !r.mother && !r.parents.length, JSON.stringify(r.people.map((x) => [x.role, x.name])));
    assert.ok(!(r.self && r.self.bornText), "another person's birth date is not this person's");
  });
}

test("another woman's sisters are not the story person's", opts, async () => {
  const r = await read("My grandmother Ana was born in Zagreb in 1920. Her mother Eva and her 3 sisters stayed behind.");
  assert.deepEqual(r.p.siblings || [], []);
});

test("the consistency check has no complaint about these readings", opts, async () => {
  const { runOne } = await import("./stress/invariants.mjs");
  for (const t of [WHOLE, "My mother's mum, Rosa Bianchi, was born 12 March 1930 in Udine. Her parents were Carlo and Giulia Bianchi.",
    "Tom Reilly was born in Cork in 1902, son of Patrick Reilly and his wife Bridget. He moved to Boston."]) assert.deepEqual(runOne(t).problems, [], t);
});
