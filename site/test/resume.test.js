/* «Start again at» is for half-read books only: the first page not read after reading began, nothing for a finished one, and no word about the pages
 * before the first one recorded. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const P = (() => {
  const window = {}, localStorage = { getItem: () => null, setItem() {} };
  const document = { dispatchEvent() {}, addEventListener() {}, readyState: "complete", documentElement: { getAttribute: () => "/" } };
  new Function("window", "localStorage", "document", "CustomEvent", "fetch", read("public/js/progress-kit.js"))(window, localStorage, document, class {}, () => new Promise(() => {}));
  return window.raProgress;
})();

test("a half-read book points to the next unread page", () => {
  assert.equal(P.resume([[1, 47]], { total: 174 }), 48);
  assert.equal(P.resume([[1, 47], [60, 72]], { total: 174 }), 48, "the first gap, not the highest page");
  assert.equal(P.resume([[6, 669]], { total: 676 }), 670);
  assert.equal(P.resume([[4, 29], [115, 174]], { total: 174 }), 30);
  assert.equal(P.resume([[115, 174], [4, 29]], { total: 174 }), 30, "in any order");
  assert.equal(P.resume([[1, 10], [11, 20]], { total: 40 }), 21, "runs that touch are one run");
  assert.equal(P.resume([[6, 669]]), 670, "with no page count, the page after the first run");
});

test("nothing for a finished book, or when nothing follows what was read", () => {
  assert.equal(P.resume([[1, 80]], { total: 80 }), null);
  assert.equal(P.resume([[6, 676]], { total: 676 }), null, "the pages before 6 are not claimed, and not pointed at");
  assert.equal(P.resume([[6, 669]], { total: 676, walked: [[6, 669]] }), null, "read in full");
  assert.equal(P.resume([[1, 10]], { total: 80, state: "exhausted" }), null);
  assert.equal(P.resume([], { total: 80 }), null);
  assert.equal(P.resume(null), null);
  assert.equal(P.resume([[1, 10]], { total: 80, walked: [] }), 11);
});

test("every page that says where to start again passes what it knows and says nothing when there is no answer", () => {
  assert.match(read("public/js/volume-marks.js"), /P\.resume\(m\.done, m\)/);
  const page = read("src/pages/my-research.astro");
  assert.match(page, /P\.resume\(cov, \{ ?total: m\.total, walked: m\.walked, state: b\.state ?\}\)/);
  assert.doesNotMatch(page + read("public/js/volume-marks.js") + read("src/pages/shared.astro"), /resume\([a-zA-Z.]+\)\s*\+/, "never concatenated without a check");
  assert.doesNotMatch(read("src/pages/shared.astro"), /P\.resume\([^,()]+\)(?!\s*;)/);
});
