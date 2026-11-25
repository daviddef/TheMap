/* THE CONTACTS THE STORY PLAN READS (src/lib/archives-near.js): an address read off an institution's own page must reach the plan, and a dead one never. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildArchivesNear } from "../src/lib/archives-near.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const asRows = (d) => Object.fromEntries(d.rows.map((r) => [r[0], Object.fromEntries(d.cols.map((c, i) => [c, r[i]]))]));
const P = (id, q) => ({ id, name: id, kind: "regional-archive", countries: ["HR"], url: "https://x/", at: { lat: 45, lon: 16 }, wikidata: q });

test("our own address leads Wikidata's, a branch's mailbox never leads, and a dead address is never published", () => {
  const out = asRows(buildArchivesNear([P("a", "Q1"), P("b", "Q2")], { contacts: { Q1: { email: "old@a.hr", tel: "+385 1", post: "Old 1" }, Q2: { email: "gone@b.hr" } } }, {
    emails: [{ email: "branch@a.hr", state: "answered", branch: true, providers: ["a"] }, { email: "info@a.hr", state: "listed", providers: ["a"] }, { email: "gone@b.hr", state: "dead", providers: ["b"] }],
    offices: [{ providers: ["a"], tel: "+385 2", form: "https://a.hr/kontakt/", branches: [{ name: "Centre", tel: "+385 3" }] }] }));
  assert.equal(out.a.email, "info@a.hr"); assert.equal(out.a.state, "listed");
  assert.equal(out.a.tel, "+385 2"); assert.equal(out.a.post, "Old 1");
  assert.deepEqual(out.a.branches, [["Centre", "+385 3"]]);
  assert.equal(out.b.email, ""); assert.equal(out.b.state, "");
});

test("on the real data, the archives the Croatian letters go to carry their contacts", () => {
  const out = asRows(buildArchivesNear(read("providers.json"), read("provider-contacts.json"), read("provider-emails.json")));
  assert.equal(out["daos-osijek"].email, "dao@dao.hr");
  assert.equal(out["dask-sisak"].email, "info@dask.hr");
  assert.equal(out["dasb-slavonski-brod"].form, "https://dasb.hr/kontakt/");
  assert.equal(out["dasb-slavonski-brod"].branches[0][1], "+385 35 361 053");
  assert.equal(out.arhinet.email, "info@arhiv.hr");
});
