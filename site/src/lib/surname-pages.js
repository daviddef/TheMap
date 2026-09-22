/* WHICH SURNAMES GET A PAGE — decided once, for everybody who needs to know.
 *
 * There were two copies of this rule and they had drifted apart badly.
 * surname/[name].astro generated a page for a surname with a curated
 * variant, OR archive evidence, OR (as of today) a spelling link and three
 * national registers. sitemap-index.xml.js still listed only the curated
 * ones — the original rule, never updated when the other two clauses were
 * added.
 *
 * The result: 17,961 surname pages were live and 3,577 were in the sitemap.
 * Kosina was missing, which defeats the point of having just given it a
 * page. So were Defranceschi and Luwinski, and they had been missing for
 * far longer than today.
 *
 * country-pages.js already carries the lesson in its own header — "two
 * copies of a derived set is how the shard keys came to disagree between
 * build and client, so there is exactly one here". It was right, and this
 * is the same mistake one directory away.
 */

/* The slug a surname's page lives at. Must match the page and the sitemap,
   so it lives here too. */
export const slugForSurname = (x) =>
  String(x).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Does this surname earn a page?
 *
 *  curated   somebody checked and said these are the same name.
 *  archive   a family archive placed it in a country from documents.
 *  spelling  one systematic substitution, both forms independently
 *            attested, and counted by three or more registers. This is
 *            Kosina and Kozina.
 *
 * A name in one register with no variant of any kind stays out: that is
 * 600,000 pages with nothing to say. */
/* AN UNCOUNTED ATTESTATION IS A WEAKER CLAIM, AND THE THRESHOLD WAS
   CALIBRATED ON STRONGER ONES.

   «Three countries agree» earns a page because three states each counted
   these people. Denmark does not count them: it publishes which surnames
   exist and declines to say how many carry each, which is «at least three
   people» rather than «11,163 people». That is a real attestation and it
   belongs in the corpus, on the map and in search — it is simply not the
   thing this threshold was weighing.

   Letting it count anyway is not a judgement call, it is a measurement:
   adding Denmark took the page set from 16,138 to 27,724, and only 207 of
   those 11,586 new pages are Danish names. The rest are existing names
   that crossed «three countries» because a list without numbers said yes.
   The build then died out of memory, which is how this was found.

   So the spelling tier counts countries that actually counted somebody.
   Denmark still earns pages the honest way — through the spelling links it
   reveals between names already counted elsewhere, which is exactly what
   that tier is for, and which is worth 3,644 pages on its own. */
export function earnsPage(r) {
  if (!r || !r.countries || !r.countries.length) return false;
  const v = r.variants || [];
  const counted = r.countries.filter((c) => c.n != null).length;
  return v.some((x) => x.how === "curated")
      || r.countries.some((c) => c.how === "archive")
      || (v.some((x) => x.how === "spelling") && counted >= 3);
}

/* Every slug that will exist, deduplicated, in one place. */
export function surnamePageSlugs(surnames) {
  const seen = new Set();
  const out = [];
  for (const r of surnames || []) {
    if (!earnsPage(r)) continue;
    const s = slugForSurname(r.n);
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}
