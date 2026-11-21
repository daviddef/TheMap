/* THE BASEMAPS OF THE MAIN MAP, AND WHICH ONE OPENS BY DEFAULT.

   One list, so the switcher, the address bar (?base=) and the tests cannot disagree about what a basemap is. RecordMap.astro is
   handed these as define:vars and works the same two small rules out of them in the browser; test/basemaps.test.js holds this
   file and that component to each other.

   DEFAULT_BASEMAP is the ONE constant to change if Night dots (or anything else) is ever to open first. The address bar then
   carries ?base=map for the light map, because "no base" now means the default. */
export const BASEMAP_KEYS = ["map", "terrain", "satellite", "night"];
export const DEFAULT_BASEMAP = "map";

/* What ?base= says, as a key; anything not on the list (a typo, an old link, "constructor") is the default. */
export function resolveBasemap(value, keys = BASEMAP_KEYS, fallback = DEFAULT_BASEMAP) {
  return typeof value === "string" && keys.indexOf(value) >= 0 ? value : fallback;
}

/* What to write to ?base= for a key: nothing for the default, so a plain link stays plain. */
export function basemapParam(key, fallback = DEFAULT_BASEMAP) {
  return key === fallback ? "" : key;
}
