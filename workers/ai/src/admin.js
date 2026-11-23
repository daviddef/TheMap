/* THE ADMIN ROUTES, for David only. Served by this Worker itself (same origin), so they are checked BEFORE the CORS origin check and send no
   CORS headers: another website cannot read them.

   They do not exist until the secret ADMIN_TOKEN is set (every admin path answers 404 until then). The page at /admin is the same for
   everyone and holds no token and no data; the JSON routes need "Authorization: Bearer <ADMIN_TOKEN>", compared in constant time.
   What they show is counts only (see ledger.js). */
import { json, sha256Hex, stub } from "./util.js";
import { validatePatch, describe } from "./config.js";
import { ADMIN_HTML } from "./admin-page.js";

const notFound = () => json({ error: "not found" }, 404);

/* hash both sides, then compare every byte: the time does not depend on how much of a guess was right or how long it is */
async function tokenOk(request, env) {
  const m = /^Bearer (.{1,512})$/.exec(request.headers.get("Authorization") || "");
  const a = await sha256Hex(m ? m[1] : ""), b = await sha256Hex(String(env.ADMIN_TOKEN));
  let d = m ? 0 : 1;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function sum(into, from) { for (const [k, v] of Object.entries(from)) into[k] = (into[k] || 0) + v; }
/* totals over the days of a report: overall, by kind, by model, refusals and error classes */
export function totalsOf(days) {
  const t = { requests: 0, ok: 0, errors: 0, in: 0, out: 0, kinds: {}, models: {}, refused: {}, errorsBy: {} };
  for (const d of days) {
    for (const [k, v] of Object.entries(d.kinds)) {
      t.requests += v.requests; t.ok += v.ok; t.errors += v.errors; t.in += v.in; t.out += v.out;
      const a = (t.kinds[k] = t.kinds[k] || { requests: 0, ok: 0, errors: 0, in: 0, out: 0 }); sum(a, v);
    }
    for (const [k, v] of Object.entries(d.models)) { const a = (t.models[k] = t.models[k] || { requests: 0, in: 0, out: 0 }); sum(a, v); }
    sum(t.refused, d.refused); sum(t.errorsBy, d.errorsBy);
  }
  return t;
}

export async function handleAdmin(request, env, { now, parts, url }) {
  if (!env.ADMIN_TOKEN) return notFound();                       // no secret, no admin
  const route = parts[0] === "admin" ? "page" : parts.slice(2).join("/");
  if (route === "page") {
    if (parts.length !== 1 || request.method !== "GET") return notFound();
    return new Response(ADMIN_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
  }
  if (!["ping", "report", "config"].includes(route)) return notFound();
  if (!(await tokenOk(request, env))) return json({ error: "unauthorized" }, 401);

  const saved = async () => (await stub(env, "admin").getConfig()).v || {};
  if (route === "ping" && request.method === "GET") return json({ ok: true }, 200);
  if (route === "config" && request.method === "GET") {
    const s = await saved();
    return json({ ...describe(env, s), saved: s }, 200);
  }
  if (route === "config" && request.method === "PUT") {
    let body; try { body = JSON.parse(await request.text()); } catch { return json({ error: "not json" }, 400); }
    const v = validatePatch(body);
    if (!v.ok) return json({ error: "not saved", problems: v.problems }, 400);
    const before = describe(env, await saved()).config;
    const after = (await stub(env, "admin").patchConfig(now, v.patch)).v;
    const d = describe(env, after), changed = {};
    for (const k of Object.keys(d.config)) if (JSON.stringify(before[k]) !== JSON.stringify(d.config[k])) changed[k] = { from: before[k], to: d.config[k] };
    return json({ ok: true, changed, ...d, saved: after }, 200);
  }
  if (route === "report" && request.method === "GET") {
    const n = Math.floor(Number(url.searchParams.get("days") || 30));
    if (!Number.isFinite(n) || n < 1 || n > 400) return json({ error: "days must be 1 to 400" }, 400);
    const { days } = await stub(env, "stats").report(now, n);
    return json({ now, days, totals: totalsOf(days), config: describe(env, await saved()).config }, 200);
  }
  return notFound();
}
