/* Passphrase sync: the Worker (workers/sync) and the browser module (public/js/research-sync.js) tested against each other
   with an in-memory stand-in for R2. Nothing here touches the network or a Cloudflare account. All data is invented. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker, { copyNightly, computeStats } from "../../workers/sync/src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = { exports: {} };
new Function("module", fs.readFileSync(path.join(here, "../public/js/research-sync.js"), "utf8"))(mod);
const S = mod.exports;
const WORDS = JSON.parse(fs.readFileSync(path.join(here, "../public/sync-words.json"), "utf8")).words;
const FAST = { iterations: 1000 };                       // the real 600,000 is asserted once below

/* the parts of R2 the Worker uses */
function fakeR2() {
  const m = new Map(); let n = 0;
  const wrap = (key, v) => ({ key, size: v.bytes.length, uploaded: v.uploaded, customMetadata: v.customMetadata, httpMetadata: v.httpMetadata,
    arrayBuffer: async () => v.bytes.slice().buffer, json: async () => JSON.parse(new TextDecoder().decode(v.bytes)) });
  return { _m: m, _clock: Date.now(),
    async put(key, value, o) {
      if (o && o.onlyIf && o.onlyIf.etagDoesNotMatch === "*" && m.has(key)) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
      m.set(key, { bytes, uploaded: new Date(this._clock + ++n), customMetadata: o && o.customMetadata, httpMetadata: o && o.httpMetadata });
      return { key };
    },
    async get(key) { return m.has(key) ? wrap(key, m.get(key)) : null; },
    async delete(keys) { for (const k of [].concat(keys)) m.delete(k); },
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const all = [...m.keys()].filter(k => k.startsWith(prefix)).sort(), start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit);
      return { objects: page.map(k => wrap(k, m.get(k))), truncated: start + limit < all.length, cursor: String(start + limit) };
    } };
}
function rig() {
  const env = { SYNC: fakeR2(), COPY: fakeR2(), ALLOW_ORIGINS: "https://recordatlas.org" };
  const fetch = async (url, init = {}) => worker.fetch(new Request(url, { ...init, headers: { Origin: "https://recordatlas.org", ...(init.headers || {}) } }), env);
  return { env, opts: { fetch, base: "https://sync.test" } };
}
const pass = () => S.makePassphrase(WORDS);

test("the word list is 1,024 distinct plain words", () => {
  assert.equal(WORDS.length, 1024); assert.equal(new Set(WORDS).size, 1024);
  assert.ok(WORDS.every(w => /^[a-z]{3,8}$/.test(w)));
});

test("a passphrase is six words, typed any way, and a typo is named", () => {
  const p = pass(); assert.equal(p.split(" ").length, 6);
  const n = S.normalisePassphrase(p.toUpperCase().replace(/ /g, " - "), WORDS); assert.equal(n.ok, true); assert.equal(n.phrase, p);
  const bad = S.normalisePassphrase(p.split(" ").slice(0, 5).join(" ") + " zzqx", WORDS); assert.equal(bad.ok, false); assert.deepEqual(bad.bad, ["zzqx"]);
  assert.equal(S.normalisePassphrase("one two", WORDS).ok, false, "too few words");
  assert.throws(() => S.makePassphrase(["a"]), /1,024/);
});

test("the same passphrase always makes the same keys, another makes others, and the real cost is 600,000 rounds", async () => {
  const p = pass(), a = await S.deriveKeys(p, FAST), b = await S.deriveKeys(p, FAST), c = await S.deriveKeys(pass(), FAST);
  assert.equal(a.id, b.id); assert.equal(a.readToken, b.readToken); assert.notEqual(a.id, c.id);
  assert.match(a.id, /^[0-9a-f]{32}$/); assert.match(a.readToken, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(a.readToken, a.writeToken);
  assert.equal(S.ITERATIONS, 600000);
});

test("a copy encrypts, opens, and never shows its words to a server or to the wrong key", async () => {
  const k = await S.deriveKeys(pass(), FAST), k2 = await S.deriveKeys(pass(), FAST);
  const text = JSON.stringify({ note: "Kosina line, volume AAA" }), blob = await S.encrypt(k, text);
  assert.equal(await S.decrypt(k, blob), text);
  assert.doesNotMatch(Buffer.from(blob).toString("latin1"), /Kosina|volume/);
  await assert.rejects(S.decrypt(k2, blob), /Wrong passphrase/);
  const moved = { ...k, id: "0".repeat(32) }; await assert.rejects(S.decrypt(moved, blob), /Wrong passphrase/, "a blob moved under another id does not open");
  assert.notDeepEqual(await S.encrypt(k, text), blob, "a fresh iv every time");
});

test("save, restore, and a second device restoring from the passphrase alone", async () => {
  const { env, opts } = rig(), p = pass(), k = await S.deriveKeys(p, FAST);
  assert.equal(await S.pull(k, opts), null, "nothing stored yet");
  const r = await S.push(k, "version one", opts); assert.equal(r.ok, true);
  const other = await S.deriveKeys(p, FAST), got = await S.pull(other, opts);
  assert.equal(got.text, "version one"); assert.match(got.saved, /^\d{4}-\d\d-\d\dT/);
  await S.push(k, "version two", opts); assert.equal((await S.pull(other, opts)).text, "version two");
  assert.ok(env.SYNC._m.has(`latest/${k.id}`) && env.SYNC._m.has(`meta/${k.id}`));
  assert.ok([...env.SYNC._m.keys()].every(x => !/Kosina|version/.test(x)), "no key names content");
});

test("one old version a day, and a version can be listed and fetched", async () => {
  const { env, opts } = rig(), k = await S.deriveKeys(pass(), FAST);
  await S.push(k, "morning", opts); await S.push(k, "evening", opts);
  const day = new Date().toISOString().slice(0, 10), vs = await S.versions(k, opts);
  assert.equal(vs.length, 1); assert.equal(vs[0].day, day);
  assert.equal((await S.pullVersion(k, day, opts)).text, "evening", "the last save of the day is the one kept");
  assert.equal(await S.pullVersion(k, "2020-01-01", opts), null);
  assert.ok([...env.SYNC._m.keys()].some(x => x === `v/${k.id}/${day}`), "old versions live under v/ so the lifecycle rule reaches them");
  assert.ok(env.SYNC._m.has(`latest/${k.id}`), "the newest copy is NOT under v/");
});

test("the wrong token reads nothing, writes nothing and deletes nothing", async () => {
  const { opts } = rig(), k = await S.deriveKeys(pass(), FAST), thief = await S.deriveKeys(pass(), FAST);
  await S.push(k, "mine", opts);
  assert.equal(await S.pull({ ...thief, id: k.id }, opts), null, "right id, wrong read token: looks like nothing");
  await assert.rejects(S.push({ ...thief, id: k.id }, "overwrite", opts), /someone else/);
  assert.deepEqual(await S.erase({ ...thief, id: k.id }, opts), { deleted: 0 });
  assert.equal((await S.pull(k, opts)).text, "mine");
  const read = await opts.fetch("https://sync.test/v1/" + k.id, { method: "DELETE", headers: { Authorization: "Bearer " + k.readToken } });
  assert.equal(read.status, 404, "the read token cannot delete");
});

test("limits: size, shape, origin, and what the server refuses to guess", async () => {
  const { env, opts } = rig(), k = await S.deriveKeys(pass(), FAST), put = (body, h = {}) => opts.fetch("https://sync.test/v1/" + k.id, { method: "PUT", body, headers: { Authorization: "Bearer " + k.writeToken, "X-Read-Token": k.readToken, ...h } });
  assert.equal((await put(new Uint8Array(3 * 1024 * 1024).fill(1))).status, 413);
  assert.equal((await put(new Uint8Array(40))).status, 400, "first byte must be the version");
  assert.equal((await opts.fetch("https://sync.test/v1/" + k.id, { method: "PUT", body: await S.encrypt(k, "x"), headers: { Authorization: "Bearer " + k.writeToken } })).status, 400, "a first save needs the read token");
  const evil = await worker.fetch(new Request("https://sync.test/v1/health", { headers: { Origin: "https://evil.example" } }), env);
  assert.equal(evil.status, 403);
  const pre = await worker.fetch(new Request("https://sync.test/v1/" + k.id, { method: "OPTIONS", headers: { Origin: "https://recordatlas.org" } }), env);
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://recordatlas.org");
  assert.equal((await opts.fetch("https://sync.test/v1/nothex")).status, 404);
  assert.equal((await opts.fetch("https://sync.test/v1/" + k.id)).status, 401, "no token");
  assert.equal((await opts.fetch("https://sync.test/v1/health")).status, 200);
});

test("delete everything removes the reader's keys from both buckets and leaves other readers alone", async () => {
  const { env, opts } = rig(), a = await S.deriveKeys(pass(), FAST), b = await S.deriveKeys(pass(), FAST);
  await S.push(a, "a-research", opts); await S.push(b, "b-research", opts);
  await copyNightly(env);
  assert.ok(env.COPY._m.has(`latest/${a.id}`));
  const r = await S.erase(a, opts); assert.ok(r.deleted >= 3);
  assert.equal(await S.pull(a, opts), null);
  assert.ok([...env.SYNC._m.keys(), ...env.COPY._m.keys()].every(k => !k.includes(a.id)), "gone from both buckets");
  assert.equal((await S.pull(b, opts)).text, "b-research");
});

test("the nightly copy takes what changed in the last two days and nothing older", async () => {
  const env = { SYNC: fakeR2(), COPY: fakeR2() }, now = Date.now();
  env.SYNC._clock = now - 5 * 86400000; await env.SYNC.put("latest/old", "x", {});
  env.SYNC._clock = now - 3600000; await env.SYNC.put("latest/new", "y", {});
  const r = await copyNightly(env, now);
  assert.equal(r.copied, 1); assert.ok(env.COPY._m.has("latest/new")); assert.ok(!env.COPY._m.has("latest/old"));
});

test("a server error never echoes its cause, and the module never stores anything in the browser", async () => {
  const bad = await worker.fetch(new Request("https://sync.test/v1/" + "a".repeat(32), { headers: { Authorization: "Bearer " + "A".repeat(43) } }), { SYNC: { get() { throw new Error("secret key name"); } }, ALLOW_ORIGINS: "" });
  assert.equal(bad.status, 500); assert.doesNotMatch(await bad.text(), /secret/);
  const src = fs.readFileSync(path.join(here, "../public/js/research-sync.js"), "utf8");
  assert.doesNotMatch(src, /localStorage|sessionStorage|document\.cookie|sendBeacon/);
});

test("the ago line reads plainly", () => {
  const now = Date.parse("2026-11-06T12:00:00Z"), at = s => new Date(now - s * 1000).toISOString();
  assert.equal(S.ago(null, now), "never synced"); assert.equal(S.ago(at(10), now), "synced just now");
  assert.equal(S.ago(at(120), now), "synced 2 minutes ago"); assert.equal(S.ago(at(3 * 3600), now), "synced 3 hours ago"); assert.equal(S.ago(at(5 * 86400), now), "synced 5 days ago");
});

test("the AI identity is its own: derived from the same words, equal to none of the sync values, and stable", async () => {
  const words = WORDS.slice(0, 6).join(" "), a = await S.deriveKeys(words, FAST), b = await S.deriveKeys(words, FAST);
  assert.match(a.aiId, /^[0-9a-f]{32}$/); assert.match(a.aiToken, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual([a.aiId, a.aiToken], [b.aiId, b.aiToken]);
  assert.ok(![a.id, a.readToken, a.writeToken].includes(a.aiId) && ![a.id, a.readToken, a.writeToken].includes(a.aiToken));
});

test("counts: identities and recent saves are totals only, the public number needs no secret, and the full totals need the owner's key", async () => {
  const { env, opts } = rig(); env.STATS_KEY = "owner-secret-for-the-test";
  for (let i = 0; i < 3; i++) { const k = await S.deriveKeys(pass(), FAST); assert.equal((await S.push(k, "x" + i, opts)).ok, true); }
  const st = await computeStats(env);
  assert.equal(st.registrations, 3); assert.equal(st.active7, 3); assert.equal(st.active30, 3); assert.equal(st.new7, 3); assert.ok(st.bytes > 0);
  assert.equal(Object.keys(st).some(k => /id|key|phrase/i.test(k)), false, "no identifier in the totals");
  const later = await computeStats(env, Date.now() + 40 * 86400000);
  assert.equal(later.registrations, 3); assert.equal(later.active30, 0); assert.equal(later.new30, 0);
  const pub = await opts.fetch("https://sync.test/v1/count");
  assert.equal(pub.status, 200); const pj = await pub.json(); assert.equal(pj.registrations, 3); assert.deepEqual(Object.keys(pj).sort(), ["at", "registrations"]);
  assert.equal((await opts.fetch("https://sync.test/v1/stats")).status, 404, "no key");
  assert.equal((await opts.fetch("https://sync.test/v1/stats", { headers: { "X-Stats-Key": "wrong" } })).status, 404, "wrong key");
  const full = await opts.fetch("https://sync.test/v1/stats", { headers: { "X-Stats-Key": "owner-secret-for-the-test" } });
  assert.equal(full.status, 200); assert.equal((await full.json()).registrations, 3);
  delete env.STATS_KEY; assert.equal((await opts.fetch("https://sync.test/v1/stats", { headers: { "X-Stats-Key": "owner-secret-for-the-test" } })).status, 404, "no secret set, no route");
});
