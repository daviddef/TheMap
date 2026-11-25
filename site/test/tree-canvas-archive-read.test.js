/* Opening an archive's own tree on the canvas (its header button sends ?archive=<key>). On 23 Nov 2026 the archives' /roots/ pages were removed (each is now a redirect stub that
   answers 200 and carries no tree), and the canvas, which read its data from /roots/, fell back to the empty opening screen for every archive. It now reads /roots/view.html first,
   the viewer the person pages frame, and the old page second, and takes a page only if it really carries both script blocks. Every host and page here is made up. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readArchiveHtml, ARCHIVE_PAGES } from "../public/tree-canvas/compare-set.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = "family.example";
const VIEWER = '<html><script>const TREE={"people":[]};const ATLAS={"places":[]};</script></html>';
const STUB = '<!doctype html><title>Redirecting to: /trees/</title><meta http-equiv="refresh" content="0;url=/trees/">';
const resp = (status, body = "") => ({ ok: status >= 200 && status < 300, status, text: async () => body });
/* a fake server: path -> Response (or a function that throws); records what was asked, in order */
const server = routes => { const asked = []; const doFetch = async (url, signal) => { asked.push(url.replace("https://" + HOST, "")); const r = routes[new URL(url).pathname]; if (typeof r === "function") return r(signal); return r || resp(404); }; return { doFetch, asked }; };

test("the pages are tried in this order: the viewer, then the old roots page", () => {
  assert.deepEqual(ARCHIVE_PAGES, ["/roots/view.html", "/roots/"]);
});

test("the viewer carries the tree: it is read, and the old page is never asked for", async () => {
  const s = server({ "/roots/view.html": resp(200, VIEWER), "/roots/": resp(200, STUB) });
  assert.equal(await readArchiveHtml(HOST, s.doFetch), VIEWER);
  assert.deepEqual(s.asked, ["/roots/view.html"]);
});

test("the case that broke: /roots/ is a redirect stub that answers 200 with no tree, and the viewer is there", async () => {
  const s = server({ "/roots/": resp(200, STUB), "/roots/view.html": resp(200, VIEWER) });
  assert.equal(await readArchiveHtml(HOST, s.doFetch), VIEWER);
});

test("an archive that still serves the tree on its roots page, and has no viewer, is still read", async () => {
  const s = server({ "/roots/": resp(200, VIEWER) });
  assert.equal(await readArchiveHtml(HOST, s.doFetch), VIEWER);
  assert.deepEqual(s.asked, ["/roots/view.html", "/roots/"]);
});

test("a viewer that answers 200 without both blocks is not taken (a page with only the tree has no places to draw)", async () => {
  const half = '<script>const TREE={"people":[]};</script>';
  const s = server({ "/roots/view.html": resp(200, half), "/roots/": resp(200, VIEWER) });
  assert.equal(await readArchiveHtml(HOST, s.doFetch), VIEWER);
  const s2 = server({ "/roots/view.html": resp(200, half), "/roots/": resp(200, STUB) });
  await assert.rejects(() => readArchiveHtml(HOST, s2.doFetch), /no tree on \/roots\//);
});

test("nothing carries the tree: it fails, and says why, instead of drawing an empty canvas", async () => {
  await assert.rejects(() => readArchiveHtml(HOST, server({ "/roots/": resp(200, STUB) }).doFetch), /no tree on \/roots\//);
  await assert.rejects(() => readArchiveHtml(HOST, server({}).doFetch), /HTTP 404/);
});

test("a network error on the viewer moves on to the old page; the last failure is the one reported", async () => {
  const boom = () => { throw new TypeError("Failed to fetch"); };
  const s = server({ "/roots/view.html": boom, "/roots/": resp(200, VIEWER) });
  assert.equal(await readArchiveHtml(HOST, s.doFetch), VIEWER);
  await assert.rejects(() => readArchiveHtml(HOST, server({ "/roots/view.html": boom, "/roots/": boom }).doFetch), /Failed to fetch/);
});

test("an aborted request stays an abort: the time limit and a changed choice must stop the read, not start another", async () => {
  const abort = () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  const s = server({ "/roots/view.html": abort, "/roots/": resp(200, VIEWER) });
  await assert.rejects(() => readArchiveHtml(HOST, s.doFetch), e => e.name === "AbortError");
  assert.deepEqual(s.asked, ["/roots/view.html"], "the old page is not tried after an abort");
});

test("the signal is handed to every request, and the request is for that archive's own host only", async () => {
  const seen = []; const doFetch = async (url, signal) => { seen.push([url, signal]); return resp(200, VIEWER); };
  const sig = { aborted: false };
  await readArchiveHtml(HOST, doFetch, sig);
  assert.deepEqual(seen, [["https://" + HOST + "/roots/view.html", sig]]);
});

test("app.js reads an archive through readArchiveHtml and no longer fetches /roots/ itself for the tree", () => {
  const src = fs.readFileSync(path.join(here, "../public/tree-canvas/app.js"), "utf8");
  const fn = src.slice(src.indexOf("async function fetchArchive"), src.indexOf("/* an archive's drawing of its research lines"));
  assert.match(fn, /CS\.readArchiveHtml\(a\.host/);
  assert.doesNotMatch(fn, /\+ '\/roots\/'/, "fetchArchive must not ask for the removed /roots/ page directly");
  assert.match(fn, /jsonAfter\(html, 'const TREE='\)/);
  assert.match(fn, /jsonAfter\(html, 'const ATLAS='\)/);
});
