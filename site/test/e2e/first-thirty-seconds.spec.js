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

test("the three filters are one control, and none of them shoves the map", async ({ page }) => {
  await ready(page);
  /* They were eight loose pills beside two tidy disclosures — the control a
     reader touches most looking like scattered chrome next to two that
     looked designed. All three say their own state now, so a closed one
     still answers "what is on the map". */
  for (const id of ["ra-laysum", "ra-catsum", "ra-kindsum"]) {
    await expect(page.locator("#" + id)).toContainText(/—/);
  }
  const mapTop = async () => (await page.locator("#ra-map").boundingBox()).y;
  const settled = await mapTop();
  await page.locator("#ra-layersw summary").click();
  await page.waitForTimeout(300);
  /* A popover, not a fold-out: opening a filter must not move the map. */
  expect(await mapTop()).toBe(settled);
  /* One at a time. */
  await page.locator("#ra-catsw summary").click();
  await page.waitForTimeout(300);
  await expect(page.locator("#ra-layersw[open]")).toHaveCount(0);
  /* And a click anywhere else closes it. */
  await page.locator("#ra-map").click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(300);
  await expect(page.locator(".ra-drop[open]")).toHaveCount(0);
});

test("a dropdown stays on screen at every width the bar wraps at", async ({ page }) => {
  await ready(page);
  /* The bar WRAPS, so the same control is at the right-hand end at one
     width and the left-hand end at another. A breakpoint cannot know which:
     flipping the last one to right-aligned under 900px duly pushed it 49
     pixels off the LEFT edge, because by then the bar had wrapped. */
  for (const width of [1100, 820, 640, 480, 380]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(250);
    for (const id of ["ra-layersw", "ra-catsw", "ra-kindw"]) {
      await page.locator(`#${id} summary`).click();
      await page.waitForTimeout(220);
      const b = await page.locator(`#${id} .ra-drop-in`).boundingBox();
      expect(b.x, `${id} at ${width}px runs off the left`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${id} at ${width}px runs off the right`)
        .toBeLessThanOrEqual(width + 1);
      await page.locator(`#${id} summary`).click();
      await page.waitForTimeout(120);
    }
  }
});

test("full screen keeps the controls, which is the point of controls", async ({ page }) => {
  await ready(page);
  /* Full screen fixed only the map and its panel to the viewport, and the
     control bar is their SIBLING — so going full screen left the search
     box, the layers, the year and every button underneath the overlay.
     David asked where the search box had gone. The `/` shortcut made it
     worse by focusing a box nobody could see. */
  await page.locator("#ra-full").click();
  await page.waitForTimeout(400);
  const q = page.locator("#ra-q");
  await expect(q).toBeVisible();
  const box = await q.boundingBox();
  const vh = page.viewportSize().height;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vh);
  /* And the map must start below the bar rather than under it. */
  const bar = await page.locator(".ra-bar").boundingBox();
  const map = await page.locator("#ra-map").boundingBox();
  expect(map.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  /* The way out stays reachable and does not sit on top of the bar. */
  const esc = await page.locator("#ra-fs-esc").boundingBox();
  expect(esc.y).toBeGreaterThan(bar.y + bar.height);
  /* And the count, which reports on the filters, is in the bar with them —
     it used to live under the map, so the one line saying whether a filter
     did anything was missing in the mode where the map is biggest. */
  await expect(page.locator(".ra-bar #ra-count")).toHaveCount(1);
  await expect(page.locator("#ra-count")).toContainText(/places shown/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".at-wrap.ra-fs")).toHaveCount(0);
});

test("full screen on a phone still leaves the map most of the screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  await page.locator("#ra-full").click();
  await page.waitForTimeout(500);
  /* The bar wraps to 268px at this width. Uncapped it took a third of the
     window in the one mode whose whole purpose is to give the map the
     window, so it is capped and scrolls — the search row stays, the rest
     is one scroll away. */
  const bar = await page.locator(".ra-bar").boundingBox();
  expect(bar.height).toBeLessThanOrEqual(110);
  await expect(page.locator("#ra-q")).toBeVisible();
  const map = await page.locator("#ra-map").boundingBox();
  expect(map.height).toBeGreaterThan(300);
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
