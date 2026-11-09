/* THE FLAGS A COUNTRY HAS FLOWN, AS ONE SMALL FILE, FOR THE PLACE PAGES.
 *
 * A place page shows the flags of its country. Printing them into each of 56,000 pages cost about 4 KB a page; read from here once, and
 * cached, they cost nothing per page. Built from flag-eras.json (684 KB, with every tag and note) down to what a strip needs: the era's
 * image id, the polity, its dates. Keyed by the flags-atlas page slug (south-africa-flags).
 */
import eras from "../../public/flag-eras.json";

export function GET() {
  const out = {};
  for (const e of eras.eras || []) {
    if (typeof e.from !== "number") continue;
    (out[e.slug] ||= []).push([e.from, e.id, e.polity, e.dates]);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a[0] - b[0]).forEach((r) => r.shift());
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
}
