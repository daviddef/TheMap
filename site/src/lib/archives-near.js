/* THE ARCHIVES THE STORY PLAN CAN WRITE TO, as one small file the browser can read.
 *
 * public/providers.json carries only the 569 providers the map draws; the Atlas knows 2,634, and the one that holds Nova Gradiška's registers
 * (the state archive in Slavonski Brod) is not among the 569. The story plan needs every archive with a position, with the contact details
 * Wikidata states for it (data/provider-contacts.json: "ONLY WHAT WIKIDATA STATES", no address inferred from a parent body or a homepage).
 * One row per located archive, diocese, volunteer group or memorial site: [id, name, kind, access, cc, lat, lon, url, email, post, tel].
 * Nothing is added here that providers.json does not say. */
const KEEP = new Set(["national-archive", "regional-archive", "diocesan", "volunteer", "memorial"]);

export function buildArchivesNear(providers, contacts) {
  const list = Array.isArray(providers) ? providers : (providers && providers.providers) || [];
  const byQ = (contacts && contacts.contacts) || {};
  const rows = [];
  for (const p of list) {
    if (!KEEP.has(p.kind) || !p.at || p.at.lat == null || p.at.lon == null || !p.url) continue;
    const k = (p.wikidata && byQ[p.wikidata]) || {};
    rows.push([p.id, p.name, p.kind, p.access || "unsurveyed", (p.countries || [])[0] || "", +p.at.lat.toFixed(4), +p.at.lon.toFixed(4), p.url,
      k.email || "", k.post || "", k.tel || ""]);
  }
  rows.sort((a, b) => (a[4] + a[1]).localeCompare(b[4] + b[1], "en"));
  return { v: 1, note: "Every located archive, diocese, volunteer group and memorial site in data/providers.json, with the contact Wikidata states for it. Columns: id, name, kind, access, country, lat, lon, url, email, post, tel.", cols: ["id", "name", "kind", "access", "cc", "lat", "lon", "url", "email", "post", "tel"], rows };
}
