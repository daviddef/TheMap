/* /start/ and /about/ are one page, at /start/. This keeps it that way: /about/ is only a redirect, the menu has one "Start here" row and the
 * "The story" entry, nothing links to /about/, the sitemap lists /start/ and not /about/, and the news entry for the tour points at a page
 * that exists. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.join(here, "..");
const read = (f) => fs.readFileSync(path.join(site, f), "utf8");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(astro|js|html|md|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("/about/ is a redirect to /start/: canonical, instant meta refresh, script", () => {
  const src = read("src/pages/about.astro");
  assert.match(src, /<link rel="canonical" href=\{canon\}/);
  assert.match(src, /const canon = new URL\(to, Astro\.site/);
  assert.match(src, /http-equiv="refresh" content=\{`0; url=\$\{to\}`\}/);
  assert.match(src, /location\.replace\(to \+ location\.hash\)/);
  assert.match(src, /const to = u\("\/start\/"\)/);
  assert.ok(!/noindex/i.test(src.replace(/\/\*[\s\S]*?\*\//, "")), "noindex would drop the old address instead of passing it on");
  assert.ok(!/<Base/.test(src), "the redirect page carries no layout, ads or counters");
});

test("/start/ holds what /about/ held, as real HTML", () => {
  const src = read("src/pages/start.astro");
  for (const h of ["Three ways in", "Four things stand between you and the record", "Three doors", "Where it came from", "What it does not know", "How it is built", "Behind the atlas"])
    assert.ok(src.includes(h), `/start/ lacks "${h}"`);
  assert.ok(/data-tour-open/.test(src), "the Play the story button");
  assert.ok(/<ol class="st-four"/.test(src), "the four obstacles are a plain list");
  assert.ok(/id="the-whole-page"/.test(src) && /id="story"/.test(src), "anchors for the tour's links");
});

test("the numbers on /start/ are computed, not typed", () => {
  const src = read("src/pages/start.astro");
  const prose = src.slice(src.indexOf("<Base"), src.indexOf("</Base>"));
  const typed = prose.replace(/\{[^}]*\}/g, "").replace(/<[^>]+>/g, " ").match(/\b\d{1,3}(,\d{3})+\b|\b\d{2,}(\.\d)?%/g);
  assert.equal(typed, null, `hard-coded figures on /start/: ${typed}`);
});

test("the menu has one Start here row, a The story row, and no /about/", () => {
  const nav = read("src/lib/nav.js");
  assert.equal((nav.match(/\["\/start\/", "Start here"\]/g) || []).length, 1);
  assert.match(nav, /\["\/start\/#story", "The story/);
  assert.ok(!/["']\/about\/["']/.test(nav), "a menu row still points at /about/");
});

test("nothing on the site links to /about/ any more", () => {
  const skip = new Set(["test/start-merge.test.js", "src/pages/about.astro", "test/sitemap-pages.test.js"].map((f) => path.join(site, f)));
  const hits = [];
  for (const f of [...walk(path.join(site, "src")), ...walk(path.join(site, "public/js")), ...walk(path.join(site, "test"))]) {
    if (skip.has(f)) continue;
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/(?:href=|u\(|["'`(])\s*["'`]?\/about\/?["'`#)?]/g)) hits.push(`${path.relative(site, f)}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test("the sitemap lists /start/ and leaves the redirect out", () => {
  const sm = read("src/pages/sitemap-index.xml.js");
  assert.match(sm, /\["start\/",\s*"[0-9.]+"\]/);
  assert.ok(!/\["about\/"/.test(sm));
});

test("every page that loads the tour loads only the small loader; the heavy files are on-demand", () => {
  const base = read("src/layouts/Base.astro");
  assert.match(base, /src=\{u\("\/js\/start-tour-gate\.js"\)\}/);
  assert.ok(!/start-tour\.js|start-tour\.css|start-tour-land/.test(base), "Base.astro must not load the heavy tour files");
  for (const f of ["public/js/start-tour.js", "public/start-tour.css", "public/js/start-tour-land.txt", "src/pages/start-tour.html.js"]) assert.ok(fs.existsSync(path.join(site, f)), f);
});

test("no new third-party request: the tour fetches only this site's own files", () => {
  for (const f of ["public/js/start-tour-gate.js", "public/js/start-tour.js", "public/start-tour.css"]) {
    const src = read(f);
    const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]).filter((h) => !/^(www\.w3\.org)$/.test(h));
    assert.deepEqual(hosts, [], `${f} names an external host: ${hosts}`);
    assert.ok(!/@import|fonts\.googleapis|gstatic/.test(src), `${f} pulls in a font or stylesheet`);
  }
});

test("the What's new entry for the tour points at a page that exists", () => {
  const items = JSON.parse(read("src/data/whats-new.json"));
  const list = Array.isArray(items) ? items : items.items || items.entries;
  const e = list.find((x) => /story/i.test(x.headline || ""));
  assert.ok(e, "no What's new entry mentions the story tour");
  assert.ok(["new", "better", "fixed", "research"].includes(e.kind));
  assert.ok(e.headline.length <= 120);
  assert.equal(e.href, "/start/");
  assert.ok(fs.existsSync(path.join(site, "src/pages/start.astro")), "/start/ is not a page");
});

test("the handwriting font is self-hosted, licensed, declared only when the tour opens, and never fetched from Google", () => {
  for (const f of ["public/fonts/caveat-latin-500.woff2", "public/fonts/Caveat-OFL.txt"]) assert.ok(fs.existsSync(path.join(site, f)), f);
  assert.match(read("public/fonts/Caveat-OFL.txt"), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(read("public/fonts/Caveat-OFL.txt"), /Copyright 2014 The Caveat Project Authors/);
  const gate = read("public/js/start-tour-gate.js").replace(/\/\*[\s\S]*?\*\//g, "");
  const load = gate.slice(gate.indexOf("function load()"), gate.indexOf("function open("));
  assert.ok(load.includes("fonts/caveat-latin-500.woff2") && load.includes("font-display:swap"), "declared inside load(), with swap");
  assert.ok(!gate.replace(load, "").includes("caveat"), "Caveat is named outside load()");
  assert.ok(!/Caveat/.test(read("src/layouts/Base.astro")), "Base.astro must not ask for Caveat");
  assert.match(read("public/start-tour.css"), /--hand:"Caveat","Segoe Script","Bradley Hand",cursive/, "fallback unchanged");
});
