/* "Several at once" on /add/ and the brief for an AI agent at /add-sources.txt. Both only compose a message (no server, nothing posted), so what is held here is that the two
   agree: the labels an agent is told to write are the labels the single form writes, the address comes from site.json and is never typed, and the page's box counts blocks the way
   the subject says. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const page = read("../src/pages/add.astro"), brief = read("../src/pages/add-sources.txt.js");

test("the agent brief uses the form's own labels, and takes the address from site.json", () => {
  const labels = [...page.matchAll(/"af-[a-z]+": "([^"]+)"/g)].map(m => m[1]);
  assert.ok(labels.length >= 6, "the single form has its labels");
  for (const l of labels) assert.ok(brief.includes(l + ":"), "the brief tells an agent to write '" + l + ":'");
  assert.match(brief, /site\.contact\.email/, "the To address is read from site.json");
  assert.ok(!/[\w.]+@[\w.]+\.\w+/.test(brief), "no address is typed into the brief");
});

test("the page's box makes one message, counts the Name: blocks for the subject, and says to copy a long one", () => {
  assert.match(page, /id="bf-text"/);
  assert.match(page, /\^\\s\*name\\s\*:\/gim/, "a block starts with Name:");
  assert.match(page, /send\.href\.length > 1800/, "a long list is sent to Copy, not cut off in a mail link");
  assert.match(page, /href=\{u\("\/add-sources\.txt"\)\}/, "the page points an assistant at the brief");
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon/.test(page.slice(page.indexOf('id="bf-text"'))), "nothing is posted from the page");
});
