/* The admin page and routes of the "Ask Claude" Worker: they do not exist without the ADMIN_TOKEN secret, they need it for the data, and they
   show counts only. Nothing here touches the network. */
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../../workers/ai/src/index.js";
import { Ledger } from "../../workers/ai/src/ledger.js";
import { ADMIN_HTML } from "../../workers/ai/src/admin-page.js";

const DAY = 86400000, T0 = Date.UTC(2026, 10, 23, 12), ADMIN = "correct-horse-battery-staple-0123456789";
const fakeStorage = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, deleteAll: async () => m.clear() }; };

function rig(over = {}) {
  const ledgers = new Map();
  const ALLOW = { idFromName: n => n, get: n => { if (!ledgers.has(n)) ledgers.set(n, new Ledger(fakeStorage())); return ledgers.get(n); } };
  const env = { ALLOW, ALLOW_ORIGINS: "https://recordatlas.org", AI_ENABLED: "1", ANTHROPIC_API_KEY: "sk-test", TURNSTILE_SECRET: "ts-test", ADMIN_TOKEN: ADMIN, SITE_DAILY_REQUESTS: "150", ...over.env };
  if (over.noToken) delete env.ADMIN_TOKEN;
  const fetchFn = async (u, init) => {
    if (u.includes("turnstile")) return new Response(JSON.stringify({ success: true }));
    if (u.includes("anthropic")) return new Response(JSON.stringify({ content: [{ text: JSON.stringify({ draft: "x" }) }], usage: { input_tokens: 200, output_tokens: 80 } }));
    throw new Error("unexpected fetch " + u);
  };
  const admin = (path, { method = "GET", body, token = ADMIN, headers = {}, now = T0 } = {}) =>
    handle(new Request("https://ai.test" + path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...headers } }), env, { fetch: fetchFn, now });
  const ask = (path, body, now = T0) => handle(new Request("https://ai.test" + path, { method: "POST", body: JSON.stringify(body), headers: { Origin: "https://recordatlas.org", "X-Turnstile": "good", "CF-Connecting-IP": "203.0.113.7" } }), env, { fetch: fetchFn, now });
  return { env, admin, ask, ledgers };
}
const line = { text: "baptizatus est Cornelius" };

test("without ADMIN_TOKEN every admin path is a plain 404; it does not exist", async () => {
  const r = rig({ noToken: true });
  for (const [p, m] of [["/admin", "GET"], ["/v1/admin/ping", "GET"], ["/v1/admin/report", "GET"], ["/v1/admin/config", "GET"], ["/v1/admin/config", "PUT"]])
    assert.equal((await r.admin(p, { method: m, body: m === "PUT" ? {} : undefined })).status, 404, p);
  const empty = rig({ env: { ADMIN_TOKEN: "" } });
  assert.equal((await empty.admin("/v1/admin/ping", { token: "" })).status, 404, "an empty secret is no secret");
});

test("with the secret set, a missing or wrong token is 401 with no hint, and the right one is 200", async () => {
  const r = rig();
  for (const token of ["", "wrong", ADMIN + "x", ADMIN.slice(0, -1), "a".repeat(5000)]) {
    for (const p of ["/v1/admin/ping", "/v1/admin/report?days=7", "/v1/admin/config"]) {
      const res = await r.admin(p, { token }), t = await res.text();
      assert.equal(res.status, 401, p); assert.equal(t, JSON.stringify({ error: "unauthorized" })); assert.ok(!t.includes(ADMIN));
    }
  }
  assert.equal((await r.admin("/v1/admin/config", { method: "PUT", token: "wrong", body: { ANON_DAILY: 1 } })).status, 401);
  assert.equal((await r.env.ALLOW.get("admin").getConfig()).at, null, "a refused write changed nothing");
  const ok = await r.admin("/v1/admin/ping"); assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), { ok: true });
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  assert.equal((await r.admin("/v1/admin/ping", { headers: { Authorization: "Basic " + ADMIN } , token: null })).status, 401);
});

test("admin routes are answered before the origin check and send no CORS headers", async () => {
  const r = rig();
  const res = await r.admin("/v1/admin/ping", { headers: { Origin: "https://evil.example" } });
  assert.equal(res.status, 200); assert.equal(res.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal((await r.admin("/admin", { token: null, headers: { Origin: "https://evil.example" } })).status, 200);
  const pre = await r.admin("/v1/admin/ping", { method: "OPTIONS", token: null }); assert.ok(pre.status >= 400 && !pre.headers.get("Access-Control-Allow-Origin"), "no CORS preflight is ever approved");
  assert.equal((await r.admin("/v1/admin/nothing")).status, 404);
  assert.equal((await r.admin("/admin/extra", { token: null })).status, 404);
  assert.equal((await r.admin("/admin", { method: "POST", token: null })).status, 404);
});

test("GET /admin is one self-contained page: no token in it, no external request, locked down headers", async () => {
  const r = rig(), res = await r.admin("/admin", { token: null }), html = await res.text();
  assert.equal(res.status, 200); assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.equal(res.headers.get("Cache-Control"), "no-store"); assert.match(res.headers.get("X-Robots-Tag"), /noindex/);
  const csp = res.headers.get("Content-Security-Policy");
  assert.match(csp, /default-src 'none'/); assert.match(csp, /connect-src 'self'/); assert.match(csp, /script-src 'unsafe-inline'/); assert.match(csp, /style-src 'unsafe-inline'/);
  assert.ok(!/script-src[^;]*(https?:|\*)/.test(csp));
  assert.equal(html, ADMIN_HTML);
  assert.ok(!html.includes(ADMIN) && !html.includes("sk-test") && !html.includes("ts-test"), "no secret in the page");
  const urls = html.match(/(?:https?:)?\/\/[^\s"'<>)]+/g) || [];
  assert.deepEqual(urls, ["https://recordatlas.goatcounter.com"], "the only address in the page is the visit counter link");
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|<img|<iframe|url\(/i.test(html), "no external script, stylesheet, image or frame");
  assert.ok(!/\.innerHTML|insertAdjacentHTML|document\.write|outerHTML/.test(html), "dynamic text goes in with textContent only");
  assert.match(html, /sessionStorage/); assert.ok(!/localStorage|document\.cookie/.test(html), "the token lives in sessionStorage only");
  for (const c of ["#EDEBE5", "#F7F6F2", "#16222A", "#1F5C6B", "#101820", "#17212A", "#E8E6DF", "#6FB6C6"]) assert.ok(html.includes(c), c);
  assert.match(html, /prefers-color-scheme: dark/); assert.match(html, /Fraunces, Georgia/); assert.match(html, /name="viewport"/);
  for (const w of ["Estimated cost", "ESTIMATE", "Anthropic console", "Unlimited", "console.anthropic.com", "Turned away", "7 days", "90 days"]) assert.ok(html.includes(w), w);
});

test("the page script parses and has no template-literal or backtick surprises", () => {
  const m = /<script>([\s\S]*)<\/script>/.exec(ADMIN_HTML); assert.ok(m);
  assert.doesNotThrow(() => new Function(m[1]));
  assert.ok(!m[1].includes("`"));
});

test("the report has the promised shape, one entry per day, oldest first, with totals and the config", async () => {
  const r = rig({ env: { PRICE_IN_PER_MTOK: "1", PRICE_OUT_PER_MTOK: "5" } });
  await r.ask("/v1/translate", line); await r.ask("/v1/translate", line, T0 - DAY); await r.ask("/v1/plan", { facts: { route: [{ place: "Senj", country: "Croatia" }] }, candidates: [] });
  await r.ask("/v1/translate", { text: "x".repeat(5000) });                 // refused: too large
  const res = await r.admin("/v1/admin/report?days=3"), j = await res.json();
  assert.equal(res.status, 200); assert.equal(j.now, T0);
  assert.deepEqual(j.days.map(d => d.day), ["2026-11-21", "2026-11-22", "2026-11-23"]);
  assert.deepEqual(j.days[0], { day: "2026-11-21", kinds: {}, models: {}, refused: {}, errorsBy: {} });
  assert.deepEqual(j.days[2].kinds.translate, { requests: 1, ok: 1, errors: 0, in: 200, out: 80 });
  assert.deepEqual(j.days[2].kinds.plan, { requests: 1, ok: 1, errors: 0, in: 200, out: 80 });
  assert.deepEqual(j.days[2].models["claude-haiku-5-5"], { requests: 2, in: 400, out: 160 });
  assert.deepEqual(j.days[2].refused, { too_large: 1 });
  assert.equal(j.totals.requests, 3); assert.equal(j.totals.in, 600); assert.equal(j.totals.out, 240); assert.equal(j.totals.kinds.translate.requests, 2); assert.equal(j.totals.refused.too_large, 1);
  assert.equal(j.totals.models["claude-haiku-5-5"].requests, 3);
  assert.equal(j.config.PRICE_IN_PER_MTOK, 1); assert.equal(j.config.PRICE_OUT_PER_MTOK, 5); assert.equal(j.config.ANON_DAILY, 0); assert.equal(j.config.SITE_DAILY_REQUESTS, 150);
  assert.ok(!JSON.stringify(j).includes("ts-test") && !JSON.stringify(j).includes("sk-test") && !JSON.stringify(j).includes(ADMIN), "no secret in a report");
  assert.ok(!JSON.stringify(j).includes("Cornelius") && !JSON.stringify(j).includes("Senj"), "no text in a report");
});

test("the report's days are bounded 1 to 400, defaulting to 30", async () => {
  const r = rig();
  assert.equal((await (await r.admin("/v1/admin/report")).json()).days.length, 30);
  assert.equal((await (await r.admin("/v1/admin/report?days=400")).json()).days.length, 400);
  for (const d of ["0", "401", "-3", "abc", "1e9"]) assert.equal((await r.admin("/v1/admin/report?days=" + d)).status, 400, d);
});

test("GET config shows the effective values and where each came from; PUT validates, saves, and says what changed", async () => {
  const r = rig();
  const g = await (await r.admin("/v1/admin/config")).json();
  assert.equal(g.config.SITE_DAILY_REQUESTS, 150); assert.equal(g.source.SITE_DAILY_REQUESTS, "deployed"); assert.equal(g.source.ANON_DAILY, "default"); assert.equal(g.config.AI_ENABLED, true);
  assert.equal(g.config.PLAN_MODEL, "claude-haiku-5-5"); assert.equal(g.config.PLAN_MAX_TOKENS, 3500); assert.equal(g.config.PRICE_IN_PER_MTOK, null); assert.deepEqual(g.saved, {});

  const put = await r.admin("/v1/admin/config", { method: "PUT", body: { ANON_DAILY: 5, SITE_DAILY_REQUESTS: 0, PLAN_MODEL: "claude-haiku-5-5", PRICE_IN_PER_MTOK: 1.25 } });
  assert.equal(put.status, 200); const p = await put.json();
  assert.deepEqual(p.changed, { ANON_DAILY: { from: 0, to: 5 }, SITE_DAILY_REQUESTS: { from: 150, to: 0 }, PRICE_IN_PER_MTOK: { from: null, to: 1.25 } }, "an unchanged value is not reported as changed");
  assert.equal(p.config.ANON_DAILY, 5); assert.equal(p.source.ANON_DAILY, "saved"); assert.equal(p.source.SITE_DAILY_REQUESTS, "saved"); assert.equal(p.source.ID_DAILY, "default");
  /* and the new settings are what the next request sees */
  for (let i = 0; i < 5; i++) assert.equal((await r.ask("/v1/translate", line)).status, 200);
  assert.equal((await r.ask("/v1/translate", line)).status, 429);
  /* take a saved value away: back to the deployed one */
  const back = await (await r.admin("/v1/admin/config", { method: "PUT", body: { ANON_DAILY: null } })).json();
  assert.equal(back.config.ANON_DAILY, 0); assert.equal(back.source.ANON_DAILY, "default");
  assert.equal((await r.ask("/v1/translate", line)).status, 200);
});

test("PUT config refuses anything invalid, all or nothing, and says which", async () => {
  const r = rig();
  const bad = await r.admin("/v1/admin/config", { method: "PUT", body: { ANON_DAILY: 3, MODEL: "No Good", ANTHROPIC_API_KEY: "x", PLAN_MAX_TOKENS: -1 } });
  assert.equal(bad.status, 400); const j = await bad.json(); assert.equal(j.problems.length, 3); assert.ok(j.problems.some(p => p.startsWith("MODEL")));
  assert.deepEqual((await r.env.ALLOW.get("admin").getConfig()).v, {}, "nothing was saved");
  const raw = await r.admin("/v1/admin/config", { method: "PUT" });  assert.equal(raw.status, 400);
  assert.equal((await r.admin("/v1/admin/config", { method: "PUT", body: [1, 2] })).status, 400);
  assert.equal((await r.admin("/v1/admin/config", { method: "DELETE" })).status, 404);
});

test("switching the service off from the config pauses answers and is visible to the page", async () => {
  const r = rig();
  await r.admin("/v1/admin/config", { method: "PUT", body: { AI_ENABLED: false } });
  assert.equal((await r.ask("/v1/translate", line)).status, 503);
  assert.equal((await (await r.admin("/v1/admin/config")).json()).config.AI_ENABLED, false);
  assert.equal((await r.admin("/v1/admin/ping")).status, 200, "the admin still works while the service is paused");
  await r.admin("/v1/admin/config", { method: "PUT", body: { AI_ENABLED: true } });
  assert.equal((await r.ask("/v1/translate", line)).status, 200);
});
