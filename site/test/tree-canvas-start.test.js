/* The Tree Canvas's opening screen: what each removal control takes (and that nothing else goes), that a removal reaches the six-word copy as a dated deletion an
   older copy cannot undo, that every card can open Compass, and that the page keeps the ids its script uses. Every id, name and address here is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as W from "../public/tree-canvas/work.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const load = f => { const m = { exports: {} }; new Function("module", read("../public/js/" + f))(m); return m.exports; };
const RF = load("research-file.js");
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m }; };
const plain = (n = 3) => ({ v: 1, cards: Array.from({ length: n }, (_, i) => ["p" + i, 100 + i * 50, 40, 0, 0, 0, 0, 0, ""]), view: { x: 0, y: 0, k: 1 }, decisions: [], opts: {}, path: null, filter: [] });
const F1 = { t: "file", ref: "family.ged", size: 900, people: 3 }, F2 = { t: "file", ref: "other.ged", size: 500, people: 2 }, A = { t: "archive", ref: "booyzen" }, L = { t: "link", ref: "https://x.example/t.ged" };
const T0 = Date.parse("2026-11-20T10:00:00Z");

/* a store with three trees: a file with where-you-left-off and two views, another file with a view only, an archive with where-you-left-off only */
function seeded() {
  const st = memStore();
  W.put(W.makeRecord(F1, "family.ged", plain(), T0), st);
  W.putView(W.makeView(F1, "", plain(), "Mum's side", T0 + 1, "v1"), st); W.putView(W.makeView(F1, "", plain(), "Dad's side", T0 + 2, "v2"), st);
  W.putView(W.makeView(F2, "", plain(), "Just a view", T0 + 3, "v3"), st);
  W.put(W.makeRecord(A, "Booyzen archive", plain(), T0 + 4), st);
  const kept = [{ name: "family.ged", when: T0 }, { name: "other.ged", when: T0 - 1 }];
  return { st, kept, groups: () => W.groupTrees(kept, W.list(st), W.listViews(st)) };
}
const by = (g, id) => g.find(x => x.id === id);

test("a card knows every kept file and every canvas record it was made from, not only the newest", () => {
  const st = memStore();
  W.put(W.makeRecord({ t: "file", ref: "family.ged", size: 900, people: 3 }, "x", plain(), T0), st);
  W.put(W.makeRecord({ t: "file", ref: "family.ged", size: 901, people: 3 }, "x", plain(), T0 + 5), st);   // the same name, another file
  const g = W.groupTrees([{ name: "family.ged", when: 1 }, { name: "family.ged", when: 2 }], W.list(st), []);
  assert.equal(g.length, 1); assert.equal(g[0].recs.length, 2, "both records are on the one card"); assert.equal(g[0].files.length, 2);
  assert.equal(g[0].canvas.upd, new Date(T0 + 5).toISOString(), "the card shows the newest, as before");
  assert.equal(W.removalPlan(g[0], "all").keys.length, 2, "and removing the card takes both");
});

test("Forget the kept files: the plan takes files and nothing else", () => {
  const { groups } = seeded(), g = by(groups(), "file:family.ged"), p = W.removalPlan(g, "files");
  assert.deepEqual(p.files, ["family.ged"]); assert.deepEqual(p.keys, [], "no canvas record and no view is named");
  assert.deepEqual(p.n, { files: 1, canvases: 0, views: 0 });
  assert.equal(W.removalWords(p.n), "the kept file");
  assert.deepEqual(W.removalPlan(by(groups(), "archive:booyzen"), "files").files, [], "an archive has no file to forget");
});

test("a card's Remove: its file, where you left off and ITS views, never another tree's", () => {
  const { groups } = seeded(), p = W.removalPlan(by(groups(), "file:family.ged"), "all");
  assert.deepEqual(p.files, ["family.ged"]);
  assert.deepEqual([...p.keys].sort(), ["f:family.ged|900|3", "v:v1", "v:v2"].sort());
  assert.deepEqual(p.n, { files: 1, canvases: 1, views: 2 });
  assert.equal(W.removalWords(p.n), "the kept file, where you left off and 2 saved views");
  assert.equal(p.keys.includes("v:v3"), false, "another file's view is not named");
  assert.equal(W.removalWords({ files: 0, canvases: 0, views: 1 }), "1 saved view");
  assert.equal(W.removalWords({ files: 0, canvases: 0, views: 0 }), "", "nothing to take says nothing");
  assert.equal(W.removalWords({ files: 2, canvases: 3, views: 1 }), "2 kept files, where you left off on 3 trees and 1 saved view");
});

test("removeKeys takes the records out in one write and dates every deletion; the other trees are untouched", () => {
  const { st, groups } = seeded(), p = W.removalPlan(by(groups(), "file:family.ged"), "all");
  assert.equal(W.removeKeys(p.keys, st, T0 + 100), 3);
  assert.deepEqual(W.list(st).map(r => r.k), ["a:booyzen"], "the file's canvas is gone, the archive's stays");
  assert.deepEqual(W.listViews(st).map(v => v.k), ["v:v3"], "its views are gone, the other file's view stays");
  const gone = JSON.parse(st.getItem(W.KEY)).gone;
  assert.deepEqual(Object.keys(gone).sort(), ["f:family.ged|900|3", "v:v1", "v:v2"].sort());
  assert.ok(Object.values(gone).every(d => d === new Date(T0 + 100).toISOString()));
  const g2 = W.groupTrees([{ name: "other.ged", when: 1 }], W.list(st), W.listViews(st));
  assert.deepEqual(g2.map(x => x.id).sort(), ["archive:booyzen", "file:other.ged"], "the card is gone from the list");
  assert.equal(W.removeKeys(["v:zzz"], st, T0 + 101), 0, "a key that is not there removes nothing");
});

test("Clear this whole list: every card's files, canvases and views, counted", () => {
  const { groups, st } = seeded(), p = W.removalPlanAll(groups(), "all");
  assert.equal(p.trees, 3); assert.deepEqual(p.n, { files: 2, canvases: 2, views: 3 });
  assert.equal(W.removalWords(p.n), "2 kept files, where you left off on 2 trees and 3 saved views");
  assert.deepEqual(p.files.sort(), ["family.ged", "other.ged"]);
  assert.equal(W.removeKeys(W.allKeys(st), st, T0 + 200) > 0, true);
  assert.deepEqual(W.allKeys(st), []); assert.deepEqual(W.groupTrees([], W.list(st), W.listViews(st)), []);
  assert.equal(W.removalPlanAll(groups(), "files").keys.length, 0, "forgetting files across the list names no record either");
});

test("a removal is not undone by an older copy from another device, and is by a newer one", () => {
  const { st, groups } = seeded(), theirs = JSON.parse(st.getItem(W.KEY));      // the other device's copy, from before the removal
  W.removeKeys(W.removalPlan(by(groups(), "file:family.ged"), "all").keys, st, T0 + 500);
  const merged = RF.mergeCanvas(JSON.parse(st.getItem(W.KEY)), theirs);
  assert.equal("f:family.ged|900|3" in merged.items, false, "the canvas stays removed");
  assert.equal("v:v1" in merged.items || "v:v2" in merged.items, false, "and so do its views");
  assert.ok("v:v3" in merged.items && "a:booyzen" in merged.items, "what was not removed stays");
  /* a change made on the other device AFTER the removal is a newer record and does win: it is the visitor's own later work */
  const later = JSON.parse(JSON.stringify(theirs)); later.items["v:v1"].upd = new Date(T0 + 900).toISOString();
  assert.ok("v:v1" in RF.mergeCanvas(JSON.parse(st.getItem(W.KEY)), later).items);
  /* the cleaned copy that goes online keeps the dated deletions */
  const out = RF.cleanCanvas(JSON.parse(st.getItem(W.KEY)));
  assert.ok(out.gone["v:v1"] && out.gone["f:family.ged|900|3"]);
});

test("a tree that is opened and saved again after its removal comes back as new work, and its old deletion mark is dropped", () => {
  const { st } = seeded(); W.removeKeys(["a:booyzen"], st, T0 + 300);
  assert.equal(W.get("a:booyzen", st), null);
  W.put(W.makeRecord(A, "Booyzen archive", plain(), T0 + 400), st);
  assert.ok(W.get("a:booyzen", st)); assert.equal("a:booyzen" in JSON.parse(st.getItem(W.KEY)).gone, false);
});

test("blocked storage: the removal says so (-1) instead of pretending", () => {
  const st = seeded().st; st.setItem = () => { throw new Error("full"); };
  assert.equal(W.removeKeys(["a:booyzen"], st, T0), -1);
});

/* ---- the page ---- */
const astro = read("../src/pages/tree-canvas/index.astro"), app = read("../public/tree-canvas/app.js"), css = read("../public/tree-canvas/page.css");

test("the opening page keeps every id its script uses, and the controls say what they do", () => {
  for (const id of ["stDrop", "stOpen", "stFile", "stLink", "stUrl", "stGo", "stLinkMsg", "stArch", "stArchBtns", "stDemo", "stDemoMap", "stKeep", "stKeepBtn", "stKeepSt", "stFixSaved", "stRecent", "stList", "stForget", "stClear", "stAsk", "stSettings", "stRoots", "stHelp", "stCur", "yfRecent", "yfList", "yfForget", "yfClear", "yfAsk", "yfCompass"])
    assert.ok(astro.includes('id="' + id + '"'), id);
  assert.match(astro, /id="stForget"[^>]*>Forget the kept files</); assert.match(astro, /id="stClear"[^>]*>Clear this whole list/);
  assert.match(astro, /Only forgets the kept copies of your files|Forgets only the kept copies of your files/, "the button says it is files only");
  assert.match(astro, /id="stOpen"/); assert.equal((astro.match(/class="stbtn primary big"/g) || []).length, 1, "one big primary action");
  assert.match(astro, /<details class="stfold stlinksec" id="stLink">/, "the link box is folded away");
  assert.match(astro, /Watch a family move across the map/);
  assert.match(astro, /id="stKeepBtn"[^>]*href=\{u\("\/backup\/#canvas"\)\}/, "Keep your work still goes to Connection & Backup");
  assert.match(astro, /Nothing from your tree is sent to it/, "the privacy copy is still there");
});

test("Compass can be opened from the start page: the invented family, and a card of every kind", () => {
  assert.match(app, /\$\('#stDemoMap'\)\.onclick = \(\) => \{ example = true; start\([^;]*'compass'\)/);
  assert.match(app, /if \(openTo === 'compass'\) \{ openTo = null; openCP\(null\); \}/, "Compass opens once the canvas is mounted");
  assert.match(app, /if \(m\.kind === 'tree' && openTo === 'fix'\) openTo = null;/, "a tree.json still lands on Compass (it has no Fix list, only that is dropped)");
  assert.match(app, /acts\.append\(btn\('trbtn', 'Compass'[^\n]*reopen\(g, 'compass'\)/, "every card has the button");
  assert.match(app, /async function reopenSrc\(src, kept, to\)/); assert.match(app, /openArchive\(src\.ref, to\)/); assert.match(app, /openLink\(src\.ref, false, to\)/);
  assert.match(app, /if \(to === 'compass'\) openCP\(null\);/, "an archive opens on Compass too");
  assert.match(app, /pickTo = to \|\| null;/, "a file that is not kept still lands on Compass once chosen");
  assert.match(app, /start\(bytes, f\.name, undefined, undefined, to\)/);
  assert.doesNotMatch(read("../public/tree-canvas/compass-view.js") + read("../public/tree-canvas/compass-model.js"), /stDemoMap|reopenSrc/, "Compass itself is not touched");
});

test("each removal control does what it says, asks before it takes saved work, and says what went", () => {
  assert.match(app, /\$\('#stForget'\)\.onclick = \$\('#yfForget'\)\.onclick = \(\) => forgetFiles\(\);/);
  const f = /async function forgetFiles[\s\S]*?\n}\n/.exec(app)[0];
  assert.match(f, /recentForget\(\)/); assert.doesNotMatch(f, /W\.remove|removeKeys/, "forgetting files never touches a canvas or a view");
  assert.match(f, /Your saved views and where you left off are still here/, "and says that they are");
  assert.match(f, /nothing to forget/, "no silent no-op");
  const r = /function askRemove[\s\S]*?\n}\n/.exec(app)[0];
  assert.match(r, /W\.removalWords\(all\.n\)/); assert.match(r, /It cannot be undone/); assert.match(r, /Only forget the file/);
  assert.doesNotMatch(r, /W\.removeKeys|W\.remove\(/, "asking removes nothing; only the confirm button does");
  assert.match(app, /function askClear[\s\S]*?Clear this whole list\? This takes/);
  const d = /async function doRemove[\s\S]*?\n}\n/.exec(app)[0];
  assert.match(d, /W\.removeKeys\(plan\.keys\)/); assert.match(d, /ra-progress-changed/, "My research and the six-word copy are told");
  assert.match(d, /cur\.dirty = false/, "an open tree's pending save does not bring the removed record back");
  assert.match(app, /Delete the view ' \+ v\.name \+ ' \(asks once more\)/); assert.match(app, /del\.textContent = 'Delete\?'/, "a view still asks once");
  assert.doesNotMatch(app.replace(/async function recentForget[\s\S]*?\n}\n/, ""), /await recentForget\(\);\s*drawLists\(\);\s*\}\);/, "no bare, unexplained forget left on a card");
});

test("the page stays quiet about motion and keeps its colours accessible", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #start \*, #yf \* \{ transition: none !important; animation: none !important; \} \}/);
  const mo = css.indexOf("@media (prefers-reduced-motion: no-preference) {\n  .stdrop .stup"), end = css.indexOf("/* your trees */");
  assert.ok(mo > 0 && end > mo, "the drop zone's motion sits in one no-preference block");
  for (const k of ["stbob", "stjump"]) { const at = css.indexOf("@keyframes " + k); assert.ok(at > mo && at < end, k + " is inside the no-preference block"); }
  assert.match(css, /--btn: #a9520a/); assert.match(css, /\.stbtn\.primary \{ background: var\(--btn, var\(--accent\)\)/);
  assert.doesNotMatch(css, /url\((?!\/tree-canvas\/fonts\/)(?!["']?data:)/, "no image or font from anywhere else");
  assert.equal(/<img|style="/.test(astro.split("</head>")[1] || astro), false, "no image and no inline style (the page's policy allows none)");
});
