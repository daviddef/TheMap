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

test("the languages that exist actually translate", () => {
  assert.equal(t("hr", "Look up a surname"), "Potraži prezime");
  assert.equal(t("it", "Shelf"), "Scaffale");
  /* And they are not quietly identical to the English, which is what a
     copy-pasted table looks like. */
  for (const code of Object.keys(TABLES)) {
    const same = Object.entries(TABLES[code]).filter(([k, v]) => k === v);
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
