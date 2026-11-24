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

test("the story page draws the gaps as pills inside the story box: a count, one answer line for the open pill, and a word when one is found", () => {
  const js = src("story-page.js"), page = read("../src/pages/read.astro");
  assert.match(js, /Add a clue/);
  assert.match(js, /sp-pill/);
  assert.match(page, /<ul class="sp-shots"[^\n]*\n\s*<div class="sp-gaps" id="sp-gaps"/, "the clues sit inside the story box, under the words");
  assert.match(js, /found"|clues found/);
  assert.match(js, /G\.answer\(text\.value, g\.add, value\)/);
  assert.match(js, /clueReset\(\)/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\)[^}]*sp-dots i\.on/);
});

test("a surname told the way a Facebook post tells it (maiden name, «Surname X», obitelj X, a bare name) is a name, so the page asks for the first name and not «do you know their name?»", () => {
  const ids = (t) => G.gaps({ stops: [{ word: "senj" }] }, t, { place: () => false }).map((g) => g.id);
  [
    "My grandmother was born in Senj in 1921. Her maiden name was Kauzlarić. Does anyone know this family?",
    "Tražim obitelj Mažuranić iz Senja, otišli su u Ameriku oko 1900.",
    "My great grandparents came from Senj to Cleveland. Surname Rukavina.",
    "Kauzlarić Kauzlarić anyone from this name??",
    "My mother née Horvat came from Senj",
  ].forEach((t) => { assert.ok(ids(t).includes("given"), t); assert.ok(!ids(t).includes("name"), t); });
  assert.ok(ids("I came from Senj and it was hot").includes("name"), "a story with no name still asks for one");
});

test("a bare gazetteer name takes the gazetteer's first (largest) place before the index's bare rows: Dresden is the city in Germany", () => {
  const map = { dresden: [{ i: "dresden-us-1", n: "Dresden", cc: "US", y: 40.1, x: -82, c: 0 }, { i: "dresden-ca-2", n: "Dresden", cc: "CA", y: 42.6, x: -82.2, c: 0 }] };
  F.gazMerge(map, { ph: "dresden", ccs: null, more: true }, [["Dresden", 51.05, 13.74, "DE", ["Dresda"]], ["Dresden", 40.12, -82.01, "US", []]]);
  assert.equal(map.dresden[0].cc, "DE");
  assert.ok(map.dresden.some((r) => r.cc === "US" && r.i === "dresden-us-1"), "the index's rows stay as the other readings");
});

/* THE STORY READ BACK WITH ITS NAMES AND PLACES AS PILLS. David: «"my fathers name was ivan", can we flash/pill "ivan" and on tap show some things to ask?» */
test("tokens: the names and places the reader found are spans in the words as typed, once each, never overlapping", () => {
  const p = { rel: "", people: [{ role: "self", name: "Ivan" }, { role: "father", name: "Ivan" }, { role: "spouse", name: "Cheryl" }], siblings: [{ rel: "brother", name: "Robert", label: "his brother" }], stops: [{ word: "croatia", isCountry: true }, { word: "johannesburg" }, { word: "brisbane" }] };
  const t = "my fathers name was ivan. he came from croatia, via johannesburg and then moved to brisbane in 2019. His wife was Cheryl and a brother Robert.";
  const k = G.tokens(t, p);
  assert.deepEqual(k.map((x) => x.word), ["ivan", "johannesburg", "brisbane", "Cheryl", "Robert"], "a whole country is not pilled; each word once");
  assert.equal(k[0].ref, "my father", "the same name as the story's person and as «my father»: the relation is kept");
  for (let i = 1; i < k.length; i++) assert.ok(k[i].start >= k[i - 1].end);
});

test("what can be added about a person or a place becomes a sentence in that person's own words", () => {
  assert.equal(G.sentence("person", "my father", "born", "1951, Senj"), "My father was born in 1951, Senj.");
  assert.equal(G.sentence("person", "Cheryl", "married", "Ivan, 1980."), "Cheryl married Ivan, 1980.");
  assert.equal(G.sentence("person", "Ivan", "father", "Mate"), "Ivan's father was Mate.");
  assert.equal(G.sentence("place", "Brisbane", "when", "1975"), "Brisbane: they were there in 1975.");
  assert.equal(G.sentence("person", "Ivan", "born", "  "), "", "nothing typed adds nothing");
  assert.ok(G.about("person").some((o) => o.id === "died") && G.about("place").some((o) => o.id === "what"));
});

test("the story is ONE box: names and places are marked in the words being typed, and a tap on one opens what to add", () => {
  const js = src("story-page.js"), page = read("../src/pages/read.astro");
  assert.match(js, /G\.tokens\(raw, p\)/);
  assert.match(js, /createElement\("mark"\)/, "the marks are drawn behind the textarea");
  assert.match(js, /text\.addEventListener\("click"/, "a tap with the caret in a marked word opens its panel");
  assert.doesNotMatch(js, /el\("p", null, "sp-told"\)/, "no second read-back paragraph");
  assert.match(js, /PERSONAL = \/\^\(\?:name\|given\|surname\|rel\|maiden\)\$\//);
  assert.match(page, /id="sp-mirror"/);
  assert.match(page, /\.sp-mirror mark \{/);
});

test("the buttons sit below the box, the places section has no visible title, and the play bar is on the map", () => {
  const page = read("../src/pages/read.astro");
  const drop = page.slice(page.indexOf('id="sp-drop"'), page.indexOf('class="sp-under"'));
  assert.doesNotMatch(drop, /class="sp-row"/, "the button row is outside the dashed box");
  assert.match(page, /class="sp-under"[\s\S]*class="sp-row"[\s\S]*id="sp-eg"/);
  assert.match(page, /<h2 id="sp-places-h" class="sp-sr">/);
  assert.match(page, /class="sp-mapwrap">\s*<div class="sp-map" id="sp-map"[\s\S]*?<div class="sp-time" id="sp-time"/);
  assert.match(page, /\.sp-time \{ position: absolute;/);
});

test("a place's era list shows only the eras of the stay, with a way to open the rest", () => {
  const js = src("story-engine.js");
  assert.match(js, /data-extra/);
  assert.match(js, /Who held this ground while they were there/);
  assert.match(js, /lf-eras-more/);
  assert.match(js, /function stay\(y, i\)/);
});

test("with a name or a place in the story the page shows only the pills in the words, and a person's pill offers religion and travel", () => {
  const js = src("story-page.js");
  assert.match(js, /if \(toks\.length\) return;\s*\n\s*var head = el\("div", null, "sp-gaps-top"\)/);
  const ids = G.about("person").map((o) => o.id);
  for (const id of ["born", "died", "faith", "travelled", "siblings"]) assert.ok(ids.includes(id), id);
  assert.equal(G.sentence("person", "my father", "faith", "Catholic"), "My father was Catholic.");
});
