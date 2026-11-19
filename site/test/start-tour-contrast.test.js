/* The tour's text colours, measured. WCAG 2: body text >= 4.5:1, large text (>= 24px, or >= 18.66px bold) >= 3:1.
 *
 * The tour sits over a dot map. Small text sits on a "plate" (the ground colour at 78% opacity). The worst thing that can be behind a
 * plate is a full-strength map dot, so every small-text colour is checked against the plate over the brightest dot colour the tour draws
 * for the map base (#5C7E8D), and the large headlines against the ground itself. The live page was also checked in a browser against
 * the pixels of the canvas under every line of text (see the pull request); this keeps the palette from drifting. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../public/start-tour.css", import.meta.url), "utf8");
const root = css.match(/#ra-tour\{--ground:[^}]*\}/)[0] + css.match(/#ra-tour\{--ink-3:[^}]*\}/)[0];
const V = (name) => { const m = root.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6,8})`, "g")); return m[m.length - 1].split(":")[1].trim(); };

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const alpha = (h) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const DOT = rgb("#5C7E8D");                                    // the brightest map base dot
const plate = V("--plate");
const onPlate = over(rgb(plate), DOT, alpha(plate));           // the plate over that dot
const ground = rgb(V("--ground"));

test("small text colours reach 4.5:1 on the plate, over the worst map dot", () => {
  for (const name of ["--ink", "--ink-2", "--ink-3", "--accent", "--accent-2"]) {
    const r = ratio(rgb(V(name)), onPlate);
    assert.ok(r >= 4.5, `${name} ${V(name)} is ${r.toFixed(2)}:1 on the plate`);
  }
});

test("text on the plain ground reaches 4.5:1", () => {
  for (const name of ["--ink", "--ink-2", "--ink-3", "--accent", "--accent-2", "--brass", "--brick"]) {
    const r = ratio(rgb(V(name)), ground);
    assert.ok(r >= 4.5, `${name} ${V(name)} is ${r.toFixed(2)}:1 on the ground`);
  }
});

test("handwriting on the paper reaches 4.5:1", () => {
  assert.ok(ratio(rgb(V("--paper-ink")), rgb(V("--paper"))) >= 4.5);
});

test("the plate is there for the small captions, and no rule hides text by colour alone", () => {
  for (const sel of [".note", ".atl", ".hint", ".photo-cap", ".legend span", ".yearrow .who", ".coda p"])
    assert.ok(css.includes(`#ra-tour ${sel}`), `${sel} has no plate rule`);
});
