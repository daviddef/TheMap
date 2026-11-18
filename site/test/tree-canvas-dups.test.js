/* Possible duplicates inside one archive: the canvas's TC.dupsOf, cut out of the built page (scripts/roots/tree-canvas.template.html) and run in a VM, so what is tested is what ships.
   Every person here is INVENTED. Two records of one archive with the same surname (or one family of the Atlas's surname catalogue), the same given name (or one family of its given-name
   catalogue) and the same birth year; never across archives (the bridges do that), never a parent, child or spouse, never a living person, never a different sex or a death years apart. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TPL = fs.readFileSync(path.join(here, "../../scripts/roots/tree-canvas.template.html"), "utf8");
const code = /<script>(\/\* logic\.js[\s\S]*?)<\/script>/.exec(TPL);
assert.ok(code, "the canvas template's logic block moved: this test cuts it out by its first comment");
const ctx = vm.createContext({ console }); ctx.window = ctx; vm.runInContext(code[1], ctx);
const { TC } = ctx;
assert.ok(TC && typeof TC.dupsOf === "function", "the template carries TC.dupsOf (rebuild the Tree Canvas with --embed and vendor it)");

const A = [{ k: "x", name: "X" }, { k: "y", name: "Y" }];
const people = [];
/* arch, id, sex, given, sur, by, bpIdx, dy, dpIdx, father, mother, fg, mg, spouses, kids, page, occIdx, flags */
const add = (a, id, sex, given, sur, by, o = {}) => people.push([a, id, sex, given, sur, by, o.bp ?? -1, o.dy ?? null, -1, o.f ?? -1, o.m ?? -1, o.f != null ? 2 : -1, o.m != null ? 2 : -1, o.sp || [], [], "", -1, o.fl || 0]);
add(0, "ant-o", "m", "Antonio", "Defranceschi", 1825, { bp: 0, dy: 1894 });   // 0
add(0, "ant-us", "m", "Antonius", "De Franceschi", 1825, { bp: 0, dy: 1894 }); // 1  the same man, a second row
add(0, "ant-1826", "m", "Antonius", "Defranceschi", 1826);                     // 2  another birth year
add(0, "ant-f", "f", "Antonia", "Defranceschi", 1825);                         // 3  another sex
add(0, "son", "m", "Antonio", "Defranceschi", 1850, { f: 0 });                 // 4  his child
add(0, "liv", "m", "Antonio", "Defranceschi", 1825, { fl: 8 });                // 5  living
add(1, "other", "m", "Antonio", "Defranceschi", 1825);                         // 6  another archive
add(0, "far", "m", "Antonio", "Defranceschi", 1825, { dy: 1920 });             // 7  died 26 years later
add(0, "ghost", "m", "Antonio", "Defranceschi", 1825, { fl: 32 });             // 8  a ghost
add(0, "nobody", "m", "Antonio", "Rossi", 1825);                               // 9  another surname
const M = TC.build({ archives: A, places: ["Gracisce"], occs: [], built: "t", people });
const d = i => JSON.parse(JSON.stringify(TC.dupsOf(M, i).map(x => x.i).sort((a, b) => a - b)));   // out of the VM's realm, so deepEqual compares plain arrays

test("before the catalogue is read, only a name written the same way is one name", () => {
  assert.deepEqual(d(0), []);
});
test("after it, Antonio and Antonius of one birth year are listed, and the rules keep the rest out", () => {
  TC.attachNames(M, {
    gn: { languages: [{ key: "latin", label: "Latin", core: true }], rows: [{ canon: "Antonio", id: "antonio", langs: { latin: [{ form: "Antonius", status: "attested" }, { form: "Antonio", status: "same" }, { form: "Tonio", status: "lead" }] } }] },
    sn: { rows: [{ id: "defranceschi", name: "Defranceschi", forms: [["Defranceschi", "same"], ["De Franceschi", "same"]], notSame: [] }] },
  });
  assert.deepEqual(d(0), [1]);
  assert.deepEqual(d(1), [0]);
  for (const i of [2, 3, 4, 5, 6, 8, 9]) assert.deepEqual(d(i), [], "person " + i);
  assert.deepEqual(d(7), [], "a death 26 years apart");
});
test("the notes say why, and nothing is called doubtful when nothing disagrees", () => {
  const x = TC.dupsOf(M, 0)[0];
  assert.ok(x.notes.includes("same birth year") && x.notes.includes("same birthplace") && x.notes.includes("same death year"));
  assert.ok(x.notes.some(n => /Atlas catalogue/.test(n)));
  assert.equal(x.doubtful, false);
});
