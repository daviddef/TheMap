/* THE WHAT'S NEW LIST, CHECKED BEFORE IT IS MERGED.
   scripts/check-data.py holds the same rules, but it runs only after a push to main (and needs the built data), so a headline over the card
   limit was merged, stopped the build, and mailed a failed run for every push after it (23 Nov 2026, five entries). This test needs no
   generated data, so a pull request can run it (.github/workflows/pr-checks.yml) and it is part of `npm test` too. Keep it in step with
   check-data.py's check_whats_new. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "src/data/whats-new.json"), "utf8");
const entries = JSON.parse(raw).entries;
const MAX = 120;

/* a page is a top-level .astro file, a folder with an index or a [dynamic] page */
const pages = new Set();
const pdir = join(root, "src/pages");
for (const f of readdirSync(pdir, { withFileTypes: true })) {
  if (f.isFile() && f.name.endsWith(".astro")) pages.add(f.name.slice(0, -6));
  if (f.isDirectory()) pages.add(f.name);
}
const pageOf = (href) => href.replace(/^\//, "").split("/")[0].split("#")[0].split("?")[0];
const label = (e, i) => `entry ${i + 1} (${e.date}, "${String(e.headline).slice(0, 40)}…")`;

test("the list has entries", () => assert.ok(entries.length > 0));

test(`every headline fits a card line (at most ${MAX} characters)`, () => {
  const bad = entries.map((e, i) => [e, i]).filter(([e]) => (e.headline || "").trim().length > MAX);
  assert.deepEqual(bad.map(([e, i]) => `${label(e, i)}: ${e.headline.trim().length} characters`), []);
});

test("every entry has a headline, a real date and a known kind", () => {
  entries.forEach((e, i) => {
    assert.ok((e.headline || "").trim(), `${label(e, i)} has no headline`);
    assert.match(e.date || "", /^\d{4}-\d{2}-\d{2}$/, `${label(e, i)} date is not YYYY-MM-DD`);
    assert.ok(!Number.isNaN(Date.parse(e.date)), `${label(e, i)} date is not a date`);
    assert.ok(["new", "better", "fixed", "research"].includes(e.kind), `${label(e, i)} kind ${e.kind} must be new, better, fixed or research`);
  });
});

test("every link points at a page that exists in the atlas", () => {
  entries.forEach((e, i) => {
    const hs = [e.href, ...(e.links || []).map((l) => l.href)].filter(Boolean);
    for (const h of hs) {
      assert.ok(h.startsWith("/"), `${label(e, i)}: ${h} must start with /`);
      const p = pageOf(h);
      assert.ok(!p || pages.has(p), `${label(e, i)}: ${h} points at a page that does not exist`);
    }
  });
});

test("no entry has a key written twice (two merged pull requests made one object of two entries)", () => {
  /* JSON.parse keeps the last duplicate silently, so read the text: inside each {...} entry a key may appear once. */
  const body = raw.slice(raw.indexOf('"entries"'));
  const blocks = body.split(/\n {4}\{\n/).slice(1);
  blocks.forEach((b, i) => {
    const top = b.split(/\n {4}\}/)[0];
    const keys = [...top.matchAll(/^ {6}"(\w+)":/gm)].map((m) => m[1]);
    const dup = keys.filter((k, j) => keys.indexOf(k) !== j);
    assert.deepEqual(dup, [], `entry ${i + 1} writes ${dup.join(", ")} twice: split it into two entries`);
  });
});
