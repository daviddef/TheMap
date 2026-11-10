import test from "node:test";
import assert from "node:assert/strict";
import { namesNews } from "../src/lib/names-news.js";

const fam = (name, forms, added) => ({ id: name.toLowerCase(), name, members: forms.map((f) => ({ form: f[0], status: f[1] || "same", evidence: [{ added, what: "A baptism of SOMEBODY NAMED in 1840", ref: "archive:X" }] })) });

test("a small day names the families and their new spellings, never evidence text", () => {
  const r = namesNews({ surnames: { families: [fam("Adamich", [["Adamic"], ["Adamitsch"]], "2026-11-05"), fam("Kosina", [["Kosinas", "not-same"]], "2026-11-05")] } });
  assert.equal(r.length, 1);
  assert.match(r[0].headline, /Adamich \(Adamic, Adamitsch\)/);
  assert.ok(!/Kosina/.test(r[0].headline), "a not-same form is not an addition");
  assert.ok(!JSON.stringify(r).includes("SOMEBODY"));
  assert.equal(r[0].date, "2026-11-05");
});

test("a bulk day says how many, once", () => {
  const forms = Array.from({ length: 60 }, (_, i) => ["Form" + i]);
  const r = namesNews({ surnames: { families: [fam("Big", forms, "2026-11-03")] } });
  assert.match(r[0].headline, /60 spellings of 1 surname/);
});

test("given names and dated place names get their own entries; undated place names are ignored", () => {
  const r = namesNews({
    given: { families: [fam("Giovanni", [["Zuane"]], "2026-11-06")] },
    places: { places: [{ id: "harare", name: "Harare", names: [{ name: "Salisbury", added: "2026-11-07" }, { name: "Old", from: 1890 }] }] },
  });
  assert.equal(r.length, 2);
  assert.ok(r.some((e) => e.href === "/your-name/" && /Giovanni \(Zuane\)/.test(e.headline)));
  assert.ok(r.some((e) => e.href === "/place-names/" && /Harare \(also Salisbury\)/.test(e.headline)));
});

test("catalogue additions are tagged research, so «new» stays for what a reader can now do", () => {
  const r = namesNews({ surnames: { families: [fam("Adamich", [["Adamic"]], "2026-11-05")] }, given: { families: [fam("Giovanni", [["Zuane"]], "2026-11-05")] },
    places: { places: [{ name: "Harare", names: [{ name: "Salisbury", added: "2026-11-05" }] }] } });
  assert.equal(r.length, 3);
  assert.ok(r.every((e) => e.kind === "research"), JSON.stringify(r.map((e) => e.kind)));
});
