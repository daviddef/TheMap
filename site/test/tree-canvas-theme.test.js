/* The Tree Canvas's Look (a section of its Appearance menu). Three files each hold a copy of the same small rule, because they run in three places (the canvas iframe, the page around it,
   and a classic script that runs before paint). These tests hold the copies together:
   - the canvas template's cycle (LOOK_CYCLE) is the shell's CYCLE, in the same order;
   - the button walks that cycle and comes back to the start; a layout (lanes, countries, names) goes to automatic;
   - the boot script, which cannot import, paints the same page colour as shellScheme() for every look, and does nothing when storage is blocked;
   - the button is a plain labelled button, and nothing in the change sends anything new anywhere. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as ST from "../public/tree-canvas/settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(here, p), "utf8");
const template = read("../../scripts/roots/tree-canvas.template.html");
const boot = read("../public/tree-canvas/theme-boot.js");
const page = read("../src/pages/tree-canvas/index.astro");
const app = read("../public/tree-canvas/app.js");

const templateCycle = () => {
  const m = /LOOK_CYCLE\s*=\s*(\[[^\]]*\])/.exec(template);
  assert.ok(m, "the canvas template defines LOOK_CYCLE");
  return JSON.parse(m[1].replace(/'/g, '"'));
};

/* run the boot script against a fake page and storage; returns what it set on <html> */
const runBoot = (store, { blocked = false } = {}) => {
  const attrs = {};
  const localStorage = blocked
    ? { getItem() { throw new DOMException("blocked", "SecurityError"); } }
    : { getItem: k => (k in store ? store[k] : null) };
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } };
  vm.runInNewContext(boot, { localStorage, document, JSON });
  return attrs;
};

test("the canvas's cycle is the shell's cycle, in the same order", () => {
  assert.deepEqual(templateCycle(), ST.CYCLE);
});

test("the cycle starts at automatic, holds only the three colour looks, and every step is a real look", () => {
  assert.deepEqual(ST.CYCLE, ["auto", "sticker", "paper", "ground"]);
  for (const l of ST.CYCLE) assert.ok(ST.LOOKS.includes(l), l + " is a look");
});

test("one click moves one step and the last step returns to automatic", () => {
  let cur = "auto";
  const seen = [cur];
  for (let i = 0; i < ST.CYCLE.length; i++) { cur = ST.nextLook(cur); seen.push(cur); }
  assert.deepEqual(seen, ["auto", "sticker", "paper", "ground", "auto"]);
});

test("a layout chosen in Settings goes to automatic on the next click; an unknown value does too", () => {
  for (const l of ["lanes", "countries", "names", "nonsense", "", undefined]) assert.equal(ST.nextLook(l), "auto", String(l));
});

test("the page around the canvas: automatic leaves the device in charge, ground is dark, every other look is light", () => {
  assert.equal(ST.shellScheme("auto"), null);
  assert.equal(ST.shellScheme(undefined), null);
  assert.equal(ST.shellScheme("ground"), "dark");
  for (const l of ["sticker", "paper", "lanes", "countries", "names"]) assert.equal(ST.shellScheme(l), "light", l);
});

test("the boot script paints what shellScheme says, for every look, from either place the look is kept", () => {
  for (const look of ST.LOOKS) {
    const want = ST.shellScheme(look);
    const fromSettings = runBoot({ "ra-settings-v1": JSON.stringify({ v: 1, look }) });
    const fromLoam = runBoot({ loamTheme: look });
    if (want === null) { assert.deepEqual(fromSettings, {}, look + " (settings)"); assert.deepEqual(fromLoam, {}, look + " (loamTheme)"); }
    else { assert.equal(fromSettings["data-theme"], want, look + " (settings)"); assert.equal(fromLoam["data-theme"], want, look + " (loamTheme)"); }
  }
});

test("the boot script leaves the page alone when nothing is kept, the record is damaged, or storage refuses", () => {
  assert.deepEqual(runBoot({}), {});
  assert.deepEqual(runBoot({ "ra-settings-v1": "{not json" }), {});
  assert.deepEqual(runBoot({ "ra-settings-v1": JSON.stringify({ v: 1, look: "<script>" }) }), {});
  assert.deepEqual(runBoot({}, { blocked: true }), {});
});

test("the canvas template has one Appearance button (View and Look together) and no separate Look button, and a three-dot More button", () => {
  assert.equal((template.match(/id="bTheme"/g) || []).length, 0, "the half-sun Look button is gone: the Look is a section of the Appearance menu");
  assert.equal((template.match(/id="bLens"/g) || []).length, 1);
  assert.match(template, /<button[^>]*id="bLens"[^>]*aria-label="Appearance: View and Look"[^>]*hidden/, "named for both, hidden until the canvas knows it can show it");
  assert.match(template, /id = 'lensMenu'|id="lensMenu"/, "one menu holds both sections");
  assert.match(template, /aria-label="Look" class="lkgrid"/, "the Look section has its four chips");
  assert.match(template, /Appearance\. View: /, "the button's name says the View and the Look now worn");
  assert.match(template, /const lookAvail = \(\) => !EMBED \|\| SA;/, "shown on the standalone file and on the Atlas page (?sa), as the Look and View buttons were");
  assert.match(template, /const lensAvail = \(\) => lookAvail\(\) && !S\.pr;/, "the button stays in Compare; only the View choices wait");
  assert.match(template, /Compare is laying the people out, so the views wait\. Stop comparing to choose one\./, "in Compare the View items say why they are disabled");
  assert.match(template, /postMessage\(\{ tcLookSet: k \}/, "a chip asks the page around the canvas, which keeps the Look, as the old button did");
  assert.match(template, /set\('#bMore',\s*'more'\)/, "the phone-width More button no longer wears a gear that looks like a sun");
});

test("the page loads the boot script as its own file (the page's CSP allows no inline script) and before it paints", () => {
  assert.match(page, /<script is:inline src="\/tree-canvas\/theme-boot\.js"><\/script>/);
  assert.ok(page.indexOf('<script is:inline src="/tree-canvas/theme-boot.js">') < page.indexOf('<script is:inline src="/tree-canvas/app.js"'), "boot script comes first");
  assert.doesNotMatch(boot, /\bfetch\b|XMLHttpRequest|sendBeacon|WebSocket/, "the boot script reads storage and nothing else");
});

test("the page accepts a look only from the canvas, only one it knows, and keeps it through the Settings code", () => {
  assert.match(app, /tcLookSet/);
  assert.match(app, /ST\.LOOKS\.includes\(d\.tcLookSet\)/, "an unknown value is ignored");
  assert.match(app, /ST\.write\(\{\s*look\s*\}\)/, "kept through the same settings record the drawer uses");
});

/* The Fix list page wears the canvas's own look (Sticker, Paper, Ground), not just light or dark. */
test("the boot script and the page say which colour look is worn, and only the three colour looks", () => {
  for (const look of ["sticker", "paper", "ground"]) assert.equal(runBoot({ "ra-settings-v1": JSON.stringify({ v: 1, look }) })["data-look"], look, look);
  for (const look of ["auto", "lanes", "countries", "names"]) assert.equal(runBoot({ "ra-settings-v1": JSON.stringify({ v: 1, look }) })["data-look"], undefined, look);
  assert.match(app, /data-look/, "wearLook keeps data-look in step with data-theme");
});

test("the Fix list's colours are the canvas's own for each look, and its fonts are files from this site, never another host", () => {
  const css = read("../public/tree-canvas/page.css");
  const tok = name => { const m = new RegExp("\\[data-theme=\"" + name + "\"\\]\\{([^}]*)\\}").exec(template); assert.ok(m, name); return m[1]; };
  const lk = (block, k) => (new RegExp("--lk-" + k + ":(#[0-9A-Fa-f]{6})").exec(block) || [])[1];
  for (const [look, scope] of [["sticker", "#fx {"], ["paper", '[data-look="paper"] #fx {'], ["ground", ':root[data-theme="dark"] #fx {']]) {
    const at = css.indexOf(scope); assert.ok(at >= 0, look);
    const block = css.slice(at, css.indexOf("}", at));
    for (const [v, k] of [["bg", "paper"], ["card", "card"], ["line", "line"], ["ink", "ink"]]) {
      const want = lk(tok(look === "sticker" ? "sticker" : look), k).toLowerCase();
      assert.ok(block.toLowerCase().includes("--" + v + ": " + want), look + " " + v + " is the canvas's " + want);
    }
  }
  for (const f of ["lilita-one-latin", "lilita-one-ext", "nunito-latin", "nunito-ext"]) assert.ok(fs.existsSync(path.join(here, "../public/tree-canvas/fonts/" + f + ".woff2")), f);
  assert.doesNotMatch(css, /url\((?!\/tree-canvas\/fonts\/)(?!["']?data:)/, "no font or image from anywhere but this site");
  assert.match(page, /font-src 'self';/);
  assert.doesNotMatch(page, /font-src[^;]*(https?:|\*)/);
});

test("Settings: the Layout tiles at the top map to real looks and wire to the one write path", () => {
  const tiles = [...page.matchAll(/data-sglook="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(tiles, ["tree", "lanes", "countries", "names"]);
  for (const t of tiles.filter(x => x !== "tree")) assert.ok(ST.LOOKS.includes(t), t + " is a look the settings know");
  assert.ok(page.indexOf('id="sgLayT"') < page.indexOf('id="sgLivT"'), "the Layout section comes first");
  assert.match(app, /document\.querySelectorAll\('#sg \.sglk'\)[\s\S]*lookSet\(look\)/, "a tile uses lookSet, like the Look button");
  assert.match(page, /<button type="button" class="sglk"[^>]*aria-pressed="false"/, "tiles are plain pressed-state buttons");
});
