/* THE FIRST THIRTY SECONDS, REHEARSED.
 *
 * Every improvement to this map has been measured against a reader who
 * already knows what it is. Nobody has sat with a stranger, handed them a
 * surname and watched where they get stuck — and every interface bug found
 * this week was found exactly that way, by accident, by David, one at a
 * time: the panel answering the previous question, two headings for one
 * name, country markers lit for a surname that has nothing to do with
 * them, half the screen spent on an explanation.
 *
 * This is the closest a machine can get to that. It walks the path a
 * stranger actually takes, in order, and asserts that each step produces
 * something a person could act on WITHIN THE TIME THEY WOULD GIVE IT. It
 * is deliberately not a unit test: nothing here reaches inside a function.
 * It asks the page the same questions a visitor would.
 *
 *     cd site && npx playwright install chromium
 *     npx playwright test test/e2e --config test/e2e/playwright.config.js
 */
import { test, expect } from "@playwright/test";

const MAP = "/TheMap/";

/* The atlas is ready when it has told the reader how much of it there is. */
async function ready(page) {
  await page.goto(MAP);
  await expect(page.locator("#ra-count")).not.toBeEmpty({ timeout: 45000 });
}
const state = (page) => page.evaluate(() => window.recordAtlas.state());

test("second one: the map says what it is doing instead of showing a grey box", async ({ page }) => {
  await page.goto(MAP);
  /* Server-rendered, so it is on screen in the first paint rather than
     after the three fetches the map cannot start without. */
  const note = page.locator("#ra-loading");
  await expect(note).toBeVisible({ timeout: 3000 });
  await expect(note).toContainText(/Loading the atlas|Drawing/);
  /* And it goes away. A loading notice that outlives the load is worse
     than none, because it says the page is broken. */
  await expect(note).toHaveCount(0, { timeout: 45000 });
});

test("second five: the panel asks for something the reader actually has", async ({ page }) => {
  await ready(page);
  const empty = page.locator("#ra-empty");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("Start with what you have");
  /* A surname first, because that is what people arrive holding. */
  await expect(empty.locator(".ra-try").first()).toBeVisible();
  /* And the one idea the colours carry, said in a sentence. */
  await expect(empty).toContainText(/colour of a dot is what it costs/i);
});

test("second ten: the world is legible rather than a grey smear", async ({ page }) => {
  await ready(page);
  const s = await state(page);
  expect(s.clustered).toBe(true);
  expect(s.shelfOnMap).toBe(false);
  /* The number that matters is what a reader can see at once, not how many
     cells exist worldwide. Under a hundred is a map; twenty-one thousand
     dots is a texture. */
  const onScreen = await page.evaluate(() => {
    const A = window.recordAtlas, b = A.map.getBounds();
    let n = 0;
    A.layers.clusters.eachLayer((l) => { if (b.contains(l.getLatLng())) n++; });
    return n;
  });
  expect(onScreen).toBeGreaterThan(5);
  expect(onScreen).toBeLessThan(120);
});

test("second twelve: clicking in twice hands back the real places", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.recordAtlas.map.setView([45.3, 14.0], 7, { animate: false }));
  await page.waitForTimeout(900);
  const s = await state(page);
  expect(s.clustered).toBe(false);
  expect(s.shelfOnMap).toBe(true);
});

test("second fifteen: a surname typed by hand answers with countries", async ({ page }) => {
  await ready(page);
  await page.locator("#ra-q").fill("Blažević");
  /* Fifteen seconds is generous for this; a reader gives it about three. */
  await expect(page.locator(".at-body .ra-surn").first()).toBeVisible({ timeout: 15000 });
  /* ONE heading for one name. There were two for «Defranceski», which is
     the bug that made this file necessary. */
  await expect(page.locator(".at-body .at-h h3")).toHaveCount(1);
});

test("second twenty: a name and a place, asked together", async ({ page }) => {
  await ready(page);
  await page.locator("#ra-q").fill("Blazevic Gracisce");
  await page.waitForTimeout(3000);
  const s = await state(page);
  expect(s.splitName).toBe("blazevic");
  expect(s.splitPlace).toBe("gracisce");
  /* The heading must be a name a person would recognise, not the folded
     lower-case form the matcher works in. */
  const head = await page.locator(".at-body .at-h h3").first().textContent();
  expect(head.trim().toLowerCase()).not.toBe("blazevic");
  /* And the two facts must not be conflated: the panel says which places
     stand in a country the register attests, and says what that does and
     does not mean. */
  await expect(page.locator(".at-what")).toContainText(/attested/i);
});

test("second twenty-five: the panel never answers the previous question", async ({ page }) => {
  await ready(page);
  await page.locator("#ra-q").fill("Kosina");
  await expect(page.locator(".at-body")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator("#ra-q").fill("Kranj");
  await page.waitForTimeout(3000);
  const body = await page.locator(".at-body").textContent();
  /* Typing a place while a surname was showing used to move the map to
     Carniola and leave the panel describing Kosina. */
  expect(body.toLowerCase()).not.toContain("kosina");
});

test("second thirty: there is a way out of everything", async ({ page }) => {
  await ready(page);
  await page.locator("#ra-q").fill("Gracisce");
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await expect(page.locator("#ra-q")).toHaveValue("");
  /* And the reader can reach the search box again without the mouse. */
  await page.keyboard.press("/");
  await expect(page.locator("#ra-q")).toBeFocused();
});

test("on a phone, the answer is not below the fold", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await ready(page);
  await page.locator("#ra-q").fill("Gracisce");
  await expect(page.locator(".at-body")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
  const panel = page.locator(".at-panel");
  const box = await panel.boundingBox();
  /* A sheet over the bottom of the map, which is where every phone map on
     earth puts one — not a box under 420 pixels of map that the reader
     never scrolls to. */
  expect(box.y).toBeLessThan(780);
  await expect(page.locator("#ra-sheet-x")).toBeVisible();
  await page.locator("#ra-sheet-x").click();
  await expect(page.locator("#ra-empty")).toBeVisible();
});
