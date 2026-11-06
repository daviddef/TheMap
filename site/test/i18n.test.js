/* The translation table, tested for the two ways it can lie.
 *
 * ONE: a missing key must render the English, not a blank or a key name.
 * The keys ARE the English strings for exactly this reason, so a
 * half-finished language is «not yet translated» and never «broken».
 *
 * TWO: the table must not claim more than it has. coverage() is printed
 * on the page beside the language switcher, so if it counted the keys of
 * the union rather than of each language, a language with six strings
 * would advertise itself as complete.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { t, LANGS, TABLES, coverage } from "../src/lib/i18n.js";

test("an unknown language falls back to the English it was given", () => {
  assert.equal(t("de", "Shelf"), "Shelf");
  assert.equal(t(undefined, "Shelf"), "Shelf");
  assert.equal(t("hr", "a string nobody has translated"),
                     "a string nobody has translated");
});

/* Words that really are the same in the other language, so the table says so on purpose. Anything else identical to its key is a copy-paste. */
const COGNATES = {
  it: new Set(["Offline", "Menu", "Privacy", "Area", "volume", "1 volume", "No", "satellite", "account"]),
};

test("the languages that exist actually translate", () => {
  assert.equal(t("hr", "Look up a surname"), "Potraži prezime");
  assert.equal(t("it", "Shelf"), "Scaffale");
  /* And they are not quietly identical to the English, which is what a
     copy-pasted table looks like. */
  for (const code of Object.keys(TABLES)) {
    const same = Object.entries(TABLES[code]).filter(([k, v]) => k === v && !COGNATES[code]?.has(k));
    assert.equal(same.length, 0,
      `${code} leaves ${same.length} strings untranslated in place`);
  }
});

test("every language is offered and English is one of them", () => {
  const codes = LANGS.map(([c]) => c);
  assert.ok(codes.includes("en"));
  for (const code of Object.keys(TABLES)) assert.ok(codes.includes(code));
});

test("coverage counts each language, not the union", () => {
  const cov = coverage();
  const keys = new Set(Object.values(TABLES).flatMap((x) => Object.keys(x)));
  for (const row of cov) {
    assert.equal(row.of, keys.size);
    assert.ok(row.strings <= row.of);
    if (row.code !== "en")
      assert.equal(row.strings, Object.keys(TABLES[row.code]).length);
  }
});

test("no translation is empty or only whitespace", () => {
  for (const [code, tab] of Object.entries(TABLES))
    for (const [k, v] of Object.entries(tab))
      assert.ok(String(v).trim().length > 0, `${code}: "${k}" is empty`);
});

test("a {} in a key is carried into every translation, the same number of times", () => {
  for (const [code, tab] of Object.entries(TABLES))
    for (const [k, v] of Object.entries(tab)) {
      const n = (x) => (String(x).match(/\{\}/g) || []).length;
      assert.equal(n(v), n(k), `${code}: "${k}" has ${n(k)} {} but its translation has ${n(v)}`);
    }
});

test("Croatian and Italian hold the same set of strings, so neither is a half of the other", () => {
  const hr = new Set(Object.keys(TABLES.hr)), it = new Set(Object.keys(TABLES.it));
  assert.deepEqual([...hr].filter((k) => !it.has(k)), []);
  assert.deepEqual([...it].filter((k) => !hr.has(k)), []);
});

test("the chrome a reader meets first is translated in both languages", () => {
  /* The header, the map bar, the area tool, Connection & Backup and the footer: the places the report «languages half baked» came from. */
  const must = ["Views", "Areas", "Add area", "Save", "Clear", "Show", "Connection & Backup", "Back up my research",
    "Data credits and licences", "Add source", "Researching", "Local", "Layers", "Kind", "Share", "Last synced: {}."];
  for (const code of Object.keys(TABLES))
    for (const k of must) assert.ok(TABLES[code][k], `${code} has no translation for "${k}"`);
});
