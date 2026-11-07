/* What wrangler deploys: the handler, plus the Durable Object class the counters live in. Kept apart from index.js so the tests,
   which cannot import "cloudflare:workers", can load the handler on its own. */
import { DurableObject } from "cloudflare:workers";
import worker from "./index.js";
import { Ledger } from "./ledger.js";

export class Allowance extends DurableObject {
  constructor(state, env) { super(state, env); this.l = new Ledger(state.storage); }
  register(now, h) { return this.l.register(now, h); }
  take(now, o) { return this.l.take(now, o); }
  give(now, cost) { return this.l.give(now, cost); }
  addTokens(now, n) { return this.l.addTokens(now, n); }
  peek(now) { return this.l.peek(now); }
  wipe() { return this.l.wipe(); }
}
export default worker;
