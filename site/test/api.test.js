/* The read API and the remote MCP server (workers/api), tested on small invented files: no network, no account. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeTools } from "../../workers/api/src/tools.js";
import { makeHandler } from "../../workers/api/src/handler.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/record-reader.js"), "utf8"))(mod);
const R = mod.exports;
const terms = JSON.parse(fs.readFileSync(path.join(here, "../../data/record-terms.json"), "utf8"));

const FILES = {
  "given-names.json": { built: "2026-11-06", rows: [
    { canon: "John", id: "john", forms: 4, langs: { latin: [{ form: "Joannes", status: "seen", seen: 3 }, { form: "Joannem", status: "rule", notNominative: "accusative" }], italian: [{ form: "Giovanni", status: "seen", seen: 5 }], croatian: [{ form: "Ivan", status: "seen", seen: 2 }] } },
    { canon: "Ivan", id: "ivan-x", forms: 1, langs: { russian: [{ form: "Иван", status: "lead" }, { form: "Ivan", status: "lead" }] } },
  ] },
  "providers.json": { access: { free: "Free to search" }, providers: [
    { id: "a-hr", name: "State Archive Rijeka", url: "https://x.example/", kind: "regional-archive", access: "free", countries: ["HR"], what: "Registers." },
    { id: "b-it", name: "Archivio Trieste", url: "https://y.example/", kind: "national-archive", access: "catalogue", countries: ["IT"], what: "Civil acts." },
  ] },
  "context.json": { generated: "2026-11-06", contract: { version: 1 }, rule: "from <= year < to", counts: { regions: 60 } },
};
const load = async name => { if (!FILES[name]) throw new Error("no such file"); return FILES[name]; };
const handle = makeHandler(makeTools({ load, R, terms }));
const get = (p, h) => handle(new Request("https://api.test" + p, { headers: h }), { APP_KEYS: JSON.stringify([{ name: "test-app", sha256: "" }]) });
const rpc = (body, h) => handle(new Request("https://api.test/mcp", { method: "POST", body: JSON.stringify(body), headers: h }), {});

test("a given name returns every spelling, and a name in two families is ambiguous, never a guess", async () => {
  const j = await (await get("/v1/given-name/Joannes")).json();
  assert.equal(j.ambiguous, false); assert.equal(j.matches[0].canonical, "John"); assert.equal(j.asOf, "2026-11-06");
  assert.deepEqual(j.matches[0].languages.italian.map(f => f.form), ["Giovanni"]);
  assert.equal(j.matches[0].languages.latin[1].case, "accusative");
  const amb = await (await get("/v1/given-name/Ivan")).json();
  assert.equal(amb.ambiguous, true); assert.equal(amb.matches.length, 2);
  const none = await (await get("/v1/given-name/Zzyzx")).json();
  assert.equal(none.found, false); assert.match(none.note2, /not a finding/);
  const fold = await (await get("/v1/given-name/joannes")).json(); assert.equal(fold.matches.length, 1, "case does not matter");
});

test("a register word, with another ending and an abbreviation, finds its card with its sources", async () => {
  const j = await (await get("/v1/term?q=uxoris")).json();
  assert.equal(j.terms[0].id, "uxor"); assert.ok(j.terms[0].sources.every(s => /^https:/.test(s)));
  const m = await (await get("/v1/term?q=7bris")).json(); assert.ok(m.terms.some(t => t.id === "september"));
  const none = await (await get("/v1/term?q=zzqx")).json(); assert.equal(none.found, false);
  const narrowed = await (await get("/v1/term?q=obstetrix&record=burial")).json(); assert.equal(narrowed.count, 0);
});

test("a date decodes with its working, and refuses to invent", async () => {
  const j = await (await get("/v1/date?text=" + encodeURIComponent("die 30 7bris 1671"))).json();
  assert.equal(j.text, "30 September 1671"); assert.equal(j.ok, true);
  const bad = await (await get("/v1/date?text=" + encodeURIComponent("31 aprilis 1700"))).json(); assert.equal(bad.ok, false);
});

test("providers filter by country and keep the access legend", async () => {
  const j = await (await get("/v1/providers?country=hr")).json();
  assert.equal(j.total, 1); assert.equal(j.providers[0].id, "a-hr"); assert.ok(j.accessLegend.free);
  assert.equal((await (await get("/v1/providers?q=trieste")).json()).providers[0].id, "b-it");
});

test("health, tool list, a missing route and a wrong method", async () => {
  const h = await (await get("/v1/health")).json(); assert.equal(h.ok, true); assert.equal(h.tools.length, 5);
  assert.equal((await (await get("/v1/tools")).json()).tools.length, 5);
  const nf = await get("/v1/nope"); assert.equal(nf.status, 404);
  const post = await handle(new Request("https://api.test/v1/health", { method: "POST" }), {}); assert.equal(post.status, 405);
  assert.equal((await handle(new Request("https://api.test/v1/health", { method: "OPTIONS" }), {})).status, 204);
  assert.equal((await get("/v1/health")).headers.get("Access-Control-Allow-Origin"), "*");
});

test("an app key that is sent and wrong is refused; no key is fine", async () => {
  assert.equal((await get("/v1/health", { "X-Atlas-Key": "not-a-key" })).status, 401);
  assert.equal((await get("/v1/health")).status, 200);
  const key = "my-secret-key", hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)))].map(b => b.toString(16).padStart(2, "0")).join("");
  const r = await handle(new Request("https://api.test/v1/health", { headers: { "X-Atlas-Key": key } }), { APP_KEYS: JSON.stringify([{ name: "my-app", sha256: hash }]) });
  assert.equal((await r.json()).app, "my-app");
});

test("MCP: initialize, list the tools, call one, and say what it does not know", async () => {
  const init = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
  assert.equal(init.result.serverInfo.name, "record-atlas"); assert.ok(init.result.capabilities.tools);
  const list = await (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
  assert.deepEqual(list.result.tools.map(t => t.name).sort(), ["atlas_context", "atlas_date", "atlas_given_name", "atlas_providers", "atlas_term"]);
  assert.ok(list.result.tools.every(t => t.inputSchema && t.description));
  const call = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "atlas_term", arguments: { word: "uxoris" } } })).json();
  assert.equal(call.result.isError, false); assert.match(call.result.content[0].text, /uxor/);
  const unknown = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "delete_everything" } })).json();
  assert.equal(unknown.error.code, -32602);
  assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 5, method: "ping" }).then(r => r.json())).result !== undefined, true);
  const bad = await handle(new Request("https://api.test/mcp", { method: "POST", body: "{not json" }), {}); assert.equal(bad.status, 400);
  assert.equal((await handle(new Request("https://api.test/mcp"), {})).status, 405);
});

test("there is no write tool, and a failing data file never leaks its cause", async () => {
  const tools = makeTools({ load, R, terms });
  assert.ok(Object.keys(tools).every(n => /^atlas_(given_name|term|date|providers|context)$/.test(n)));
  const broken = makeHandler(makeTools({ load: async () => { throw new Error("secret path /x/y"); }, R, terms }));
  const r = await broken(new Request("https://api.test/v1/context"), {});
  assert.equal(r.status, 500); assert.doesNotMatch(await r.text(), /secret/);
});

test("the Worker source names no secret and keeps nothing", () => {
  for (const f of ["tools.js", "handler.js", "index.js"]) {
    const s = fs.readFileSync(path.join(here, "../../workers/api/src", f), "utf8");
    assert.doesNotMatch(s, /localStorage|api[_-]?key\s*=\s*["'][A-Za-z0-9]{12,}|BEGIN (RSA|PRIVATE)/i, f);
  }
});
