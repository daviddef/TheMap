/* COMPARE-SET: read several archives for the paired Compare view, a few at a time, and say which could not be read.

   The page around the canvas gives this a list of archive keys and a function that reads ONE archive (a plain request for that archive's own public page). This module only decides
   how: at most `concurrency` at once, each with its own time limit, one archive failing never stops the others, and an archive that answered is remembered for the rest of the visit
   (`cache`), so changing the choice does not read it again. It returns what was read and, separately, what failed and why; a failed archive is never reported as empty.
   Pure (no DOM, no fetch of its own): tested in node. */

export const ARCHIVE_KEYS = ['defranceski', 'booyzen', 'luwinski', 'lerena', 'falco', 'blazevic', 'darcy', 'mazza'];

/* keys: what the canvas asked for → the valid ones, once each, in the archives' own order. */
export function cleanKeys(keys, allowed = ARCHIVE_KEYS) {
  const want = new Set((Array.isArray(keys) ? keys : []).filter(k => typeof k === 'string'));
  return allowed.filter(k => want.has(k));
}

/* readOne(key, signal) → Promise<value>. Returns { ok: [{key, value, ms, cached}], failed: [{key, why}], ms }. onProgress(done, total, key) is called as each one finishes. */
export async function loadSet(keys, readOne, o = {}) {
  const concurrency = Math.max(1, o.concurrency || 3), timeoutMs = o.timeoutMs || 45000, cache = o.cache || new Map(), onProgress = o.onProgress || (() => {});
  const list = cleanKeys(keys, o.allowed), t0 = Date.now(), results = new Map();
  let next = 0, done = 0;
  const one = async key => {
    if (cache.has(key)) { results.set(key, { key, value: cache.get(key), ms: 0, cached: true }); return; }
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, t1 = Date.now();
    let timer = 0;
    try {
      const value = await Promise.race([
        readOne(key, ctl && ctl.signal),
        new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error('took too long')); }, timeoutMs); }),
      ]);
      if (!value) throw new Error('nothing came back');
      cache.set(key, value); results.set(key, { key, value, ms: Date.now() - t1, cached: false });
    } catch (e) { results.set(key, { key, failed: String((e && e.message) || e || 'error').slice(0, 120) }); }
    finally { clearTimeout(timer); }
  };
  const worker = async () => { while (next < list.length) { const k = list[next++]; await one(k); onProgress(++done, list.length, k); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return {
    ok: list.filter(k => results.get(k) && !results.get(k).failed).map(k => results.get(k)),
    failed: list.filter(k => results.get(k) && results.get(k).failed).map(k => ({ key: k, why: results.get(k).failed })),
    ms: Date.now() - t0,
  };
}
