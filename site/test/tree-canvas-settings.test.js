/* The Tree Canvas's Settings drawer: three short choices kept on the device and carried in the six-word copy.
   What these tests hold the code to:
   - nothing chosen means today's behaviour (living people shown as the file gives them, the last files kept, the look to suit the device): the defaults are not weakened;
   - the copy carries three enumerated values and nothing else, so there is no family data in it, and anything else in a file is dropped;
   - adding the section changes nothing else in the file, and a file without it still reads (old files, old clients);
   - a setting from another device only FILLS a choice this device has not made, so the living filter can never be switched off from elsewhere;
   - storage that refuses to write never throws. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ST from "../public/tree-canvas/settings.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/research-file.js"), "utf8"))(mod);   // a classic script
const RF = mod.exports;

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, _m: m }; };
const refusing = () => ({ getItem() { throw new DOMException("blocked", "SecurityError"); }, setItem() { throw new DOMException("quota", "QuotaExceededError"); }, removeItem() { throw new DOMException("blocked", "SecurityError"); } });

test("nothing chosen is today's behaviour: living shown as the file gives them, files kept, the look automatic", () => {
  assert.deepEqual(ST.effective(mem()), { living: false, look: "auto", remember: true });
  assert.deepEqual(ST.chosen(mem()), {});
  /* unreadable or hostile stored values fall back to the defaults, never to something looser or odd */
  assert.deepEqual(ST.effective(mem({ "ra-settings-v1": "{not json", loamTheme: "<script>", tcRemember: "maybe" })), { living: false, look: "auto", remember: true });
  assert.deepEqual(ST.effective(mem({ "ra-settings-v1": JSON.stringify({ v: 1, living: "yes", look: "neon", remember: 2 }) })), { living: false, look: "auto", remember: true });
  assert.deepEqual(ST.effective(refusing()), { living: false, look: "auto", remember: true });
});

test("a choice made in the canvas's older menu is still honoured, and is not lost when a new one is made", () => {
  const s = mem({ loamTheme: "paper", tcRemember: "0" });
  assert.deepEqual(ST.effective(s), { living: false, look: "paper", remember: false });
  ST.write({ living: 1 }, s);
  assert.deepEqual(ST.effective(s), { living: true, look: "paper", remember: false });
});

test("a choice is stored only once it is made, and the keys the canvas reads are kept in step", () => {
  const s = mem();
  assert.equal(ST.write({ living: 1 }, s).ok, true);
  assert.deepEqual(JSON.parse(s.getItem("ra-settings-v1")), { v: 1, living: 1 });
  assert.equal(s.getItem("loamTheme"), null, "the look was not chosen, so it is not written");
  ST.write({ look: "ground", remember: 0 }, s);
  assert.deepEqual(JSON.parse(s.getItem("ra-settings-v1")), { v: 1, living: 1, look: "ground", remember: 0 });
  assert.equal(s.getItem("loamTheme"), "ground"); assert.equal(s.getItem("tcRemember"), "0");
  ST.write({ look: "auto" }, s);
  assert.equal(s.getItem("loamTheme"), null, "automatic means the canvas chooses, so its own key is cleared");
  assert.equal(ST.effective(s).look, "auto");
  ST.write({ living: null, look: null, remember: null }, s);
  assert.equal(s.getItem("ra-settings-v1"), null, "forgetting every choice leaves nothing behind");
  assert.deepEqual(ST.effective(s), { living: false, look: "auto", remember: true });
});

test("storage that refuses to write never throws; the page is told so it can say the choice lasts only this visit", () => {
  const r = ST.write({ living: 1 }, refusing());
  assert.equal(r.ok, false); assert.equal(r.chosen.living, 1);
  assert.doesNotThrow(() => ST.write({ look: "paper" }, null));
});

/* ---- the six-word copy: the same rule in research-file.js ---- */
const TABLE = [
  { v: 1, living: 1 }, { v: 1, living: 0, look: "paper", remember: 0 }, { v: 1, look: "auto" }, { v: 1 }, { v: 2, living: 1 }, { living: 1 }, null, [], "x",
  { v: 1, living: true, look: "neon", remember: "1" }, { v: 1, living: 1, look: "countries", name: "Anna Example", p: { a: 1 }, remember: 1 },
  { v: 1, look: "<img src=x onerror=alert(1)>" }, { v: 1, living: 2 }, { v: 1, remember: -1 },
];
test("the page's cleaning rule and research-file.js's agree on every input", () => {
  for (const x of TABLE) assert.deepEqual(RF.cleanSettings(x), ST.clean(x), JSON.stringify(x));
});

test("the copy carries three enumerated values and nothing else: no name, no text, no tree", () => {
  const c = RF.cleanSettings({ v: 1, living: 1, look: "countries", remember: 0, name: "Anna Example", note: "my mother", people: [1, 2, 3], nested: { a: 1 } });
  assert.deepEqual(c, { v: 1, living: 1, look: "countries", remember: 0 });
  assert.deepEqual(Object.keys(c).sort(), ["living", "look", "remember", "v"]);
  const text = JSON.stringify(c);
  assert.ok(text.length < 70, "a few bytes: " + text);
  assert.equal(RF.cleanSettings({ v: 1, look: "Anna Example" }), null, "a look is one of the list or it is dropped");
});

const progress = () => ({ v: 1, active: "a", lines: { a: { name: "A", where: "", made: "2026-10-01" } }, marks: { "volume:X-1": { t: "Births", where: "Senj", by: { a: { done: [[1, 5]] } } } } });

test("settings ride in the file as a section of their own, only when chosen, and change nothing else in it", () => {
  const plain = RF.buildBackup(progress(), {}, Date.parse("2026-11-18T10:00:00Z"));
  assert.equal("settings" in plain, false);
  assert.equal("settings" in RF.buildBackup(progress(), {}, undefined, { settings: { v: 1 } }), false, "nothing chosen: no section");
  const withS = RF.buildBackup(progress(), {}, Date.parse("2026-11-18T10:00:00Z"), { settings: { v: 1, living: 1, look: "paper" } });
  assert.deepEqual(withS.settings, { v: 1, living: 1, look: "paper" });
  const rest = { ...withS }; delete rest.settings;
  assert.deepEqual(rest, plain, "everything else in the file is exactly as it was: a client that does not know the section reads the same file");
  assert.equal(withS.v, plain.v, "the file's own version is unchanged");
});

test("an old file (no settings) still reads, and a file with them reads back what was put in", () => {
  const old = RF.parseAny(JSON.stringify(RF.buildBackup(progress(), {})));
  assert.equal(old.settings, null); assert.equal(Object.keys(old.progress.marks).length, 1);
  const f = RF.buildBackup(progress(), {}, undefined, { settings: { v: 1, living: 1, remember: 0 } });
  assert.deepEqual(RF.parseAny(JSON.stringify(f)).settings, { v: 1, living: 1, remember: 0 });
  /* a hand-edited file cannot put anything but the three choices in */
  const evil = JSON.parse(JSON.stringify(f)); evil.settings = { v: 1, living: 1, look: "<script>alert(1)</script>", x: "y" };
  assert.deepEqual(RF.parseAny(JSON.stringify(evil)).settings, { v: 1, living: 1 });
});

test("a setting from another device only fills a choice this device has not made, and never replaces one", () => {
  assert.deepEqual(RF.settingsToFill({}, { v: 1, living: 1, look: "paper", remember: 0 }), { living: 1, look: "paper", remember: 0 }, "an empty device takes them");
  assert.deepEqual(RF.settingsToFill({ living: 1 }, { v: 1, living: 0, look: "paper" }), { look: "paper" }, "the living filter chosen here is not switched off from elsewhere");
  assert.deepEqual(RF.settingsToFill({ living: 0 }, { v: 1, living: 1 }), {}, "nor switched on: a device's own choice stands");
  assert.deepEqual(RF.settingsToFill({ look: "ground", remember: 1 }, { v: 1, look: "paper", remember: 0 }), {});
  assert.deepEqual(RF.settingsToFill({}, { v: 1, living: 7 }), {}, "junk is not a choice");
  assert.deepEqual(RF.settingsToFill(undefined, null), {});
});

test("the six-word save watches the settings, so a changed choice is saved too", () => {
  const m = { exports: {} };
  new Function("module", fs.readFileSync(path.join(here, "../public/js/sync-auto.js"), "utf8"))(m);
  assert.ok(m.exports.WATCH.includes("ra-settings-v1"));
  assert.ok(RF.KEY_SETTINGS === "ra-settings-v1");
});

/* ---- the page ---- */
const read = p => fs.readFileSync(path.join(here, p), "utf8");
test("the page: one drawer, reached from three places, with the living filter's wording and no new third party", () => {
  const astro = read("../src/pages/tree-canvas/index.astro"), app = read("../public/tree-canvas/app.js"), tpl = read("../../scripts/roots/tree-canvas.template.html");
  for (const id of ["sg", "sgLiv", "sgMh", "sgAnc", "sgLook", "sgRem", "sgClose", "stSettings", "yfSettings"]) assert.ok(astro.includes('id="' + id + '"'), id);
  assert.match(astro, /role="dialog" aria-modal="true" aria-labelledby="sgTitle"/);
  assert.match(astro, /no death or burial for them/, "what living means is said");
  assert.match(astro, /110 years/, "and it is the reader's rule");
  assert.match(app, /tcSettings/); assert.match(app, /ST\.write\(\{ living:/);
  assert.match(app, /e\.key === 'Escape' && !\$\('#sg'\)\.hidden/, "Escape closes the drawer first");
  /* the canvas points here instead of keeping its own copy: the Look chips, the links box and the keep-files tick go, on the standalone page only */
  assert.match(tpl, /data-gsettings/); assert.match(tpl, /tcSettings/);
  assert.match(tpl, /SA \? '' : `<div class="mmlook">/, "the menu's Look chips remain for an archive's embedded canvas");
  assert.ok(!/src="https?:\/\//.test(astro), "no external script");
  /* a card carries `hidden` and a display of its own: the attribute must still win, or "Your file is open" shows before any file is */
  assert.match(read("../public/tree-canvas/page.css"), /\.stcard\[hidden\]\s*\{\s*display:\s*none/);
});
