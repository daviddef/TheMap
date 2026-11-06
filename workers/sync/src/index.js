/* RECORD ATLAS SYNC: one encrypted blob per reader, and a server that cannot read it.

   The browser makes everything: a six-word passphrase, from it a lookup id, a read token, a write token and an AES key
   (public/js/research-sync.js). This Worker only ever sees the id, the two tokens (it keeps a hash of each) and bytes it cannot
   open. There is no database and no account: the id is the lookup, the tokens are the permission.

   KEYS IN R2 (bucket SYNC)
     meta/<id>          { v, created, writeHash, readHash }                     never expires
     latest/<id>        the newest blob, always                                 never expires
     v/<id>/<YYYY-MM-DD> the last blob saved that (UTC) day: one old version a day   a lifecycle rule expires v/ after 30 days
   The newest copy lives apart from v/ so that a reader who is away for a month does not lose it to the 30-day rule.

   NIGHTLY: objects changed in the last two days are copied to bucket COPY (a second bucket: it protects against a mistaken
   delete or overwrite, NOT against losing the Cloudflare account; a copy at another provider is a later step).
   "Delete everything I have stored" removes the reader's keys from both buckets. */

const MAX_BODY = 2 * 1024 * 1024;
const MIN_BODY = 1 + 12 + 16 + 1;                    // version byte, iv, GCM tag, at least one byte
const ID_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;              // 32 bytes, base64url, no padding
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const COPY_WINDOW_MS = 2 * 86400000;
const COPY_MAX = 2000;

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
async function sha256Hex(s) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function same(a, b) {                                  // constant time over equal-length hex strings
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function allowed(env) { return String(env.ALLOW_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean); }
function corsFor(request, env) {
  const o = request.headers.get("Origin");
  if (!o) return { ok: true, headers: {} };
  if (!allowed(env).includes(o)) return { ok: false, headers: {} };
  return { ok: true, headers: {
    "Access-Control-Allow-Origin": o, "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, X-Read-Token, Content-Type",
    "Access-Control-Expose-Headers": "X-Saved-At", "Access-Control-Max-Age": "600" } };
}
const reply = (body, status, extra) => new Response(body, { status, headers: { "Cache-Control": "no-store", ...extra } });
const json = (obj, status, extra) => reply(JSON.stringify(obj), status, { "Content-Type": "application/json", ...extra });

function bearer(request) { const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.get("Authorization") || ""); return m && TOKEN_RE.test(m[1]) ? m[1] : null; }

/* include: customMetadata, or R2 leaves out the saved-at time of every listed version */
async function listAll(bucket, prefix) {
  const out = []; let cursor;
  do { const r = await bucket.list({ prefix, cursor, limit: 1000, include: ["customMetadata"] }); out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined; } while (cursor);
  return out;
}
async function wipe(bucket, id) {
  const keys = [`meta/${id}`, `latest/${id}`, ...(await listAll(bucket, `v/${id}/`)).map(o => o.key)];
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
  return keys.length;
}

async function handle(request, env) {
  const cors = corsFor(request, env);
  if (!cors.ok) return json({ error: "origin not allowed" }, 403);
  const h = cors.headers;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "v1") return json({ error: "not found" }, 404, h);
  if (parts[1] === "health" && parts.length === 2) return json({ ok: true, v: 1 }, 200, h);
  const id = parts[1];
  if (!id || !ID_RE.test(id)) return json({ error: "not found" }, 404, h);
  const sub = parts[2], day = parts[3];

  const tok = bearer(request);
  if (!tok) return json({ error: "a token is needed" }, 401, h);
  const th = await sha256Hex(tok);
  let meta = null;
  const mo = await env.SYNC.get(`meta/${id}`);
  if (mo) meta = await mo.json();

  if (request.method === "PUT" && !sub) {
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY) return json({ error: "too large" }, 413, h);
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > MAX_BODY) return json({ error: "too large" }, 413, h);
    if (body.length < MIN_BODY || body[0] !== 1) return json({ error: "not an encrypted pack" }, 400, h);
    if (!meta) {
      const rt = request.headers.get("X-Read-Token");
      if (!rt || !TOKEN_RE.test(rt)) return json({ error: "a first save needs the read token too" }, 400, h);
      meta = { v: 1, created: new Date().toISOString(), writeHash: th, readHash: await sha256Hex(rt) };
      const made = await env.SYNC.put(`meta/${id}`, JSON.stringify(meta), { onlyIf: { etagDoesNotMatch: "*" } });
      if (made === null) {                              // someone saved first, in the same instant: judge against theirs
        const again = await env.SYNC.get(`meta/${id}`); meta = again ? await again.json() : null;
      }
    }
    if (!meta || !same(meta.writeHash, th)) return json({ error: "wrong token" }, 403, h);
    const now = new Date(), saved = now.toISOString(), d = saved.slice(0, 10);
    const opts = { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { saved } };
    await env.SYNC.put(`latest/${id}`, body, opts);
    await env.SYNC.put(`v/${id}/${d}`, body, opts);
    return json({ ok: true, saved, day: d, bytes: body.length }, 200, h);
  }

  if (request.method === "DELETE" && !sub) {
    if (!meta || !same(meta.writeHash, th)) return json({ error: "not found" }, 404, h);
    const n = await wipe(env.SYNC, id);
    if (env.COPY) await wipe(env.COPY, id);
    return json({ ok: true, deleted: n }, 200, h);
  }

  if (request.method === "GET") {
    if (!meta || !same(meta.readHash, th)) return json({ error: "not found" }, 404, h);   // an unknown id and a wrong token look alike
    if (!sub) {
      const o = await env.SYNC.get(`latest/${id}`);
      if (!o) return json({ error: "not found" }, 404, h);
      return reply(await o.arrayBuffer(), 200, { ...h, "Content-Type": "application/octet-stream", "X-Saved-At": (o.customMetadata && o.customMetadata.saved) || "" });
    }
    if (sub === "versions" && !day) {
      const list = (await listAll(env.SYNC, `v/${id}/`)).map(o => ({ day: o.key.split("/").pop(), bytes: o.size, saved: (o.customMetadata && o.customMetadata.saved) || null }));
      list.sort((a, b) => (a.day < b.day ? 1 : -1));
      return json({ versions: list }, 200, h);
    }
    if (sub === "versions" && DAY_RE.test(day || "")) {
      const o = await env.SYNC.get(`v/${id}/${day}`);
      if (!o) return json({ error: "not found" }, 404, h);
      return reply(await o.arrayBuffer(), 200, { ...h, "Content-Type": "application/octet-stream", "X-Saved-At": (o.customMetadata && o.customMetadata.saved) || "" });
    }
  }
  return json({ error: "not found" }, 404, h);
}

/* Copy what changed in the last two days to the second bucket. Bounded, so one run never grows without limit. */
export async function copyNightly(env, now = Date.now()) {
  if (!env.COPY) return { copied: 0 };
  let copied = 0, cursor;
  do {
    const r = await env.SYNC.list({ cursor, limit: 1000 });
    for (const o of r.objects) {
      if (now - new Date(o.uploaded).getTime() > COPY_WINDOW_MS) continue;
      if (copied >= COPY_MAX) return { copied, capped: true };
      const src = await env.SYNC.get(o.key);
      if (!src) continue;
      await env.COPY.put(o.key, await src.arrayBuffer(), { httpMetadata: src.httpMetadata, customMetadata: src.customMetadata });
      copied++;
    }
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return { copied };
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (e) { return json({ error: "server error" }, 500); }      // never echo the cause: it may name a key
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(copyNightly(env)); },
};
