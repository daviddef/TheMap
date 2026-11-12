import test from "node:test";
import assert from "node:assert/strict";
import worker, { keyFor, originFor, cacheControlFor, corsFor } from "../src/index.js";

test("a folder is its index.html", () => {
  assert.equal(keyFor("/"), "index.html");
  assert.equal(keyFor("/place/senj/"), "place/senj/index.html");
});
test("a file is itself, accents decoded", () => {
  assert.equal(keyFor("/p/senj.json"), "p/senj.json");
  assert.equal(keyFor("/surname/%C5%BEubrini%C4%87/"), "surname/žubrinić/index.html");
});
test("traversal and bad escapes are refused", () => {
  assert.equal(keyFor("/a/../b"), null);
  assert.equal(keyFor("/%E0%A4%A"), null);
});

test("the origin URL always stays on the origin host", () => {
  assert.equal(originFor("https://recordatlas.org", "/place/senj/", "?x=1"), "https://recordatlas.org/place/senj/?x=1");
  assert.equal(originFor("https://recordatlas.org/", "/a", ""), "https://recordatlas.org/a");
  for (const p of ["//evil.com/x", "///evil.com", "//place//senj/", "/\\evil.com"]) {
    const u = new URL(originFor("https://recordatlas.org", p, ""));
    assert.equal(u.host, "recordatlas.org", p);
  }
});

test("html is marked no-transform, data files are not", () => {
  assert.match(cacheControlFor("place/senj/index.html"), /no-transform/);
  assert.doesNotMatch(cacheControlFor("surnames.json"), /no-transform/);
});

test("CORS is for the research publications and nothing else", () => {
  assert.equal(corsFor("/research-sessions.json"), true);
  assert.equal(corsFor("/research-receipts/defranceschi.json"), true);
  for (const p of ["/", "/place/senj/", "/p/senj.json", "/research-sessions.json.bak", "/research-receipts", "/my-research/", "/a/research-receipts/x.json"]) assert.equal(corsFor(p), false, p);
});

test("a receipt answered from R2 carries Access-Control-Allow-Origin *, and a place page does not", async () => {
  const obj = (body) => ({ body, httpEtag: '"e"' });
  const env = { ORIGIN: "https://example.invalid", SITE: { get: async (k) => obj(k), head: async () => null } };
  const get = (path, method = "GET") => worker.fetch(new Request("https://recordatlas.org" + path, { method }), env);
  const r = await get("/research-receipts/defranceschi.json");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal((await get("/research-sessions.json")).headers.get("access-control-allow-origin"), "*");
  assert.equal((await get("/research-receipts/defranceschi.json", "HEAD")).headers.get("access-control-allow-origin"), "*");
  assert.equal((await get("/place/senj/")).headers.get("access-control-allow-origin"), null);
  assert.equal((await get("/research-receipts/x.json", "POST")).status, 405);   // GET and HEAD only
});

test("a receipt that R2 does not hold yet is answered by the origin, with the header too", async () => {
  const env = { ORIGIN: "https://example.invalid", SITE: { get: async () => null, head: async () => null } };
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const r = await worker.fetch(new Request("https://recordatlas.org/research-receipts/falco.json"), env);
    assert.equal(r.headers.get("x-served-from"), "origin");
    assert.equal(r.headers.get("access-control-allow-origin"), "*");
  } finally { globalThis.fetch = real; }
});
