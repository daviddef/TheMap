/* RECORD ATLAS "ASK CLAUDE": paste a line of a register (or a photo of one) and get a draft reading that leans on the Atlas's own
   cards. The browser sends the cards it matched; this Worker adds the rules, checks the visitor, counts the use and calls Claude.

   WHAT IT KEEPS: counts only. No pasted text, no image, no answer, no name. A request is read, sent on, answered and forgotten;
   observability is off so nothing is logged either. The key lives as a Worker secret and never reaches the browser.

   WHO MAY ASK, in the order it is checked
     1. the switch (AI_ENABLED)   2. the origin   3. a Turnstile bot check   4. the six-word identity, if one is sent
     5. its own daily and monthly allowance (small when new, grows with age)   6. the address's daily cap
     7. the whole site's daily request and token caps.
   The per-person caps are SOFT on purpose: anyone can make new six words. What actually bounds the bill is 6 and 7, plus the
   monthly spend limit David sets with Anthropic on the key itself. */
import { TRANSLATE_SYSTEM, TRANSCRIBE_SYSTEM, translateMessage, IMAGE_TYPES, parseJson } from "./prompt.js";

const ID_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const MAX_JSON = 80 * 1024;
const MAX_IMAGE_B64 = 2_200_000;                     // about 1.6 MB of picture; the browser shrinks it first
const IMAGE_COST = 3;
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const sha256Hex = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };

const allowed = env => String(env.ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
function corsFor(request, env) {
  const o = request.headers.get("Origin");
  if (!o) return { ok: true, headers: {} };
  if (!allowed(env).includes(o)) return { ok: false, headers: {} };
  return { ok: true, headers: { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-AI-Id, X-Turnstile, Content-Type", "Access-Control-Max-Age": "600" } };
}
const json = (obj, status, extra) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const bearer = r => { const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(r.headers.get("Authorization") || ""); return m && TOKEN_RE.test(m[1]) ? m[1] : null; };
const stub = (env, name) => env.ALLOW.get(env.ALLOW.idFromName(name));

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

function limitsFor(env, identity, now) {
  if (!identity) return { day: num(env.ANON_DAILY, 3), month: null };
  const ageDays = Math.floor((now - (identity.created || now)) / 86400000);
  return { day: Math.min(num(env.ID_DAILY, 20), num(env.ID_NEW_DAILY, 5) + 2 * ageDays), month: num(env.ID_MONTHLY, 250) };
}
const busy = (which, h) => json({ error: which === "site" || which === "tokens" ? "The service has reached today's limit for everyone. Try again tomorrow." :
  which === "month" ? "You have used this month's allowance." : "You have used today's allowance.", limit: which }, 429, h);

async function callClaude(env, fetchFn, { system, content, maxTokens }) {
  const r = await fetchFn("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.MODEL || "claude-haiku-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content }] }) });
  if (!r.ok) {   // say which kind of refusal (Anthropic's public error type), never the key or anything sent
    let type = ""; try { type = String(((await r.json()).error || {}).type || "").replace(/[^a-z_]/g, "").slice(0, 40); } catch { /* no body */ }
    return { ok: false, status: r.status, type };
  }
  const j = await r.json();
  return { ok: true, text: (j.content || []).map(b => b.text || "").join(""), usage: (j.usage && (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0)) || 0 };
}

export async function handle(request, env, o = {}) {
  const fetchFn = o.fetch || fetch, now = o.now || Date.now();
  const cors = corsFor(request, env);
  if (!cors.ok) return json({ error: "origin not allowed" }, 403);
  const h = cors.headers;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "v1") return json({ error: "not found" }, 404, h);
  const enabled = env.AI_ENABLED !== "0";
  if (parts[1] === "health") return json({ ok: true, v: 1, enabled }, 200, h);
  if (!enabled) return json({ error: "Ask Claude is paused for now." }, 503, h);

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
    const lim = limitsFor(env, identity, now), used = identity ? await stub(env, `id:${aiId}`).peek(now) : null;
    return json({ identity: !!identity, dayLimit: lim.day, monthLimit: lim.month, dayUsed: used ? used.day : null, monthUsed: used ? used.month : null }, 200, h);
  }
  if (request.method !== "POST" || !["translate", "transcribe"].includes(parts[1]) || parts.length !== 2) return json({ error: "not found" }, 404, h);
  const kind = parts[1], cost = kind === "transcribe" ? IMAGE_COST : 1;

  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > (kind === "transcribe" ? MAX_IMAGE_B64 + MAX_JSON : MAX_JSON)) return json({ error: "too large" }, 413, h);
  let body; try { body = await request.json(); } catch { return json({ error: "not json" }, 400, h); }
  if (!body || typeof body !== "object") return json({ error: "not json" }, 400, h);

  let content, system, maxTokens = Math.min(num(env.MAX_OUT_TOKENS, 1200), 2000);
  if (kind === "translate") {
    if (typeof body.text !== "string" || !body.text.trim()) return json({ error: "paste a line to read" }, 400, h);
    if (body.text.length > 4000) return json({ error: "that is too long: paste one entry at a time (up to 4,000 characters)" }, 413, h);
    system = TRANSLATE_SYSTEM; content = translateMessage(body);
  } else {
    const im = body.image;
    if (!im || !IMAGE_TYPES[im.media_type] || typeof im.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(im.data)) return json({ error: "send a jpeg, png or webp picture" }, 400, h);
    if (im.data.length > MAX_IMAGE_B64) return json({ error: "that picture is too large: it should be shrunk first" }, 413, h);
    system = TRANSCRIBE_SYSTEM; maxTokens = Math.min(maxTokens, 900);
    content = [{ type: "image", source: { type: "base64", media_type: im.media_type, data: im.data } },
      { type: "text", text: "Transcribe this. " + (body.context && body.context.language ? "Language: " + String(body.context.language).slice(0, 40) + "." : "") }];
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const why = await turnstileWhy(env, request.headers.get("X-Turnstile"), ip, fetchFn);
  if (why) return json({ error: "The bot check did not pass. Reload the page and try again.", reason: why }, 403, h);

  const lim = limitsFor(env, identity, now);
  if (identity) { const r = await stub(env, `id:${aiId}`).take(now, { cost, day: lim.day, month: lim.month }); if (!r.ok) return busy(r.which, h); }
  const ipKey = await sha256Hex(`${ip}:${new Date(now).toISOString().slice(0, 10)}`);       // dated, so it cannot follow an address across days
  const rip = await stub(env, `ip:${ipKey}`).take(now, { cost, day: identity ? num(env.IP_DAILY, 40) : num(env.ANON_DAILY, 3) });
  if (!rip.ok) return busy("day", h);
  const site = await stub(env, "site").take(now, { cost: 1, day: num(env.SITE_DAILY_REQUESTS, 400), tokensBelow: num(env.SITE_DAILY_TOKENS, 1500000) });
  if (!site.ok) return busy(site.which === "tokens" ? "tokens" : "site", h);

  let out;
  try { out = await callClaude(env, fetchFn, { system, content, maxTokens }); } catch { out = { ok: false, status: 0 }; }
  if (!out.ok) return json({ error: out.status === 429 || out.status === 529 ? "Claude is busy. Try again in a minute." : "Claude could not answer just now.", reason: out.status ? "anthropic-" + out.status + (out.type ? "-" + out.type : "") : "anthropic-unreachable" }, 503, h);
  await stub(env, "site").addTokens(now, out.usage);

  const parsed = parseJson(out.text);
  const used = identity ? await stub(env, `id:${aiId}`).peek(now) : null;
  return json({ kind, result: parsed || { unparsed: true, draft: String(out.text).slice(0, 4000) }, left: used ? Math.max(0, lim.day - used.day) : Math.max(0, num(env.ANON_DAILY, 3) - rip.day) }, 200, h);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch { return json({ error: "server error" }, 500); }       // never echo the cause: it may hold what was pasted
  },
};
