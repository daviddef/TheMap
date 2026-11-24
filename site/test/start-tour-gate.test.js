/* The story tour decides, on every page, whether to open itself. That decision is a pure function (public/js/start-tour-gate.js), so it is
 * tested here with no browser. The rules it must keep: once per browser, only on the two front doors, never on a deep link, never for a
 * robot, never when storage is blocked (a tour that cannot remember it was shown would open on every visit). */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/* a classic script that exports its decisions when it finds a CommonJS module (the same way the other public/js files are tested) */
const G = (() => { const m = { exports: {} }; new Function("module", fs.readFileSync(new URL("../public/js/start-tour-gate.js", import.meta.url), "utf8"))(m); return m.exports; })();
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const fresh = (o = {}) => ({ path: "/", base: "/", search: "", hash: "", seen: false, canStore: true, webdriver: false, ua: CHROME, ...o });

test("a first visit to the home page or /start/ opens the tour", () => {
  assert.equal(G.shouldAutoOpen(fresh()), true);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/start/" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/start/index.html" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/start" })), true);
});

test("never again once seen, and never when this browser cannot remember", () => {
  assert.equal(G.shouldAutoOpen(fresh({ seen: true })), false);
  assert.equal(G.shouldAutoOpen(fresh({ canStore: false })), false);
});

test("a deep link is never interrupted", () => {
  for (const path of ["/map/", "/your-name/", "/tree-canvas/", "/places/rijeka/", "/flags/", "/help/", "/read/"])
    assert.equal(G.shouldAutoOpen(fresh({ path })), false, path);
  for (const search of ["?q=Gallignana", "?spot=rijeka", "?layers=shelf&years=1800,1920", "?view=45.1,14.3,8"])
    assert.equal(G.shouldAutoOpen(fresh({ search })), false, search);
  assert.equal(G.shouldAutoOpen(fresh({ hash: "#place=rijeka" })), false);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/start/", hash: "#the-whole-page" })), false);
});

test("a query that says nothing about where the visitor is going does not count as a deep link", () => {
  assert.equal(G.shouldAutoOpen(fresh({ search: "?utm_source=newsletter&utm_medium=email" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ search: "?fbclid=abc123" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ search: "?utm_source=x&q=Rijeka" })), false);
  assert.equal(G.plainQuery(""), true);
  assert.equal(G.plainQuery("?"), true);
});

test("/start/#story is a request, handled by the page; it still counts as a front door", () => {
  assert.equal(G.shouldAutoOpen(fresh({ path: "/start/", hash: "#story" })), true);
});

test("never for a robot or an automated browser", () => {
  assert.equal(G.shouldAutoOpen(fresh({ webdriver: true })), false);
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; bingbot/2.0)",
    "facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/120.0", "Lighthouse", "curl/8.0", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "Slackbot-LinkExpanding 1.0"])
    assert.equal(G.shouldAutoOpen(fresh({ ua })), false, ua);
});

test("a site under a base path is read the same way", () => {
  assert.equal(G.shouldAutoOpen(fresh({ path: "/TheMap/", base: "/TheMap/" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/TheMap/start/", base: "/TheMap" })), true);
  assert.equal(G.shouldAutoOpen(fresh({ path: "/TheMap/flags/", base: "/TheMap/" })), false);
  assert.equal(G.cleanPath("/TheMap/start/index.html", "/TheMap/"), "/start/");
  assert.equal(G.cleanPath("/start/", "/"), "/start/");
});

test("T opens the tour, unless the visitor is typing or holding a modifier", () => {
  const k = (o) => ({ key: "t", defaultPrevented: false, target: { tagName: "BODY" }, ...o });
  assert.equal(G.isTourKey(k({})), true);
  assert.equal(G.isTourKey(k({ key: "T" })), true);
  assert.equal(G.isTourKey(k({ key: "x" })), false);
  assert.equal(G.isTourKey(k({ target: { tagName: "INPUT" } })), false);
  assert.equal(G.isTourKey(k({ target: { tagName: "TEXTAREA" } })), false);
  assert.equal(G.isTourKey(k({ target: { tagName: "DIV", isContentEditable: true } })), false);
  assert.equal(G.isTourKey(k({ metaKey: true })), false);
  assert.equal(G.isTourKey(k({ ctrlKey: true })), false);
  assert.equal(G.isTourKey(k({ altKey: true })), false);
  assert.equal(G.isTourKey(k({ defaultPrevented: true })), false);
});

test("the always-on loader stays small and loads the heavy files only on open", () => {
  const raw = fs.readFileSync(new URL("../public/js/start-tour-gate.js", import.meta.url), "utf8");
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(src.length < 9500, `loader is ${src.length} bytes without comments, before minifying`);
  // the heavy files are named inside load(), which only open() calls
  const loadFn = src.slice(src.indexOf("function load()"), src.indexOf("function open("));
  for (const f of ["start-tour.css", "start-tour.html", "start-tour-land.txt", "js/start-tour.js"]) assert.ok(loadFn.includes(f), f);
  const outside = src.replace(loadFn, "");
  for (const f of ["start-tour.css", "start-tour.html", "start-tour-land.txt", "js/start-tour.js"]) assert.ok(!outside.includes(f), `${f} is fetched outside load()`);
  assert.ok(!/localStorage[^;]*;/.test(src.replace(/try\s*{[^}]*}/g, "")), "every storage call is inside try/catch");
});

test("the first-visit auto-open is switched off: a fresh visit to / or /start/ never opens it", () => {
  assert.equal(G.AUTO_OPEN, false, "AUTO_OPEN is the one line to turn it on later");
  assert.equal(G.autoOpenNow(fresh()), false);
  assert.equal(G.autoOpenNow(fresh({ path: "/start/" })), false);
  assert.equal(G.autoOpenNow(fresh({ path: "/start/index.html" })), false);
  assert.equal(G.shouldAutoOpen(fresh()), true, "the first-visit rules are kept, for when it is switched on");
});

test("boot() asks the switch, opens only from a request, and marks it seen only when it opens", () => {
  const raw = fs.readFileSync(new URL("../public/js/start-tour-gate.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const bootSrc = raw.slice(raw.indexOf("function boot("));
  assert.ok(bootSrc.includes("autoOpenNow(here)") && !/shouldAutoOpen\(here\)/.test(bootSrc), "boot goes through the switch");
  // the requests that still open it: a button or link, the T key, /start/#story
  assert.ok(bootSrc.includes("[data-tour-open]") && bootSrc.includes("isTourKey(e)") && bootSrc.includes('"#story"'));
  // "seen" is written in one place, inside open(), never on a page view
  assert.equal((raw.match(/markSeen\(\)/g) || []).length, 2, "the definition and the one call in open()");
  const open = raw.slice(raw.indexOf("function open("), raw.indexOf("w.raTour ="));
  assert.ok(open.includes("markSeen()"));
});
