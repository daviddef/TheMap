/* One sitemap per kind of page. */
import { sitemapFiles, urlsForFile, base } from "./sitemap-index.xml.js";

/* One file per entry the index lists — which is one per set, except where a
   set is over the 50,000-URL limit and has been split. The index and these
   files are generated from the SAME list, so a sitemap the index names can
   never be one this does not build. */
export function getStaticPaths() {
  return sitemapFiles().map((f) => ({ params: { set: f.name }, props: f }));
}

export async function GET({ props, site }) {
  const b = base(site);
  const today = new Date().toISOString().slice(0, 10);
  const rows = urlsForFile(props.set, props.part)
    .map(([p, pri]) => `  <url><loc>${b}${p}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
