/* Opening a GEDCOM or tree.json from a link (public/roots/js/openlink.js): what may be fetched, and what happens to the reply. No network: fetch is a stub. */
import test from "node:test";
import assert from "node:assert/strict";
import { parseLink, fetchBytes, fileNameOf, MAX_BYTES } from "../public/roots/js/openlink.js";

const bad = (s, re) => { const r = parseLink(s); assert.equal(r.ok, false, s); if (re) assert.match(r.error, re, s); };

test("addresses that are refused, each with a reason in plain words", () => {
  bad("", /Paste the address/);
  bad("notalink", /web address/);
  bad("not a link", /space/);
  bad("http://raw.githubusercontent.com/a/b/main/tree.json", /https:\/\//);
  bad("ftp://example.org/tree.json", /Only https/);
  bad("javascript:alert(1)", /Only https/);
  bad("data:text/plain,0%20HEAD", /Only https/);
  bad("file:///etc/passwd", /Only https/);
  bad("https://user:pw@raw.githubusercontent.com/a/b/main/tree.json", /user name or password/);
  bad("https://raw.githubusercontent.com:8443/a/b/main/tree.json", /special port/);
  bad("https://localhost/tree.json", /not a public website/);
  bad("https://127.0.0.1/tree.json", /not a public website/);
  bad("https://192.168.1.10/tree.json", /not a public website/);
  bad("https://[::1]/tree.json", /not a public website/);
  bad("https://2130706433/tree.json", /not a public website/);   // 127.0.0.1 written as one number: the URL parser turns it into dotted form
  bad("https://nas.local/tree.json", /not a public website/);
  bad("https://files.internal/tree.json", /not a public website/);
  bad("https://intranet/tree.json", /not a public website/);
  bad("https://example.org/a b.json", /space/);
  bad("https://example.org/" + "a".repeat(2100), /too long/);
});

test("a public https address is accepted, with no fragment", () => {
  const r = parseLink("  https://raw.githubusercontent.com/daviddef/tree/main/tree.json#top  ");
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://raw.githubusercontent.com/daviddef/tree/main/tree.json");
  assert.equal(r.host, "raw.githubusercontent.com");
  assert.equal(r.note, "");
  assert.equal(parseLink("https://someone.github.io/family/tree.json").ok, true);
  assert.equal(parseLink("https://xn--bcher-kva.example.org/tree.json").ok, true);
});

test("the github.com page of a file becomes its raw address, and says so", () => {
  const r = parseLink("https://github.com/daviddef/TheTree/blob/main/data/tree.json");
  assert.equal(r.ok, true);
  assert.equal(r.url, "https://raw.githubusercontent.com/daviddef/TheTree/main/data/tree.json");
  assert.equal(r.host, "raw.githubusercontent.com");
  assert.match(r.note, /raw address/);
  const q = parseLink("https://github.com/a/b/raw/main/x.ged");
  assert.equal(q.url, "https://raw.githubusercontent.com/a/b/main/x.ged");
  const repo = parseLink("https://github.com/daviddef/TheTree");   // a repository page is left alone; the fetch will then say it is a web page
  assert.equal(repo.url, "https://github.com/daviddef/TheTree");
});

test("file names for the last-used list are plain", () => {
  assert.equal(fileNameOf("https://x.org/a/My%20Tree%20(2).json", "x.org"), "My Tree (2).json");
  assert.equal(fileNameOf("https://x.org/", "x.org"), "file from x.org");
  assert.equal(fileNameOf("https://x.org/%3Cscript%3E.json", "x.org"), "script.json");
  assert.equal(fileNameOf("https://x.org/" + "a".repeat(200) + ".json", "x.org").length, 60);
});

/* a stub fetch: body is text or bytes; `chunks` splits it so the stream reader is used */
const reply = (body, o = {}) => async (url, init) => {
  reply.last = { url, init };
  const buf = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const chunks = o.chunks || [buf];
  let i = 0;
  return {
    ok: o.status ? o.status < 400 : true, status: o.status || 200, url: o.finalUrl || url,
    headers: { get: k => (k.toLowerCase() === "content-length" && o.length != null ? String(o.length) : null) },
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }), cancel: async () => { o.cancelled = true; } }) },
  };
};
const L = "https://raw.githubusercontent.com/daviddef/tree/main/tree.json";

test("a good reply comes back as bytes, fetched with no cookies and no referrer", async () => {
  const r = await fetchBytes(L, { fetchImpl: reply('{"people":[{"id":"a"}]}') });
  assert.equal(r.ok, true);
  assert.equal(new TextDecoder().decode(r.bytes), '{"people":[{"id":"a"}]}');
  assert.equal(r.host, "raw.githubusercontent.com");
  assert.equal(reply.last.init.credentials, "omit");
  assert.equal(reply.last.init.referrerPolicy, "no-referrer");
  assert.equal(reply.last.init.redirect, "follow");
  assert.equal(reply.last.init.cache, "no-store");
});

test("a reply that arrives in pieces is put back together", async () => {
  const a = new TextEncoder().encode("0 HEAD\n1 CHAR UTF-8\n"), b = new TextEncoder().encode("0 @I1@ INDI\n0 TRLR\n");
  const r = await fetchBytes(L, { fetchImpl: reply(null, { chunks: [a, b] }) });
  assert.equal(r.ok, true);
  assert.equal(new TextDecoder().decode(r.bytes), "0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n0 TRLR\n");
});

test("a web page is refused, with the GitHub 'Raw' hint", async () => {
  for (const html of ["<!DOCTYPE html><html>", "  <html lang=en>", "<?xml version='1.0'?><svg>"]) {
    const r = await fetchBytes(L, { fetchImpl: reply(html) });
    assert.equal(r.ok, false); assert.equal(r.kind, "page"); assert.match(r.error, /Raw/);
  }
});

test("a blocked read (CORS or network) is explained, not shown as 'Failed to fetch'", async () => {
  const r = await fetchBytes(L, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
  assert.equal(r.ok, false); assert.equal(r.kind, "cors");
  assert.match(r.error, /Access-Control-Allow-Origin/); assert.match(r.error, /drop it on this page/); assert.doesNotMatch(r.error, /Failed to fetch/);
});

test("a time-out says so", async () => {
  const r = await fetchBytes(L, { timeout: 20, fetchImpl: (u, init) => new Promise((_, no) => init.signal.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.equal(r.kind, "timeout");
});

test("status codes get a sentence each", async () => {
  for (const [s, re] of [[404, /no file at that address/i], [403, /refused/], [401, /sign-in/], [429, /too many/], [500, /answered 500/]]) {
    const r = await fetchBytes(L, { fetchImpl: reply("x", { status: s }) });
    assert.equal(r.ok, false); assert.equal(r.kind, "status"); assert.match(r.error, re, String(s));
  }
});

test("a redirect that ends somewhere not allowed is refused", async () => {
  for (const to of ["http://evil.example.net/x.json", "https://127.0.0.1/x.json", "https://intranet.corp/x.json"]) {
    const r = await fetchBytes(L, { fetchImpl: reply("{}", { finalUrl: to }) });
    assert.equal(r.ok, false, to); assert.equal(r.kind, "redirect", to);
  }
  const fine = await fetchBytes(L, { fetchImpl: reply("{}", { finalUrl: "https://cdn.example.net/x.json" }) });
  assert.equal(fine.ok, true); assert.equal(fine.finalHost, "cdn.example.net");
});

test("size: refused from the header, and stopped mid-stream when the header lies", async () => {
  const big = await fetchBytes(L, { fetchImpl: reply("{}", { length: MAX_BYTES + 1 }) });
  assert.equal(big.kind, "size"); assert.match(big.error, /MB/);
  const o = { chunks: [new Uint8Array(600), new Uint8Array(600), new Uint8Array(600)] };
  const stream = await fetchBytes(L, { max: 1000, fetchImpl: reply(null, o) });
  assert.equal(stream.kind, "size"); assert.equal(o.cancelled, true);
});

test("an empty reply, and an address that is not allowed, never reach fetch", async () => {
  assert.equal((await fetchBytes(L, { fetchImpl: reply("") })).kind, "empty");
  let called = false;
  const r = await fetchBytes("http://raw.githubusercontent.com/x.json", { fetchImpl: async () => { called = true; } });
  assert.equal(r.ok, false); assert.equal(r.kind, "address"); assert.equal(called, false);
});
