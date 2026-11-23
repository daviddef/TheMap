/* THE COUNTER. One Durable Object per counted thing ("site", "ip:<hash>", "id:<ai id>") holds one small record and nothing else:
   counts for today and this month, today's tokens, and (for a six-word identity) a hash of its token and the day it was made.
   No text, no name, no research. Plain functions over a storage object, so tests run it without Cloudflare.
   The same class also holds two shared records, by name: "admin" (the settings saved from the admin page) and "stats" (counts by day). */

const day = now => new Date(now).toISOString().slice(0, 10);
const month = now => new Date(now).toISOString().slice(0, 7);
const KEEP_DAYS = 400;
const KINDS = ["translate", "transcribe", "document", "casefile", "plan", "tidy", "post"];
const REASONS = ["bot", "paused", "too_large", "limit"];
const ERR_CLASSES = ["429", "5xx", "4xx", "network"];
const MODEL_KEY = /^[a-z0-9._-]{1,60}$/;

export class Ledger {
  constructor(storage) { this.s = storage; }
  async _load(now) {
    const r = (await this.s.get("c")) || { created: null, tokenHash: null, d: { k: "", n: 0 }, m: { k: "", n: 0 }, t: { k: "", n: 0 } };
    if (r.d.k !== day(now)) r.d = { k: day(now), n: 0 };
    if (r.m.k !== month(now)) r.m = { k: month(now), n: 0 };
    if (r.t.k !== day(now)) r.t = { k: day(now), n: 0 };
    return r;
  }
  /* First use of an identity registers its token hash (first write wins); every later use must match. */
  async register(now, tokenHash) {
    const r = await this._load(now);
    if (!r.tokenHash) { r.tokenHash = tokenHash; r.created = now; await this.s.put("c", r); return { ok: true, created: r.created, fresh: true }; }
    if (r.tokenHash !== tokenHash) return { ok: false };
    return { ok: true, created: r.created, fresh: false };
  }
  /* All-or-nothing: charge `cost` against a daily limit and, if given, a monthly one; or charge nothing and say which was hit. */
  async take(now, o) {
    const r = await this._load(now), cost = o.cost || 1;
    if (o.tokensBelow != null && r.t.n >= o.tokensBelow) return { ok: false, which: "tokens", day: r.d.n, month: r.m.n };
    if (o.day != null && r.d.n + cost > o.day) return { ok: false, which: "day", day: r.d.n, month: r.m.n };
    if (o.month != null && r.m.n + cost > o.month) return { ok: false, which: "month", day: r.d.n, month: r.m.n };
    r.d.n += cost; r.m.n += cost; await this.s.put("c", r);
    return { ok: true, day: r.d.n, month: r.m.n };
  }
  /* Give back what take() charged, for a call that never produced an answer. Never below zero. */
  async give(now, cost) { const r = await this._load(now), c = cost || 1; r.d.n = Math.max(0, r.d.n - c); r.m.n = Math.max(0, r.m.n - c); await this.s.put("c", r); return { ok: true }; }
  async addTokens(now, n) { const r = await this._load(now); r.t.n += Math.max(0, Math.floor(n) || 0); await this.s.put("c", r); return { tokens: r.t.n }; }
  async peek(now) { const r = await this._load(now); return { created: r.created, day: r.d.n, month: r.m.n, tokens: r.t.n }; }
  async wipe() { await this.s.deleteAll(); return { ok: true }; }

  /* THE CONFIG RECORD (the Durable Object named "admin"): the settings David changes from the admin page, as short strings. */
  async getConfig() { const r = (await this.s.get("cfg")) || { v: {}, at: null }; return { v: r.v || {}, at: r.at || null }; }
  /* patch: { KEY: "value" | null }. null forgets the saved value. Already validated by the caller (config.js). Read-modify-write inside the object, so it is atomic. */
  async patchConfig(now, patch) {
    const r = (await this.s.get("cfg")) || { v: {}, at: null };
    for (const [k, v] of Object.entries(patch || {})) { if (v == null) delete r.v[k]; else r.v[k] = String(v); }
    r.at = now; await this.s.put("cfg", r);
    return { v: r.v, at: r.at };
  }

  /* THE STATS RECORD (the Durable Object named "stats"): COUNTS ONLY, by UTC day, the last 400 days. Per kind and per model: requests, answered,
     errors, input and output tokens; per day: errors by Anthropic status class and refusals by reason. No text, no name, no address, no id.
     Every key is checked against a fixed list (or a model-name pattern) here, so nothing a reader sent can become a key. */
  async _stats() { return (await this.s.get("s")) || { d: {} }; }
  _day(s, now) {
    const k = day(now); const d = (s.d[k] = s.d[k] || { k: {}, m: {}, x: {}, ec: {} });
    const cut = day(now - KEEP_DAYS * 86400000);
    for (const old of Object.keys(s.d)) if (old < cut) delete s.d[old];
    return d;
  }
  async recordCall(now, e) {
    const s = await this._stats(), d = this._day(s, now), n = Math.max(0, Math.floor(e.in) || 0), o = Math.max(0, Math.floor(e.out) || 0);
    const kind = KINDS.includes(e.kind) ? e.kind : "other";
    const model = MODEL_KEY.test(String(e.model || "")) ? e.model : "other";
    const mk = (d.m[model] || Object.keys(d.m).length < 12) ? model : "other";
    const k = (d.k[kind] = d.k[kind] || { r: 0, ok: 0, e: 0, i: 0, o: 0 }), m = (d.m[mk] = d.m[mk] || { r: 0, i: 0, o: 0 });
    k.r++; m.r++; k.i += n; m.i += n; k.o += o; m.o += o;
    if (e.ok) k.ok++; else { k.e++; const c = ERR_CLASSES.includes(e.errClass) ? e.errClass : "other"; d.ec[c] = (d.ec[c] || 0) + 1; }
    await this.s.put("s", s); return { ok: true };
  }
  async recordRefusal(now, reason) {
    const s = await this._stats(), d = this._day(s, now), r = REASONS.includes(reason) ? reason : "other";
    d.x[r] = (d.x[r] || 0) + 1; await this.s.put("s", s); return { ok: true };
  }
  /* the last `n` UTC days up to and including today, oldest first, every day present (empty when nothing happened) */
  async report(now, n) {
    const s = await this._stats(), out = [];
    for (let i = Math.min(Math.max(1, Math.floor(n) || 30), KEEP_DAYS) - 1; i >= 0; i--) {
      const key = day(now - i * 86400000), d = s.d[key] || { k: {}, m: {}, x: {}, ec: {} }, kinds = {}, models = {};
      for (const [a, v] of Object.entries(d.k)) kinds[a] = { requests: v.r, ok: v.ok, errors: v.e, in: v.i, out: v.o };
      for (const [a, v] of Object.entries(d.m)) models[a] = { requests: v.r, in: v.i, out: v.o };
      out.push({ day: key, kinds, models, refused: { ...d.x }, errorsBy: { ...d.ec } });
    }
    return { days: out };
  }
}
