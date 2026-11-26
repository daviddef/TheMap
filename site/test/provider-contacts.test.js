/* WHERE TO WRITE, FROM WIKIDATA (data/provider-contacts.json): scripts/harvest-provider-contacts.py drops what would mislead a letter or name a
   person, and keeps what it already holds while Wikidata still states it, so the weekly proposal shows only real changes. No network. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PY = `
import importlib.util, json, sys
sys.path.insert(0, "scripts")
spec = importlib.util.spec_from_file_location("harvest", "scripts/harvest-provider-contacts.py")
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)
out = []
for case in json.load(sys.stdin):
    g = {"post": {k: set(v) for k, v in case.get("post", {}).items()}, "email": set(case.get("email", [])), "tel": set(case.get("tel", [])), "zip": set()}
    out.append(h.row_for(g, [{"name": case.get("name", "State Archives"), "countries": ["HR"]}], {"gone@arhiv.example"}, case.get("was")))
print(json.dumps(out))
`;
const rows = (cases) => JSON.parse(execFileSync("python3", ["-c", PY], { cwd: ROOT, input: JSON.stringify(cases), encoding: "utf8" }));

test("an address that names a person, is on free mail naming nobody's office, is cut short or is recorded dead is dropped; two in one value are split", () => {
  const [person, titled, free, cut, dead, two] = rows([
    { email: ["mailto:ana.horvat@arhiv.example"], tel: ["+385 1"] }, { email: ["Dr.horvat@arhiv.example"] }, { email: ["arhiv@gmail.com"] },
    { email: ["info@arhiv.example.h"] }, { email: ["gone@arhiv.example"] }, { email: ["ana.horvat@arhiv.example,pisarnica@arhiv.example"] }]);
  assert.deepEqual(person, { tel: "+385 1" });
  for (const r of [titled, free, cut, dead]) assert.equal(r.email, undefined);
  assert.equal(two.email, "pisarnica@arhiv.example");
});

test("a mailbox named for a desk or for the place is kept, with dots in it", () => {
  const [desk, place, initials] = rows([{ email: ["archives.departementales@ain.example"] },
    { email: ["od_chelm@lublin.example"], name: "Archiwum Państwowe w Lublinie Oddział w Chełmie" }, { email: ["msa.bca@state.example"] }]);
  assert.equal(desk.email, "archives.departementales@ain.example");
  assert.equal(place.email, "od_chelm@lublin.example");
  assert.equal(initials.email, "msa.bca@state.example");
});

test("free mail is kept only where every part of it is the institution's and one part says it is an office", () => {
  const cases = [["zupa.svetog.marka", "Župa svetog Marka"], ["zupasvetaana", "crkva svete Ane"], ["opcina.djurdjevac", "Općina Đurđevac"],
    ["nacelnik.opcina.sv.ilija", "Općina Sveti Ilija"], ["gradskimuzej.primjer7", "Gradski muzej Primjer"], ["curiacefalu", "Diocesi di Cefalù"],
    ["ivan.horvat", "Župa svetog Marka"], ["zupnik.marko", "Župa svetog Marka"], ["muzej.horvat", "Gradski muzej"], ["horvat", "Muzej Horvat"],
    ["arhiv", "State Archives"], ["ana.grad", "Grad Primjer"]];
  const got = rows(cases.map(([local, name]) => ({ email: [`${local}@gmail.com`], name })));
  assert.deepEqual(got.map((r) => !!r.email), cases.map((c, i) => i < 6));
});

test("the value already held stays while Wikidata states it, and a new choice does not depend on the order of the answer", () => {
  const post = { hr: ["Trg 1,10000, Zagreb", "Trg 1, 10000, Zagreb"] };
  const [kept, fresh, gone, reversed] = rows([
    { post, tel: ["+385.1.22", "+385-1-22"], was: { post: "Trg 1,10000, Zagreb", tel: "+385.1.22" } }, { post, tel: ["+385.1.22", "+385-1-22"] },
    { post: { hr: ["Nova ulica 2, Zagreb"] }, was: { post: "Trg 1, 10000, Zagreb" } }, { post: { hr: [...post.hr].reverse() }, tel: ["+385-1-22", "+385.1.22"] }]);
  assert.deepEqual(kept, { post: "Trg 1,10000, Zagreb", tel: "+385.1.22" });
  assert.equal(fresh.post, "Trg 1, 10000, Zagreb");
  assert.equal(gone.post, "Nova ulica 2, Zagreb");
  assert.deepEqual(reversed, fresh);
});

test("a one-word «address» no letter could use is left out, and the fuller of two is taken", () => {
  const [bare, full] = rows([{ post: { hr: ["Rathaus"] } }, { post: { hr: ["22 route de Rambaud, 5010, Gap", "22 route de Rambaud, 05010, Gap"] } }]);
  assert.equal(bare.post, undefined);
  assert.equal(full.post, "22 route de Rambaud, 05010, Gap");
});
