/* WHAT THE ATLAS HOLDS, PER COUNTRY, FOR THE FLAG ATLAS CARDS.
 *
 * The flags index is a static page written by hand and a number typed into it
 * goes stale the first time a harvest runs. So the cards fetch this instead:
 * counted at build from the same two files the rest of the site reads, keyed
 * by ISO 3166-1 alpha-2. v = volumes, p = places with any, r = record regions
 * that cover the country, e = eras those regions describe.
 */
import coverage from "../../public/coverage-by-country.json";
import regions from "../../public/regions.json";

export function GET() {
  const out = {};
  for (const [cc, c] of Object.entries(coverage.countries || {})) {
    out[cc] = { v: c.volumes || 0, p: c.places || 0, r: 0, e: 0 };
  }
  for (const r of regions.regions || []) {
    for (const cc of r.countries || []) {
      const o = (out[cc] ||= { v: 0, p: 0, r: 0, e: 0 });
      o.r += 1;
      o.e += (r.eras || []).length;
    }
  }
  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
