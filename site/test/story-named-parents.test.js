/* David: «still no hedviga? and if he has siblings, surely we should show unknown parents? ... father still not showing? "My father's name was Ivan. He was born in Senj in 1951 ...
   His wife was Cheryl. Ivan's father Mate was born in Senj in 1920."» */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { parse } = await import("./stress/ctx.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const m = { exports: {} }; new Function("module", read("../public/js/story-gaps.js"))(m); const G = m.exports;
const roles = (p) => (p.people || []).map((x) => x.role + ":" + x.name).join(",");

test("«Ivan's father Mate was born in Senj in 1920» makes Mate Ivan's father, and keeps Ivan's wife", () => {
  const p = parse("My father's name was Ivan. He was born in Senj in 1951 and left in 1954. His wife was Cheryl. Ivan's father Mate was born in Senj in 1920.");
  assert.match(roles(p), /self:Ivan/); assert.match(roles(p), /father:Mate/); assert.match(roles(p), /spouse:Cheryl/);
});

test("«Ivan's father was Mate» and «Ivan's mother Hedviga» are read when Ivan is the person told of", () => {
  assert.match(roles(parse("My father's name was Ivan. Ivan's father was Mate.")), /self:Ivan,father:Mate/);
  assert.match(roles(parse("My grandfather Ivan came from Senj. Ivan's mother Hedviga was born in Senj.")), /mother:Hedviga/);
});

test("a sentence-initial «His cousin Hedviga» is a person named in passing, and the place pill writes it that way", () => {
  const p = parse("My grandfather Ivan came from Senj to Sydney. His cousin Hedviga lived in Senj.");
  assert.deepEqual((p.others || []).map((o) => o.kin + ":" + o.name), ["cousin:Hedviga"]);
  assert.equal(G.sentence("place", "Senj", "who", "Hedviga, cousin"), "His cousin Hedviga lived in Senj.");
  assert.equal(G.sentence("place", "Senj", "who", "Hedviga"), "His relative Hedviga lived in Senj.");
  const toks = G.tokens("My grandfather Ivan came from Senj. His cousin Hedviga lived in Senj.", parse("My grandfather Ivan came from Senj. His cousin Hedviga lived in Senj.")).map((t) => t.word);
  assert.ok(toks.includes("Hedviga"), "Hedviga is highlighted as a person");
});

test("a person's father pill is said by the person's own name, so the reader attaches it to him", () => {
  assert.equal(G.sentence("person", "Ivan", "father", "Mate"), "Ivan's father was Mate.");
  assert.match(read("../public/js/story-page.js"), /oo\.id === "father" \|\| oo\.id === "mother"\) && tk\.name/);
});

test("a story that names siblings draws the parents above them, waiting to be told", () => {
  assert.match(read("../public/js/story-engine.js"), /BROTHERS AND SISTERS HAVE PARENTS/);
  assert.match(read("../public/js/story-engine.js"), /whoS \+ "'s father"/);
});
