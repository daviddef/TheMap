// The row key and the receipt shape of scripts/import-research-sessions.py, checked from the site's suite so a change to either is seen.
// The three vectors are the shared definition (the archive kit and every archive's /whats-new/ compute the same key); the Python script
// proves its own copy with --selftest, and this runs it. Node's copy of the same key is checked here against the same three rows.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function canon(v) {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
const rowkey = (r) => createHash("sha1").update(canon(r), "utf8").digest("hex").slice(0, 12);

const VECTORS = [
  [{ when: "12 Nov 2026", src: "FamilySearch", what: "Gologorica baptisms 1872–1880", outcome: "hit" }, "e7c29e4b77d3"],
  [{ outcome: "nil", what: "Šestan «Žubrinić» — nothing", when: "2026-11-11", src: "DAPA ZM34K-214", pages: "p. 12", ev: [["/imotski/", "Imotski"]] }, "afb2db3a6e3a"],
  [{ key: "x-1", when: "10 Nov 2026", walked: true, n: 3, nested: { b: [1, 2], a: "é" } }, "7e662c5e1f2f"],
];

test("the row key in Node gives the three shared vectors", () => {
  for (const [row, want] of VECTORS) assert.equal(rowkey(row), want);
});

test("the importer's own copy of the row key and its receipt checks pass their self-test", () => {
  const out = execFileSync("python3", ["scripts/import-research-sessions.py", "--selftest"], { cwd: root, encoding: "utf8" });
  assert.match(out, /selftest: row key matches the 3 vectors/);
});
