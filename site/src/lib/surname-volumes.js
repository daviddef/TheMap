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
 * A SECOND VERSION, AFTER THE FIRST ONE DOUBLED THE BUILD. That version
 * indexed each country in a merge-sort tree so a query never had to scan a
 * whole country — sound in complexity, wrong in practice. A tree over
 * 2,890,777 leaves holds O(n log n) elements, and every one of those was a
 * plain JS array boxed onto the heap: roughly 60 million small objects
 * alive for the whole build. `npm run build` went from 2,209s to 4,947s —
 * every OTHER page paid rent on a heap this module inflated, not just the
 * surname pages that queried it. Measure the whole build, not just the
 * function.
 *
 * WHAT REPLACED IT is the same shape build.py's own coverage-by-country.json
 * already computes: a flat array of volume refs per (country, decade),
 * built by counting sizes first and filling typed arrays second — no
 * per-node duplication, no tree. A query for a handful of decades collects
 * refs from just those buckets into a Set (exact, because a volume
 * touching two queried decades must count once) — proportional to how much
 * of a country the surname's OWN decades actually touch, not to the
 * country's total. */
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

const THIS_YEAR = new Date().getFullYear();

/* ---- load, once for the whole build ------------------------------------ */

let BY_CC = null;   // cc -> { total, buckets: Map<decade, Int32Array of refs>, meta[] }
let TOTAL_LOADED = 0;

function tryRead(candidates) {
  let lastErr = null;
  for (const f of candidates) {
    try { return readFileSync(f); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("not found: " + candidates.join(", "));
}

/* ONE PLACE AT A TIME, BECAUSE V8 WILL NOT HOLD THE WHOLE FILE.
 *
 * This was `JSON.parse(gunzipSync(raw).toString("utf8"))`, and it worked
 * until the corpus outgrew a JS string. V8 caps a string at 0x1fffffe8 bytes
 * — 512 MB — and the placed corpus reached 539 MB decompressed when the
 * gazetteer gained the thirty per-country files it had been missing. The
 * build died with «Cannot create a string longer than 0x1fffffe8 characters»
 * on the first surname page, nineteen minutes in.
 *
 * A Buffer has no such limit, so the bytes are fine; only the string was the
 * problem. scripts/match-fs-volumes.py now ends every `byPlace` entry with a
 * newline — still one valid JSON document, since a newline between members is
 * whitespace — and this walks those lines, so the largest string built is one
 * place's books instead of all of them.
 *
 * Each line is `"placeid":[...]`, with a trailing comma on all but the last,
 * which `{` + line + `}` turns into a parseable object. A raw newline cannot
 * occur inside a title, because JSON writes those as \n.
 *
 * THE OLD ONE-LINE FORMAT STILL READS, for a file restored from a cache
 * written before this change — it simply cannot be larger than 512 MB, and
 * the throw says so plainly rather than blaming the string length. */
function parseWorld(buf) {
  const firstNl = buf.indexOf(10);
  if (firstNl < 0 || firstNl > 4096) {
    try {
      return JSON.parse(buf.toString("utf8"));
    } catch (e) {
      throw new Error(
        "fs-volumes-world.json.gz is in the old single-line format and is too " +
        "large for one JS string (" + buf.length.toLocaleString() + " bytes " +
        "decompressed, limit 536,870,888). Re-run scripts/match-fs-volumes.py " +
        "to rewrite it one place per line. Original: " + e.message);
    }
  }
  const out = { byPlace: {} };
  let i = 0, inBy = false;
  while (i < buf.length) {
    let j = buf.indexOf(10, i);
    if (j < 0) j = buf.length;
    let line = buf.toString("utf8", i, j).trim();
    i = j + 1;
    if (!line || line === "{" || line === "}" || line === "}}") continue;
    if (line.endsWith(",")) line = line.slice(0, -1);
    if (line === '"byPlace":{') { inBy = true; continue; }
    if (line.charCodeAt(0) !== 34) continue;      // not a `"key":value` line
    const obj = JSON.parse("{" + line + "}");
    if (inBy) Object.assign(out.byPlace, obj);
    else Object.assign(out, obj);
  }
  return out;
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
  const world = parseWorld(gunzipSync(raw));
  const colTitles = world.colTitles || {};

  const placeCc = {};
  for (const p of idx.places || []) if (p.cc) placeCc[p.i] = p.cc;

  const metaByCc = {};        // cc -> [{t,from,to,url,rk}, ...]
  const sizeByCcDecade = {};  // cc -> Map<decade, count>  (pass 1)
  let placed = 0, unplaced = 0, malformed = 0;

  /* PASS 1: read every volume once, keep its metadata, and count how many
     land in each (country, decade) bucket without allocating them yet. */
  for (const [pid, rows] of Object.entries(world.byPlace || {})) {
    const cc = placeCc[pid];
    if (!cc) { unplaced += rows.length; continue; }
    const meta = (metaByCc[cc] ||= []);
    const sizes = (sizeByCcDecade[cc] ||= new Map());
    for (const r of rows) {
      let from = r.from, to = r.to ?? r.from;
      if (from == null) continue;
      from = Number(from); to = Number(to);
      /* Mirrors build.py's own coverage sanity filter exactly, so a volume
         this atlas would not count as dated coverage there is not counted
         as overlapping anything here either. */
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from ||
          from < 1200 || from > THIS_YEAR) { malformed++; continue; }
      to = Math.min(to, THIS_YEAR);
      placed++;
      const ref = meta.length;
      meta.push({ t: r.t, from, to, url: r.url || fsImageUrl(r.col, r.wp),
                  rk: kindsOf(r.t, colTitles[r.col]) });
      for (let d = Math.floor(from / 10) * 10; d <= Math.floor(to / 10) * 10; d += 10) {
        sizes.set(d, (sizes.get(d) || 0) + 1);
      }
    }
  }
  TOTAL_LOADED = placed;

  /* PASS 2: allocate exactly-sized Int32Arrays and refill — no push, no
     resizing, no per-node duplication. A volume spanning k decades appears
     in k buckets; total storage is the sum of those, not n log n of it. */
  for (const cc of Object.keys(metaByCc)) {
    const sizes = sizeByCcDecade[cc];
    const buckets = new Map();
    for (const [d, n] of sizes) buckets.set(d, { arr: new Int32Array(n), pos: 0 });
    /* DEDUP BY STAMP, NOT BY SET. The first cut here used a JS Set to dedupe
       a volume that touches more than one queried decade, and it was the
       second thing (after the tree) to double the build: Italy alone can
       union half a million refs for a single page, and hashing every one of
       them into a Set costs far more than writing to a plain index. A
       Uint32Array the size of the country, each slot holding the query
       "stamp" that last touched it, turns membership into one array read —
       no hashing, no resizing, no per-query allocation beyond the output
       itself. */
    BY_CC[cc] = { total: metaByCc[cc].length, buckets, meta: metaByCc[cc],
                  stampArr: new Uint32Array(metaByCc[cc].length), stamp: 0 };
  }
  /* PASS 3: refill the buckets. `ref` has to land on the same volume as
     pass 1 gave it, so this re-derives it by walking byPlace in the same
     order and re-applying the identical filter — a second pass over the
     source, not a second copy of it. */
  const cursor = {};
  for (const [pid, rows] of Object.entries(world.byPlace || {})) {
    const cc = placeCc[pid];
    if (!cc) continue;
    const entry = BY_CC[cc];
    for (const r of rows) {
      let from = r.from, to = r.to ?? r.from;
      if (from == null) continue;
      from = Number(from); to = Number(to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from ||
          from < 1200 || from > THIS_YEAR) continue;
      to = Math.min(to, THIS_YEAR);
      const ref = (cursor[cc] = (cursor[cc] || 0));
      cursor[cc]++;
      for (let d = Math.floor(from / 10) * 10; d <= Math.floor(to / 10) * 10; d += 10) {
        const b = entry.buckets.get(d);
        b.arr[b.pos++] = ref;
      }
    }
  }

  console.log(`surname-volumes: ${placed.toLocaleString()} volumes indexed across ` +
    `${Object.keys(BY_CC).length} countries (${unplaced.toLocaleString()} on places ` +
    `outside the current atlas, ${malformed.toLocaleString()} with no usable date, skipped)`);
}

/** Total volumes this atlas holds for a country (all years), or 0. */
export function totalVolumes(cc) {
  load();
  return (BY_CC[cc] && BY_CC[cc].total) || 0;
}

const SHORTLIST_CAP = 40;

/** The volumes worth opening for `cc`, given the decades this name is
 *  attested there. Returns one of three shapes:
 *    { total, state: "warning" }                         — zero overlap
 *    { total, state: "shortlist", overlap, list }         — small enough to read
 *    { total, state: "filter", overlap, kinds }           — too many to list
 *  `total` is every dated volume this atlas holds for the country, whether
 *  or not it overlaps; `overlap` is the exact count that does. */
/* Only the ranking of the four commonest kinds is ever shown for a
   "filter" result, never a count — so once there are more matches than
   this, tallying kinds from a bounded sample instead of every match gives
   the same answer for a fraction of the cost. Italy-scale countries can
   overlap 500,000+ volumes on a single page; scanning `.rk` on all of them
   just to rank four labels was most of this function's remaining cost. */
const KIND_SAMPLE_CAP = 20000;

export function volumesFor(cc, decades) {
  load();
  const c = BY_CC[cc];
  if (!c || !c.total || !decades || !decades.length) return null;
  const stamp = ++c.stamp;
  const stampArr = c.stampArr;
  // Upper bound on the union size, known without touching a bucket:
  // preallocating one typed array up front avoids a plain array's repeated
  // grow-and-copy as `refs` fills, which dominated the cost at Italy's scale.
  let cap = 0;
  const chosen = [];
  for (const dRaw of decades) {
    const b = c.buckets.get(Number(dRaw));
    if (b) { chosen.push(b); cap += b.arr.length; }
  }
  const refs = new Int32Array(cap);
  let n = 0;
  for (const b of chosen) {
    const arr = b.arr;
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      if (stampArr[r] !== stamp) { stampArr[r] = stamp; refs[n++] = r; }
    }
  }
  const overlap = n;
  if (overlap === 0) return { total: c.total, state: "warning" };
  if (overlap <= SHORTLIST_CAP) {
    const list = Array.from(refs.subarray(0, n), (r) => c.meta[r])
      .sort((a, b) => a.from - b.from);
    return { total: c.total, state: "shortlist", overlap, list };
  }
  const kindCount = {};
  const step = overlap > KIND_SAMPLE_CAP ? Math.ceil(overlap / KIND_SAMPLE_CAP) : 1;
  for (let i = 0; i < n; i += step) for (const k of c.meta[refs[i]].rk) kindCount[k] = (kindCount[k] || 0) + 1;
  const kinds = Object.entries(kindCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  return { total: c.total, state: "filter", overlap, kinds };
}

export const loadedVolumeCount = () => (load(), TOTAL_LOADED);
