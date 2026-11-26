/* THE FAMILY FIRST (story-family.js and the story page it arranges): the family as the selector, the three searches to do first, the chart of which book covers which
   years, and the promise that nothing the page had before is gone. Every person, place and book here is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const js = (f, m) => { new Function("module", src("public/js/" + f))(m); return m.exports; };
const A = js("atlas-summary.js", { exports: {} }), E = js("story-engine.js", { exports: {}, deps: { summary: A } }), T = js("story-todo.js", { exports: {} }), F = js("story-family.js", { exports: {} });
const page = src("src/pages/read.astro"), pageJs = src("public/js/story-page.js"), famJs = src("public/js/story-family.js"), todoJs = src("public/js/story-todo.js"), engineJs = src("public/js/story-engine.js");

const book = (title, from, to, kinds, url) => ({ title, from, to, kinds, url: url || "https://example.org/" + encodeURIComponent(title), access: "free" });
const place = (name, cols, extra) => Object.assign({ name, href: "/place/" + name.toLowerCase() + "/", lat: 45, lon: 14, cols }, extra || {});

/* ---- the family is the selector ------------------------------------------------------------------------------------------------------ */
const self = { role: "self", rel: "grandfather", name: "Oren Valdic" }, father = { role: "father", name: "Stip Valdic" }, mother = { role: "mother", name: "Dora Penn" };
const sib = { role: "sibling", name: "Petra" }, silent = { role: "father", name: "" };
const ITEMS = [
  { title: "The parents’ marriage", who: [father, mother], steps: [{ title: "Marriage entry", why: "Both families.", href: "/place/x/", ev: { kind: "m", w: [1890, 1900] } }] },
  { title: "Oren Valdic", who: [self], steps: [{ title: "Birth or baptism entry · 1902", why: "Parents.", href: "/place/x/", ev: { kind: "b", w: [1902, 1902] } }, { title: "Death or burial", why: "Age.", ev: { kind: "d", w: null } }, { title: "Whether they are alive", why: "No search." }] },
  { title: "The sister", who: [{ rel: "sister", name: "Petra" }], steps: [{ title: "Her baptism", why: "Same books.", href: "/place/x/", ev: { kind: "b", w: [1900, 1910] } }] },
  { title: "Someone the tree does not draw", who: [], steps: [{ title: "Their papers", why: "At home." }] }
];

test("each part of the plan goes to the people it is about, a brother or sister by name, and what is about nobody drawn is kept", () => {
  const by = F.assign([self, father, mother, sib], ITEMS);
  assert.deepEqual(by.by.map((l) => l.map((i) => i.title)), [["Oren Valdic"], ["The parents’ marriage"], ["The parents’ marriage"], ["The sister"]]);
  assert.deepEqual(by.loose.map((i) => i.title), ["Someone the tree does not draw"]);
  assert.equal(F.isAbout({ rel: "sister", name: "Ana" }, sib), false, "another sister is not this one");
  assert.deepEqual(F.helpsOf(ITEMS[0]), ["Stip Valdic", "Dora Penn"]);
  assert.equal(F.nameOf({ role: "father", name: "" }), "Father", "an unnamed person is called by what they are");
  assert.equal(F.nameOf({ role: "self", me: true }), "You");
});

test("a life is laid out in the order of its years, what has no year last, and an estimate says so", () => {
  const line = F.lifeLine(F.stepsOf([ITEMS[1], ITEMS[0]]));
  assert.deepEqual(line.map((x) => x.step.title), ["Marriage entry", "Birth or baptism entry · 1902", "Death or burial", "Whether they are alive"]);
  assert.equal(F.yearLabel({ ev: { w: [1890, 1900], est: true } }), "about 1890–1900");
  assert.equal(F.yearLabel({ ev: { w: [1920, 1920], by: true } }), "by 1920");
  assert.equal(F.yearLabel({ ev: { w: null } }), "");
});

test("the map follows a relative with places of their own, and the whole family otherwise", () => {
  const senj = { name: "Senj" }, facts = { route: [{ info: { name: "Rab" }, role: "born", year: 1902 }], born: 1902, kin: [{ name: "Stip Valdic", label: "your father", stops: [{ info: senj, role: "born", year: 1870 }] }] };
  const own = F.mapFacts(facts, father);
  assert.deepEqual(own.route.map((s) => [s.info.name, s.year]), [["Senj", 1870]]);
  assert.equal(own.born, 1870);
  assert.deepEqual(own.kin, []);
  assert.equal(F.mapFacts(facts, self), null, "the story's own person is the story's own route");
  assert.equal(F.mapFacts(facts, mother), null, "no place told: the whole family, and the page says so");
  assert.equal(F.mapFacts(facts, silent).born, 1870, "a father the story does not name is still «your father»");
  assert.equal(F.mapFacts(facts, { role: "spouse", name: "" }), null);
});

/* ---- the three to do first ----------------------------------------------------------------------------------------------------------- */
test("three searches are chosen for the family as a whole: different, tagged with whom they help, and never «are they alive»", () => {
  const three = F.chooseThree(ITEMS, 3);
  assert.equal(three.length, 3);
  assert.equal(three[0].step.title, "Marriage entry", "what helps two people comes first");
  assert.deepEqual(three[0].helps, ["Stip Valdic", "Dora Penn"]);
  assert.equal(new Set(three.map((t) => t.item.title)).size, 3, "three parts of the family, while there are three");
  assert.ok(!F.chooseThree(ITEMS, 9).some((t) => t.step.title === "Whether they are alive"));
  assert.equal(F.chooseThree([ITEMS[1]], 3).length, 2, "one person alone still gets the searches there are");
  assert.deepEqual(F.chooseThree([], 3), []);
});

test("«Nothing there» says what to try next: the step's own words first, then by the kind of record", () => {
  assert.equal(F.fallback({ detail: "Read it. If nothing turns up: try the civil register." , ev: { kind: "b" } }), "Try the civil register.");
  assert.match(F.fallback({ ev: { kind: "b" } }, ["Lun (4 km)"]), /years either side, the books of Lun \(4 km\)/);
  assert.match(F.fallback({ ev: { kind: "m" } }), /partner’s parish/);
  assert.match(F.fallback({ ev: { kind: "d" } }), /gravestones/);
});

test("ticks are remembered by the page only: nothing is written to the browser's storage", () => {
  assert.doesNotMatch(famJs, /localStorage|sessionStorage|indexedDB|document\.cookie|raProgress|\bfetch\(/);
  assert.match(page, /A tick stays on this page only/);
});

/* ---- which book covers these years ------------------------------------------------------------------------------------------------- */
const HOME = place("Veli", [book("Births 1812-1854", 1812, 1854, ["b"]), book("Births 1850-1880", 1850, 1880, ["b"]), book("Births 1900-1910 Marriages 1840-1899", 1840, 1910, ["b", "m"]), book("Deaths 1700-1800", 1700, 1800, ["d"])]);
const NEAR = [{ km: 4.2, info: place("Mali", [book("Births 1623-1700", 1623, 1700, ["b"])]) }, { km: 9, info: place("Drugi", [book("Births 1815-1900", 1815, 1900, ["b"])]) }];
const stepFor = (w, kind) => ({ title: "x", ev: { kind: kind || "b", w, info: HOME, near: NEAR } });

test("a book that does not cover the wanted years is never presented as covering them", () => {
  const c = F.chart(stepFor([1623, 1660]), E.spansOf, []);
  const home = c.rows[0];
  assert.equal(home.name, "Veli");
  assert.ok(home.bars.every((b) => b.covers === false && b.has === null), "1812–1854 does not cover 1623");
  assert.equal(c.say.startsWith("No book the Atlas lists for Veli has births for 1623–1660."), true);
  assert.deepEqual(c.rows.slice(1).map((r) => r.name), ["Mali"], "only the neighbour that has the years is drawn beside it");
  assert.match(c.say, /a neighbour’s book is a lead, not proof/);
  for (const r of c.rows) for (const b of r.bars) {
    assert.equal(b.covers, b.from <= 1660 && b.to >= 1623, b.title);
    assert.match(F.barSay(b, r, c), b.covers ? /: covers / : /does not cover the years wanted/);
  }
});

test("a bundle is read kind by kind: marriages reaching the years do not give it the births", () => {
  const c = F.chart(stepFor([1860, 1870]), E.spansOf, []);
  const bundle = c.rows[0].bars.find((b) => b.title.startsWith("Births 1900-1910"));
  assert.ok(!bundle || (bundle.from === 1900 && bundle.covers === false), "its births are 1900–1910");
  assert.deepEqual(c.rows[0].bars.filter((b) => b.covers).map((b) => b.from), [1850]);
  assert.match(c.say, /^The Atlas lists births for 1860–1870 at Veli\./);
});

test("books that share years are stacked, never drawn end to end, and part cover is said as part", () => {
  const c = F.chart(stepFor([1845, 1895]), E.spansOf, []);
  for (const r of c.rows) for (const a of r.bars) for (const b of r.bars) if (a !== b && a.lane === b.lane) assert.ok(a.to < b.from || b.to < a.from, a.title + " and " + b.title);
  const lanes = c.rows[0].bars.filter((b) => b.from >= 1800 && b.from <= 1850).map((b) => b.lane);
  assert.equal(new Set(lanes).size, lanes.length, "1812–1854 and 1850–1880 are one above the other");
  assert.match(c.say, /only 1845–1880 of 1845–1895/);
});

test("years the story says were searched are marked on that place's chart, only where they are among the years wanted", () => {
  const told = [{ what: "baptism", place: "Veli", from: 1851, to: 1853 }, { what: "baptism", place: "Mali", from: 1855, to: 1856 }, { what: "marriage", place: "Veli", from: 1852, to: 1852 }];
  assert.deepEqual(F.chart(stepFor([1850, 1860]), E.spansOf, told).searched, [[1851, 1853]]);
  assert.deepEqual(F.chart(stepFor([1870, 1875]), E.spansOf, told).searched, []);
  assert.match(pageJs, /p\.searched \|\| \[\]/, "telling of a search redraws the page");
});

test("the map is told every neighbour with a book of the kind, filled only where one has the years; there is no chart without years or books", () => {
  const c = F.chart(stepFor([1623, 1660]), E.spansOf, []);
  assert.deepEqual(c.map.map((r) => [r.name, r.covers]), [["Veli", false], ["Mali", true], ["Drugi", false]]);
  assert.match(F.mapSay(c), /Filled dots.*Hollow dots/);
  assert.equal(F.chart({ ev: { kind: "b", w: null, info: HOME } }, E.spansOf, []), null);
  assert.equal(F.chart({ ev: { kind: "a", w: [1900, 1900], info: HOME } }, E.spansOf, []), null);
  assert.equal(F.chart({ ev: { kind: "b", w: [1900, 1900], info: { name: "Land", isCountry: true, cols: [] } } }, E.spansOf, []), null);
});

test("the lists by generation say which books lack that generation's births", () => {
  const gen = { born: [1623, 1660], married: [1640, 1690] };
  assert.equal(E.coverSay(HOME.cols[0], gen), "No births 1623–1660 · no marriages 1640–1690");
  assert.equal(E.coverSay(book("Births 1650-1655 Marriages 1600-1645", 1600, 1655, ["b", "m"]), gen), "Births in these years: 1650–1655 · marriages: 1640–1645");
  assert.equal(E.inYears(book("Births 1900-1910 Marriages 1640-1690", 1640, 1910, ["b", "m"]), "b", gen.born), null);
  assert.match(engineJs, /nb \? nBooks\(nb, "birth"\) : "no birth book"/);
  assert.deepEqual(E.volumesFor(HOME.cols, "b", [1860, 1870]).map((c) => c.from), [1850], "a bundle's marriage years do not offer it for births");
  assert.equal(E.titleMisses("Births 1900-1910", [1850, 1860]), "(by its title, nothing in 1850–1860)");
  assert.equal(E.titleMisses("Births 1850-1855", [1850, 1860]), "");
});

/* ---- nothing removed ---------------------------------------------------------------------------------------------------------------- */
test("every part and control the page had is still in it, once", () => {
  const had = ["sp-rail", "sp-told", "sp-title", "sp-lede", "sp-doubt", "sp-drop", "sp-edit", "sp-mirror", "sp-text", "sp-shots", "sp-gaps", "sp-file", "sp-tidy", "sp-postbtn", "sp-read", "sp-link", "sp-clear", "sp-eg", "sp-status",
    "sp-aipanel", "sp-aip-h", "sp-aip-x", "sp-aip-note", "sp-aip-send", "sp-aip-preview", "sp-aip-ok", "sp-aip-consent", "sp-aip-go", "sp-aip-why", "sp-aip-status", "sp-aip-out", "sp-lang", "sp-rewrite", "sp-did", "sp-chips",
    "sp-places", "sp-places-h", "sp-map", "sp-time", "sp-play", "sp-year", "sp-yearout", "sp-cap", "sp-stops", "sp-family", "sp-family-h", "sp-tree", "sp-life", "sp-lifebox", "sp-names", "sp-names-h", "sp-namesbox", "sp-setting", "sp-setting-h", "sp-moments", "sp-ask",
    "sp-plan", "sp-plan-h", "sp-ai-btn", "sp-ai-note", "sp-ai-status", "sp-ai-out", "sp-steps", "sp-keep", "sp-keep-h", "sp-fa-line", "sp-fa-name", "sp-fa-btn", "sp-save-btn", "sp-fa-out", "sp-save-out"];
  for (const id of had) assert.equal(page.split('id="' + id + '"').length - 1, 1, id);
});

test("every id the page's script asks for is in the page", () => {
  const asked = new Set([...(pageJs + famJs).matchAll(/\$\("(sp-[a-z0-9-]+)"\)/g)].map((m) => m[1]).filter((id) => !id.endsWith("-")));
  for (const id of asked) assert.ok(page.includes('id="' + id + '"') || new RegExp('\\.id = "' + id).test(pageJs), id);
});

test("every section of the plan has a place to go, and so has every part of a place's card", () => {
  const keys = [...todoJs.matchAll(/section\("([a-z]+)", /g)].map((m) => m[1]);
  assert.ok(keys.length >= 8, keys.join());
  const where = famJs.match(/var where = \{([^}]*)\}/)[1];
  const routed = [...where.matchAll(/([a-z]+): "(sp-[a-z-]+)"/g)];
  for (const [, , id] of routed) assert.ok(page.includes('id="' + id + '"'), id);
  /* «people» is the family itself and the index; «names» is the names shelf's own census; «happening» is each place's list of events, or its own card where there is none */
  const known = new Set(routed.map((m) => m[1]).concat(["people", "names", "happening"]));
  for (const k of keys) assert.ok(known.has(k), "the plan section «" + k + "» is shown somewhere");
  assert.match(famJs, /s\.key === "people"/);
  assert.match(famJs, /data-key="happening"/);
  assert.match(engineJs, /function censusBlock/);
  const shelves = new Set([...engineJs.matchAll(/onShelf\(.*?, "([a-z]+)"\)/g)].map((m) => m[1]));
  for (const s of shelves) assert.ok(famJs.includes('[data-shelf="' + s + '"]'), "the card part «" + s + "» is taken to a shelf");
});

test("the shelves are tabs with their panels, in the rail's order, and the AI buttons are still wired to nothing but a press", () => {
  const tabs = [...page.matchAll(/role="tab" id="sp-tab-([a-z]+)" aria-controls="(sp-[a-z]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs.map((t) => t[1]), ["sp-books", "sp-web", "sp-arch", "sp-names", "sp-setting", "sp-plan"]);
  for (const [name, panel] of tabs) { assert.match(page, new RegExp('id="' + panel + '" role="tabpanel" aria-labelledby="sp-tab-' + name + '"')); assert.ok(page.includes('data-go="' + panel + '"'), panel); }
  assert.match(famJs, /ArrowRight/);
  assert.ok(page.indexOf('/js/story-family.js') < page.indexOf('/js/story-page.js'), "the page script finds it loaded");
  assert.doesNotMatch(famJs, /sp-ai-btn|sp-tidy|sp-postbtn|sp-read\b/);
});

test("a book offered at the desk says which of its kinds are in the story's years", () => {
  assert.match(todoJs, /var inside = x\.known && win \? insideSay\(c, win, deps\.spansOf\) : null;/);
});

test("the plan's steps say whom they help and what kind of record they are", () => {
  const info = place("Veli", HOME.cols, { cc: "HR", countryName: "Croatia", neigh: [], eras: [], p: {} });
  const g = { facts: { rel: "ancestor", name: "Oren Valdic", born: 1860, route: [{ info, role: "born", year: 1860 }], kin: [], siblings: [], searched: [] }, people: [{ role: "self", rel: "ancestor", name: "Oren Valdic" }], names: { people: [] } };
  const plan = T.build(g, { base: "/", spansOf: E.spansOf, providers: [], archives: [], cemeteries: null, mort: null, pickVolumes: () => [] });
  const people = plan.sections.find((s) => s.key === "people").items;
  assert.ok(people.length && people.every((i) => Array.isArray(i.who) && i.who.length), "each card names its people");
  assert.ok(F.chooseThree(people, 3).every((t) => t.helps.length));
  assert.ok(F.stepsOf(people).some((x) => x.step.ev && x.step.ev.kind === "b" && x.step.ev.w[0] <= 1860));
});

test("the plan's advice about the family names is kept on the names shelf, beside the census", () => {
  const info = place("Veli", HOME.cols, { cc: "HR", countryName: "Croatia", neigh: [], eras: [], p: {} });
  const census = { home: { name: "Veli", lat: 45, lon: 14 }, rows: [{ name: "Valdic", areas: [] }], around: [{ n: "Veli", km: 1, names: ["Orlin", "Pavic"], place: "" }] };
  const g = { facts: { rel: "ancestor", name: "Oren Valdic", born: 1860, route: [{ info, role: "born", year: 1860 }], kin: [], siblings: [], searched: [] }, people: [{ role: "self", rel: "ancestor", name: "Oren Valdic" }], names: { people: [], census } };
  const plan = T.build(g, { base: "/", spansOf: E.spansOf, providers: [], archives: [], cemeteries: null, mort: null, pickVolumes: () => [] });
  const advice = plan.sections.find((s) => s.key === "names").items.map((i) => i.advice).filter(Boolean);
  assert.equal(advice.length, 2);
  assert.match(advice[0], /rare name is worth searching everywhere/);
  assert.match(advice[1], /Veli with the godparents and witnesses in the registers\. They are today's names/);
  assert.match(famJs, /namesNote\.append\(el\("p", i\.advice/);
});
