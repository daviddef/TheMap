/* RECORD ATLAS "ASK CLAUDE": paste a line of a register (or a photo of one) and get a draft reading that leans on the Atlas's own
   cards. The browser sends the cards it matched; this Worker adds the rules, checks the visitor, counts the use and calls Claude.

   WHAT IT KEEPS: counts only. No pasted text, no image, no answer, no name. A request is read, sent on, answered and forgotten;
   observability is off so nothing is logged either. The key lives as a Worker secret and never reaches the browser.

   WHO MAY ASK, in the order it is checked
     1. the switch (AI_ENABLED)   2. the origin   3. a Turnstile bot check   4. the six-word identity, if one is sent
     5. its own daily and monthly allowance   6. the address's daily cap   7. the whole site's daily, monthly and token caps.
   EVERY LIMIT IS OFF BY DEFAULT: a value of 0, empty or missing means unlimited, and each can be set in wrangler.jsonc or, without a
   redeploy, from the admin page (config.js). The counters keep counting either way. What bounds the bill when nothing is limited is the
   monthly spend limit David sets with Anthropic on the key itself, and the bot check. Settings saved from the admin page are merged over
   the deployed vars once per request (one Durable Object call).

   Beside the answers there are: POST /v1/plan (a research plan, Haiku, grounded against the Atlas records the browser sent), POST /v1/tidy
   ("AI ready": the reader's whole story rewritten as plain sentences, no fact added) and POST /v1/post (a forum post read as a request: what is
   known, what is asked, the story to draw, a draft reply; the whole text is sent, so the page asks first) and the
   admin routes (admin.js: a page, a report of counts by day, the config), which exist only once the secret ADMIN_TOKEN is set. */
import { TRANSLATE_SYSTEM, TRANSCRIBE_SYSTEM, DOCUMENT_SYSTEM, CASEFILE_SYSTEM, PLAN_SYSTEM, TIDY_SYSTEM, POST_SYSTEM, cleanTidyRequest, tidyMessage, groundTidy, cleanPostRequest, postMessage, groundPost, translateMessage, documentMessage, casefileMessage, planMessage, cleanPlanRequest, groundPlan, IMAGE_TYPES, parseJson } from "./prompt.js";
import { json, sha256Hex, stub } from "./util.js";
import { limit, pos, effectiveEnv, DEFAULTS } from "./config.js";
import { handleAdmin } from "./admin.js";

const ID_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_JSON = 80 * 1024;      // a tidy or a post is at most 8,000 characters, a plan's candidates a few thousand: all well inside this
const MAX_IMAGE_B64 = 2_200_000;                     // about 1.6 MB of picture; the browser shrinks it first
const IMAGE_COST = 3;
const KINDS = ["translate", "transcribe", "document", "casefile", "plan", "tidy", "post"];
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };      // for the per-kind costs, which are not limits

const allowed = env => String(env.ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
function corsFor(request, env) {
  const o = request.headers.get("Origin");
  if (!o) return { ok: true, headers: {} };
  if (!allowed(env).includes(o)) return { ok: false, headers: {} };
  return { ok: true, headers: { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-AI-Id, X-Turnstile, Content-Type", "Access-Control-Max-Age": "600" } };
}
const bearer = r => { const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(r.headers.get("Authorization") || ""); return m && TOKEN_RE.test(m[1]) ? m[1] : null; };

/* null when the bot check passed; otherwise a short reason, so a refusal can be diagnosed from the page. The reasons are Cloudflare's own public
   error codes (like "timeout-or-duplicate" or "invalid-input-secret") or one of ours: never the secret, the token or anything about the reader. */
async function turnstileWhy(env, token, ip, fetchFn) {
  if (!env.TURNSTILE_SECRET) return "no-secret-set";           // fail closed: no secret, no answers
  if (!token) return "no-token-sent";
  if (token.length > 2048) return "token-too-long";
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token }); if (ip) form.set("remoteip", ip);
  try {
    const j = await (await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })).json();
    if (j.success) return null;
    const codes = (Array.isArray(j["error-codes"]) ? j["error-codes"] : []).map(String).filter(c => /^[a-z0-9-]{1,40}$/.test(c)).slice(0, 4);
    return codes.length ? codes.join(",") : "refused";
  } catch { return "siteverify-unreachable"; }
}

/* The reader's own day and month limits; null means no limit. A six-word identity starts at ID_NEW_DAILY and grows by 2 a day of age up to ID_DAILY. */
function limitsFor(env, identity, now) {
  if (!identity) return { day: limit(env.ANON_DAILY), month: null };
  const first = limit(env.ID_NEW_DAILY), most = limit(env.ID_DAILY), ageDays = Math.floor((now - (identity.created || now)) / 86400000);
  const day = first == null ? null : most == null ? first + 2 * ageDays : Math.min(most, first + 2 * ageDays);
  return { day, month: limit(env.ID_MONTHLY) };
}
const under = (used, cap) => cap == null || used < cap;
const busy = (which, h) => json({ error: which === "site" || which === "tokens" ? "The free reads for today are used up for everyone. They come back tomorrow (midnight UTC). Everything else on the site still works." :
  which === "sitemonth" ? "The free reads for this month are used up for everyone. They come back on the 1st. Everything else on the site still works." :
  which === "month" ? "You have used this month's allowance." : "You have used today's allowance.", limit: which }, 429, h);

async function callClaude(env, fetchFn, { system, content, maxTokens, model }) {
  const r = await fetchFn("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content }] }) });
  if (!r.ok) {   // say which kind of refusal (Anthropic's public error type), never the key or anything sent
    let type = ""; try { type = String(((await r.json()).error || {}).type || "").replace(/[^a-z_]/g, "").slice(0, 40); } catch { /* no body */ }
    return { ok: false, status: r.status, type };
  }
  const j = await r.json(), u = j.usage || {};
  return { ok: true, text: (j.content || []).map(b => b.text || "").join(""), in: Math.max(0, Math.floor(u.input_tokens) || 0), out: Math.max(0, Math.floor(u.output_tokens) || 0) };
}
const errClass = status => !status ? "network" : status === 429 ? "429" : status >= 500 ? "5xx" : "4xx";

export async function handle(request, env0, o = {}) {
  const fetchFn = o.fetch || fetch, now = o.now || Date.now();
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  /* the admin page and routes: same origin, so they are answered BEFORE the origin check, and send no CORS headers */
  if ((parts[0] === "admin" && parts.length === 1) || (parts[0] === "v1" && parts[1] === "admin")) return handleAdmin(request, env0, { now, parts, url });

  const cors = corsFor(request, env0);
  if (!cors.ok) return json({ error: "origin not allowed" }, 403);
  const h = cors.headers;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (parts[0] !== "v1") return json({ error: "not found" }, 404, h);

  /* the settings saved from the admin page, over the deployed vars: one Durable Object call per request. If it cannot be read, the deployed vars stand. */
  let saved = {}; try { saved = (await stub(env0, "admin").getConfig()).v || {}; } catch { /* use the deployed vars */ }
  const env = effectiveEnv(env0, saved);
  /* counts of what was turned away and of every call made to Claude: counts only, and never allowed to break an answer */
  const refuse = async (reason, res) => { try { await stub(env0, "stats").recordRefusal(now, reason); } catch { /* the count is lost, the answer is not */ } return res; };

  const enabled = env.AI_ENABLED !== "0";
  if (parts[1] === "health") return json({ ok: true, v: 1, enabled }, 200, h);
  if (!enabled) return request.method === "POST" ? refuse("paused", json({ error: "Ask Claude is paused for now." }, 503, h)) : json({ error: "Ask Claude is paused for now." }, 503, h);

  /* the six-word identity, if sent: registered on first use, then every later call must carry the same token */
  const aiId = request.headers.get("X-AI-Id"), tok = bearer(request);
  let identity = null;
  if (aiId) {
    if (!ID_RE.test(aiId) || !tok) return json({ error: "a token is needed with that identity" }, 401, h);
    identity = await stub(env, `id:${aiId}`).register(now, await sha256Hex(tok));
    if (!identity.ok) return json({ error: "wrong token" }, 403, h);
  }

  if (request.method === "DELETE" && parts[1] === "id" && identity) {        // "forget my allowance"
    await stub(env, `id:${aiId}`).wipe();
    return json({ ok: true }, 200, h);
  }
  if (request.method === "GET" && parts[1] === "allowance") {
    /* THE METER the page shows before anything is pressed: how many tries this reader has left today, and whether the whole site's free
       reads are used up. A six-word identity is counted by its id; anyone else by address (hashed, dated, as the counting below does).
       With no limit set, `left` and `of` are null (the page shows no meter) and the site is open. */
    const lim = limitsFor(env, identity, now), used = identity ? await stub(env, `id:${aiId}`).peek(now) : null;
    const ipk = await sha256Hex(`${request.headers.get("CF-Connecting-IP") || ""}:${new Date(now).toISOString().slice(0, 10)}`);
    const ipUsed = identity ? null : await stub(env, `ip:${ipk}`).peek(now);
    const sitePeek = await stub(env, "site").peek(now);
    const siteOpen = under(sitePeek.day, limit(env.SITE_DAILY_REQUESTS)) && under(sitePeek.tokens, limit(env.SITE_DAILY_TOKENS)) && under(sitePeek.month, limit(env.SITE_MONTHLY_REQUESTS));
    const dayUsed = used ? used.day : ipUsed ? ipUsed.day : null, dayLimit = lim.day;
    return json({ identity: !!identity, dayLimit, monthLimit: lim.month, dayUsed: used ? used.day : null, monthUsed: used ? used.month : null,
      left: dayUsed == null || dayLimit == null ? null : Math.max(0, dayLimit - dayUsed), of: dayLimit, siteOpen }, 200, h);
  }
  if (request.method !== "POST" || !KINDS.includes(parts[1]) || parts.length !== 2) return json({ error: "not found" }, 404, h);
  const kind = parts[1], isPic = kind === "transcribe" || kind === "document", cost = kind === "document" ? num(env.DOC_COST, 2) : isPic ? IMAGE_COST : kind === "casefile" ? num(env.CASE_COST, 2) : 1;   // a whole document costs 2 tries, the case file that joins them 2, a register line 1 (and a plan 1)

  const maxBody = isPic ? MAX_IMAGE_B64 + MAX_JSON : MAX_JSON;
  if (Number(request.headers.get("Content-Length") || 0) > maxBody) return refuse("too_large", json({ error: "too large" }, 413, h));
  let raw; try { raw = await request.text(); } catch { return json({ error: "not json" }, 400, h); }
  if (raw.length > maxBody) return refuse("too_large", json({ error: "too large" }, 413, h));
  let body; try { body = JSON.parse(raw); } catch { return json({ error: "not json" }, 400, h); }
  if (!body || typeof body !== "object") return json({ error: "not json" }, 400, h);

  let content, system, model = env.MODEL, maxTokens = Math.min(pos(env.MAX_OUT_TOKENS, DEFAULTS.MAX_OUT_TOKENS), 2000), planCands = null, tidyOriginal = null;
  if (kind === "translate") {
    if (typeof body.text !== "string" || !body.text.trim()) return json({ error: "paste a line to read" }, 400, h);
    if (body.text.length > 4000) return refuse("too_large", json({ error: "that is too long: paste one entry at a time (up to 4,000 characters)" }, 413, h));
    system = TRANSLATE_SYSTEM; content = translateMessage(body);
  } else if (kind === "plan") {
    const p = cleanPlanRequest(body);
    if (p.error) return json({ error: p.error }, 400, h);
    planCands = p.candidates; system = PLAN_SYSTEM; content = planMessage(p);
    model = env.PLAN_MODEL || DEFAULTS.PLAN_MODEL; maxTokens = Math.min(pos(env.PLAN_MAX_TOKENS, DEFAULTS.PLAN_MAX_TOKENS), 16000);
  } else if (kind === "tidy") {
    const p = cleanTidyRequest(body);
    if (p.error) return json({ error: p.error }, 400, h);
    tidyOriginal = p.text; system = TIDY_SYSTEM; content = tidyMessage(p);
    model = env.PLAN_MODEL || DEFAULTS.PLAN_MODEL; maxTokens = Math.min(pos(env.PLAN_MAX_TOKENS, DEFAULTS.PLAN_MAX_TOKENS), 6000);
  } else if (kind === "post") {
    const p = cleanPostRequest(body);
    if (p.error) return json({ error: p.error }, 400, h);
    planCands = p.candidates; system = POST_SYSTEM; content = postMessage(p);
    model = env.PLAN_MODEL || DEFAULTS.PLAN_MODEL; maxTokens = Math.min(pos(env.PLAN_MAX_TOKENS, DEFAULTS.PLAN_MAX_TOKENS), 8000);
  } else if (kind === "casefile") {
    const docs = Array.isArray(body.docs) ? body.docs : [];
    if (docs.length < 2 || docs.length > 6) return json({ error: "send two to six documents that were read" }, 400, h);
    system = CASEFILE_SYSTEM; model = env.CASE_MODEL || "claude-sonnet-5-5"; maxTokens = num(env.CASE_MAX_TOKENS, 3500);
    content = casefileMessage({ docs, atlas: typeof body.atlas === "string" ? body.atlas : "", question: typeof body.question === "string" ? body.question : "" });
  } else {
    const im = body.image;
    if (!im || !IMAGE_TYPES[im.media_type] || typeof im.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(im.data)) return json({ error: "send a jpeg, png or webp picture" }, 400, h);
    if (im.data.length > MAX_IMAGE_B64) return refuse("too_large", json({ error: "that picture is too large: it should be shrunk first" }, 413, h));
    const pic = { type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } };
    if (kind === "document") {      // a whole form or sheet, read field by field: a stronger model, and room to answer
      system = DOCUMENT_SYSTEM; model = env.DOC_MODEL || "claude-sonnet-5-5"; maxTokens = num(env.DOC_MAX_TOKENS, 3000);
      content = [pic, { type: "text", text: documentMessage(body) }];
    } else {
      system = TRANSCRIBE_SYSTEM; maxTokens = Math.min(maxTokens, 900);
      content = [pic, { type: "text", text: "Transcribe this. " + (body.context && body.context.language ? "Language: " + String(body.context.language).slice(0, 40) + "." : "") }];
    }
  }
  model = model || DEFAULTS.MODEL;

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const why = await turnstileWhy(env, request.headers.get("X-Turnstile"), ip, fetchFn);
  if (why) return refuse("bot", json({ error: "The bot check did not pass. Reload the page and try again.", reason: why }, 403, h));

  /* the counters ALWAYS count; a limit that is not set (null) simply never refuses */
  const lim = limitsFor(env, identity, now), anon = limit(env.ANON_DAILY);
  if (identity) { const r = await stub(env, `id:${aiId}`).take(now, { cost, day: lim.day, month: lim.month }); if (!r.ok) return refuse("limit", busy(r.which, h)); }
  const ipKey = await sha256Hex(`${ip}:${new Date(now).toISOString().slice(0, 10)}`);       // dated, so it cannot follow an address across days
  const rip = await stub(env, `ip:${ipKey}`).take(now, { cost, day: identity ? limit(env.IP_DAILY) : anon });
  if (!rip.ok) return refuse("limit", busy("day", h));
  const site = await stub(env, "site").take(now, { cost: 1, day: limit(env.SITE_DAILY_REQUESTS), month: limit(env.SITE_MONTHLY_REQUESTS), tokensBelow: limit(env.SITE_DAILY_TOKENS) });
  if (!site.ok) {   // the site said no after the reader's own counters said yes: give those tries back, the reader used none
    await Promise.allSettled([identity ? stub(env, `id:${aiId}`).give(now, cost) : null, stub(env, `ip:${ipKey}`).give(now, cost)].filter(Boolean));
    return refuse("limit", busy(site.which === "tokens" ? "tokens" : site.which === "month" ? "sitemonth" : "site", h));
  }

  let out;
  try { out = await callClaude(env, fetchFn, { system, content, maxTokens, model }); } catch { out = { ok: false, status: 0 }; }
  /* every attempted call is counted once it has resolved, answered or not: kind, model, status class and the tokens in and out, never any text */
  try { await stub(env0, "stats").recordCall(now, { kind, model, ok: out.ok, errClass: out.ok ? null : errClass(out.status), in: out.in || 0, out: out.out || 0 }); } catch { /* the count is lost, the answer is not */ }
  if (!out.ok) {   // a call that gave no answer costs the reader nothing: hand back every try it took
    await Promise.allSettled([identity ? stub(env, `id:${aiId}`).give(now, cost) : null, stub(env, `ip:${ipKey}`).give(now, cost), stub(env, "site").give(now, 1)].filter(Boolean));
  }
  if (!out.ok) return json({ error: out.status === 429 || out.status === 529 ? "Claude is busy. Try again in a minute." : "Claude could not answer just now.", reason: out.status ? "anthropic-" + out.status + (out.type ? "-" + out.type : "") : "anthropic-unreachable" }, 503, h);
  await stub(env, "site").addTokens(now, out.in + out.out);

  const parsed = parseJson(out.text);
  const used = identity ? await stub(env, `id:${aiId}`).peek(now) : null;
  const left = used ? (lim.day == null ? null : Math.max(0, lim.day - used.day)) : (anon == null ? null : Math.max(0, anon - rip.day)), of = identity ? lim.day : anon;
  const unparsed = { unparsed: true, draft: String(out.text).slice(0, 4000) };
  if (kind === "plan") return json({ kind, result: (parsed && groundPlan(parsed, planCands)) || unparsed, model, left, of }, 200, h);
  if (kind === "tidy") return json({ kind, result: (parsed && groundTidy(parsed, tidyOriginal)) || unparsed, model, left, of }, 200, h);
  if (kind === "post") return json({ kind, result: (parsed && groundPost(parsed, planCands)) || unparsed, model, left, of }, 200, h);
  return json({ kind, result: parsed || unparsed, left, of }, 200, h);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch { return json({ error: "server error" }, 500); }       // never echo the cause: it may hold what was pasted
  },
};
