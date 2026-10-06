/* RENDER THE SITES THAT ARE APPLICATIONS RATHER THAN PAGES.
 *
 * A third of the French communal archives return a JavaScript shell: Annecy is
 * 14,857 bytes of HTML and one character of text. survey-providers.py marks
 * those `needs-browser` rather than scoring them as empty, because "no signals
 * found" on a page that was never rendered is a false negative wearing the
 * clothes of a fact.
 *
 * THIS FETCHES AND DOES NOT JUDGE. The phrase lists and the verdict rules live
 * in survey-providers.py and stay there. This writes {id, url, final, text}
 * and hands it back to be scored by the same code that scores a static fetch —
 * because two copies of a classifier in two languages is precisely the bug
 * build.py already documents about its third copy of the surname-page rule.
 *
 *   node scripts/render-pages.mjs data/_survey-review.json data/_rendered.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/* Playwright is a devDependency of site/, and this script lives in scripts/.
   Node resolves from the importing file upward, and the repository root has no
   node_modules, so a bare import fails wherever this is run from. Resolve it
   against site/package.json explicitly, so the script works from the root —
   which is where every other script in this project is run from. The browser
   binaries are under site/node_modules too, hence PLAYWRIGHT_BROWSERS_PATH=0
   below unless the caller has already said otherwise. */
const _req = createRequire(pathToFileURL("site/package.json"));
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
/* require, not import: @playwright/test's entry is CommonJS, and a dynamic
   import of it hands back a module namespace whose bindings sit on .default —
   so destructuring chromium off the top level silently gave undefined and the
   failure surfaced one line later as "cannot read properties of undefined". */
const _pw = _req("@playwright/test");
const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
if (!chromium) throw new Error("playwright resolved but exposes no chromium");

const UA = "RecordAtlas/1.0 (+https://recordatlas.org; a map of genealogical sources)";
const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node scripts/render-pages.mjs <review.json> <out.json>");
  process.exit(2);
}

const review = JSON.parse(readFileSync(inPath, "utf8"));
const todo = (review.rows || []).filter((r) => r.outcome === "needs-browser");
console.log(`rendering ${todo.length} pages that need a browser`);

const browser = await chromium.launch();
/* The same user-agent the static fetcher sends. The point of an honest UA is
   that it is the same everywhere, so an archive reading its logs sees one
   visitor rather than a browser and a robot that happen to share an address. */
const ctx = await browser.newContext({ userAgent: UA, locale: "fr-FR" });
const out = [];

for (const r of todo) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(r.url, { waitUntil: "networkidle", timeout: 45000 });
    const text = await page.evaluate(() => document.body?.innerText || "");
    out.push({ id: r.id, name: r.name, url: r.url, final: page.url(),
               status: res ? res.status() : null, text });
    console.log(`  ${res ? res.status() : "?"}  ${text.length.toString().padStart(6)} chars  ${r.name}`);
  } catch (e) {
    out.push({ id: r.id, name: r.name, url: r.url, error: e.name || String(e) });
    console.log(`  ERR  ${e.name || e}  ${r.name}`);
  }
  await page.close();
  /* One at a time and a beat between, because these are small municipal
     servers and one of them answered 503 the moment four workers arrived. */
  await new Promise((s) => setTimeout(s, 1200));
}

await browser.close();
writeFileSync(outPath, JSON.stringify({ ran: new Date().toISOString().slice(0, 10), rows: out }, null, 1));
console.log(`wrote ${outPath}`);
