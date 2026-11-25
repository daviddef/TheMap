/* Runs a story through the reader's own parse + gather against the built data in public/ (like test/stress/gather.mjs), for the plan audit and its tests. */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { A, ctx, parse } from "../stress/ctx.mjs";
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), PUB = path.join(SITE, "public");
globalThis.window = { raFold: A.fold }; new Function("window", fs.readFileSync(path.join(PUB, "js/shard-key.js"), "utf8"))(globalThis.window);
globalThis.document = { createElement: () => ({ style: {}, append() {}, setAttribute() {}, classList: { add() {} } }), getElementById: () => null };
globalThis.fetch = async (url) => { const f = path.join(PUB, String(url).replace(/^\/+/, "").split("?")[0]); if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => { throw new Error("404"); }, text: async () => "" }; const buf = fs.readFileSync(f); return { ok: true, status: 200, json: async () => JSON.parse(buf.toString("utf8")), text: async () => buf.toString("utf8") }; };
globalThis.window.raAtlasSummary = A; new Function("window", "document", "CustomEvent", fs.readFileSync(path.join(PUB, "js/story-engine.js"), "utf8"))(globalThis.window, globalThis.document, function () {});
export const F = globalThis.window.raStory;
export const L = F.createLoader("/");
export { parse, ctx, A, PUB, SITE };
export async function read(text) { const p = parse(text); const g = await L.gather(p); return { p, g }; }
