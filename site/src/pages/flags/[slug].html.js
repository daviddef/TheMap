/* THE FLAGS ATLAS'S OLD ADDRESSES, KEPT ALIVE.
 *
 * Its 245 pages were hand-built files served as /flags/croatia-flags.html.
 * They are Astro pages now and sit at /flags/croatia-flags/ like everything
 * else here — half the point, because an .html URL in a site of directory
 * URLs is one of the things that made the flags atlas feel like a different
 * website. But those addresses have been published for weeks, so each one
 * still answers and points at its new home.
 *
 * WHY THIS IS A ROUTE AND NOT `redirects:` IN astro.config.mjs. It was that
 * first, and the build died: with `build.format: 'directory'` Astro renders
 * a redirect key as a DIRECTORY — /flags/croatia-flags.html/index.html —
 * which does not answer the old URL at all, and /flags/index.html then
 * collided with the real index page's own output file:
 *     ENOTDIR: not a directory, mkdir '…/dist/flags/index.html/'
 * An endpoint whose filename carries the extension emits exactly
 * /flags/<slug>.html, which is a file and is the address people have. The
 * same trick the site already uses for feed.xml.js and [set].xml.js.
 *
 * `index` is deliberately absent: /flags/index.html is what the index page
 * itself emits under directory format, so it already answers and a redirect
 * there would be the collision above.
 */
import { slugs } from "../../lib/flag-pages.js";
import { u } from "../../lib/url.js";

export function getStaticPaths() {
  return slugs().map((slug) => ({ params: { slug } }));
}

export function GET({ params }) {
  const to = u(`/flags/${params.slug}/`);
  /* A meta refresh with a canonical beside it. A static host cannot send a
     301, so this is the whole toolkit: the refresh moves a reader, the
     canonical moves a crawler, and the link moves anyone whose browser does
     neither. */
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Moved — Record Atlas</title>
<link rel="canonical" href="${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<meta name="robots" content="noindex">
</head>
<body>
<p>This page has moved to <a href="${to}">${to}</a>.</p>
</body>
</html>
`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
