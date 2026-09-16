// Prefix a site-root path with the deployment base, so the same links work at
// https://daviddef.github.io/TheDefranceski/ and at https://defranceski.com/.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const u = (p = "/") => `${BASE}${p.startsWith("/") ? p : "/" + p}`;

/* Some prose lives in the data files as raw HTML and reaches the page through
   set:html, which means u() never sees its links. Those shipped as href="/gaps/"
   instead of href="/TheDefranceski/gaps/" and 404 on GitHub Pages. Run a prose
   string through this before setting it. Already-based, external and anchor
   links are left alone, so it is safe to apply to anything. */
export const based = (s = "") =>
  String(s).replace(/href="(\/(?!\/)[^"]*)"/g,
                    (m, h) => (h.startsWith(BASE + "/") ? m : `href="${u(h)}"`));
