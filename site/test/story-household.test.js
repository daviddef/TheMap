/* THE TELLER'S OWN HOUSEHOLD (public/js/story-engine.js): «i am ..., my father was ... my wife is ... her dad is ...». The wife was dropped, her parents were hung on the
   teller's own father and mother, lower-case surnames were lost, and a story with no places drew nothing at all. The people here are invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const opts = { skip: !BUILT && "needs the built public/ data" };

async function family(text) {
  const { parse } = await import("./stress/ctx.mjs"), p = parse(text), by = {};
  for (const x of p.people || []) by[x.key || x.role] = x;
  return { p, by };
}
const FULL = "i am peter horvat, my father was ivan horvat from senj, croatia. my mother is anna horvat, born 1955. my father was born in 1951 in senj. "
  + "my dads father was also ivan, and he was from crikvenica. my dads mother was hedviga kovac from senj.\nmy wife is maria and i have 2 children luka and marko. marias mum is rosa and her dad is Ian O'Brien.";

test("a family told from the middle: the teller, the partner, her parents, both of the father's parents and the children", opts, async () => {
  const { by } = await family(FULL);
  const got = Object.fromEntries(Object.entries(by).map(([k, x]) => [k, x.name]));
  assert.deepEqual(got, { ME: "Peter Horvat", F: "Ivan Horvat", M: "Anna Horvat", S: "Maria", SM: "Rosa", SF: "Ian O'Brien", FF: "Ivan", FM: "Hedviga Kovac", C1: "Luka", C2: "Marko" });
  assert.equal(by.S.label, "your wife");
  assert.equal(by.SM.label, "your wife's mother");
  assert.equal(by.SF.label, "your wife's father");
  assert.equal(by.SF.role, "inlaw");
  assert.equal(by.FF.place.word.toLowerCase(), "crikvenica");
  assert.equal(by.F.events.find((e) => e.type === "born").year, 1951);
});

test("a parent called by name: «annas father was nuno and her mother was catherine meyer» are the mother's parents", opts, async () => {
  const { by } = await family(FULL + " annas father was nuno and her mother was catherine meyer.");
  assert.equal(by.MF && by.MF.name, "Nuno");
  assert.equal(by.MM && by.MM.name, "Catherine Meyer");
  assert.equal(by.FF.name, "Ivan");
  assert.equal(by.FM.name, "Hedviga Kovac");
  assert.equal(by.SM.name, "Rosa");
  assert.equal(by.SF.name, "Ian O'Brien");
});

test("the same family with no place for anyone else is still the teller's own", opts, async () => {
  const { by } = await family("i am peter horvat, my father was ivan horvat from croatia. my mother is anna horvat, born 1955. my father was born in 1951.\nmy wife is maria and i have 2 children luka and marko. marias mum is rosa and her dad is Ian O'Brien.");
  assert.equal(by.ME.name, "Peter Horvat");
  assert.equal(by.S.name, "Maria");
  assert.ok(!by.FM && !by.MF, "her parents are not hung on the teller's parents");
});

for (const text of [
  "My father was Ivan Horvat and my mother was Anna. My wife is Maria. Maria's mum is Rosa Kelly.",
  "My father was Ivan Horvat and my mother was Anna. My wife is Maria and her mum is Rosa Kelly.",
  "My father was Ivan Horvat and my mother was Anna. My wife is Maria. My mother-in-law is Rosa Kelly."]) {
  test("the partner's mother: " + text.slice(52), opts, async () => {
    const { by } = await family(text);
    assert.equal(by.SM && by.SM.name, "Rosa Kelly");
    assert.equal(by.M.name, "Anna");
    assert.ok(!by.FM && !by.MM);
  });
}

for (const [text, teller] of [
  ["I am Peter Horvat. My wife is Maria. My father was Ivan and my mother was Anna.", "Peter Horvat"],
  ["I am Croatian. My wife is Maria. My father was Ivan and my mother was Anna.", ""],
  ["I am trying to find them. My wife is Maria. My father was Ivan and my mother was Anna.", ""]]) {
  test("who is telling: " + text.slice(0, 24), opts, async () => {
    const { p } = await family(text);
    assert.equal(p.teller, teller);
  });
}

test("a plain word after a name is no surname", opts, async () => {
  const { by } = await family("My father was ivan retired. My mother was Anna and my wife is Maria.");
  assert.equal(by.F.name, "Ivan");
});

test("a story with a family and no place is still drawn", () => {
  const page = fs.readFileSync(path.join(SITE, "public/js/story-page.js"), "utf8");
  assert.match(page, /function tellable\(p\) \{ return placed\(p\) \|\|/);
  assert.match(page, /No place in the story yet/);
});
