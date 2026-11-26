/* Every file the /data/ page offers is made by the build. leaders.json was listed and read by the story and history pages, and no step of `npm run data` wrote it, so the
   live site answered 404 for it. A fresh checkout in the deploy is where this bites: a machine with old files in site/public passes. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");
const BUILT = fs.existsSync(path.join(SITE, "public/index.json"));
/* the plain paths; a pattern such as /p/<place-id>.json names a family of files */
const listed = [...read("src/pages/data.astro").matchAll(/\bpath: "\/([^"<]+\.json(?:\.gz)?)"/g)].map((m) => m[1]);

test("every file the Data page offers to download is there after the build", { skip: !BUILT && "needs the built public/ data" }, () => {
  assert.ok(listed.length > 15, "the page's list was read");
  const missing = listed.filter((f) => !fs.existsSync(path.join(SITE, "public", f)) && !fs.existsSync(path.join(SITE, "src/pages", f + ".js")));
  assert.deepEqual(missing, []);
});

test("the data step writes the heads of state, and a change to its list of scripts misses the data cache", () => {
  assert.match(JSON.parse(read("package.json")).scripts.data, /build-leaders\.py/);
  for (const w of ["deploy-r2.yml", "deploy.yml"]) {
    const y = read("../.github/workflows/" + w);
    assert.match(y, /hashFiles\([^)]*'site\/package\.json'\)/, w);
    assert.match(y, /site\/public\/leaders\.json/, w);
  }
});
