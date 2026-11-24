/* One story page, and it asks for what is missing as you type. The old /looking-for/ page is a redirect that keeps already-sent links working. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const src = (f) => read("../public/js/" + f);
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const A = load("atlas-summary.js");
const F = load("story-engine.js", { summary: A });
const G = load("story-gaps.js");
const L = load("story-link.js");

let k = 0;
const P = (n, cc, x, y) => ({ i: n.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + cc + "-" + (++k), n, cc, c: 5, x, y });
const rows = [P("Fužine", "HR", 14.7, 45.3), P("Pittsburgh", "US", -80, 40.4), P("Cork", "IE", -8.4, 51.9), P("Boston", "US", -71, 42.3)];
const given = ["Ivan", "Maria", "Anna"].map((n) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
const ctx = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries: { HR: "Croatia", US: "United States of America", IE: "Ireland" } };
const ids = (t, o) => G.gaps(F.parseStory(t, ctx, o && o.files ? "photo" : null), t, o).map((g) => g.id);

test("a story that names who, where, to where and when is not asked for those again", () => {
  const got = ids("My great-grandfather Ivan Kauzlarić came from Fužine to Pittsburgh around 1928. All I have is this photo.", { files: 0 });
  for (const done of ["from", "village", "name", "surname", "given", "to", "when", "rel", "holds"]) assert.ok(!got.includes(done), done + " was answered");
  assert.ok(got.includes("faith") && got.includes("family") && got.includes("ship") && got.includes("end"), "the deeper questions come after");
});

test("a thin story is asked first for what unlocks the most: the place, the name, the other end, the year", () => {
  const got = ids("My grandmother Anna came from Cork.");
  assert.deepEqual(got.slice(0, 5), ["surname", "to", "when", "holds", "maiden"]);
  const none = ids("My grandfather was a miner.");
  assert.equal(none[0], "from", "no place at all: where did they start comes first");
});

test("a country is not a village, a woman is asked her birth name, and a told birth name is not asked again", () => {
  assert.ok(ids("Kauzlarić from Croatia").includes("village"));
  assert.ok(ids("My grandmother Anna came from Cork.").includes("maiden"));
  assert.ok(!ids("My grandmother Anna, née Horvat, came from Cork.").includes("maiden"));
  assert.ok(!ids("My grandfather Ivan came from Cork.").includes("maiden"), "only for a woman");
});

test("a surname told on its own is not asked for again: the first name is, because that is what lets the page read it", () => {
  const t = "My ancestor Kauzlarić came from Fužine, Croatia to Pittsburgh around 1928.";
  const place = (w) => !!ctx.map[A.fold(w)];
  const got = G.gaps(F.parseStory(t, ctx, null), t, { place }).map((g) => g.id);
  assert.ok(!got.includes("name"), "the name was just told");
  assert.equal(got[0], "given");
  const eg = G.gaps(F.parseStory("My grandfather Cork came from Boston.", ctx, null), "My grandfather Cork came from Boston.", { place });
  assert.ok(eg.some((g) => g.id === "name"), "a place is not taken for a surname");
  assert.ok(G.gaps({}, "The Horvat family came from somewhere", {}).some((g) => g.id === "given"));
});

test("a photo already added counts, and an answer in the words removes its question", () => {
  assert.ok(ids("My grandfather Ivan came from Cork to Boston in 1905.").includes("holds"));
  assert.ok(!ids("My grandfather Ivan came from Cork to Boston in 1905.", { files: 1 }).includes("holds"));
  assert.ok(!ids("My grandfather Ivan came from Cork to Boston in 1905. He sailed from Liverpool.").includes("ship"));
  assert.ok(!ids("My grandfather Ivan came from Cork to Boston in 1905. He died in Boston.").includes("end"));
});

test("a tap adds a new sentence start for the reader to finish, never fills anything in", () => {
  assert.equal(G.append("My grandfather came from Cork", " They left around "), "My grandfather came from Cork. They left around ");
  assert.equal(G.append("My grandfather came from Cork.", " They left around "), "My grandfather came from Cork. They left around ");
  assert.match(G.append("", " They came from "), /^My ancestor came from $/);
  for (const g of G.gaps({}, "some words about someone", {})) assert.ok(!/[A-Z][a-z]+ [A-Z][a-z]+/.test(g.add), "no name is ever put in: " + g.id);
});

test("an old /looking-for/ link becomes a sentence the story reader understands", () => {
  const s = L.sentenceFromOld("#surname=Kauzlarić&from=Fužine,%20Croatia&to=Pittsburgh&left=1928&holds=photo");
  assert.equal(s, "My ancestor Kauzlarić came from Fužine, Croatia to Pittsburgh around 1928. All I have is a photo.");
  const p = F.parseStory(s, ctx, null);
  assert.equal(p.from.row.n, "Fužine");
  assert.equal(p.to.row.n, "Pittsburgh");
  assert.equal(p.left, 1928);
  assert.equal(L.sentenceFromOld("#"), "");
  assert.equal(L.sentenceFromOld("#story"), "");
  assert.equal(L.sentenceFromOld("#from=" + encodeURIComponent("<script>x</script>")).includes("<"), false);
});

test("the words ride after the #, are cut to a length an address can hold, and round-trip", () => {
  const t = "My grandfather Ivan came from Cork. He was a stonemason; “Ivo” to everyone.";
  const h = L.hashFor(t);
  assert.ok(h.hash.startsWith("#story=") && !h.cut);
  assert.equal(L.textFromHash(h.hash), t);
  assert.equal(L.hashFor("x".repeat(L.MAX + 50)).cut, true);
  assert.equal(L.textFromHash("#story"), "");
  assert.equal(L.textFromHash("#story=%E0%A4%A"), "", "a broken address gives nothing, not an error");
});

test("the story page loads the gaps and the link readers, draws the box, and the old page only redirects", () => {
  const page = read("../src/pages/read.astro"), js = src("story-page.js"), old = read("../src/pages/looking-for.astro");
  for (const f of ["story-link.js", "story-gaps.js"]) assert.ok(page.indexOf(f) > 0 && page.indexOf(f) < page.indexOf("story-page.js"), f + " loads before the page script");
  assert.match(page, /id="sp-gaps"/);
  assert.match(js, /raStoryGaps/);
  assert.match(js, /textFromHash\(location\.hash\)/);
  assert.doesNotMatch(js + src("story-gaps.js") + src("story-link.js"), /innerHTML\s*=/, "words go in as text, never as markup");
  assert.doesNotMatch(src("story-link.js"), /location\.search/, "nothing rides in the query string");
  assert.match(old, /location\.replace\(to\)/);
  assert.ok(!fs.existsSync(path.join(here, "../public/js/looking-for.js")), "the old page's script is gone");
  assert.match(page, /\^#story=/, "the tab picker leaves words in the address for the page to read");
});

test("nothing in the menu, the front door or the start page still points at the old page", () => {
  for (const f of ["../src/lib/nav.js", "../public/js/front-door-v2.js", "../src/lib/start-tour-markup.js", "../src/pages/start.astro", "../src/pages/sitemap-index.xml.js"])
    assert.doesNotMatch(read(f), /looking-for/, f);
});

test("every gap id has a short clue name, and an inline answer is added as a finished sentence, never into the middle of one", () => {
  const ids = ["from", "village", "name", "given", "surname", "to", "when", "rel", "holds", "maiden", "faith", "family", "ship", "end"];
  ids.forEach((id) => assert.ok(G.clue(id)[0] && G.clue(id)[0] !== id, "clue name for " + id));
  assert.equal(G.answer("My grandfather came from Senj.", " They left around ", "1905"), "My grandfather came from Senj. They left around 1905.");
  assert.equal(G.answer("My grandfather came from Senj", " They went to ", "  Chicago.. "), "My grandfather came from Senj. They went to Chicago.");
  assert.equal(G.answer("Text.", " They went to ", "   "), "Text.", "an empty answer adds nothing");
});

test("the story page draws the gaps as a hunt: a count, a box on each clue, and a word when one is found", () => {
  const js = src("story-page.js"), page = read("../src/pages/read.astro");
  assert.match(js, /Clues to find/);
  assert.match(js, /found"/);
  assert.match(js, /G\.answer\(text\.value, g\.add, value\)/);
  assert.match(js, /clueReset\(\)/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)[^}]*sp-dots i\.on/);
});
