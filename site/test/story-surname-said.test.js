/* The clue pill «What was the surname?» adds the sentence «The surname was X.» to the story; the reader did not take that as a surname, so the clue never closed. */
import test from "node:test";
import assert from "node:assert/strict";
const { parse } = await import("./stress/ctx.mjs");

test("«the surname was Kosina» is read as the surname, with or without a capital", () => {
  for (const t of ["my fathers name was ivan. The surname was Kosina.", "My grandfather Ivan came from Senj. The surname was kosina.", "Ivan, family name: Kosina."]) {
    const p = parse(t); assert.match(p.surname, /^Kosina$/, t); assert.match(p.name, /Kosina/, t);
  }
});

test("a sentence about a surname that is not a name is left alone", () => {
  for (const t of ["Ivan came from Senj. His surname was changed in 1921.", "Ivan came from Senj. The surname is common there."]) assert.equal(parse(t).surname, "", t);
});
