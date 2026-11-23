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

test("resetSearch is not mistaken for typing and gives the caret back", () => {
  const fn = src.slice(src.indexOf("function resetSearch()"), src.indexOf("function readDone()") > -1 ? src.indexOf("/* \"Reading what you wrote") : undefined);
  assert.match(fn, /resetting = true/, "the empty value sent to the map's search is marked");
  assert.match(fn, /setSelectionRange\(a, b/, "the caret and selection go back where they were");
  assert.match(src, /q\.addEventListener\("input", function \(e\) \{\s+if \(resetting\) return;/, "our own listener ignores the marked event, so the story is not cleared on every key");
});

test("starting a story closes the place card the first words opened, and the save panel is plain", () => {
  const fn = src.slice(src.indexOf("function resetSearch()"), src.indexOf("function read()"));
  assert.match(fn, /#ra-body \.at-h h3/, "the place card heading is compared with what was typed");
  assert.match(fn, /ra-sheet-x/, "the map's own close button closes it");
  const sd = readFileSync(new URL("../src/components/StoryDrawer.astro", import.meta.url), "utf8");
  assert.match(sd, /<a href=\{u\("\/my-research\/#story"\)\}>My story<\/a>/, "My story is a link");
  assert.doesNotMatch(sd, /Roots &amp; Routes/, "the tree page is called the Tree Canvas");
});

test("a story on the map stands alone, and the card does not repeat the words", () => {
  assert.doesNotMatch(src, /mk\("p", "rs-words"/, "the box grows to show the words, so the card does not echo them");
  const map = readFileSync(new URL("../src/components/RecordMap.astro", import.meta.url), "utf8");
  assert.match(map, /storyQuiet = !!storyCcs/, "the map goes quiet when the story reports its countries");
  assert.match(map, /if \(storyQuiet\) want = false;/, "the shelf and clusters are not drawn while it is quiet");
  assert.match(map, /if \(storyQuiet\) \{\s+LAYERS\.concat/, "the other layers step off the map");
});

test("the one box is a growing text box in the mock-up's shape: 50px, 16px radius, Fraunces 17px", () => {
  const map = readFileSync(new URL("../src/components/RecordMap.astro", import.meta.url), "utf8");
  assert.match(map, /<textarea id="ra-q" rows="1"/, "a text box that can grow, not a one-line input");
  assert.doesNotMatch(map, /<input id="ra-q"/);
  assert.match(map, /\.ra-bar-find \{ --ra-ctl: 50px; align-items: flex-start; \}/, "one height for the box and the buttons, level with the first line");
  assert.match(map, /\.ra-bar-find #ra-q \{[^}]*font: 400 17px\/1\.45 var\(--serif\)[^}]*border-radius: 16px/);
  assert.match(src, /function grow\(\) \{ q\.style\.height = "auto"/, "it grows with what is written");
  assert.match(src, /e\.key === "Enter" && !e\.isComposing && \(!e\.shiftKey \|\| !looksLikeStory\(q\.value\)\)\) e\.preventDefault\(\)/, "Enter searches; it never adds a line to a place search");
  assert.match(src, /top:calc\(var\(--ra-ctl,38px\) \/ 2\)/, "the + and the Story badge stay on the first line");
});
