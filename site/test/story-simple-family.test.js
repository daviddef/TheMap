/* A SHORT STORY OF TWO PARENTS AND FOUR GRANDPARENTS, typed quickly: no capitals, no apostrophes, a slipped key in «fathers». The reader lost the mother (the page's
   own rewording turned «married my mother Maria» into «married his wife Maria»), the father's father, the mother's mother, her middle names and, with the typo, the father's
   mother. Every name here is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILT = ["public/index.json", "public/given-names.json"].every((f) => fs.existsSync(path.join(SITE, f)));
const opts = { skip: !BUILT && "needs the built public/ data" };
const K = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(SITE, "public/js/story-kin.js"), "utf8"))(m); return m.exports; })();

/* as the page reads it: reworded first (story-kin.js), then parsed */
async function read(text) {
  const h = await import("./plan/harness.mjs");
  const rw = K.rewrite(text, (w) => !!h.ctx.given[h.A.fold(w)]), p = h.parse(rw.changed ? rw.text : text);
  const who = Object.fromEntries((p.people || []).map((x) => [x.key, x]));
  const route = (key) => ((p.kin || []).find((k) => k.key === key)?.stops || []).map((s) => `${s.role} ${s.row.n.replace(/ \(.*/, "")} ${s.year}`);
  return { p, who, route, rw, names: Object.fromEntries((p.people || []).map((x) => [x.key, x.name || ""])) };
}

const STORY = "my father is marko horvat who died in 2021. he was born in split, croatia in 1948, married my mother rosa in 1971 in cape town and they moved to perth australia in 2009. "
  + "i was born in 1975. my fatehers mother was barbara kovac, and his father was luka. my mothers father was anton and her mother was julia anne louise meyer.";

test("both parents and all four grandparents, from one short story typed without capitals", opts, async () => {
  const r = await read(STORY);
  assert.deepEqual(r.names, { ME: "", F: "Marko Horvat", M: "Rosa", FF: "Luka", FM: "Barbara Kovac", MF: "Anton", MM: "Julia Anne Louise Meyer" });
  assert.equal(r.who.MM.surname, "Meyer", "the middle names are not part of the surname");
  assert.ok(r.rw.notes.some((n) => n.includes("«fatehers» read as «fathers»")), "the page says what it read a slip as");
});

test("the wedding and the move are both parents', and the birth and death stay the father's", opts, async () => {
  const r = await read(STORY);
  assert.deepEqual(r.route("F"), ["born Split 1948", "married Cape Town 1971", "move Perth 2009"]);
  assert.deepEqual(r.route("M"), ["married Cape Town 1971", "move Perth 2009"]);
  assert.equal(r.who.F.events.find((e) => e.type === "died").year, 2021);
  assert.equal(r.who.ME.events.find((e) => e.type === "born").year, 1975);
  assert.deepEqual((r.p.others || []).map((o) => o.name), [], "a parent in a box is not listed again as also named");
});

for (const text of ["My mothers father was Anton and her mother was Julia Meyer.", "My mother's father was Anton. Her mother was Julia Meyer."]) {
  test("«her mother», straight after «my mother's father», is the mother's mother: " + text, opts, async () => {
    const r = await read(text);
    assert.equal(r.names.MF, "Anton");
    assert.equal(r.names.MM, "Julia Meyer");
    assert.ok(!r.names.M, "she is not the teller's mother");
  });
}

test("a slipped key is mended only in a family word after my, his, her or their", () => {
  const read2 = (t) => K.rewrite(t, () => false).text;
  assert.equal(read2("My mohter was Rosa."), "My mother was Rosa.");
  for (const t of ["He moved farther north.", "My fate was sealed.", "His other son stayed.", "Her moth collection grew."]) assert.equal(read2(t), t);
});

/* the suggestions, built as the plan audit builds them */
async function cards(text) {
  const h = await import("./plan/harness.mjs"), { todo, deps } = await import("./plan/deps.mjs");
  const rw = K.rewrite(text, (w) => !!h.ctx.given[h.A.fold(w)]), g = await h.L.gather(h.parse(rw.changed ? rw.text : text));
  return todo.build(g, deps(g)).sections.flatMap((s) => s.items).filter((c) => c.steps);
}

test("what is told of the parents is looked for where it was told: the wedding, the death, and no parish invented for a birth", opts, async () => {
  const all = await cards(STORY), card = (re) => all.find((c) => re.test(c.title));
  const wed = card(/parents’ marriage/);
  assert.match(wed.why, /Told in the story: 1971, .*Cape Town/);
  assert.match(wed.steps[0].title, /1971.*Cape Town/);
  const mother = card(/\(your mother\)/);
  assert.match(mother.steps[0].why, /does not say where she was born.*Cape Town, 1971/);
  assert.ok(!mother.steps.some((s) => /parish of Cape Town/.test(s.why)), "where she married is not where she was born");
  assert.doesNotMatch(mother.why, /from Cape Town/i);
  const father = card(/\(your father\)/);
  assert.match(father.steps.find((s) => /^Death/.test(s.title)).title, /2021.*Perth/);
  assert.ok(!father.steps.some((s) => /may be alive/.test(s.why)), "the story says he died");
  assert.ok(!mother.steps.some((s) => /^Death/.test(s.title)), "no death is told of a mother who may well be living");
});
