import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const P = (() => { const m = { exports: {} }; new Function("module", "window", src("story-plan.js").replace(/\}\)\(typeof window[\s\S]*$/, "})(null);"))(m, undefined); return m.exports; })();

const g = {
  facts: {
    rel: "father", born: 1931,
    route: [
      { role: "born", year: 1931, age: 0, info: { name: "Senj", cc: "HR", href: "/place/senj/", lat: 44.99, lon: 14.9, cols: [{ t: "Births 1858-1900", url: "/place/senj/#v" }],
        provs: [{ name: "Croatian State Archives in Rijeka", kind: "regional-archive", url: "https://example.org/dar", at: { lat: 45.33, lon: 14.44 } }, { name: "Far Archive", kind: "regional-archive", url: "https://example.org/far", at: { lat: 10, lon: 10 } }, { name: "National portal", kind: "library", url: "https://example.org/nat" }],
        near: [{ n: "Otočac", i: "otocac", km: 30, c: 2 }] } },
      { role: "move", age: 20, info: { name: "Brisbane", cc: "AU", href: "/place/brisbane/", lat: -27.47, lon: 153.02 } }
    ],
    kin: [{ label: "grandfather", stops: [{ info: { name: "Zagreb", cc: "HR" } }] }]
  },
  life: { groups: [{ items: ["He worked on the railway"] }] }
};
const countries = { HR: "Croatia", AU: "Australia" };

test("the plan's candidates are Atlas records near the story's places, each with an id and a link", () => {
  const c = P.candidates(g, countries, "/");
  assert.ok(c.length >= 5);
  c.forEach((x, i) => { assert.equal(x.id, "c" + (i + 1)); assert.ok(x.url); assert.ok(x.name); });
  assert.ok(c.some((x) => x.kind === "archive" && /Rijeka/.test(x.name)), "an archive within 150 km is a candidate");
  assert.equal(c.some((x) => /Far Archive/.test(x.name)), false, "an archive farther than 150 km is not");
  assert.ok(c.some((x) => x.kind === "volume"), "a volume the Atlas lists for the place");
  assert.ok(c.some((x) => x.url === "/place/otocac/"), "a nearby place that holds volumes");
  assert.equal(new Set(c.map((x) => x.id)).size, c.length);
});

test("the facts sent to Claude carry places, relation and years, and no name", () => {
  const f = P.facts({ ...g, facts: { ...g.facts, name: "Ivan" } }, countries);
  assert.equal(f.rel, "father"); assert.equal(f.born, 1931);
  assert.deepEqual(f.route.map((r) => r.place), ["Senj", "Brisbane"]);
  assert.equal(JSON.stringify(P.payload(g, countries, "/")).includes("Ivan"), false);
  assert.ok(f.kin.length && f.life.length);
});

test("an answer is drawn with textContent only, and only Atlas lines with a safe address are links", () => {
  const dom = { made: [] };
  const mk = () => { const e = { children: [], className: "", textContent: "", append(...a) { this.children.push(...a); }, set href(v) { this._h = v; }, get href() { return this._h; } }; return e; };
  global.document = { createElement: () => mk() };
  const mount = mk();
  P.render({ headline: "<img src=x onerror=alert(1)>", groups: [{ title: "Read", items: [{ source: "atlas", title: "A", url: "javascript:alert(1)" }, { source: "atlas", title: "B", url: "/place/x/" }, { source: "suggested", title: "C", url: "https://evil.example" }] }] }, mount);
  const all = JSON.stringify(mount, (k, v) => (k === "children" ? v : v));
  assert.ok(all.includes("onerror"), "the text is kept as text");
  const links = []; (function walk(n) { if (n && n._h) links.push(n._h); if (n && n.children) n.children.forEach(walk); })(mount);
  assert.deepEqual(links, ["/place/x/"]);
  delete global.document;
  assert.equal(/innerHTML|insertAdjacentHTML|document\.write/.test(src("story-plan.js")), false);
});

test("the plan as text for My research keeps the tags and links of Atlas lines", () => {
  const t = P.asText({ headline: "H", groups: [{ title: "Read", items: [{ source: "atlas", title: "A", url: "/p/", detail: "d" }, { source: "suggested", title: "B" }] }], cautions: ["c"] });
  assert.match(t, /\[Atlas\] A: d \(\/p\/\)/);
  assert.match(t, /\[Suggested\] B/);
  assert.match(t, /Caution: c/);
  assert.equal(P.asText({ unparsed: true }), "");
});

test("the home page hands the words to the story page and keeps no long report of its own", () => {
  const d = src("story-drawer.js"), u = src("unified-search.js");
  assert.match(d, /ra-story-handoff/); assert.match(d, /read\/#story/);
  assert.match(u, /Open your story/); assert.match(u, /raStoryBox\.handoff/);
  assert.match(src("story-page.js"), /ra-story-handoff/);
});
