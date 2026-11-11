/* WHAT THE ATLAS HOLDS, FOR THE VOLUMES PILL ON EVERY PAGE BUT THE HOME PAGE.
 * The home page prints the whole inventory in its own HTML. The other 80,000 pages carry only the pill and its count (a few hundred bytes), and the
 * pill fetches this file the first time it is opened. Same numbers, same module (lib/inventory.js), so the two cannot differ. */
import { u } from "../lib/url.js";
import { volumes, latestNews, NEWS_KIND, newsDay, inventoryRows } from "../lib/inventory.js";

export function GET() {
  const body = {
    volumes,
    news: latestNews.map((e) => ({ kind: e.kind || "better", label: NEWS_KIND[e.kind] || "Better", headline: e.headline, href: u(e.href || "/whats-new/"), date: e.date, day: newsDay(e.date) })),
    allNews: u("/whats-new/"),
    rows: inventoryRows.map(([head, items]) => [head, items.map(([n, label, href, note, eg]) => [n, label, u(href), note, eg])]),
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}
