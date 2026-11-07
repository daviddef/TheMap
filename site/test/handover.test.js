/* The handover on /read/: one document drawn as a PDF page, a Markdown file and a prompt, from what is in the box. Nothing leaves the browser. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const m0 = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js/handover.js"), "utf8"))(m0);
const H = m0.exports;

const t1 = "Die 3 martii 1788 baptizatus est Joannes. Patrini: Petrus et Anna.", t2 = "Die 4 maii 1792 sepultus est Joannes Kosina.";
const res1 = { result: { draft: "On 3 March 1788 Joannes was baptised.", words: [{ w: "patrini", gloss: "godparents", from: "model", doubt: true, why: "smudged" }], roles: [{ w: "Joannes", role: "child" }], not_said: ["the parents"], note: "" } };
const box = t1 + "\n\n— Picture 2 —\n" + t2;
const facts = { place: "Senj", country: "Croatia", older: ["Segna"], year: 1788, polity: "Habsburg Monarchy", regime: "Austrian rule", language: "Latin", page: "https://recordatlas.org/place/senj/", volumes: [{ title: "Births 1780-1800", from: 1780, to: 1800 }] };

test("the model is built from the box; an entry edited after Claude read it has no draft", () => {
  const m = H.model(box, { [t1]: { res: res1, lang: "Latin" } }, facts, "Senj 1788", "2026-11-07");
  assert.equal(m.entries.length, 2);
  assert.ok(m.entries[0].res && !m.entries[1].res);
  assert.deepEqual(m.years, [1788, 1792]);
  const edited = H.model(box.replace("Petrus", "Petro"), { [t1]: { res: res1 } }, null, "", "2026-11-07");
  assert.equal(edited.entries[0].res, null, "the draft belonged to the old words");
});

test("the Markdown carries the transcript, the draft, the doubts, the place facts, and says the pictures are not included", () => {
  const m = H.model(box, { [t1]: { res: res1, lang: "Latin" } }, facts, "Senj 1788", "2026-11-07");
  const md = H.toMarkdown(H.document(m, "ai", ""));
  for (const s of [t1, "On 3 March 1788 Joannes was baptised.", "DOUBTFUL: smudged", "Habsburg Monarchy", "Births 1780-1800", "not included", "No draft reading was made"]) assert.ok(md.includes(s), s);
  assert.match(md, /^# Record handover/);
});

test("the prompt for an AI has the task, the rules against invention, the entries and what to send back; a typed goal replaces the default", () => {
  const m = H.model(box, { [t1]: { res: res1 } }, null, "", "2026-11-07");
  const p = H.prompt(m, "ai", "");
  for (const s of ["YOUR TASK", H.DEFAULT_GOAL, "Do not invent people", "not proof of one person", "do not look them up", t1, "WHAT I WANT BACK"]) assert.ok(p.includes(s), s);
  assert.ok(H.prompt(m, "ai", "Find the godparents").includes("Find the godparents") && !H.prompt(m, "ai", "Find the godparents").includes(H.DEFAULT_GOAL));
});

test("the prompt for a person is a note, not a set of instructions to a model", () => {
  const m = H.model(t1, { [t1]: { res: res1 } }, null, "", "2026-11-07");
  const p = H.prompt(m, "person", "Who were the godparents?");
  assert.match(p, /^Hello,/);
  assert.ok(p.includes("Who were the godparents?") && p.includes("treat it with suspicion") && !p.includes("YOUR TASK"));
});

test("the PDF page is drawn with DOM calls and textContent only", () => {
  const src = fs.readFileSync(path.join(here, "../public/js/handover.js"), "utf8");
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "no markup is parsed from text");
});
