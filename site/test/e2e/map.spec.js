/* The half of the testing that would have caught the bugs.
 *
 * Not wired into the deploy. It needs a browser download, and the build
 * already takes forty minutes; this wants its own job. Run it by hand:
 *
 *     cd site && npx playwright install chromium
 *     npx playwright test test/e2e --config test/e2e/playwright.config.js
 *
 * Every assertion here is a bug that actually shipped and was found by a
 * person looking at the page, which is the argument for the file
 * existing at all.
 */
import { test, expect } from "@playwright/test";

const MAP = "/TheMap/";

async function mapReady(page) {
  await page.goto(MAP);
  await expect(page.locator("#ra-map")).toBeVisible();
  /* The count only fills once the index has arrived and apply() has run. */
  await expect(page.locator("#ra-count")).not.toBeEmpty({ timeout: 45000 });
}

test("the index is requested before the page has finished loading", async ({ page }) => {
  /* It used to be requested at 4,821 ms because the map was built inside
     window.load, so the one file it cannot start without waited for every
     font and CDN script on the page. */
  const started = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/index.json")) started.push(Date.now());
  });
  const t0 = Date.now();
  await page.goto(MAP, { waitUntil: "load" });
  expect(started.length).toBeGreaterThan(0);
  expect(started[0] - t0).toBeLessThan(3000);
});

test("the quiet half arrives and every place is on the map", async ({ page }) => {
  await mapReady(page);
  const text = await page.locator("#ra-count").innerText();
  const [shown, total] = text.match(/([\d,]+) of ([\d,]+)/).slice(1)
    .map((n) => Number(n.replace(/,/g, "")));
  expect(shown).toBe(total);
  expect(total).toBeGreaterThan(20000);
});

test("a surname search lights only the countries it is attested in", async ({ page }) => {
  /* This left two hundred country markers standing across Africa and Asia
     next to eight lit outlines, and a reader reads dots as the name. */
  await mapReady(page);
  await page.fill("#ra-q", "Peeters");
  await expect(page.locator(".at-panel")).toContainText("Peeters", { timeout: 30000 });
  await expect(page.locator(".at-panel")).toContainText("Belgium");
  await expect(page.locator("#ra-count")).toContainText("0 of");
});

test("a surname with a page is linked, and the link is not a 404", async ({ page }) => {
  await mapReady(page);
  await page.fill("#ra-q", "Peeters");
  const link = page.locator(".at-panel .ra-go a").first();
  await expect(link).toBeVisible({ timeout: 30000 });
  const href = await link.getAttribute("href");
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
});

test("the panel heading is the name once, not the typing and then the name", async ({ page }) => {
  await mapReady(page);
  await page.fill("#ra-q", "peeters");
  const h = page.locator(".at-panel h3").first();
  await expect(h).toHaveText("Peeters", { timeout: 30000 });
});

test("a place search opens a place", async ({ page }) => {
  await mapReady(page);
  await page.fill("#ra-q", "Gallignana");
  await expect(page.locator(".at-panel")).toContainText(/Gračišće/, { timeout: 30000 });
});

test("the surname map draws land, not a black continent", async ({ page }) => {
  /* Astro scopes styles and the SVG arrives through set:html, so the
     first render was browser defaults: a black continent, invisible
     dots, on a light background inside a dark page. */
  await page.goto("/TheMap/surname/peeters/");
  const land = page.locator("svg.sm .sm-land").first();
  await expect(land).toBeVisible();
  const fill = await land.evaluate((el) => getComputedStyle(el).fill);
  expect(fill).not.toBe("rgb(0, 0, 0)");
});

test("the map still answers at a phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mapReady(page);
  const box = await page.locator("#ra-map").boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
  expect(box.height).toBeGreaterThan(200);
});
