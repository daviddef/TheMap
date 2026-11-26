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
  ["My great grandfather is Ivan MIHALJEVIĆ and his wife, my great grandmother is Lucija, born FRATROVIĆ.", "Lucija", "Fratrović", ""],
  ["My father was Ivan Horvat. My mother was Marija, née Kovač.", "Marija", "Kovač", ""],
  ["My mother was Anna Rossi, born Bianchi. My father was Marco Rossi.", "Anna", "Bianchi", "Rossi"],
  ["My grandfather was Peter Murphy. His wife Bridget (née O'Brien) was born in 1899 in Ennis.", "Bridget", "O'Brien", ""],
  ["My mother was Marija Horvat. Her name before marriage was Kovač.", "Marija", "Kovač", "Horvat"],
  ["My great grandfather is Ivan Mihaljevic and his wife is Lucija. Lucija’s maiden name was Fratrovic.", "Lucija", "Fratrovic", ""]]) {
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
  ["My grandfather was Ivan, born Fratrovic.", "Ivan"]]) {
  test("no birth name invented: " + text, opts, async () => {
    const p = await woman(text, given);
    assert.ok(!p || !p.maiden, p && p.maiden);
  });
}
