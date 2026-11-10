/* BUILD ONE SLICE OF THE GENERATED PAGES. RA_SHARD="i/n" keeps a page when a stable hash of its slug falls in slice i of n; with the
 * variable unset every page is kept, which is today's build, byte for byte. Used so the 56k place, surname and name pages can be built
 * in parallel jobs and uploaded as separate parts (see docs/split-build.md). The hash is FNV-1a over the slug, so the slice a page
 * belongs to never depends on what else is in the build. */
export function inShard(slug) {
  const s = process.env.RA_SHARD;
  if (!s) return true;
  const [i, n] = s.split("/").map(Number);
  if (!(n > 0) || !(i >= 0 && i < n)) throw new Error("RA_SHARD must look like 3/16, got " + s);
  let h = 0x811c9dc5;
  const t = String(slug);
  for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % n === i;
}
