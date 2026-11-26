/* A WOMAN'S BIRTH NAME HEADS HER BOX (public/js/story-engine.js, markMaidens): David, «can you show the wives maiden names as their last name? currently hidden amongst
   the text.» Read only where the words say it; a town after «born» is never a surname; a married name told as well is kept. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const opts = { skip: !BUILT && "needs the built public/ data" };

async function woman(text, given) {
  const { read } = await import("./plan/harness.mjs"), { g } = await read(text);
  return (g.people || []).find((p) => p.given && p.given.typed === given);
}

for (const [text, given, maiden, married] of [
  ["My great grandfather is Josip PERKOVIĆ and his wife, my great grandmother is Barbara, born LONČAR.", "Barbara", "Lončar", ""],
  ["My father was Ivan Horvat. My mother was Marija, née Kovač.", "Marija", "Kovač", ""],
  ["My mother was Anna Rossi, born Bianchi. My father was Marco Rossi.", "Anna", "Bianchi", "Rossi"],
  ["My grandfather was Peter Murphy. His wife Bridget (née O'Brien) was born in 1899 in Ennis.", "Bridget", "O'Brien", ""],
  ["My mother was Marija Horvat. Her name before marriage was Kovač.", "Marija", "Kovač", "Horvat"],
  ["My great grandfather is Josip Perkovic and his wife is Barbara. Barbara’s maiden name was Loncar.", "Barbara", "Loncar", ""]]) {
  test("birth name read: " + text.slice(0, 60), opts, async () => {
    const p = await woman(text, given);
    assert.ok(p, given + " is in the family");
    assert.equal(p.maiden, maiden);
    assert.equal(p.married, married);
    assert.equal(p.surnameTyped, maiden);
  });
}

/* «born Bianchi» put Anna's birth in Monte dei Bianchi, because the word is part of that name. Made-up rows, so the test does not depend on which places the data holds today. */
test("a word that is only part of a longer place name is a birth name after «born», not that place", opts, async () => {
  const { parse, ctx } = await import("./plan/harness.mjs");
  ctx.map.quartari = [{ i: "p-monte-dei-quartari-it", n: "Monte dei Quartari", y: 44.17, x: 10.13, c: 0, w: 1, cc: "IT", q: "quartari dei monte" }];
  try {
    const out = parse("My mother was Anna Rossi, born Quartari. My father was Marco Rossi.");
    const anna = out.people.find((p) => p.given === "Anna");
    assert.equal(anna.maiden, "Quartari");
    assert.ok(!anna.place, "no birthplace is made of her birth name");
    assert.deepEqual((anna.events || []).filter((e) => e.place), []);
    assert.equal(ctx.map.quartari.length, 1, "the place is put back for every later reading");
  } finally { delete ctx.map.quartari; }
});

for (const [text, given] of [
  ["My great grandmother was Rosa, born in Genoa.", "Rosa"],
  ["My grandmother was Anna, born Zagreb 1901.", "Anna"],
  ["My grandfather was Josip, born Loncar.", "Josip"]]) {
  test("no birth name invented: " + text, opts, async () => {
    const p = await woman(text, given);
    assert.ok(!p || !p.maiden, p && p.maiden);
  });
}

/* The same rule with a made-up index, so it does not hang on which places a build happens to hold. */
const js = (f, m) => { new Function("module", fs.readFileSync(path.join(SITE, "public/js", f), "utf8"))(m); return m.exports; };
const A = js("atlas-summary.js", { exports: {} }), F = js("story-engine.js", { exports: {}, deps: { summary: A } });
function mother(text, rows) {
  const p = F.parseStory(text, { map: A.buildMap(rows), given: A.buildGiven([]), skip: {}, countries: { IT: "Italy", ES: "Spain" } });
  return p.people.find((x) => x.given === "Anna");
}
const STORY = "My mother was Anna Rossi, born Bianchi. My father was Marco Rossi.";
const place = (n, q) => ({ i: A.fold(n).replace(/ /g, "-"), n, y: 44, x: 10, cc: "IT", c: 0, ...(q ? { q } : {}) });

test("one word of a longer place name does not stop a birth name being read", () => {
  assert.equal(mother(STORY, [place("Monte dei Bianchi", "bianchi dei monte")]).maiden, "Bianchi");
});

test("a place of that name, or an old name of one, is still where she was born", () => {
  assert.ok(!mother(STORY, [place("Bianchi")]).maiden, "its own name");
  assert.ok(!mother(STORY, [place("Bianchi (Cosenza)")]).maiden, "its name with a district");
  assert.ok(!mother(STORY, [place("Villanova", "bianchi")]).maiden, "an old name");
});

test("a longer place name written out after «born» is not cut into a surname", () => {
  assert.ok(!mother("My mother was Anna Rossi, born Monte Bianchi.", [place("Monte Bianchi", "bianchi monte")]).maiden);
});

/* Surnames that begin a longer place name: «born Brown» had made Anna's birthplace of Brown County and kept the name too. */
for (const [word, longer] of [["Brown", "Brown County"], ["Silva", "Silva Jardim"], ["Pozzuolo", "Pozzuolo del Friuli"]]) {
  test(`the first word of a longer place name, alone after «born», is a birth name: ${word}`, () => {
    const anna = mother(`My mother was Anna Rossi, born ${word}. My father was Marco Rossi.`, [place(longer, A.fold(longer))]);
    assert.equal(anna.maiden, word);
    assert.ok(!anna.place, "and no birthplace is made of it");
  });
  test(`written out in full it is the place: ${longer}`, () => {
    const anna = mother(`My mother was Anna Rossi, born ${longer}. My father was Marco Rossi.`, [place(longer, A.fold(longer))]);
    assert.ok(!anna.maiden, anna.maiden);
    assert.equal(anna.place && anna.place.row.n, longer);
  });
}

