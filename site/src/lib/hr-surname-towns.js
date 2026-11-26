/* CROATIA'S TEN MOST COMMON SURNAMES, TOWN BY TOWN (2021 census), for the pages built here.
 *
 * data/hr-surname-towns.json is the table (scripts/harvest-croatia-surname-towns.py). It gives RANKS ONLY: no page may turn a rank into a
 * number of people, or a name's absence from every list into an absence from Croatia. Every page that shows it names the source.
 *
 * The story page reads the same table in the browser from /hr-surname-towns.json (`face` below) with its own copy of the lookup in
 * public/js/story-engine.js; test/hr-surname-towns.test.js holds the two together.
 */
import table from "../../../data/hr-surname-towns.json" with { type: "json" };
import counts from "../../../data/frequencies/hr.json" with { type: "json" };

export const source = { name: table.source, url: table.url, year: table.year };
const LOCAL = new Set(["town", "municipality", "district"]);
const low = (s) => String(s || "").normalize("NFC").toLocaleLowerCase("hr");

/* What the browser is given: short keys, because the story page downloads it. */
export function face() {
  return {
    source: table.source, url: table.url, year: table.year, note: table.note,
    areas: table.areas.map((a) => ({ k: a.kind, n: a.name, c: a.countyEn, y: a.lat, x: a.lon, p: a.place, s: a.names })),
    /* the 2011 one-name lookup's answers, for a name the 2021 lists do not hold */
    counted2011: Object.fromEntries(counts.surnames.map((r) => [r.n, r.c])),
    below2011: counts.gone,
  };
}

let byName = null;
function index() {
  if (byName) return byName;
  byName = new Map();
  for (const a of table.areas) a.names.forEach((n, i) => {
    const k = low(n);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push({ area: a, rank: i + 1 });
  });
  return byName;
}

/* Where one spelling ranks (accents count: Kovac is not Kovač). Null when it is in no list. */
export function whereRanked(name) {
  const hits = index().get(low(name));
  if (!hits) return null;
  const order = (x, y) => x.rank - y.rank || x.area.name.localeCompare(y.area.name, "hr");
  return {
    areas: hits.filter((h) => LOCAL.has(h.area.kind)).sort(order),
    counties: hits.filter((h) => h.area.kind === "county").sort(order),
    country: (hits.find((h) => h.area.kind === "country") || {}).rank || null,
  };
}

const bare = (s) => low(s).replace(/^(grad|općina|town of|municipality of|city of)\s+/, "").replace(/\s+[-–/]\s+.*$/, "");
const countyKey = (s) => low(s).normalize("NFD").replace(/[^a-z]/g, "").replace(/(county|of)/g, "").slice(-6);

/* The town or municipality whose list belongs on a place's page: the area that was placed on this very place, else the one the place's
   own record says it lies in (GeoNames' adm2, matched with its county, because Croatia has two Otoks and two Privlakas). */
export function areaForPlace(place) {
  if (!place || place.country !== "HR") return null;
  const local = table.areas.filter((a) => a.kind === "town" || a.kind === "municipality");
  const own = local.find((a) => a.place === place.id);
  if (own) return { area: own, itself: true };
  const ad = place.admin || {};
  if (!ad.adm2 || !ad.adm1) return null;
  const hit = local.filter((a) => bare(a.name) === bare(ad.adm2) && countyKey(a.countyEn) === countyKey(ad.adm1));
  return hit.length === 1 ? { area: hit[0], itself: false } : null;
}

export const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th");
