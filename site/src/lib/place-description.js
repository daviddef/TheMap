/* THE ONE SENTENCE A PLACE PAGE SAYS ABOUT ITSELF, to a reader (the dek under the title), to a search engine (the meta description and
   og:description) and to structured data (the JSON-LD description). They are the same string on purpose, so they cannot disagree.

   WHY THIS IS A FILE AND NOT A LINE IN THE PAGE. The sentence used to count `cs.length`, the collections shown on the page, capped at 20 and
   read from places-full.json, while the paragraph under it (PlaceGlance) says «The atlas holds N record volumes» from the detail file's
   volumesTotal. Two numbers for one fact: 38 of 45 pages sampled on 22 Nov 2026 said «0 record volumes» in the description and a real count
   in the body. Google shows the description as the snippet, so the first thing a stranger read about Montenaken was a false zero.

   The page passes the SAME `volumes` it gives PlaceGlance (volumesTotal || the collections it lists). test/place-description.test.js reads
   both off a built page and fails if they differ.

   Rules: 70 to 160 characters (a search result cuts at about that); no person's name; the former names are trimmed from the end until it fits;
   where nothing is held it says what the page does hold instead of «0 record volumes». */

export const MIN = 70;
export const MAX = 160;

const plural = (n, one, many) => (n === 1 ? one : many);

/* name, whereFull («County Limerick, Ireland»), older: the former names, volumes: the number the body prints,
   span: [from, to] | null. */
export function placeDescription({ name, whereFull, older = [], volumes = 0, span = null }) {
  const head = `${name} in ${whereFull}`;
  const held = volumes > 0
    ? [`${volumes.toLocaleString("en-GB")} record ${plural(volumes, "volume", "volumes")}` +
       (span ? ` covering ${span[0]}–${span[1]}` : "") + ", and who holds them.",
       `${volumes.toLocaleString("en-GB")} record ${plural(volumes, "volume", "volumes")}` +
       (span ? ` covering ${span[0]}–${span[1]}.` : "."),
       `${volumes.toLocaleString("en-GB")} record ${plural(volumes, "volume", "volumes")}.`]
    /* nothing counted here: say what the page does hold. It is a gap in the atlas, not a finding about the records. */
    : ["No register volumes are listed for it yet; the page points to the country's archives, sources and flags.",
       "No register volumes are listed yet; see the country's archives and sources.",
       "No register volumes are listed yet."];

  /* the former names are what people type, so they go in first and are the part trimmed when the line is too long; then the longer tail */
  const build = (n, t) => {
    const aka = older.slice(0, n);
    return aka.length ? `${head}, also written ${aka.join(", ")}. ${held[t]}` : `${head}. ${held[t]}`;
  };
  for (let t = 0; t < held.length; t++) {
    for (let n = older.length; n >= 0; n--) {
      const s = build(n, t);
      if (s.length <= MAX) return pad(s, volumes);
    }
  }
  return build(0, held.length - 1);               // a very long name and county: the shortest form, whatever its length
}

/* a short name in a short country: 70 is the floor, and one more true clause gets there */
function pad(s, volumes) {
  return s.length >= MIN ? s : s + (volumes > 0 ? " See the archives, years and how to open them." : " See the country's archives.");
}
