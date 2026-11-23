/* The "Ask Claude" Worker with NO LIMITS by default, limits that are still honoured when set, the saved config that wins over the deployed
   vars, and the counts-only statistics. Claude and Turnstile are faked; no network. All text is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../../workers/ai/src/index.js";
import { Ledger } from "../../workers/ai/src/ledger.js";
import { validatePatch, effectiveEnv, describe, limit } from "../../workers/ai/src/config.js";

const DAY = 86400000, T0 = Date.UTC(2026, 10, 23, 12);
const fakeStorage = () => { const m = new Map(); return { get: async k => m.get(k), put: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))); }, deleteAll: async () => m.clear() }; };

function rig(over = {}) {
  const ledgers = new Map(), calls = [], gets = { admin: 0 };
  const ALLOW = { idFromName: n => n, get: n => { if (!ledgers.has(n)) ledgers.set(n, new Ledger(fakeStorage())); if (n === "admin") { const l = ledgers.get(n); if (!l.counted) { l.counted = true; const g = l.getConfig.bind(l); l.getConfig = () => { gets.admin++; return g(); }; } } return ledgers.get(n); } };
  const env = { ALLOW, ALLOW_ORIGINS: "https://recordatlas.org", AI_ENABLED: "1", ANTHROPIC_API_KEY: "sk-test", TURNSTILE_SECRET: "ts-test", ...over.env };
  let claude = over.claude || (() => ({ content: [{ text: JSON.stringify({ draft: "baptised Cornelia", words: [], roles: [], not_said: [], note: "ok" }) }], usage: { input_tokens: 100, output_tokens: 50 } }));
  const fetchFn = async (u, init) => {
    calls.push({ u, init });
    if (u.includes("turnstile")) return new Response(JSON.stringify(String(init.body).includes("response=bad") ? { success: false, "error-codes": ["x"] } : { success: true }));
    if (u.includes("anthropic")) { const r = claude(JSON.parse(init.body)); return r instanceof Response ? r : new Response(JSON.stringify(r)); }
    throw new Error("unexpected fetch " + u);
  };
  const call = (path, { method = "POST", body, headers = {}, now = T0 } = {}) =>
    handle(new Request("https://ai.test" + path, { method, body: body && JSON.stringify(body), headers: { Origin: "https://recordatlas.org", "X-Turnstile": "good", "CF-Connecting-IP": "203.0.113.7", ...headers } }), env, { fetch: fetchFn, now });
  const stored = async (name, key) => ledgers.get(name).s.get(key);
  return { env, calls, call, setClaude: f => { claude = f; }, ledgers, gets, stored, claudeCalls: () => calls.filter(c => c.u.includes("anthropic")) };
}
const line = { text: "die 3 7bris 1671 baptizatus est Cornelius filius legitimus Joannis" };
const ID = "a".repeat(32), TOKEN = "T".repeat(43), idHeaders = { "X-AI-Id": ID, Authorization: "Bearer " + TOKEN };
const ALL_LIMITS = ["ANON_DAILY", "ID_NEW_DAILY", "ID_DAILY", "ID_MONTHLY", "IP_DAILY", "SITE_DAILY_REQUESTS", "SITE_MONTHLY_REQUESTS", "SITE_DAILY_TOKENS"];

test("with no limits set, or every limit 0 or empty or null, many calls succeed, and the counters still count", async () => {
  for (const v of [undefined, "0", "", null]) {
    const env = {}; for (const k of ALL_LIMITS) if (v !== undefined) env[k] = v;
    const r = rig({ env });
    for (let i = 0; i < 25; i++) assert.equal((await r.call("/v1/translate", { body: line })).status, 200);
    for (let i = 0; i < 12; i++) assert.equal((await r.call("/v1/translate", { body: line, headers: idHeaders })).status, 200);
    const site = await r.ledgers.get("site").peek(T0);
    assert.equal(site.day, 37); assert.equal(site.month, 37); assert.equal(site.tokens, 37 * 150, "tokens are counted too");
    assert.equal((await r.ledgers.get(`id:${ID}`).peek(T0)).day, 12, "the identity's own counter counts");
  }
});

test("unlimited answers carry left and of as null, and the meter says the site is open", async () => {
  const r = rig();
  const j = await (await r.call("/v1/translate", { body: line })).json(); assert.equal(j.left, null); assert.equal(j.of, null);
  const m = await (await r.call("/v1/allowance", { method: "GET" })).json();
  assert.equal(m.left, null); assert.equal(m.of, null); assert.equal(m.siteOpen, true); assert.equal(m.dayLimit, null); assert.equal(m.monthLimit, null);
  const mi = await (await r.call("/v1/allowance", { method: "GET", headers: idHeaders })).json();
  assert.equal(mi.left, null); assert.equal(mi.of, null); assert.equal(mi.siteOpen, true); assert.equal(mi.dayUsed, 0);
});

test("a photo, a whole document and a case file are unlimited too", async () => {
  const r = rig({ claude: () => ({ content: [{ text: "{}" }], usage: { input_tokens: 3, output_tokens: 3 } }) });
  for (let i = 0; i < 6; i++) assert.equal((await r.call("/v1/transcribe", { body: { image: { media_type: "image/jpeg", data: "QUJD" } } })).status, 200);
  for (let i = 0; i < 6; i++) assert.equal((await r.call("/v1/document", { body: { image: { media_type: "image/jpeg", data: "QUJD" } } })).status, 200);
  assert.equal((await r.call("/v1/casefile", { body: { docs: [{}, {}] } })).status, 200);
});

test("explicit positive limits are still honoured, each of them", async () => {
  const cases = [
    [{ ANON_DAILY: "2" }, {}, 2],
    [{ ID_NEW_DAILY: "2" }, idHeaders, 2],
    [{ ID_NEW_DAILY: "9", ID_MONTHLY: "3" }, idHeaders, 3],
    [{ IP_DAILY: "2" }, idHeaders, 2],
    [{ SITE_DAILY_REQUESTS: "2" }, {}, 2],
    [{ SITE_MONTHLY_REQUESTS: "2" }, {}, 2],
    [{ SITE_DAILY_TOKENS: "100" }, {}, 1],
  ];
  for (const [env, headers, n] of cases) {
    const r = rig({ env }); let ok = 0;
    for (let i = 0; i < 6; i++) if ((await r.call("/v1/translate", { body: line, headers })).status === 200) ok++;
    assert.equal(ok, n, JSON.stringify(env));
  }
});

test("an identity with ID_DAILY unlimited but ID_NEW_DAILY set grows without a ceiling; with both set it stops at ID_DAILY", async () => {
  const a = rig({ env: { ID_NEW_DAILY: "5" } });
  await a.call("/v1/translate", { body: line, headers: idHeaders });
  assert.equal((await (await a.call("/v1/allowance", { method: "GET", headers: idHeaders, now: T0 + 10 * DAY })).json()).dayLimit, 25);
  const b = rig({ env: { ID_NEW_DAILY: "5", ID_DAILY: "12" } });
  await b.call("/v1/translate", { body: line, headers: idHeaders });
  assert.equal((await (await b.call("/v1/allowance", { method: "GET", headers: idHeaders, now: T0 + 10 * DAY })).json()).dayLimit, 12);
});

test("limit() reads 0, empty, null, missing and nonsense as unlimited, and whole positive numbers as themselves", () => {
  for (const v of [0, "0", "", null, undefined, "abc", -4, "-1", 0.4, NaN]) assert.equal(limit(v), null, String(v));
  assert.equal(limit("12"), 12); assert.equal(limit(7.9), 7);
});

test("the saved config beats the deployed var, is read once per request, and can be taken away", async () => {
  const r = rig({ env: { ANON_DAILY: "0" } });
  for (let i = 0; i < 4; i++) assert.equal((await r.call("/v1/translate", { body: line })).status, 200);
  await r.env.ALLOW.get("admin").patchConfig(T0, { ANON_DAILY: "5" });
  r.gets.admin = 0;
  assert.equal((await (await r.call("/v1/allowance", { method: "GET" })).json()).of, 5);
  assert.equal(r.gets.admin, 1, "one extra Durable Object call per request for the config");
  r.gets.admin = 0; await r.call("/v1/translate", { body: line }); assert.equal(r.gets.admin, 1);
  assert.equal((await r.call("/v1/translate", { body: line })).status, 429, "5 used today now that the limit is 5");
  await r.env.ALLOW.get("admin").patchConfig(T0, { ANON_DAILY: null });
  assert.equal((await r.call("/v1/translate", { body: line })).status, 200, "forgetting the saved value goes back to the deployed one: unlimited");
});

test("the saved config can switch the service off, change the models and the output cap", async () => {
  const r = rig({ env: { MODEL: "claude-haiku-5-5", MAX_OUT_TOKENS: "1200" } });
  await r.env.ALLOW.get("admin").patchConfig(T0, { AI_ENABLED: "0" });
  assert.equal((await r.call("/v1/translate", { body: line })).status, 503);
  assert.equal((await (await r.call("/v1/health", { method: "GET" })).json()).enabled, false);
  await r.env.ALLOW.get("admin").patchConfig(T0, { AI_ENABLED: "1", MODEL: "claude-test-9", MAX_OUT_TOKENS: "700" });
  assert.equal((await r.call("/v1/translate", { body: line })).status, 200);
  const sent = JSON.parse(r.claudeCalls()[0].init.body); assert.equal(sent.model, "claude-test-9"); assert.equal(sent.max_tokens, 700);
});

test("a broken config store does not take the service down: the deployed vars stand", async () => {
  const r = rig({ env: { ANON_DAILY: "1" } });
  r.ledgers.set("admin", { getConfig: async () => { throw new Error("down"); } });
  assert.equal((await r.call("/v1/translate", { body: line })).status, 200);
  assert.equal((await r.call("/v1/translate", { body: line })).status, 429);
});

test("config validation: known keys only, numbers non-negative and finite, model names a safe pattern, strings short", () => {
  const ok = validatePatch({ ANON_DAILY: 5, SITE_MONTHLY_REQUESTS: "2500", ID_DAILY: 0, ID_MONTHLY: "", AI_ENABLED: false, MODEL: "claude-haiku-5-5", PLAN_MODEL: "", PLAN_MAX_TOKENS: 3000, PRICE_IN_PER_MTOK: "1.5", PRICE_OUT_PER_MTOK: "", IP_DAILY: null });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.patch, { ANON_DAILY: "5", SITE_MONTHLY_REQUESTS: "2500", ID_DAILY: "0", ID_MONTHLY: "0", AI_ENABLED: "0", MODEL: "claude-haiku-5-5", PLAN_MODEL: "", PLAN_MAX_TOKENS: "3000", PRICE_IN_PER_MTOK: "1.5", PRICE_OUT_PER_MTOK: "", IP_DAILY: null });
  for (const bad of [{ NOPE: 1 }, { ANTHROPIC_API_KEY: "x" }, { ANON_DAILY: -1 }, { ANON_DAILY: "abc" }, { ANON_DAILY: Infinity }, { ANON_DAILY: 1e13 }, { ANON_DAILY: true }, { ANON_DAILY: [1] },
    { MODEL: "Claude Haiku" }, { MODEL: "x".repeat(61) }, { MODEL: "a/b" }, { MODEL: 5 }, { PLAN_MAX_TOKENS: 99999 }, { PRICE_IN_PER_MTOK: -1 }, { PRICE_OUT_PER_MTOK: "free" }, { AI_ENABLED: "maybe" }])
    assert.equal(validatePatch(bad).ok, false, JSON.stringify(bad));
  assert.equal(validatePatch([1]).ok, false); assert.equal(validatePatch("x").ok, false);
  assert.equal(validatePatch({ ANON_DAILY: 3, NOPE: 1 }).ok, false, "all or nothing");
});

test("effective config: the saved value wins for owned keys only, and says where each value came from", () => {
  const env = { ANON_DAILY: "5", MODEL: "claude-haiku-5-5", ANTHROPIC_API_KEY: "sk", TURNSTILE_SECRET: "t" };
  const eff = effectiveEnv(env, { ANON_DAILY: "0", ANTHROPIC_API_KEY: "evil", PLAN_MODEL: "claude-x" });
  assert.equal(eff.ANON_DAILY, "0"); assert.equal(eff.PLAN_MODEL, "claude-x"); assert.equal(eff.ANTHROPIC_API_KEY, "sk", "a secret can never be overridden");
  const d = describe(env, { PLAN_MODEL: "claude-x" });
  assert.equal(d.config.ANON_DAILY, 5); assert.equal(d.config.ID_DAILY, 0); assert.equal(d.config.PLAN_MODEL, "claude-x"); assert.equal(d.config.PLAN_MAX_TOKENS, 3500); assert.equal(d.config.PRICE_IN_PER_MTOK, null); assert.equal(d.config.AI_ENABLED, true);
  assert.deepEqual([d.source.ANON_DAILY, d.source.PLAN_MODEL, d.source.ID_DAILY], ["deployed", "saved", "default"]);
});

test("stats: a success and a failed call are each counted with input and output tokens kept apart, and no text is ever stored", async () => {
  const r = rig({ claude: b => b.messages[0].content.includes("FAIL") ? new Response("{}", { status: 529 }) : { content: [{ text: JSON.stringify({ draft: "ok" }) }], usage: { input_tokens: 123, output_tokens: 45 } } });
  assert.equal((await r.call("/v1/translate", { body: line })).status, 200);
  assert.equal((await r.call("/v1/translate", { body: { text: "FAIL secretword Cornelius" } })).status, 503);
  const s = (await r.stored("stats", "s")).d["2026-11-23"];
  assert.deepEqual(s.k.translate, { r: 2, ok: 1, e: 1, i: 123, o: 45 });
  assert.deepEqual(s.m["claude-haiku-5-5"], { r: 2, i: 123, o: 45 });
  assert.deepEqual(s.ec, { "5xx": 1 });
  const all = JSON.stringify(await r.stored("stats", "s")) + JSON.stringify(await r.stored("admin", "cfg"));
  for (const w of ["baptizatus", "Cornelius", "secretword", "203.0.113.7", "FAIL", "sk-test"]) assert.ok(!all.includes(w), "stats hold no " + w);
  /* the site token counter got the sum, as before */
  assert.equal((await r.ledgers.get("site").peek(T0)).tokens, 168);
});

test("stats: an unreachable Claude is a network error, a 429 and a 401 are their own classes, and refusals are counted by reason", async () => {
  const r = rig({ env: { ANON_DAILY: "50" }, claude: () => { throw new Error("offline"); } });
  await r.call("/v1/translate", { body: line });
  r.setClaude(() => new Response("{}", { status: 429 })); await r.call("/v1/translate", { body: line });
  r.setClaude(() => new Response("{}", { status: 401 })); await r.call("/v1/translate", { body: line });
  r.setClaude(() => ({ content: [{ text: "{}" }], usage: { input_tokens: 1, output_tokens: 1 } }));
  await r.call("/v1/translate", { body: line, headers: { "X-Turnstile": "bad" } });
  await r.call("/v1/translate", { body: { text: "x".repeat(4001) } });
  await r.env.ALLOW.get("admin").patchConfig(T0, { AI_ENABLED: "0" }); await r.call("/v1/translate", { body: line });
  await r.env.ALLOW.get("admin").patchConfig(T0, { AI_ENABLED: "1", ANON_DAILY: "1" }); await r.call("/v1/translate", { body: line, headers: { "CF-Connecting-IP": "198.51.100.9" } });
  await r.call("/v1/translate", { body: line, headers: { "CF-Connecting-IP": "198.51.100.9" } });
  const s = (await r.stored("stats", "s")).d["2026-11-23"];
  assert.deepEqual(s.ec, { network: 1, "429": 1, "4xx": 1 });
  assert.deepEqual(s.x, { bot: 1, too_large: 1, paused: 1, limit: 1 });
  assert.equal(s.k.translate.r, 4, "refusals are not calls to Claude: three failures and the one that was let through");
});

test("stats keep 400 days, count per UTC day, and refuse to turn a stray string into a key", async () => {
  const l = new Ledger(fakeStorage());
  await l.recordCall(T0 - 500 * DAY, { kind: "translate", model: "claude-haiku-5-5", ok: true, in: 1, out: 1 });
  await l.recordCall(T0 - 399 * DAY, { kind: "plan", model: "claude-haiku-5-5", ok: true, in: 1, out: 1 });
  await l.recordCall(T0, { kind: "Cornelius baptised", model: "Some Name With Spaces", ok: false, errClass: "free text", in: -5, out: 2.9 });
  await l.recordRefusal(T0, "a pasted line");
  const s = await l.s.get("s"); const days = Object.keys(s.d);
  assert.equal(days.length, 2, "the 500-day-old record is gone"); assert.ok(days.includes("2026-11-23"));
  const d = s.d["2026-11-23"];
  assert.deepEqual(Object.keys(d.k), ["other"]); assert.deepEqual(Object.keys(d.m), ["other"]); assert.deepEqual(d.ec, { other: 1 }); assert.deepEqual(d.x, { other: 1 });
  assert.deepEqual(d.k.other, { r: 1, ok: 0, e: 1, i: 0, o: 2 });
  const rep = await l.report(T0, 3); assert.deepEqual(rep.days.map(x => x.day), ["2026-11-21", "2026-11-22", "2026-11-23"]);
});
