/* A LINK TO THE SITE THAT KEEPS A PAGE FOR THE NAME. David: «maybe we add a link to acta on last names?» The story page and the surname page each carry the
   rule (one is a classic script, one is built), so this holds them together over the real directory. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nameLinks } from "../src/lib/name-links.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, "../public/js", f), "utf8");
const load = (f, deps) => { const m = { exports: {}, deps }; new Function("module", src(f))(m); return m.exports; };
const F = load("story-engine.js", { summary: load("atlas-summary.js") });
const providers = JSON.parse(fs.readFileSync(path.join(here, "../../data/providers.json"), "utf8")).providers;

test("a Croatian surname links to its Acta Croatica page, with the accent encoded", () => {
  const [acta] = nameLinks(providers, "Fratrović", ["HR"]);
  assert.equal(acta.name, "Acta Croatica");
  assert.equal(acta.url, "https://actacroatica.com/en/surname/Fratrovi%C4%87/");
});

test("a site that wants capitals gets capitals, and its name is the short one", () => {
  const it = nameLinks(providers, "De Franceschi", ["IT"]).find((x) => x.id === "cognomix");
  assert.equal(it.name, "Cognomix");
  assert.ok(it.url.endsWith("/DE_FRANCESCHI"), it.url);
});

test("no country with such a site, no name or no country: no link", () => {
  assert.deepEqual(nameLinks(providers, "Fratrović", ["MK"]), []);
  assert.deepEqual(nameLinks(providers, "", ["HR"]), []);
  assert.deepEqual(nameLinks(providers, "Fratrović", []), []);
});

test("the story page and the surname page make the same links", () => {
  for (const [name, ccs] of [["Mihaljević", ["HR", "SI"]], ["Rossi", ["IT", "AU"]], ["Smith", ["GB"]]])
    assert.deepEqual(F.nameLinks(providers, name, ccs), nameLinks(providers, name, ccs));
});
