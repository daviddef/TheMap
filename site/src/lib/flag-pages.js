/* THE FLAGS ATLAS WAS A SEPARATE WEBSITE WEARING THE SAME NAME.
 *
 * David, looking at the two side by side: «flags doesnt feel like its part of
 * record atlas? different widths, missing menu bars». It was not style drift.
 * site/public/flags/ held 245 hand-built HTML files that Astro copied into
 * dist VERBATIM, so they never passed through Base.astro and could not have
 * the nav, the container or the footer. A reader clicking «Flags» walked out
 * of the atlas and the door shut behind them.
 *
 * WHY THESE PAGES ARE LIFTED RATHER THAN REGENERATED. The obvious fix is to
 * render them from flag-index.json and flag-eras.json, which already hold the
 * countries, the eras and the art. They do not hold the rest: each page also
 * carries its own prose, colour swatches with hex values, specification rows,
 * flag captions, and — on all 210 country pages — a hand-authored animated map
 * with a year slider whose border lines dissolve the moment two pieces of a
 * country were ruled together. That is roughly 139 KB of body per page and
 * none of it is in the JSON. Regenerating would have quietly thrown it away.
 * So the body is lifted whole and given the site's shell; turning the content
 * into data is a separate job that can happen later without a reader noticing.
 *
 * SAFE TO LIFT, MEASURED: the pages define 70 CSS classes and Base.astro
 * defines 16, and the two sets do not intersect at all. Their stylesheet comes
 * with them and nothing of the site's is overridden.
 */
import fs from "node:fs";
import path from "node:path";
import { u } from "./url.js";

export const DIR = path.join(process.cwd(), "src", "flags-pages");

/** Every page slug, index excluded — `croatia-flags`, `baltics-hub`, … */
export function slugs() {
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".html") && f !== "index.html")
    .map((f) => f.slice(0, -5))
    .sort();
}

/* THE LINKS INSIDE THESE PAGES ARE RELATIVE TO A DEPTH THAT NO LONGER EXISTS.
   They were written for /flags/croatia-flags.html, where `../` is the site
   root and `bosnia-flags.html` is a sibling. The pages now live at
   /flags/croatia-flags/, one level deeper, so every one of those would point
   somewhere wrong — `../` at the new depth is /flags/, not /.
   Resolving each href against the OLD location and emitting a root-relative
   path fixes both cases at once and leaves anchors and external links alone. */
function relink(html) {
  return html.replace(/(href|src)="([^"]+)"/g, (m, attr, href) => {
    if (/^(https?:|mailto:|#|\/|data:)/.test(href)) return m;
    const [p, hash = ""] = href.split("#");
    if (!p) return m;
    // Resolve against the directory the page used to sit in.
    const abs = path.posix.normalize(path.posix.join("/flags/", p));
    // A sibling flags page is now a directory URL; anything else stays put.
    const out = abs.endsWith(".html")
      ? abs.slice(0, -".html".length) + "/"
      : abs;
    return `${attr}="${u(out)}${hash ? "#" + hash : ""}"`;
  });
}

/* SCOPING IS NOT OPTIONAL HERE, IT IS THE WHOLE SAFETY OF THE LIFT.
   These stylesheets were written to own a document. Measured on one page,
   213 rules, of which the selectors `html`, `body`, `:root`, `footer`, `h1`,
   `h2`, `h3` and `img` are bare element rules — dropped into the site as-is
   they would restyle Base's own header, nav and footer, and the change meant
   to make flags feel part of Record Atlas would instead make every flag page
   wreck the shell around it. So every selector is confined to the wrapper.

   The class names needed no help: the pages define 70 and Base defines 16,
   and the two sets do not intersect. It is the element rules that bite. */
const ROOTISH = /^(:root|html|body)\b/;

function scope(css, sel) {
  /* COMMENTS FIRST, BECAUSE A COMMENT LOOKS EXACTLY LIKE A SELECTOR. The
     scoper finds a selector by reading up to the next «{», and atlas-tokens.css
     opens with a twenty-line block comment — so the first pass prefixed the
     prose with .flagpage and split it on its own commas, which destroyed the
     comment and the rule after it. Stripping them is the fix and it is free:
     these stylesheets ship to every reader. */
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /* A selector list is rewritten one selector at a time. `:root` and friends
     BECOME the wrapper; anything else is nested inside it. The exception is a
     root carrying a condition — `:root[data-theme="dark"]` — where the
     condition is about the document and must stay on the document, with the
     wrapper appended as a descendant. */
  const one = (t) => {
    t = t.trim();
    if (!t) return t;
    const m = t.match(ROOTISH);
    if (!m) return `${sel} ${t}`;
    const rest = t.slice(m[0].length).trim();
    if (!rest) return sel;                       // :root / html / body
    if (rest.startsWith("[") || rest.startsWith(":"))
      return `${t} ${sel}`;                      // :root[data-theme=dark] …
    return `${sel} ${rest}`;                     // body .thing
  };

  let out = "", i = 0;
  while (i < css.length) {
    const at = css.indexOf("{", i);
    if (at < 0) { out += css.slice(i); break; }
    let head = css.slice(i, at);
    const body_start = at + 1;
    // Find this block's matching close brace.
    let depth = 1, j = body_start;
    while (j < css.length && depth) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const inner = css.slice(body_start, j - 1);
    const trimmed = head.trim();
    if (/^@(media|supports|layer|container)/i.test(trimmed)) {
      out += head + "{" + scope(inner, sel) + "}";          // recurse
    } else if (/^@(keyframes|-webkit-keyframes|font-face|page|property)/i.test(trimmed)) {
      out += head + "{" + inner + "}";                      // never touch
    } else {
      const lead = head.slice(0, head.length - head.trimStart().length);
      out += lead + trimmed.split(",").map(one).join(", ") + "{" + inner + "}";
    }
    i = j;
  }
  return out;
}

/* The pages link ../atlas-tokens.css for the ten custom properties they paint
   with — --ink, --paper, --brick and the rest. Base does not load it and
   should not have to on 46,000 pages that never use them, so it is folded in
   here and scoped with everything else: the variables land on the wrapper and
   inherit down, and the dark-mode blocks keep testing the real document. */
let TOKENS = "";
try {
  TOKENS = fs.readFileSync(path.join(process.cwd(), "public", "atlas-tokens.css"), "utf8");
} catch { TOKENS = ""; }

/** Title, stylesheet and body markup for one page, ready to put inside Base. */
export function page(slug) {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.html`), "utf8");
  const head = (raw.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ""])[1];
  const body = (raw.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, raw])[1];
  /* The <style> blocks live in both halves — one in the head, one partway
     down the body — so they are collected from the whole file and hoisted,
     and the body keeps only its markup and its scripts. */
  const css = [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1]).join("\n");
  const title = ((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, slug])[1] || "")
    .replace(/\s+/g, " ").trim();
  const h1 = ((body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ""])[1] || "")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return {
    slug,
    title: title || h1 || slug,
    h1,
    css: scope(TOKENS + "\n" + css, ".flagpage"),
    html: relink(body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")),
    /* The head carried nothing else worth keeping: one font link, two metas
       and the stylesheet. Base supplies all three, better. */
    headLinks: (head.match(/<link[^>]+>/gi) || []).length,
  };
}
