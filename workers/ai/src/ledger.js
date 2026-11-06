/* THE COUNTER. One Durable Object per counted thing ("site", "ip:<hash>", "id:<ai id>") holds one small record and nothing else:
   counts for today and this month, today's tokens, and (for a six-word identity) a hash of its token and the day it was made.
   No text, no name, no research. Plain functions over a storage object, so tests run it without Cloudflare. */

const day = now => new Date(now).toISOString().slice(0, 10);
const month = now => new Date(now).toISOString().slice(0, 7);

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
  async addTokens(now, n) { const r = await this._load(now); r.t.n += Math.max(0, Math.floor(n) || 0); await this.s.put("c", r); return { tokens: r.t.n }; }
  async peek(now) { const r = await this._load(now); return { created: r.created, day: r.d.n, month: r.m.n, tokens: r.t.n }; }
  async wipe() { await this.s.deleteAll(); return { ok: true }; }
}
