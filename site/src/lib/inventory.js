/* THE NUMBERS BEHIND THE VOLUMES PILL: one place, read by the home page (which prints the full inventory) and by the header on every other page (which
   only needs the count, and fetches the rest from /inventory.json when the pill is opened). Computed once per build process. */
import newsData from "../data/whats-new.json";
import { countryTotals } from "./country-metrics.js";
import { atlas as idx } from "./atlas.js";
import regions from "../../public/regions.json";
import provs from "../../public/providers.json";
import { corpus } from "./surname-corpus.js";
import gnFamilies from "../../../data/given-name-families.json";
import snFamilies from "../../../data/surname-families.json";
import flagIndex from "../../../data/flag-index.json";
import placeNames from "../../../data/place-names.json";

export const places = idx.places.length;
/* THE LAST THREE LINES OF WHAT'S NEW, for the inventory opened from the books icon. Newest first; a day's lines keep the file's order. */
export const NEWS_KIND = { new: "New", better: "Better", fixed: "Fixed" };
export const latestNews = (newsData.entries || []).slice().sort((x, y) => y.date.localeCompare(x.date)).slice(0, 3);
export const newsDay = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/* `v` IS VOLUMES; `c` IS COLLECTIONS. The map's own hint had this wrong
   and was fixed; this line is the same mistake in the page header above
   it, and it is the one a reader sees first. It was printing "8557 record
   volumes" for an atlas holding 2,328,191. */
export const volumes = idx.places.reduce((a, p) => a + (p.v || 0), 0);
/* `cc` IS THE COUNTRY. This used `k`, which is the place's KIND (church, cemetery, census ... in combination), so it counted 34 kinds and
   called them countries: on the page, in its search-engine description and in its structured data. David: «we have a dot everywhere,
   on most countries». */
export const placeCountries = new Set(idx.places.map(p => p.cc || p.country).filter(Boolean));
/* THE SAME COUNT AS /countries/ AND /places/. This used to be the countries with a place plus the countries a worldwide source names
   (146), while those pages list every country anything is known about (162): a place, a collection, a provider or a surname register.
   David clicked 146 and landed on "162 of them". One definition now, from lib/country-metrics.js, so the tile and the list cannot differ. */
const ccTotals = countryTotals();
export const countries = ccTotals.countries;
export const withPlaces = ccTotals.walked;
export const archives = provs.providers.filter(p => p.at);
export const archiveCountries = new Set(archives.map(p => p.at.place.split(", ").pop())).size;
/* THE INVENTORY BEHIND THE ONE PILL. David: one pill, «volumes», and on click a summary of everything the atlas holds. Every
   number is read from the data when the page is built, so none can drift from what is held. */
const sur = corpus().surnames;
const surnameCount = Array.isArray(sur) ? sur.length : Object.keys(sur || {}).length;
/* ROWS, NOT ONE POURED GRID. David: countries, regions, places and dated places belong on a row of their own. Three rows: where
   (the ground), the records (what is kept and where), and names and flags. Each row: [heading, [number, label, link, what, example]]. */
export const inventoryRows = [
  ["The ground", [
    [countries, "countries and territories", "/countries/", `${withPlaces} with a place on the map, and ${countries - withPlaces} more known from sources, collections or surnames`, "Egypt: archives listed, no town catalogued yet"],
    [regions.regions.length, "regions", "/providers/#regions", "stretches of ground whose rulers changed together", "the Military Frontier"],
    /* THE ERAS THE REGIONS CARRY. David: «how many are we tracking? is there a way to show that in the counts?» An era is one ruler over
       one region for a span of years, with the archives that hold its paper: the unit the map and the history play are built on. */
    [regions.regions.reduce((n, r) => n + (r.eras || []).length, 0), "eras", "/providers/#regions", "spans of years when one ruler held a region, each with the archives that kept its paper", "the Imotski frontier: Ottoman, then Venetian, then Austrian"],
    [places, "places", "/places/", "towns and villages, each with the books and archives that cover it", "Senj, in Croatia"],
    [Object.keys(placeNames.places).length, "places with dated names", "/place-names/", "a place's name in the year of the record", "Fiume before 1945 is today's Rijeka"],
  ]],
  /* «volume» and «archive» are the two words a first-time reader cannot tell apart: a volume is a book; an archive is where books are kept. */
  ["The records", [
    [volumes, "volumes", "/countries/", "register books of baptisms, marriages, burials and civil acts", "Senj, births 1859–1877: one book"],
    [archives.length, "archives", "/providers/", `the places that keep the books, in ${archiveCountries} countries`, "the State Archives in Rijeka"],
    /* THE SOURCES, HERE AND NOT ON THEIR OWN PAGE. David: «source stats, don't waste the real estate, rather add it to our metrics board». */
    [provs.providers.length, "sources", "/providers/", `archives, libraries, indexes and portals: ${provs.providers.filter(p => p.access === "free").length} free to use with no account, ${provs.providers.filter(p => p.access !== "unsurveyed").length} with the cost to look worked out`, "Antenati: free, no account"],
  ]],
  ["Names and flags", [
    [surnameCount, "surnames", "/surnames/", `${snFamilies.counts.families} families of spellings`, "Blažević has its own page"],
    [gnFamilies.counts.families, "given names", "/your-name/", `${gnFamilies.counts.forms.toLocaleString()} forms in many languages`, "Ivan, Johann and Giovanni are one name"],
    /* THE SAME NUMBERS THE FLAGS SECTION BELOW SAYS ("211 countries and 34 hubs"). This tile read counts.withFlag (210, the cards
       whose flag is an inline drawing: France's is a named reference, so it was left out) beside a section that counted 211, and
       the hubs were not shown at all. David asked why they disagreed. */
    [flagIndex.counts.countries, "countries with flags", "/flags/", "each with the flags that flew over it through history", "every flag that flew over Croatia"],
    [flagIndex.counts.hubs, "flag hubs", "/flags/#hubsHeadingEl", "regions that group those countries' flags together", "Former Yugoslavia"],
  ]],
];
