/* THE TRANSLATION TABLES, AS ONE FILE EVERY PAGE SHARES.
 *
 * They used to be written into each page as an inline tag, which was fine at
 * four kilobytes. With Croatian and Italian chrome they are 64 KB, and an
 * inline copy on each of 83,000 pages took the built site from 8.2 GB to
 * 13.3 GB, over the 10 GB ceiling on what Pages will accept. As a file it is
 * stored once and the browser keeps it. It is loaded synchronously, ahead of
 * /js/i18n.js, so a reader whose language is not English still sees the page
 * in their language from the first paint.
 */
import { TABLES } from "../../lib/i18n.js";

export function GET() {
  return new Response("window.RA_I18N=" + JSON.stringify(TABLES) + ";\n", {
    headers: { "Content-Type": "text/javascript; charset=utf-8" },
  });
}
