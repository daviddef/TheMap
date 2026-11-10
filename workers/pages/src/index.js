/* The page server. A request for /place/senj/ is looked up as the object `place/senj/index.html` in the bucket and returned as it
 * was built; nothing is rendered here, so the bytes are exactly what the build wrote. A path the bucket does not hold is fetched from
 * ORIGIN (the GitHub Pages site), which is what lets the move happen one route at a time: upload the place pages, and only those
 * are served from here. */

const TYPES = {
  html: "text/html; charset=utf-8", json: "application/json; charset=utf-8", js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ico: "image/x-icon",
  woff2: "font/woff2", woff: "font/woff", pdf: "application/pdf", gz: "application/gzip", csv: "text/csv; charset=utf-8",
};

/* The object key for a URL path, or null when the path is not one we serve. A trailing slash means a folder's index.html, the way
   GitHub Pages reads it. */
export function keyFor(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }
  if (p.includes("\0") || p.split("/").includes("..")) return null;
  p = p.replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) return p + "index.html";
  return p;
}

const extOf = (k) => (k.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();

export default {
  async fetch(req, env) {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const url = new URL(req.url);
    const key = keyFor(url.pathname);
    if (key == null) return new Response("Bad request", { status: 400 });

    let obj = await env.SITE.get(key);
    /* GitHub Pages sends /place/senj to /place/senj/ when that folder exists; so do we */
    if (!obj && !url.pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(url.pathname)) {
      const dir = await env.SITE.head(key + "/index.html");
      if (dir) return Response.redirect(url.origin + url.pathname + "/" + url.search, 301);
    }
    if (obj) {
      const h = new Headers();
      h.set("content-type", TYPES[extOf(key)] || "application/octet-stream");
      h.set("etag", obj.httpEtag);
      h.set("cache-control", "public, max-age=600");
      h.set("x-served-from", "r2");
      return new Response(req.method === "HEAD" ? null : obj.body, { headers: h });
    }
    /* not ours: the origin answers, unchanged */
    const origin = new URL(url.pathname + url.search, env.ORIGIN);
    const r = await fetch(origin.toString(), { method: req.method, headers: { accept: req.headers.get("accept") || "*/*" }, redirect: "manual" });
    const out = new Response(r.body, r);
    out.headers.set("x-served-from", "origin");
    return out;
  },
};
