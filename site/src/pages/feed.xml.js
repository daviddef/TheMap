/* AN ATOM FEED OF WHAT THIS ATLAS LEARNED.
 *
 * The changelog page has existed for a while and nobody can be told about
 * it. That is the whole problem: the people who would most want to know
 * that 2.5 million volumes were placed, or that twenty-nine French archive
 * links were repaired, are genealogy society editors and archivists who
 * read feeds and do not revisit a page on the chance it moved.
 *
 * Generated from the same data/changelog.json the page renders, which is
 * generated from the git history — so the feed cannot drift from the page,
 * and neither can drift from what actually happened.
 *
 * ONE ENTRY PER DAY, NOT PER COMMIT. A day's work here is routinely fifteen
 * commits; fifteen notifications for one afternoon is how a feed gets
 * unsubscribed from. The day is the unit a reader cares about, and each
 * commit's subject and lead are listed inside it.
 */
import log from "../data/changelog.json";
import site from "../data/site.json";

const SITE = "https://daviddef.github.io";
const BASE = "/TheMap";
const HOME = SITE + BASE + "/";

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

export async function GET() {
  const byDay = {};
  for (const c of log.commits) (byDay[c.date] = byDay[c.date] || []).push(c);
  const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]))
    /* Sixty days is about two months of work and keeps the file small
       enough to be polite to fetch. The page carries the whole history. */
    .slice(0, 60);

  /* «Now» would make every build a change, so readers would be told the feed
     moved on days nothing happened. The newest day's date is the truth. */
  const updated = days.length ? days[0][0] + "T12:00:00Z"
                              : new Date().toISOString();

  const entries = days.map(([day, cs]) => {
    const id = `${HOME}changelog/#${day}`;
    const body = cs.map((c) =>
      `&lt;p&gt;&lt;a href="${esc(site.repo)}/commit/${esc(c.sha)}"&gt;` +
      `&lt;strong&gt;${esc(c.subject)}&lt;/strong&gt;&lt;/a&gt;` +
      (c.lead ? `&lt;br&gt;${esc(c.lead)}` : "") + `&lt;/p&gt;`).join("\n");
    const title = cs.length === 1 ? cs[0].subject
      : `${cs.length} changes · ${cs[0].subject}`;
    return `  <entry>
    <title>${esc(title)}</title>
    <link rel="alternate" type="text/html" href="${esc(id)}"/>
    <id>${esc(id)}</id>
    <updated>${day}T12:00:00Z</updated>
    <content type="html">${body}</content>
  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(site.name)} — what changed</title>
  <subtitle>${esc(site.tagline)}</subtitle>
  <link rel="alternate" type="text/html" href="${HOME}"/>
  <link rel="self" type="application/atom+xml" href="${HOME}feed.xml"/>
  <id>${HOME}</id>
  <updated>${updated}</updated>
  <rights>CC0 1.0 — no rights reserved</rights>
${entries}
</feed>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/atom+xml; charset=utf-8" },
  });
}
