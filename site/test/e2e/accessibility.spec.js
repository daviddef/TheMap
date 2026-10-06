/* THE AUDIT, WIRED.
 *
 * An axe-core pass over the four page shapes. It exists because the one-off
 * audit that found these faults found 59 failing elements on a single surname
 * page, all of them one CSS variable — and a one-off audit that is not wired
 * in is a thing that was true once.
 *
 * axe comes from node_modules, not a CDN. A check that needs the network to
 * pass is not a check; it is a check plus a coin toss.
 *
 * SERIOUS AND CRITICAL ONLY, deliberately. axe's "minor" and "moderate"
 * findings include judgement calls this project has already made differently
 * on purpose, and a gate that cries about those gets turned off. These two
 * levels are the ones where a reader cannot use the page.
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";

const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

const PAGES = [
  ["the map",        "/"],
  ["a place",        "/place/aberdeen/"],
  ["a surname",      "/surname/blazevic/"],
  ["the data index", "/data/"],
  ["the region index", "/jurisdictions/"],
];

for (const [what, path] of PAGES) {
  test(`${what} is usable by somebody who cannot see it`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res.status(), `${path} should exist`).toBe(200);
    /* The map builds itself from three fetches; auditing before they land
       audits an empty div and passes for the wrong reason. */
    await page.locator("#ra-count").waitFor({ state: "attached", timeout: 30000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
    await page.addScriptTag({ path: AXE });

    const bad = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ["violations"] });
      return r.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          n: v.nodes.length,
          where: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
        }));
    });

    /* Printed rather than summarised, because "3 violations" sends the next
       reader back to the browser and this sends them to the element. */
    const say = bad.map((v) =>
      `  [${v.impact}] ${v.id} x${v.n} — ${v.help}\n      ${v.where.join("\n      ")}`
    ).join("\n");
    expect(bad, `${path}\n${say}`).toEqual([]);
  });
}
