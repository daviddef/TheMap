/* Errands: a letter to where the record is, from a plain template. What the template says and leaves for the reader, what the store keeps, how two
   devices' copies merge, that the research file carries them, and that nothing in the Atlas sends a letter. Every name here is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js", f), "utf8"))(m); return m.exports; };
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");
const E = load("errands.js"), RF = load("research-file.js");

const er = (o = {}) => ({ id: "e1", pid: "qld-state-archives", name: "Queensland State Archives", line: "kosina", to: "info@archives.example", subject: "s", body: "b", note: "", status: "drafted", created: "2026-11-24T00:00:00Z", updated: "2026-11-24T00:00:00Z", ...o });
const doc = (...es) => ({ v: 1, errands: Object.fromEntries(es.map((e) => [e.id, e])), gone: {} });

test("the template names the family, the institution and the place, and leaves the rest in brackets", () => {
  const L = E.draft({ inst: "Queensland State Archives", family: "Kosina", where: "Brisbane" });
  assert.match(L.subject, /Kosina family, Brisbane/);
  assert.match(L.body, /the Kosina family of Brisbane/);
  assert.match(L.body, /whether Queensland State Archives holds records/);
  assert.match(L.body, /\[your name\]/);
  assert.ok(E.unfilled(L.body) >= 7, "who, what, when, relation, country, name and address are the reader's to fill");
  assert.equal(E.unfilled("Dear Sir, no brackets here"), 0);
});

test("with no family or place yet the template asks for them instead of inventing one", () => {
  const L = E.draft({ inst: "An archive" });
  assert.match(L.subject, /\[family name\]/);
  assert.match(L.body, /\[family name\]/);
  assert.doesNotMatch(L.body, / of undefined|null/);
});

test("clean keeps only what an errand may hold", () => {
  const d = E.clean({ errands: { a: { name: "<img onerror=x>".repeat(30), body: "x".repeat(9000), status: "evil", url: "javascript:alert(1)", extra: "no" } } });
  const e = d.errands.a;
  assert.equal(e.name.length <= 120, true);
  assert.equal(e.body.length, 6000);
  assert.equal(e.status, "todo");
  assert.equal("url" in e, false, "only http(s) addresses are kept");
  assert.equal("extra" in e, false);
  assert.deepEqual(E.clean(null), E.empty());
  assert.deepEqual(E.clean("junk"), E.empty());
});

test("the later change wins a merge, and what was deleted stays deleted", () => {
  const a = doc(er({ body: "mine", updated: "2026-11-24T10:00:00Z" })), b = doc(er({ body: "theirs", status: "sent", updated: "2026-11-24T12:00:00Z" }));
  const m = E.merge(a, b);
  assert.equal(m.errands.e1.body, "theirs");
  assert.equal(m.errands.e1.status, "sent");
  const gone = { v: 1, errands: {}, gone: { e1: "2026-11-25T00:00:00Z" } };
  assert.deepEqual(Object.keys(E.merge(a, gone).errands), []);
  assert.deepEqual(Object.keys(E.merge(gone, a).errands), []);
  const two = E.merge(doc(er()), doc(er({ id: "e2", name: "Another" })));
  assert.deepEqual(Object.keys(two.errands).sort(), ["e1", "e2"]);
});

test("the e-mail link carries the letter and nothing is sent by the page", () => {
  const link = E.mailto(er({ subject: "A & B?", body: "Line one\nLine two" }));
  assert.match(link, /^mailto:info@archives\.example\?subject=A%20%26%20B%3F&body=Line%20one%0ALine%20two$/);
  assert.equal(E.mailto(er({ to: "" })), "", "no address, no link");
  for (const f of ["../public/js/errands.js", "../public/js/research-errands.js"]) {
    const s = read(f);
    assert.doesNotMatch(s, /\bfetch\(.*(POST|method)/, f + " must not post anything");
    assert.doesNotMatch(s, /innerHTML|insertAdjacentHTML/, f + " builds with textContent only");
    assert.doesNotMatch(s, /XMLHttpRequest|sendBeacon|navigator\.share/, f);
  }
});

test("the research file carries the errands, merges them in, and a file made before them still matches", () => {
  const prog = { lines: {}, marks: {} };
  const without = RF.sigOf(prog, null, null, null);
  assert.equal(RF.sigOf(prog, null, null, E.empty()), without, "no errands, same signature as before they existed");
  assert.notEqual(RF.sigOf(prog, null, null, doc(er())), without);
  const f = RF.buildBackup(prog, null, undefined, { errands: doc(er()) });
  assert.equal(f.errands.errands.e1.name, "Queensland State Archives");
  assert.equal(RF.summary(f).errands, 1);
  const got = RF.parseAny(JSON.stringify(f));
  assert.equal(got.errands.errands.e1.to, "info@archives.example");
  assert.equal("errands" in RF.buildBackup(prog, null, undefined, {}), false);
});

test("the pencil is offered only where an address is known, on the map and on the story page", () => {
  const rm = read("../src/components/RecordMap.astro"), en = read("../public/js/story-engine.js");
  assert.match(rm, /function penIcon\(pid, name\)/);
  assert.match(rm, /my-research\/\?errand=/);
  assert.match(rm, /x\.p\.em, x\.p\.id/);
  assert.match(en, /function penLink\(p\)/);
  assert.match(en, /if \(!p \|\| !p\.id \|\| !p\.em/);
  assert.match(read("../src/pages/my-research.astro"), /id="mr-errands"/);
});
