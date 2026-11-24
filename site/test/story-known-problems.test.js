/* THE KNOWN PROBLEMS, FIXED AND HELD. Each was seen on a real story:
   "moved to America" was Jardim América in Brazil; "Fiume (now Rijeka)" was two stops; the story's own "Rhodesia" did not choose Salisbury in Zimbabwe for "Salisburg";
   "the Church of St Anne" and "the family name Schmidt" were offered as places; and a place nearer Croatia than Australia (Sydney, Nova Scotia) won a family's
   journey, because nearness was counted at any distance. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const A = (() => { const m = { exports: {} }; new Function("module", src("atlas-summary.js"))(m); return m.exports; })();
const F = (() => { const m = { exports: {}, deps: { summary: A } }; new Function("module", src("story-engine.js"))(m); return m.exports; })();

let k = 0;
const P = (n, cc, x, y, extra) => Object.assign({ i: n.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + cc.toLowerCase() + "-" + (++k), n, cc, c: 5, x, y }, extra || {});
const rows = [
  P("Rijeka", "HR", 14.44, 45.33), P("Senj", "HR", 14.9, 45), P("Trieste", "IT", 13.77, 45.65),
  P("Sydney", "AU", 151.2, -33.87, { c: 0, v: 145 }), P("Sydney", "CA", -60.18, 46.14, { c: 0, v: 5 }),
  P("Naples", "IT", 14.27, 40.85), P("Naples", "US", -81.8, 26.14, { c: 0 }),
  P("Salisbury", "US", -80.5, 35.67, { c: 9 }), P("Salisbury", "ZW", 31.05, -17.83, { c: 0 }),
  P("Jardim América", "BR", -43.3, -22.8, { c: 0 }), P("Johannesburg", "ZA", 28.04, -26.2), P("Botswana", "BW", 24.6, -22.5, { c: 0 }),
  P("Falls Church", "US", -77.17, 38.88, { c: 0 }), P("Christ Church", "GB", -1.8, 50.7, { c: 0 }), P("Berlin", "DE", 13.4, 52.52),
];
const given = [["Ivan"], ["Anna"]].map(([n]) => ({ canon: n, id: n.toLowerCase(), langs: { english: [{ form: n, status: "same" }] } }));
const countries = { HR: "Croatia", IT: "Italy", AU: "Australia", CA: "Canada", US: "United States of America", ZW: "Zimbabwe", BR: "Brazil", ZA: "South Africa", DE: "Germany", GB: "United Kingdom", BW: "Botswana" };
const ctx = () => {
  const c = { map: A.buildMap(rows), given: A.buildGiven(given), skip: {}, countries };
  F.countryPoints(c.map, [{ cc: "US", x: -98, y: 39 }, { cc: "AU", x: 134, y: -25 }, { cc: "HR", x: 15.5, y: 45.1 }]);
  return c;
};
const names = (p) => (p.stops || []).map((s) => s.row.n);

test("«moved to America» is the United States, and only straight after to / in / from", () => {
  const a = F.parseStory("My father came from Senj and moved to America.", ctx(), null);
  assert.deepEqual(names(a), ["Senj", "United States of America"]);
  const b = F.parseStory("My father came from Senj. Captain America came to town.", ctx(), null);
  assert.ok(!names(b).some((n) => /america/i.test(n)), "Captain America is not a place");
});

test("America as the end of the journey does not pull the other places into the United States", () => {
  const p = F.parseStory("my uncle Joe went to america and never came back, he was from near naples", ctx(), null);
  assert.deepEqual(p.stops.map((s) => s.row.cc), ["US", "IT"]);
});

test("«Fiume (now Rijeka)» is one stop, and the Sydney that follows is Australia", () => {
  const p = F.parseStory("My grandfather was from Fiume (now Rijeka) and went to Sydney.", ctx(), null);
  assert.deepEqual(p.stops.map((s) => s.row.n + "/" + s.row.cc), ["Rijeka/HR", "Sydney/AU"]);
});

test("distance beyond about 1,500 km is not «beside»: it cannot tip a family's journey to the nearer namesake", () => {
  assert.match(src("story-engine.js"), /d < 1500 \? Math\.exp\(-d \/ 1000\) : 0/);
});

test("a word that is not put after in / at / from / to is not offered as a place (Church, Schmidt)", () => {
  const p = F.parseStory("My great-grandfather was married in the Church of St Anne. My mother's family name was Schmidt.", ctx(), null);
  assert.deepEqual((p.suggest || []).map((x) => x.typed), []);
});

test("«Salisburg, Rhodesia» is offered as Salisbury in Zimbabwe, not North Carolina", () => {
  const p = F.parseStory("My father moved to Botswana. He then moved to Salisburg, Rhodesia. Then he moved to Johannesburg.", ctx(), null);
  const s = (p.suggest || []).find((x) => x.typed === "Salisburg");
  assert.ok(s, "offered");
  assert.equal(s.options[0].cc, "ZW");
  assert.equal(s.options[0].n, "Salisbury");
});
