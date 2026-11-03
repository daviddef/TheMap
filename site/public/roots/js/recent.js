/* "Remember this file on this device": the ONE module that keeps anything in the browser, and only when the visitor presses the button.
   Files go into this browser's own IndexedDB for this page: no network, and nothing is read back except to reopen the file. Capped at five files;
   "Forget" removes one, "Forget all" removes everything. No other module may use browser storage (the privacy test checks). */
const DB = 'roots-recent', STORE = 'files', KEEP = 5;
const open = () => new Promise((ok, no) => {
  if (typeof indexedDB === 'undefined') return no(new Error('This browser has no storage for it.'));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error || new Error('Storage is not available (a private window?).'));
});
const run = async (mode, fn) => { const db = await open(); try { return await new Promise((ok, no) => { const t = db.transaction(STORE, mode), s = t.objectStore(STORE); let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => ok(out); t.onerror = () => no(t.error); t.onabort = () => no(t.error || new Error('Not saved: the browser refused the storage.')); }); } finally { db.close(); } };

/* [{id, name, size, saved}] newest first, without the file itself */
export async function list() {
  try { const all = await run('readonly', s => s.getAll()); return (all || []).map(({ id, name, size, saved }) => ({ id, name, size, saved })).sort((a, b) => b.saved - a.saved); } catch { return []; }
}
export async function remember(name, bytes) {
  const id = name + '|' + bytes.byteLength;                      // the same file saved twice is one entry
  await run('readwrite', s => s.put({ id, name, size: bytes.byteLength, saved: Date.now(), bytes }));
  const all = await list();
  for (const old of all.slice(KEEP)) await forget(old.id);
  return id;
}
export const recall = async id => { const r = await run('readonly', s => s.get(id)); return r ? { name: r.name, bytes: r.bytes } : null; };
export const forget = id => run('readwrite', s => s.delete(id));
export const forgetAll = () => run('readwrite', s => s.clear());
