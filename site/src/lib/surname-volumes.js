/* Which volumes are worth opening, per country, for a surname page.
 *
 * The atlas knows a surname is attested in a country and nothing finer — no
 * place, no date. It separately knows WHEN a name was borne there (from the
 * birth timeline) and WHEN a volume's own pages run (every one carries a
 * `from` and a `to`). Intersecting the two is a real filter and the only
 * one the data supports; this module is that intersection, computed once
 * for the whole build rather than once per page.
 *
 * SOURCED FROM data/fs-volumes-world.json.gz ALONE — 2,890,777 volumes over
 * 15,675 places, the same figure this project's own briefs cite as the
 * headline. The place pages additionally fold in three much smaller, hand-
 * curated sources (fs-volumes.json's 9,494 rows, Antenati's 5,591, Trove's
 * 432) with a bookkey-based dedupe against the world file. Reproducing that
 * exact dedupe here, a second time, risks a subtly different merge from the
 * one the place pages show — so this module does not attempt it. A
 * country's count here can therefore be a small UNDERcount relative to what
 * a place page for one of its towns would show, never an overcount, and
 * that direction of error is the safe one for a claim this page makes.
 *
 * WHY A SEGMENT TREE. A country's volumes have to be queried by the surname's
 * OWN attested decades in that country, which differ on every page, so this
 * cannot be precomputed per country in advance. Italy alone holds 1,340,764
 * volumes; a linear scan of that per surname page, times however many of the
 * ~19,779 pages attest a name in Italy, is exactly the mistake this project's
 * own briefs keep finding (a regex inside near(), a find() over fr.surnames,
 * a provider filter per page — see surname-timeline.js). A merge-sort tree
 * built once per country answers "how many volumes have from<=hi and to>=lo"
 * in O(log^2 n), and — because each tree node keeps the ORIGINAL volume's
 * index alongside its sort key, not just the key — the same query also
 * yields the exact matching volumes when there are few enough to list,
 * with no separate code path for "count" versus "list".
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { atlas as idx } from "./atlas.js";

/* Mirrors scripts/record_kinds.py's KINDS exactly (order is significant:
   the first pattern to match wins), so a volume classifies the same way
   here as it does on a place page. Classified on the volume's own title
   AND its parent collection's title — FamilySearch catalogues collection
   titles in English even where a volume's own title is not ("Defunciones
   1980-1989" only classifies as civil registration through its collection,
   "Argentina, Civil Registration, 1886-2019"). */
const KIND_RX = [
  ["church", "Church and parish registers",
    /church|parish|baptis|christening|banns|diocese|catholic|lutheran|reformed|orthodox|methodist|presbyterian|congregation|synagog|anglican|evangelical|episcopal|jewish record|kirk session|bishop'?s transcript|matricul|libri|confirmation/i],
  ["cemetery", "Cemeteries and burials",
    /cemeter|burial|grave|tombstone|monumental inscription|interment|funeral|crematio/i],
  ["census", "Censuses and population lists",
    /census|revision list|population register|population card|electoral|poll book|voter|tax list|head of household/i],
  ["military", "Military and wartime",
    /military|army|navy|air force|war |wartime|conscript|regiment|veteran|draft|soldier|prisoner of war|service record|muster/i],
  ["migration", "Immigration and emigration",
    /emigra|immigra|passenger|naturaliz|border cross|passport|arrival|departure|ship manifest|alien regist/i],
  ["probate", "Probate, land and notarial",
    /probate|\bwills?\b|estate|testament|land record|deed|notar|cadastr|property|mortgage|seigniorial|court record/i],
  ["civil", "Civil registration and vital records",
    /civil regist|vital record|\bbirths?\b|\bdeaths?\b|\bmarriages?\b|divorce|register office|state registration/i],
  ["newspaper", "Newspapers and gazettes", /\bnewspapers?\b|\bgazette\b/i],
];
export const KIND_LABEL = Object.fromEntries(KIND_RX.map(([k, label]) => [k, label]));

function kindsOf(...texts) {
  const hay = texts.filter(Boolean).join(" ");
  if (!hay) return [];
  return KIND_RX.filter(([, , rx]) => rx.test(hay)).map(([k]) => k);
}

/* Mirrors scripts/build.py's _fs_image_url exactly: the owc parameter takes
   a URL, not a bare waypoint id — the bare form 404s on every one of the
   2.8 million links this project shipped before that was found. */
function fsImageUrl(col, wp) {
  return "https://www.familysearch.org/search/image/index?owc=" +
    "https://www.familysearch.org/service/cds/recapi/collections/" +
    col + "/waypoints/" + wp;
}

/* ---- load, once for the whole build ------------------------------------ */

let BY_CC = null;         // cc -> { total, fromArr, toArr, refArr, meta[] }
let TOTAL_LOADED = 0;

function buildTree(sortedRefs) {
  /* A bottom-up merge-sort tree over `to`, sorted-by-`from` order preserved
     as the leaf order. Node i (1-indexed, array-backed) covers a range of
     the from-sorted array; leaves hold one element. Internal nodes hold
     their range's elements sorted by `to`, built by merging children —
     O(n log n) time and space, once, per country. */
  const n = sortedRefs.length;
  if (n === 0) return null;
  const leafToVal = new Float64Array(n);
  const leafRef = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    leafToVal[i] = sortedRefs[i].to;
    leafRef[i] = sortedRefs[i].ref;
  }
  const size = 1 << Math.ceil(Math.log2(Math.max(n, 1)));
  const nodeTo = new Array(2 * size).fill(null);
  const nodeRef = new Array(2 * size).fill(null);
  for (let i = 0; i < n; i++) { nodeTo[size + i] = [leafToVal[i]]; nodeRef[size + i] = [leafRef[i]]; }
  for (let i = n; i < size; i++) { nodeTo[size + i] = []; nodeRef[size + i] = []; }
  for (let i = size - 1; i >= 1; i--) {
    const l = 2 * i, r = 2 * i + 1;
    const lt = nodeTo[l], rt = nodeTo[r], lr = nodeRef[l], rr = nodeRef[r];
    const mTo = new Array(lt.length + rt.length);
    const mRef = new Array(lr.length + rr.length);
    let a = 0, b = 0, k = 0;
    while (a < lt.length && b < rt.length) {
      if (lt[a] <= rt[b]) { mTo[k] = lt[a]; mRef[k] = lr[a]; a++; }
      else { mTo[k] = rt[b]; mRef[k] = rr[b]; b++; }
      k++;
    }
    while (a < lt.length) { mTo[k] = lt[a]; mRef[k] = lr[a]; a++; k++; }
    while (b < rt.length) { mTo[k] = rt[b]; mRef[k] = rr[b]; b++; k++; }
    nodeTo[i] = mTo; nodeRef[i] = mRef;
    /* Children are NOT freed here. The iterative range query below picks
       its canonical nodes from every level of the tree, not only the
       root, so every node has to stay populated for a query to find it. */
  }
  return { size, nodeTo, nodeRef };
}

function lowerBoundGE(arr, lo) {
  /* First index in `arr` (sorted ascending) with value >= lo. */
  let a = 0, b = arr.length;
  while (a < b) { const m = (a + b) >> 1; if (arr[m] < lo) a = m + 1; else b = m; }
  return a;
}

/* Collect the refs of every leaf-range node fully inside [ql, qr) whose
   sorted `to` values are >= lo, walking the segment tree iteratively. */
function queryRefs(tree, ql, qr, lo, out) {
  if (!tree || ql >= qr) return;
  let l = ql + tree.size, r = qr + tree.size;
  while (l < r) {
    if (l & 1) { collectNode(tree, l, lo, out); l++; }
    if (r & 1) { r--; collectNode(tree, r, lo, out); }
    l >>= 1; r >>= 1;
  }
}
function collectNode(tree, node, lo, out) {
  const toArr = tree.nodeTo[node];
  if (!toArr || !toArr.length) return;
  const pos = lowerBoundGE(toArr, lo);
  const refArr = tree.nodeRef[node];
  for (let i = pos; i < refArr.length; i++) out.push(refArr[i]);
}

function tryRead(candidates) {
  let lastErr = null;
  for (const f of candidates) {
    try { return readFileSync(f); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("not found: " + candidates.join(", "));
}

function load() {
  if (BY_CC) return;
  BY_CC = {};
  let raw;
  try {
    raw = tryRead([
      resolve(process.cwd(), "../data/fs-volumes-world.json.gz"),
      resolve(process.cwd(), "data/fs-volumes-world.json.gz"),
    ]);
  } catch (e) {
    console.warn("surname-volumes: fs-volumes-world.json.gz unavailable (" +
      e.message + ") — country volume filters will be empty on every page. " +
      "Set RA_ALLOW_NO_WORLD=1 knowingly, or fetch the release asset.");
    return;
  }
  const world = JSON.parse(gunzipSync(raw).toString("utf8"));
  const colTitles = world.colTitles || {};

  const placeCc = {};
  for (const p of idx.places || []) if (p.cc) placeCc[p.i] = p.cc;

  /* One growing array of volume metadata per country, plus a parallel
     collector of {from,to,ref} used only while building the tree. */
  const metaByCc = {};
  const rowsByCc = {};
  let placed = 0, unplaced = 0;

  for (const [pid, rows] of Object.entries(world.byPlace || {})) {
    const cc = placeCc[pid];
    if (!cc) { unplaced += rows.length; continue; }
    placed += rows.length;
    const meta = (metaByCc[cc] ||= []);
    const list = (rowsByCc[cc] ||= []);
    for (const r of rows) {
      const from = r.from, to = r.to ?? r.from;
      if (from == null) continue;
      const ref = meta.length;
      meta.push({
        t: r.t,
        from, to,
        url: r.url || fsImageUrl(r.col, r.wp),
        rk: kindsOf(r.t, colTitles[r.col]),
      });
      list.push({ from, to, ref });
    }
  }
  TOTAL_LOADED = placed;

  for (const [cc, list] of Object.entries(rowsByCc)) {
    list.sort((a, b) => a.from - b.from);
    const fromArr = new Float64Array(list.length);
    for (let i = 0; i < list.length; i++) fromArr[i] = list[i].from;
    BY_CC[cc] = { total: list.length, fromArr, tree: buildTree(list), meta: metaByCc[cc] };
  }
  console.log(`surname-volumes: ${placed.toLocaleString()} volumes indexed across ` +
    `${Object.keys(BY_CC).length} countries (${unplaced.toLocaleString()} on places ` +
    "outside the current atlas, skipped)");
}

/** Total volumes this atlas holds for a country (all years), or 0. */
export function totalVolumes(cc) {
  load();
  return (BY_CC[cc] && BY_CC[cc].total) || 0;
}

const SHORTLIST_CAP = 40;

/** Merge a set of decade numbers (e.g. [1900,1910,1930]) into maximal
    contiguous runs, each covering [decade, decade+9] for its span. */
function decadeRuns(decades) {
  const sorted = [...new Set(decades)].sort((a, b) => a - b);
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d <= last.hi + 10) last.hi = d + 9;
    else runs.push({ lo: d, hi: d + 9 });
  }
  return runs;
}

/** The volumes worth opening for `cc`, given the decades this name is
 *  attested there. Returns one of three shapes:
 *    { total, state: "warning" }                         — zero overlap
 *    { total, state: "shortlist", overlap, list }         — small enough to read
 *    { total, state: "filter", overlap, kinds }           — too many to list
 *  `total` is every dated volume this atlas holds for the country, whether
 *  or not it overlaps; `overlap` is the exact count that does. */
export function volumesFor(cc, decades) {
  load();
  const c = BY_CC[cc];
  if (!c || !c.total || !decades || !decades.length) return null;
  const runs = decadeRuns(decades.map(Number));
  const refs = [];
  for (const { lo, hi } of runs) {
    const qr = lowerBoundGE(c.fromArr, hi + 1);   // exclusive upper bound: from <= hi
    queryRefs(c.tree, 0, qr, lo, refs);
  }
  const uniq = [...new Set(refs)];
  const overlap = uniq.length;
  if (overlap === 0) return { total: c.total, state: "warning" };
  if (overlap <= SHORTLIST_CAP) {
    const list = uniq.map((r) => c.meta[r]).sort((a, b) => a.from - b.from);
    return { total: c.total, state: "shortlist", overlap, list };
  }
  const kindCount = {};
  for (const r of uniq) for (const k of c.meta[r].rk) kindCount[k] = (kindCount[k] || 0) + 1;
  const kinds = Object.entries(kindCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  return { total: c.total, state: "filter", overlap, kinds };
}

export const loadedVolumeCount = () => (load(), TOTAL_LOADED);
