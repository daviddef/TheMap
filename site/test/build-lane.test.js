/* WHICH BUILD A PUSH NEEDS (scripts/build_lane.py). The rule under test: "static" is only ever given to a file the place, surname and name page
   templates cannot reach; everything unknown is "full". A wrong "static" would publish generated pages that disagree with their template. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "../../scripts/build_lane.py");
const lane = (...files) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lane-")), "changes.txt");
  fs.writeFileSync(f, files.map((x) => (x.includes("\t") ? x : "M\t" + x)).join("\n") + "\n");
  return execFileSync("python3", [script, "--files", f], { encoding: "utf8" }).split("\n")[0].replace("lane: ", "");
};

test("documentation and housekeeping build nothing", () => {
  assert.equal(lane("docs/split-build.md", "README.md", ".github/workflows/linkcheck.yml", "record-atlas-research-import.json"), "none");
});

test("tests and Workers get the checks and no publish", () => {
  assert.equal(lane("site/test/shard.test.js"), "check");
  assert.equal(lane("workers/ai/src/index.js", "docs/ai-admin.md"), "check");
});

test("a script or stylesheet served as written, a static page and the research marks are the static lane", () => {
  assert.equal(lane("site/public/js/story-engine.js"), "static");
  assert.equal(lane("site/public/styles.css"), "static");
  assert.equal(lane("site/src/pages/read.astro"), "static");
  assert.equal(lane("site/public/research-receipts/blazevic.json", "site/public/research-sessions.json", "record-atlas-research-import.json"), "static");
  assert.equal(lane("site/public/js/x.js", "docs/a.md", "site/test/a.test.js"), "static", "the most demanding file decides");
});

test("anything the generated pages can reach is the full build", () => {
  assert.equal(lane("site/src/layouts/Base.astro"), "full", "every page wears the layout");
  assert.equal(lane("site/src/pages/place/[id].astro"), "full");
  assert.equal(lane("site/src/pages/surname/[name].astro"), "full");
  assert.equal(lane("site/src/pages/name/[id].astro"), "full");
  assert.equal(lane("site/src/lib/shard.js"), "full", "a template imports it");
  assert.equal(lane("site/src/data/whats-new.json"), "full", "the layout reads the newest date");
});

test("the data step's inputs, the build itself and anything unknown are the full build", () => {
  assert.equal(lane("data/places.json"), "full");
  assert.equal(lane("scripts/build.py"), "full");
  assert.equal(lane("site/package.json"), "full");
  assert.equal(lane("site/astro.config.mjs"), "full");
  assert.equal(lane("site/public/providers.json"), "full", "a data file in public may be read into any page");
  assert.equal(lane(".github/workflows/deploy-r2.yml"), "full", "the deploy itself is proved by a real build");
  assert.equal(lane("something/nobody/has/heard/of.txt"), "full");
  assert.equal(lane("site/public/js/x.js", "data/places.json"), "full");
  assert.equal(lane("D\tsite/src/lib/shard.js"), "full", "a deletion counts too");
});

test("the import walk finds the templates' dependencies and is not in doubt", () => {
  const out = execFileSync("python3", ["-c",
    "import sys; sys.path.insert(0, %s); import build_lane as B; G, d = B.reachable(B.generated_roots()); print(len(G), len(d))".replace("%s", JSON.stringify(path.dirname(script)))], { encoding: "utf8" }).trim().split(" ");
  assert.ok(Number(out[0]) > 30, "the templates reach their layout, components and libraries");
  assert.equal(out[1], "0", "no import it could not resolve: a doubt would make every source change a full build");
});
