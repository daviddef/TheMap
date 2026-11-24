/* «My grandfather Ivan came from Senj to Sydney around 1925. I only have a photo. his wife was cheryl. he had a brother Robert and a sister ada.»
   David: «tree still not right». His wife and his brother and sister were typed in lower case or left under «also named», not in the tree. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const m = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/story-kin.js"), "utf8"))(m);
const K = m.exports;
const given = (w) => /^(?:cheryl|robert|ivan)$/i.test(w);

test("a name typed in lower case after wife, brother or sister gets its capital, and the page says so", () => {
  const r = K.rewrite("his wife was cheryl. he had a brother Robert and a sister ada.", given);
  assert.equal(r.text, "his wife was Cheryl. he had a brother Robert and a sister Ada.");
  assert.equal(r.notes.length, 2);
});

test("a word that is not a name is left alone: verbs, adjectives, words the page does not know", () => {
  for (const t of ["his wife died in 1950.", "his sister is old.", "my brother still lives there.", "his wife was born in Senj.", "a sister may come."]) {
    const r = K.rewrite(t, given); assert.equal(r.changed, false, t); assert.equal(r.text, t);
  }
});

test("the family tree draws the siblings beside the person, and «also named» no longer repeats them", () => {
  const eng = fs.readFileSync(path.join(here, "../public/js/story-engine.js"), "utf8");
  const pg = fs.readFileSync(path.join(here, "../public/js/story-page.js"), "utf8");
  assert.match(eng, /siblings: parsed\.siblings \|\| \[\]/);
  assert.match(eng, /opts && opts\.siblings/);
  assert.match(eng, /function othersBlock\(others, siblings\)/);
  assert.match(pg, /siblings: f\.siblings/);
  assert.match(pg, /E\.othersBlock\(g\.others, f\.siblings\)/);
  assert.match(eng, /"His wife"/);
});
