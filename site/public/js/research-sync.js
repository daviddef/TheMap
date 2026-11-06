/* RESEARCH SYNC: keep one encrypted copy of a reader's research off their machine, with no account.

   Everything secret is made HERE, in the browser, from a six-word passphrase the reader keeps:
     passphrase --PBKDF2 (600,000 rounds)--> master --HKDF--> lookup id, read token, write token, AES-256 key
   The server (workers/sync) gets the id, the two tokens and bytes it cannot open. It has no way to read the research, and a
   leaked server holds nothing a person could read. What the passphrase does NOT protect against: someone who has the passphrase
   (a photo of the recovery sheet, a shoulder surfer). Six words from 1,024 is 60 bits: strong against guessing, not against being told.

   A classic script (loaded with one <script> tag and evaluated by the tests). The network and the clock are passed in, so the
   tests run against a fake server. This file never touches the browser's own storage or cookies: what the page keeps is the page's business. */
(function () {
  "use strict";
  var ITERATIONS = 600000, SALT = "record-atlas-sync-v1", WORDS_IN_PASSPHRASE = 6, BASE = "https://sync.recordatlas.org";
  var te = new TextEncoder(), td = new TextDecoder();

  function b64url(bytes) { var s = ""; bytes = new Uint8Array(bytes); for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function hex(bytes) { return Array.prototype.map.call(new Uint8Array(bytes), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }

  /* ---- the passphrase -------------------------------------------------------------------------------------------- */

  /* Six words chosen with the browser's own random numbers. The list has 1,024 words, a power of two, so every word is equally likely. */
  function makePassphrase(words, rnd) {
    if (!words || words.length !== 1024) throw new Error("The word list must hold exactly 1,024 words.");
    var r = new Uint16Array(WORDS_IN_PASSPHRASE); (rnd || crypto.getRandomValues.bind(crypto))(r);
    var out = []; for (var i = 0; i < r.length; i++) out.push(words[r[i] & 1023]);
    return out.join(" ");
  }

  /* What the reader typed, folded to the one form that is derived from, and checked word by word against the list so a typo is
     named instead of silently becoming a different (empty) account. Spaces, hyphens, commas and capitals do not matter. */
  function normalisePassphrase(text, words) {
    var list = String(text == null ? "" : text).toLowerCase().split(/[^a-z]+/).filter(Boolean);
    var set = {}; (words || []).forEach(function (w) { set[w] = 1; });
    var bad = words ? list.filter(function (w) { return !set[w]; }) : [];
    return { phrase: list.join(" "), count: list.length, bad: bad, ok: list.length === WORDS_IN_PASSPHRASE && !bad.length };
  }

  /* ---- the keys -------------------------------------------------------------------------------------------------- */

  async function deriveKeys(phrase, opts) {
    var iterations = (opts && opts.iterations) || ITERATIONS, subtle = crypto.subtle;
    var base = await subtle.importKey("raw", te.encode(phrase), "PBKDF2", false, ["deriveBits"]);
    var master = await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode(SALT), iterations: iterations }, base, 256);
    var hk = await subtle.importKey("raw", master, "HKDF", false, ["deriveBits"]);
    async function part(label, bytes) { return subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode("record-atlas-sync/" + label) }, hk, bytes * 8); }
    var id = hex(await part("id", 16)), read = b64url(await part("read", 32)), write = b64url(await part("write", 32));
    var key = await subtle.importKey("raw", await part("enc", 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    /* A SEPARATE IDENTITY FOR THE "ASK CLAUDE" SERVICE. Its own labels, so the AI service holds an id and a token that open nothing
       at the sync service, and the sync service cannot be asked about them: neither can find or read the other's data. */
    var aiId = hex(await part("ai-id", 16)), aiToken = b64url(await part("ai-token", 32));
    return { id: id, readToken: read, writeToken: write, key: key, aiId: aiId, aiToken: aiToken };
  }

  /* blob = [1][12-byte iv][AES-GCM ciphertext+tag]. The id is bound in as associated data, so a blob moved under another id fails to open. */
  async function encrypt(keys, text) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode(keys.id) }, keys.key, te.encode(text)));
    var out = new Uint8Array(1 + 12 + ct.length); out[0] = 1; out.set(iv, 1); out.set(ct, 13);
    return out;
  }
  async function decrypt(keys, bytes) {
    bytes = new Uint8Array(bytes);
    if (bytes.length < 30 || bytes[0] !== 1) throw new Error("That is not a Record Atlas sync copy.");
    try {
      var pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(1, 13), additionalData: te.encode(keys.id) }, keys.key, bytes.slice(13));
      return td.decode(pt);
    } catch (e) { throw new Error("Wrong passphrase, or the copy is damaged."); }
  }

  /* ---- talking to the server -------------------------------------------------------------------------------------- */

  function api(opts) { return { f: (opts && opts.fetch) || fetch.bind(globalThis), base: ((opts && opts.base) || BASE).replace(/\/$/, "") }; }
  function auth(token) { return { Authorization: "Bearer " + token }; }

  async function push(keys, text, opts) {
    var a = api(opts), body = await encrypt(keys, text);
    var r = await a.f(a.base + "/v1/" + keys.id, { method: "PUT", headers: Object.assign({ "X-Read-Token": keys.readToken, "Content-Type": "application/octet-stream" }, auth(keys.writeToken)), body: body });
    if (!r.ok) throw new Error(r.status === 413 ? "Your research is too large to sync." : r.status === 403 ? "That passphrase belongs to someone else's copy." : "Sync failed (" + r.status + ").");
    return r.json();
  }
  /* null when nothing is stored under this passphrase (or the passphrase is wrong: the server does not say which) */
  async function pull(keys, opts) {
    var a = api(opts), r = await a.f(a.base + "/v1/" + keys.id, { headers: auth(keys.readToken) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Restore failed (" + r.status + ").");
    return { text: await decrypt(keys, await r.arrayBuffer()), saved: r.headers.get("X-Saved-At") || null };
  }
  async function versions(keys, opts) {
    var a = api(opts), r = await a.f(a.base + "/v1/" + keys.id + "/versions", { headers: auth(keys.readToken) });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error("Could not list older copies (" + r.status + ").");
    return (await r.json()).versions;
  }
  async function pullVersion(keys, day, opts) {
    var a = api(opts), r = await a.f(a.base + "/v1/" + keys.id + "/versions/" + day, { headers: auth(keys.readToken) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("Could not fetch that copy (" + r.status + ").");
    return { text: await decrypt(keys, await r.arrayBuffer()), saved: r.headers.get("X-Saved-At") || null };
  }
  async function erase(keys, opts) {
    var a = api(opts), r = await a.f(a.base + "/v1/" + keys.id, { method: "DELETE", headers: auth(keys.writeToken) });
    if (r.status === 404) return { deleted: 0 };
    if (!r.ok) throw new Error("Could not delete (" + r.status + ").");
    return r.json();
  }

  /* ---- what the page says ----------------------------------------------------------------------------------------- */

  function ago(savedIso, now) {
    if (!savedIso) return "never synced";
    var s = Math.max(0, Math.round(((now == null ? Date.now() : now) - Date.parse(savedIso)) / 1000));
    if (s < 60) return "synced just now";
    var m = Math.round(s / 60); if (m < 60) return "synced " + m + (m === 1 ? " minute" : " minutes") + " ago";
    var h = Math.round(m / 60); if (h < 48) return "synced " + h + (h === 1 ? " hour" : " hours") + " ago";
    var d = Math.round(h / 24); return "synced " + d + " days ago";
  }

  /* The sheet to print or save. It must say what the words are, and that nobody, including us, can recover them. */
  function recoverySheet(phrase, when) {
    return ["RECORD ATLAS: recovery sheet", "",
      "Your passphrase (six words, in this order):", "", "    " + phrase, "",
      "Made on " + (when || "") + ".", "",
      "What it does: on any device, open My research, choose \"Restore from my passphrase\", type these words, and your research comes back.",
      "What it cannot do: be recovered. Nobody holds a copy, not even Record Atlas. If you lose these words, the stored copy can never be opened.",
      "Keep this sheet like a house key: somewhere safe, not in a photo you share, not in an email.", ""].join("\n");
  }

  var api2 = { makePassphrase: makePassphrase, normalisePassphrase: normalisePassphrase, deriveKeys: deriveKeys, encrypt: encrypt, decrypt: decrypt,
    push: push, pull: pull, versions: versions, pullVersion: pullVersion, erase: erase, ago: ago, recoverySheet: recoverySheet, ITERATIONS: ITERATIONS, BASE: BASE };
  if (typeof module !== "undefined" && module.exports) module.exports = api2;
  if (typeof window !== "undefined") window.raResearchSync = api2;
})();
