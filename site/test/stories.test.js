/* My stories: what the store keeps, how two devices' copies merge, and that the research file carries them (and nothing else gains from them).
   Every name and place in these fixtures is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => { const m = { exports: {} }; new Function("module", fs.readFileSync(path.join(here, "../public/js", f), "utf8"))(m); return m.exports; };
const S = load("stories.js"), RF = load("research-file.js");

const story = (o = {}) => ({ id: "s1", name: "Ivan to Hamilton", line: "kosina-senj", created: "2026-11-01T00:00:00Z", updated: "2026-11-01T00:00:00Z",
  pieces: [{ id: "p1", kind: "story", label: "The family story", text: "Ivan left Gračišće in 1905 for Hamilton, Ohio.", added: "2026-11-01T00:00:00Z" }], pgone: {}, ...o });
const doc = (...ss) => ({ v: 1, stories: Object.fromEntries(ss.map((s) => [s.id, s])), gone: {} });

test("clean keeps only what a story may hold", () => {
  const d = S.clean({ stories: { a: { name: "<img onerror=x>".repeat(20), pieces: [{ id: "p", kind: "evil", text: "x".repeat(9000) }], born: 1200, extra: "no" } } });
  const s = d.stories.a;
  assert.equal(s.name.length <= 80, true);
  assert.equal(s.pieces[0].kind, "note");
  assert.equal(s.pieces[0].text.length, 6000);
  assert.equal("born" in s, false);
  assert.equal("extra" in s, false);
  assert.deepEqual(S.clean(null), S.empty());
  assert.deepEqual(S.clean("junk"), S.empty());
});

test("the pieces read together, in the order they were added", () => {
  const s = story({ pieces: [
    { id: "p1", kind: "story", label: "", text: "First.", added: "1" },
    { id: "p2", kind: "document", label: "Baptism", text: "Second.", added: "2" },
    { id: "p3", kind: "photo", label: "", text: "Third.", added: "3" }] });
  assert.equal(S.textOf(s), "First.\n\nSecond.\n\nThird.");
  assert.deepEqual(S.holdsOf(s), ["document", "photo"]);
  assert.equal(S.holdsOf(story()), null);
  assert.deepEqual(S.summary(s), { story: 1, document: 1, photo: 1, note: 0 });
});

test("merge adds pieces from both devices and loses neither", () => {
  const a = story({ updated: "2026-11-02T00:00:00Z", pieces: [...story().pieces, { id: "pa", kind: "note", label: "", text: "From laptop", added: "2026-11-02T00:00:00Z" }] });
  const b = story({ updated: "2026-11-03T00:00:00Z", name: "Ivan, renamed", pieces: [...story().pieces, { id: "pb", kind: "document", label: "", text: "From phone", added: "2026-11-03T00:00:00Z" }] });
  const m = S.merge(doc(a), doc(b)).stories.s1;
  assert.equal(m.name, "Ivan, renamed");                       // the later change takes the fields
  assert.deepEqual(m.pieces.map((p) => p.id), ["p1", "pa", "pb"]);
});

test("a piece or a story removed on one device is not brought back by the other", () => {
  const other = story({ updated: "2026-11-01T00:00:00Z" });
  const removedPiece = story({ updated: "2026-11-04T00:00:00Z", pieces: [], pgone: { p1: "2026-11-04T00:00:00Z" } });
  assert.equal(S.merge(doc(removedPiece), doc(other)).stories.s1.pieces.length, 0);
  assert.equal(S.merge(doc(other), doc(removedPiece)).stories.s1.pieces.length, 0);
  const gone = { v: 1, stories: {}, gone: { s1: "2026-11-05T00:00:00Z" } };
  assert.deepEqual(Object.keys(S.merge(gone, doc(other)).stories), []);
  assert.deepEqual(Object.keys(S.merge(doc(other), gone).stories), []);
  const later = story({ updated: "2026-11-06T00:00:00Z" });                       // changed after it was removed: it stays
  assert.deepEqual(Object.keys(S.merge(gone, doc(later)).stories), ["s1"]);
});

test("the research file carries stories, and a file without them is unchanged", () => {
  const prog = { v: 1, active: "x", lines: { x: { name: "X", where: "", made: "2026-10-01" } }, marks: {} };
  const bare = RF.buildBackup(prog, {}, 0, {});
  assert.equal("stories" in bare, false);
  const withS = RF.buildBackup(prog, {}, 0, { stories: doc(story()) });
  assert.deepEqual(Object.keys(withS.stories.stories), ["s1"]);
  const back = RF.parseAny(JSON.stringify(withS));
  assert.deepEqual(Object.keys(back.stories.stories), ["s1"]);
  assert.equal(RF.parseAny(JSON.stringify(bare)).stories, null);
  assert.equal(RF.summary(withS).stories, 1);
  // the signature moves when a story does, and is the old one when there are none
  assert.equal(RF.sigOf(prog, {}), RF.sigOf(prog, {}, S.empty()));
  assert.notEqual(RF.sigOf(prog, {}, doc(story())), RF.sigOf(prog, {}, doc(story({ name: "Other" }))));
});

test("a pack never holds stories", () => {
  const pack = RF.buildPack({ v: 1, lines: { x: { name: "X", where: "" } }, marks: {} }, {});
  assert.equal("stories" in pack, false);
});
