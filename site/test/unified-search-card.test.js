/* The map's one search box (public/js/unified-search.js): a story reads into a card of sections, the empty box offers three doors, and Esc steps back. The behaviour was
   also run in a real browser against a stand-in reader; these lines keep the parts that must not be lost. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../public/js/unified-search.js", import.meta.url), "utf8");

test("a story is a card of sections (who, journey, also, work, told), each chip still presses the panel's own chip", () => {
  for (const h of ["Who", "Journey", "Also", "Work", "Told"]) assert.ok(src.includes('["' + h + '"'), h + " is a section");
  assert.match(src, /var o = src\.children\[i\]; if \(o\) o\.click\(\)/, "a chip presses the panel's chip");
  assert.match(src, /raStoryBox\.clear\(\)/, "the × takes the story off the map");
  assert.doesNotMatch(src, /ra-pill-mode|ra-pill-add|ra-pill-edit/, "the old pile of pills is gone");
});

test("the empty box offers three doors, and the story one opens the story panel", () => {
  assert.match(src, /id = "ra-doors"/);
  for (const d of ['data-d="find"', 'data-d="story"', 'data-d="photo"']) assert.ok(src.includes(d), d);
  assert.match(src, /w === "story"\)\s*\{ if \(window\.raStoryBox\) window\.raStoryBox\.open\(\)/);
  assert.match(src, /doors\.addEventListener\("mousedown", function \(e\) \{ e\.preventDefault\(\); \}\)/, "pressing a door does not take the focus off the box first");
});

test("Esc steps back one level: the card folds, the typing and the story stay", () => {
  assert.match(src, /e\.key === "Escape" && storyMode\) \{ e\.stopImmediatePropagation\(\); compact = true/);
  assert.match(src, /if \(compact\) compact = false;\s+\/\* typing opens the card again/);
});

test("a story is read when the typing pauses, not every 0.8 s while it goes", () => {
  assert.match(src, /tmr = setTimeout\(read, \/\[\\s,\.;!\?\]\$\/\.test\(q\.value\) \? 600 : 900\)/, "a pause of 0.9 s reads it, 0.6 s after a finished word or sentence");
  assert.doesNotMatch(src, /now - lastRead > 800/, "no read in the middle of a sentence");
  assert.match(src, /e\.key === "Enter" && looksLikeStory\(q\.value\)\) \{[^}]*read\(true\)/, "Enter reads it at once");
});

test("typing does not flash the Reading card or redraw the map for words already read", () => {
  const input = src.slice(src.indexOf('q.addEventListener("input"'), src.indexOf('q.addEventListener("keydown"'));
  assert.doesNotMatch(input, /thinking = true/, "no Reading card on a key press");
  assert.match(src, /if \(t === lastText && !force\) return;/, "the same words are not read twice");
  assert.match(src, /setTimeout\(function \(\) \{ thinking = true; mirror\(\); \}, 400\)/, "Reading shows only if a read is still going after 0.4 s");
  const drawer = readFileSync(new URL("../public/js/story-drawer.js", import.meta.url), "utf8");
  assert.doesNotMatch(drawer, /setText: function \(t\) \{[^\n]*lastSig = ""/, "setText keeps the signature, so an unchanged story is not drawn again");
});
