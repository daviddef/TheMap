/* THE ARCHIVES THE STORY PLAN CAN WRITE TO, as one small file the browser can read.
 *
 * public/providers.json carries only the 569 providers the map draws; the Atlas knows 2,634, and the one that holds Nova Gradiška's registers
 * (the state archive in Slavonski Brod) is not among the 569. The story plan needs every archive with a position, with every contact the Atlas holds:
 *   1. data/provider-emails.json: addresses read off the institution's own page or met in our own letters, and its "offices" (post, switchboard,
 *      contact form, branch lines). These lead. The order of addresses is scripts/provider_emails.py's: a branch's mailbox never first, then by state.
 *   2. data/provider-contacts.json: what Wikidata states, only where the first holds nothing for that field.
 * A `dead` address is never published, from either file. Nothing is inferred from a parent body or a homepage.
 * One row per located archive, diocese, volunteer group or memorial site; the columns are listed in `cols`. */
const KEEP = new Set(["national-archive", "regional-archive", "diocesan", "volunteer", "memorial"]);
const ORDER = { answered: 0, delivered: 1, listed: 2, unverified: 3 };
const COLS = ["id", "name", "kind", "access", "cc", "lat", "lon", "url", "email", "post", "tel", "state", "form", "branches", "serves"];

export function buildArchivesNear(providers, contacts, own) {
  const list = Array.isArray(providers) ? providers : (providers && providers.providers) || [];
  const byQ = (contacts && contacts.contacts) || {};
  const mail = {}, office = {}, dead = new Set();
  for (const e of (own && own.emails) || []) {
    if (e.state === "dead") { dead.add(e.email.toLowerCase()); continue; }
    for (const id of e.providers || []) (mail[id] || (mail[id] = [])).push(e);
  }
  for (const id in mail) mail[id].sort((a, b) => (a.branch ? 1 : 0) - (b.branch ? 1 : 0) || ORDER[a.state] - ORDER[b.state]);
  for (const o of (own && own.offices) || []) for (const id of o.providers || []) office[id] = o;
  const rows = [];
  for (const p of list) {
    if (!KEEP.has(p.kind) || !p.at || p.at.lat == null || p.at.lon == null || !p.url) continue;
    const k = (p.wikidata && byQ[p.wikidata]) || {}, o = office[p.id] || {}, m = mail[p.id] && mail[p.id][0];
    const wd = k.email && !dead.has(k.email.toLowerCase()) ? k.email : "";
    rows.push([p.id, p.name, p.kind, p.access || "unsurveyed", (p.countries || [])[0] || "", +p.at.lat.toFixed(4), +p.at.lon.toFixed(4), p.url,
      m ? m.email : wd, o.post || k.post || "", o.tel || k.tel || "", m ? m.state : wd ? "wikidata" : "", o.form || "",
      (o.branches || []).map((b) => [b.name, b.tel]), p.serves || null]);
  }
  rows.sort((a, b) => (a[4] + a[1]).localeCompare(b[4] + b[1], "en"));
  return { v: 2, note: "Every located archive, diocese, volunteer group and memorial site in data/providers.json, with the contacts the Atlas holds (data/provider-emails.json first, then what Wikidata states). `state` says how far the email is checked. `serves`, where set, limits an archive to the ground it names (atlas-summary.js `serves`). Columns: " + COLS.join(", ") + ".", cols: COLS, rows };
}
