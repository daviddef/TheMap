/* France's birth-decade curve, indexed ONCE.
 *
 * The surname page did `fr.surnames.find(x => slug(x.n) === slug(r.n))` in its
 * frontmatter, which Astro runs per page. 218,982 rows, slugified on every
 * comparison, times ~3,500 pages: roughly 766 million string normalisations to
 * answer 3,500 lookups. The build went from ninety seconds of page generation
 * to crawling.
 *
 * A module's top level runs once per build, however many pages import it. This
 * is the same mistake as putting a regex inside an edit-distance loop, made
 * twice in one day, which is why it is written down here rather than quietly
 * fixed. */
import fr from "../../../data/frequencies/fr.json";

const slug = (s) => (s || "").toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const BY_NAME = new Map();
for (const row of fr.surnames || []) {
  const k = slug(row.n);
  if (!BY_NAME.has(k)) BY_NAME.set(k, row);
}

export const decades = fr.decades || [];

/** The decade curve for a surname, or null. */
export function curveFor(name) {
  const row = BY_NAME.get(slug(name));
  if (!row || !row.by) return null;
  return {
    row,
    curve: row.by.map((n, i) => ({ decade: decades[i], n })),
  };
}
