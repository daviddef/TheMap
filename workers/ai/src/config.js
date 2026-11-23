/* THE SETTINGS YOU CAN CHANGE WITHOUT A REDEPLOY.
   The deployed vars (wrangler.jsonc) are the starting point. A small saved record, held by the Durable Object named "admin", is merged OVER
   them for the keys listed here and for no others. Everything is stored as a short string so the merge is just `{ ...env, ...saved }`.

   LIMITS: a value of 0, empty, missing (or anything that is not a positive number) means UNLIMITED. */

export const LIMIT_KEYS = ["ANON_DAILY", "ID_NEW_DAILY", "ID_DAILY", "ID_MONTHLY", "IP_DAILY", "SITE_DAILY_REQUESTS", "SITE_MONTHLY_REQUESTS", "SITE_DAILY_TOKENS"];
export const TOKEN_KEYS = ["MAX_OUT_TOKENS", "PLAN_MAX_TOKENS"];       // per-answer output caps: they bound one answer, not use; 0 or empty = the built-in default
export const MODEL_KEYS = ["MODEL", "PLAN_MODEL"];
export const PRICE_KEYS = ["PRICE_IN_PER_MTOK", "PRICE_OUT_PER_MTOK"];  // US dollars per million tokens; only used to ESTIMATE cost on the admin page
export const OWNED = [...LIMIT_KEYS, "AI_ENABLED", ...MODEL_KEYS, ...TOKEN_KEYS, ...PRICE_KEYS];
export const DEFAULTS = { MODEL: "claude-haiku-5-5", PLAN_MODEL: "claude-haiku-5-5", MAX_OUT_TOKENS: 1200, PLAN_MAX_TOKENS: 3500 };
export const MODEL_RE = /^[a-z0-9._-]{1,60}$/;
const MAX_LIMIT = 1e12, MAX_TOKENS = 16000, MAX_PRICE = 1000;

/* a limit as a positive whole number, or null for "no limit" */
export const limit = v => { if (v == null || v === "") return null; const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : null; };
/* a positive whole number or the default (for output caps, where 0 would be nonsense) */
export const pos = (v, d) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : d; };
/* a price, or null when not set */
export const price = v => { if (v == null || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };

/* Check a partial config sent by the admin page. null for a key means "forget the saved value, go back to the deployed one".
   All-or-nothing: returns { ok: true, patch } (values as strings, or null) or { ok: false, problems: [...] }. */
export function validatePatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, problems: ["send a JSON object of settings"] };
  const patch = {}, problems = [];
  for (const [k, v] of Object.entries(body)) {
    if (!OWNED.includes(k)) { problems.push(`${String(k).slice(0, 40)}: not a setting`); continue; }
    if (v === null) { patch[k] = null; continue; }
    const isNum = typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
    if (LIMIT_KEYS.includes(k)) {
      if (v === "") { patch[k] = "0"; continue; }                                     // empty = unlimited
      const n = Number(v);
      if (!isNum || n < 0 || n > MAX_LIMIT) problems.push(`${k}: a whole number of 0 or more (0 = unlimited)`); else patch[k] = String(Math.floor(n));
    } else if (TOKEN_KEYS.includes(k)) {
      if (v === "") { patch[k] = "0"; continue; }
      const n = Number(v);
      if (!isNum || n < 0 || n > MAX_TOKENS) problems.push(`${k}: a number from 0 to ${MAX_TOKENS} (0 = the built-in default)`); else patch[k] = String(Math.floor(n));
    } else if (PRICE_KEYS.includes(k)) {
      if (v === "") { patch[k] = ""; continue; }                                      // empty = not set
      const n = Number(v);
      if (!isNum || n < 0 || n > MAX_PRICE) problems.push(`${k}: dollars per million tokens, 0 or more (empty = not set)`); else patch[k] = String(n);
    } else if (MODEL_KEYS.includes(k)) {
      if (v === "") patch[k] = "";
      else if (typeof v !== "string" || !MODEL_RE.test(v)) problems.push(`${k}: a model name such as claude-haiku-5-5`); else patch[k] = v;
    } else if (k === "AI_ENABLED") {
      if (v === true || v === 1 || v === "1" || v === "true") patch[k] = "1";
      else if (v === false || v === 0 || v === "0" || v === "false") patch[k] = "0";
      else problems.push("AI_ENABLED: true or false");
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, patch };
}

/* the env the handler really uses: deployed vars with the saved record over them, for the owned keys only */
export function effectiveEnv(env, saved) {
  const out = { ...env };
  for (const k of OWNED) if (saved && Object.prototype.hasOwnProperty.call(saved, k) && saved[k] != null) out[k] = saved[k];
  return out;
}

/* what the admin page shows: each setting's effective value (limits as numbers, 0 = unlimited) and where it came from */
export function describe(env0, saved) {
  const env = effectiveEnv(env0, saved), config = {}, source = {};
  for (const k of OWNED) {
    if (LIMIT_KEYS.includes(k)) config[k] = limit(env[k]) ?? 0;
    else if (k === "AI_ENABLED") config[k] = env[k] !== "0";
    else if (TOKEN_KEYS.includes(k)) config[k] = pos(env[k], DEFAULTS[k]);
    else if (MODEL_KEYS.includes(k)) config[k] = MODEL_RE.test(String(env[k] || "")) ? env[k] : DEFAULTS[k];
    else config[k] = price(env[k]);
    source[k] = saved && Object.prototype.hasOwnProperty.call(saved, k) ? "saved" : env0[k] !== undefined ? "deployed" : "default";
  }
  return { config, source };
}
