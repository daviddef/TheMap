import fs from "node:fs"; import path from "node:path";
import { A, ctx, parse } from "./ctx.mjs";
import { C } from "./corpus.mjs";
const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../.."), PUB = path.join(SITE, "public");
globalThis.window = { raFold: A.fold }; new Function("window", fs.readFileSync(path.join(PUB, "js/shard-key.js"), "utf8"))(globalThis.window);
globalThis.document = { createElement: () => ({ style: {}, append() {}, setAttribute() {}, classList: { add() {} } }), getElementById: () => null };
globalThis.fetch = async (url) => { const f = path.join(PUB, String(url).replace(/^\/+/, "")); if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } }; return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, "utf8")) }; };
globalThis.window.raAtlasSummary = A; new Function("window","document","CustomEvent", fs.readFileSync(path.join(PUB, "js/story-engine.js"), "utf8"))(globalThis.window, globalThis.document, function(){});
const F = globalThis.window.raStory;
const L = F.createLoader ? F.createLoader("/") : null;
if (!L) { console.log("createLoader not exported:", Object.keys(F)); process.exit(); }
let ok = 0, bad = 0;
for (const c of C) {
  try { const p = parse(c.t); const g = await L.gather(p); const plan = g.plan || []; const txt = JSON.stringify(g.facts && g.facts.route ? g.facts.route.length : 0); ok++; if (process.argv[2] === "v") console.log(c.id, "route", txt, "plan steps", plan.length); }
  catch (e) { bad++; console.log("GATHER FAIL", c.id, e.message.slice(0, 140)); }
}
console.log("gather ok", ok, "failed", bad);
