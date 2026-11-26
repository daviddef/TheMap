/* The family archives' open errands on My research. The published file is public, so it may hold only who (a directory institution), what for (fixed record
 * kinds), a fixed status and a send month; the page shows it apart from the reader's own letters. Every institution, family and row made up here is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fakeDom, fakeStore } from "./fakedom.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, "..", p), "utf8");
const py = (...args) => execFileSync("python3", args, { cwd: path.join(here, "..", ".."), encoding: "utf8" });

test("the publisher's own checks pass: invented rows go in, only the allowed shape comes out, and a spoiled file is refused", () => {
  assert.match(py("scripts/publish-archive-errands.py", "--selftest"), /selftest: only institutions in the directory/);
});

test("with no mode, or one it does not know, the publisher does nothing", () => {
  for (const args of [[], ["--pubilsh"], ["--publish", "--write"]]) {
    assert.throws(() => execFileSync("python3", ["scripts/publish-archive-errands.py", ...args], { cwd: path.join(here, "..", ".."), stdio: "pipe" }), e => e.status === 2 && /Nothing was done/.test(String(e.stdout)), args.join(" "));
  }
});

test("the committed file holds directory institutions, fixed words and months, and nothing else", () => {
  const doc = JSON.parse(read("public/archive-errands.json"));
  const names = new Set(JSON.parse(read("../data/providers.json")).providers.map(p => p.name));
  const kinds = new Set(JSON.parse(py("-c", "import json,importlib.util as u; s=u.spec_from_file_location('p','scripts/publish-archive-errands.py'); m=u.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.KIND_NAMES))")));
  assert.deepEqual(Object.keys(doc), ["v", "archives"]);
  assert.ok(doc.archives.length > 0);
  for (const a of doc.archives) {
    assert.deepEqual(Object.keys(a).sort(), ["archive", "errands", "name", "page"]);
    assert.match(a.page, /^https:\/\/[a-z]+\.defranceski\.com\/errands\/$/);
    for (const e of a.errands) {
      for (const k of Object.keys(e)) assert.ok(["institution", "kinds", "status", "sent"].includes(k), k);
      assert.ok(names.has(e.institution), e.institution);
      assert.ok(e.kinds.every(k => kinds.has(k)));
      assert.ok(["sent", "drafted", "to do", "listed"].includes(e.status));
      if ("sent" in e) assert.match(e.sent, /^20\d\d-(0[1-9]|1[0-2])$/);
    }
  }
});

test("the build refuses a file outside that shape", () => {
  const gate = read("../scripts/check-data.py");
  assert.match(gate, /def archive_errands_gate\(\)/); assert.match(gate, /\n    archive_errands_gate\(\)\n/);
});

/* the page */
const FILE = { v: 1, archives: [
  { archive: "alpha", name: "Zzaa", page: "https://alpha.example/errands/", errands: [
    { institution: "State Archives of Nowhere", kinds: ["census"], status: "drafted" },
    { institution: "Nowhere Parish Library", kinds: ["marriages", "deaths and burials"], status: "sent", sent: "2026-09" }] },
  { archive: "gamma", name: "Zzcc", page: "https://gamma.example/errands/", errands: [{ institution: "Elsewhere Office", kinds: [], status: "to do" }] }] };

async function draw(lines, answer = () => Promise.resolve({ ok: true, json: () => Promise.resolve(FILE) })) {
  const doc = fakeDom(), host = doc.add("div", "mr-archive-errands"); host.hidden = true;
  host.setAttribute("data-base", "/"); doc.readyState = "complete";
  const asked = [], later = [];
  const win = { raProgress: { lines: () => lines }, raSynopsis: { scopeOf: (l, a, s) => (s ? s.slugs : l.map(x => x.slug)) }, addEventListener() {} };
  vm.runInNewContext(read("public/js/research-archive-errands.js"), { document: doc, window: win, localStorage: fakeStore(),
    fetch: u => { asked.push(u); return answer(u); }, setTimeout: f => later.push(f) });
  later.forEach(f => f());
  for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r));
  return { doc, host, asked };
}
const line = (slug, ...archives) => ({ slug, active: false, archives: archives.map(id => ({ id, name: "The " + id + " Archive" })) });

test("only the chosen families' archives are listed, apart from the reader's own, with the month and a link to the archive", async () => {
  const { host, asked } = await draw([line("one", "alpha", "beta")]);
  assert.deepEqual(asked, ["/archive-errands.json"]);
  assert.equal(host.hidden, false);
  const text = host.textContent;
  assert.match(text, /Open in the family archives/); assert.match(text, /not yours/);
  assert.match(text, /Zzaa archive 1 sent, 1 drafted, not sent/);
  assert.match(text, /Nowhere Parish Librarymarriages, deaths and burialssent, Sep 2026State Archives of Nowhere/, "sent first, with its month");
  assert.match(text, /Nothing open is published for the beta Archive\./);
  assert.doesNotMatch(text, /Elsewhere Office/);
  assert.equal(host.querySelector("a").href, "https://alpha.example/errands/");
  assert.equal(host.querySelector("details").open, true, "a single archive is open");
});

test("a family that belongs to no archive shows nothing and asks for nothing", async () => {
  const { host, asked } = await draw([line("mine")]);
  assert.equal(host.hidden, true); assert.equal(host.textContent, ""); assert.deepEqual(asked, []);
});

test("a list that cannot be loaded says so", async () => {
  const { host } = await draw([line("one", "alpha")], () => Promise.resolve({ ok: false, status: 404 }));
  assert.match(host.textContent, /could not be loaded/);
});

test("the reader's own empty list no longer says there are no errands at all", () => {
  assert.match(read("public/js/research-errands.js"), /No letters of your own yet\./);
  const page = read("src/pages/my-research.astro");
  assert.ok(page.indexOf('id="mr-archive-errands"') > page.indexOf('id="mr-errands"'));
  assert.match(page, /research-archive-errands\.js/);
});
