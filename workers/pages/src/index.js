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
/* Cloudflare's edge adds a Web Analytics beacon to HTML that passes through the proxy. `no-transform` is the documented way to tell it
   to leave a page as built; HTML only, so the large JSON and data files keep their normal compression. */
export function cacheControlFor(key) {
  return /\.html?$/i.test(key) ? "public, max-age=600, no-transform" : "public, max-age=600";
}

/* CORS FOR THE RESEARCH PUBLICATIONS ONLY. The family archives' pages ask the live Atlas, in the visitor's browser, whether a search row has
   reached it: they read /research-receipts/<archive>.json (and /research-sessions.json for the marks), which are public, carry keys and
   Atlas paths and no person, and are only ever fetched with GET. Any origin may read them (`*`, no credentials). Every other path
   keeps the browser's default, which is no cross-origin reads: the sync and AI Workers have their own, narrower rules. */
export function corsFor(pathname) {
  return pathname === "/research-sessions.json" || pathname.startsWith("/research-receipts/");
}

export function keyFor(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }
  if (p.includes("\0") || p.split("/").includes("..")) return null;
  p = p.replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) return p + "index.html";
  return p;
}

/* The URL to ask ORIGIN for. Built by concatenation, never `new URL(path, base)`: a path that starts with two slashes
   (//host/x) is read there as a protocol-relative URL and would send the request to another host entirely. */
export function originFor(origin, pathname, search) {
  const base = String(origin).replace(/\/+$/, "");
  const path = "/" + String(pathname).replace(/^\/+/, "");
  return base + path + (search || "");
}

const extOf = (k) => (k.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();

export default {
  async fetch(req, env) {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const url = new URL(req.url);
    /* GitHub Pages sent www to the bare domain; keep doing so, or every page would exist at two addresses */
    if (url.hostname === "www.recordatlas.org") return Response.redirect("https://recordatlas.org" + url.pathname + url.search, 301);
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
      h.set("cache-control", cacheControlFor(key));
      h.set("x-served-from", "r2");
      if (corsFor(url.pathname)) h.set("access-control-allow-origin", "*");
      return new Response(req.method === "HEAD" ? null : obj.body, { headers: h });
    }
    /* not ours: the origin answers, unchanged */
    /* If ORIGIN is this very site and the request came back to us, answering again would loop for ever: stop it. */
    if (req.headers.get("x-ra-hop")) return new Response("Origin loop", { status: 508 });
    const r = await fetch(originFor(env.ORIGIN, url.pathname, url.search), { method: req.method, headers: { accept: req.headers.get("accept") || "*/*", "x-ra-hop": "1" }, redirect: "manual" });
    const out = new Response(r.body, r);
    out.headers.set("x-served-from", "origin");
    if (corsFor(url.pathname)) out.headers.set("access-control-allow-origin", "*");
    if ((out.headers.get("content-type") || "").startsWith("text/html")) out.headers.set("cache-control", (out.headers.get("cache-control") || "public, max-age=600") + ", no-transform");
    return out;
  },
};
