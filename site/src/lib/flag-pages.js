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
/* MARKUP ONLY. A SCRIPT IS NOT MARKUP, AND THIS DID NOT KNOW THE DIFFERENCE.
 *
 * David: «I try use record atlas and it gives a 404 … /flags//flags/
 * netherlands-flags/». The hub builds its country cards in the browser:
 *
 *     return '<a class="country-card" href="' + c.url + '">' + …
 *
 * and the regex below sees `href="` followed by `' + c.url + '` and takes
 * that for a relative URL. It is a JavaScript string concatenation. relink
 * resolved it against /flags/ and wrote the prefix INTO the script, so every
 * card the search renders has pointed at /flags/ + the url twice since the
 * day the pages were folded into Astro. The static cards were fine, which is
 * why it survived: only the ones the script draws are broken, and only once
 * you search.
 *
 * So the script blocks are lifted out, the markup is relinked, and they go
 * back untouched. relinkScripts() below is the one that may rewrite a script,
 * and it does it by exact slug rather than by pattern for this same reason.
 */
function relink(html) {
  const kept = [];
  const masked = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => {
    kept.push(m);
    return `\u0000SCRIPT${kept.length - 1}\u0000`;
  });
  return relinkMarkup(masked)
    .replace(/\u0000SCRIPT(\d+)\u0000/g, (_m, i) => kept[+i]);
}

function relinkMarkup(html) {
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

/* THE WRAPPER'S OWN TWO RULES, AND WHY THEY ARE HERE RATHER THAN IN A <style>
   BLOCK ON THE ROUTES. They were, in both routes, identically — and the build
   gate caught it: «selectors declared in a style block never reach the built
   CSS — flagpage (declared in site/src/pages/flags/index.astro)». Astro scopes
   and dedupes two identical blocks into one and attributes it to whichever it
   saw first, so the index's copy existed in the source and nowhere in the
   output. Emitting them with the stylesheet they belong to is one source of
   truth and no scoping to reason about.

   The lifted sheets set their own width on `body`, which they no longer own —
   Base owns that now — so the measure they were designed for is given back
   here. And their own footer is hidden, because the site now has a real one
   underneath and two sign-offs read as a mistake. */
/* THE DOOR BACK TO THE MAP, WHICH DID NOT EXIST.
 *
 * David: «Conquest and Migration i still cant see it?» — and he was right,
 * though not because they were broken. Those layers were live and drawing;
 * they were the last two rows of a ten-item dropdown behind a funnel icon,
 * collapsed by default, with nothing anywhere saying they existed, and they
 * draw nothing at all until a year is set. That is not a layer a reader
 * finds, it is a layer a reader has to be told about.
 *
 * The flags pages are exactly the readers who want them: the conquest and
 * migration arrows are DERIVED FROM THE ERA CARDS ON THESE PAGES, and until
 * now a page's only links out were the site nav. So each page carries a line
 * to the map, opened on that country, with the flag and history layers on and
 * a year range already set — because all three are useless unset.
 *
 * The anchor and the country code come from flag-map.json, which the same
 * script writes that derives the movements, so there is no second copy of the
 * slug-to-country mapping here. */
let FLAGMAP = { slug: {}, at: {} };
try {
  FLAGMAP = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), "public", "flag-map.json"), "utf8"));
} catch { /* not built yet: the line is simply left off */ }

function toTheMap(slug, title) {
  const cc = (FLAGMAP.slug || {})[slug];
  const at = cc ? (FLAGMAP.at || {})[cc] : null;
  const layers = "countries,flags,conquest,migration";
  const years = "1800,1950";
  const href = at
    ? u(`/?layers=${layers}&years=${years}&view=${at[0]},${at[1]},5`)
    : u(`/?layers=${layers}&years=${years}`);
  const what = cc
    ? "See this on the map"
    : "See the flags, conquests and migrations on the map";
  return `<p class="flagmaplink"><a href="${href}">${what} &rarr;</a>
<span>the flag flying in any year, and who took this ground or left it \u2014 drawn from the eras on this page</span></p>`;
}


/* HOW WE KNOW THIS — THE EVIDENCE ON EACH ERA.
 *
 * The audit of 16 October 2026 found that none of the 1,472 flag eras named a
 * source, and that the page footer described the whole atlas as compiled from
 * Wikipedia, Flags of the World and Britannica: the three sites every other flag
 * page also copies. The Netherlands entry was the proof. Reading its claims
 * against their sources found a 1937 decree credited with fixing a shade it
 * does not name, a Sea Beggars flag that Wikipedia calls uncertain, a "ban
 * outright in 1943" nobody could source, a VOC and New Amsterdam claim with no
 * source at all, and a Batavian "canton" that was in fact a navy emblem.
 *
 * So an era with evidence carries a panel saying which class it is, which
 * sources were read, what they establish and what could not be confirmed.
 * data/flag-evidence.json holds it, scripts/check-data.py gates it, and an era
 * not in the file is shown as nothing at all rather than as «checked». The
 * count of how many eras are reviewed is on the page, so the gap is visible.
 */
let EVIDENCE = null;
try {
  EVIDENCE = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), "..", "data", "flag-evidence.json"), "utf8"));
} catch { EVIDENCE = null; }

/* THE DRAWINGS ARE CLAIMS TOO. Every era's picture is hand-drawn, and until now nobody had
 * compared one with the flag it stands for: a Croatian card drew a five-pointed star on teal
 * where the sourced emblem is a six-pointed star over a crescent on blue. data/flag-art.json
 * records, per drawing, what it was compared with and how it came out; the page says so under
 * the picture, and says "not yet compared" where nobody has looked. */
let ART = null;
try {
  ART = JSON.parse(fs.readFileSync(
    path.join(process.cwd(), "..", "data", "flag-art.json"), "utf8"));
} catch { ART = null; }
const ART_SAY = {
  faithful: "Drawing: the same design as the reference",
  simplified: "Drawing: simplified from the reference",
  schematic: "Drawing: a stand-in, not a documented flag",
  redrawn: "Drawing: redrawn after it was found to differ from the reference",
  wrong: "Drawing: known to differ from the reference, not yet redrawn",
  "no-reference": "Drawing: no reference image found",
};

function artTag(a) {
  const cls = ART_SAY[a.art] ? a.art : "no-reference";
  const ref = a.reference && /^https:\/\//.test(a.reference)
    ? ` <a href="${esc(a.reference)}" rel="noopener">reference</a>` : "";
  return `<div class="art-tag art-${cls}" title="${esc(a.note || "")}">${ART_SAY[cls]}${ref}</div>`;
}

const CLASS_SAY = {
  attested: "Attested",
  reconstructed: "Reconstruction",
  symbolic: "Emblem, not a flag",
  none: "No flag known",
  placeholder: "Placeholder image",
  unreviewed: "Not yet checked against sources",
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function evidencePanel(ev, sources) {
  const cls = CLASS_SAY[ev.class] ? ev.class : "unreviewed";
  const list = (ev.sources || []).map((id) => {
    const s = sources[id];
    if (!s) return "";
    return `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a>`
      + ` &mdash; ${esc(s.publisher)} <span class="ev-kind">${esc(s.kind)}</span></li>`;
  }).join("");
  return `<div class="evidence ev-${cls}">`
    + `<div class="ev-head"><span class="ev-badge">${CLASS_SAY[cls]}</span>`
    + `<span class="ev-label">how we know this</span></div>`
    + (ev.says ? `<p class="ev-says">${esc(ev.says)}</p>` : "")
    + (list ? `<ul class="ev-src">${list}</ul>` : "")
    + (ev.open ? `<p class="ev-open"><b>Not established:</b> ${esc(ev.open)}</p>` : "")
    + `</div>`;
}

/** Puts each reviewed era's panel just above its paint guide, and a count above
 *  the timeline. Fails loudly if an era in the file is not on the page, so a
 *  renamed id cannot silently drop its evidence. */
function withArt(slug, html) {
  const eras = ART && ART.pages && ART.pages[slug];
  if (!eras) return html;
  for (const [id, a] of Object.entries(eras)) {
    const at = html.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`flag-art.json names ${slug} ${id}, which is not on the page`);
    const next = html.indexOf('<div class="entry"', at);
    const cap = html.indexOf('<div class="flag-caption">', at);
    if (cap < 0 || (next >= 0 && cap > next)) continue;          // an era with no caption has nowhere to put it
    const end = html.indexOf("</div>", cap) + 6;
    html = html.slice(0, end) + artTag(a) + html.slice(end);
  }
  return html;
}

function withEvidence(slug, html) {
  html = withArt(slug, html);
  const eras = EVIDENCE && EVIDENCE.pages && EVIDENCE.pages[slug];
  if (!eras) return html;
  const src = EVIDENCE.sources || {};
  for (const [id, ev] of Object.entries(eras)) {
    const at = html.indexOf(`id="${id}"`);
    if (at < 0) throw new Error(`flag-evidence.json names ${slug} ${id}, which is not on the page`);
    const next = html.indexOf('<div class="entry"', at);
    const det = html.indexOf('<details class="paint">', at);
    if (det < 0 || (next >= 0 && det > next))
      throw new Error(`${slug} ${id} has no paint guide to put its evidence above`);
    html = html.slice(0, det) + evidencePanel(ev, src) + html.slice(det);
  }
  const total = (html.match(/<div class="entry"/g) || []).length;
  const tally = {};
  for (const ev of Object.values(eras)) tally[ev.class] = (tally[ev.class] || 0) + 1;
  const reviewed = Object.values(eras).filter((e) => e.class !== "unreviewed").length;
  const SHORT = { attested: "attested", reconstructed: "reconstructed", symbolic: "emblem only",
    none: "no flag known", placeholder: "placeholder image", unreviewed: "not yet checked" };
  const parts = Object.keys(SHORT).filter((k) => tally[k])
    .map((k) => `${tally[k]} ${SHORT[k]}`);
  const note = `<div class="evidence-sum"><b>How we know this.</b> `
    + `${Object.keys(eras).length} of ${total} eras on this page carry an evidence panel`
    + (parts.length ? ` (${parts.join(", ")})` : "") + `. `
    + `Only the ones marked attested are confirmed by the sources named under them; `
    + `where sources disagree or a claim could not be confirmed, the panel says so. `
    + (Object.keys(eras).length < total
      ? `<span>Eras without a panel have not been looked at yet.</span>` : "") + `</div>`;
  const tl = html.indexOf('<div class="timeline">');
  return tl < 0 ? html : html.slice(0, tl) + note + html.slice(tl);
}

const WRAPPER = `
.flagpage{max-width:900px;margin:0 auto;padding:0 16px 48px}
.flagpage footer{display:none}
.flagpage .flagmaplink{margin:0 0 22px;padding:10px 14px;border:1px solid var(--rule);
  border-left:3px solid var(--accent);border-radius:3px;background:var(--panel);
  font-family:var(--sans);font-size:13.5px;line-height:1.5}
.flagpage .flagmaplink a{font-weight:600;text-decoration:none}
.flagpage .flagmaplink a:hover{text-decoration:underline}
.flagpage .flagmaplink span{display:block;color:var(--ink-3);font-size:12px;margin-top:2px}
.flagpage .evidence{margin:10px 0 0;padding:10px 14px;border:1px solid var(--rule);
  border-left:3px solid var(--ink-3);border-radius:3px;background:var(--panel);
  font-family:var(--sans);font-size:13px;line-height:1.5}
.flagpage .evidence.ev-attested{border-left-color:var(--accent)}
.flagpage .ev-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px}
.flagpage .ev-badge{font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
.flagpage .ev-label{color:var(--ink-3);font-size:12px}
.flagpage .evidence p{margin:4px 0}
.flagpage .ev-src{margin:6px 0 4px;padding-left:18px}
.flagpage .ev-src li{margin:2px 0}
.flagpage .ev-kind{color:var(--ink-3);font-size:11px;border:1px solid var(--rule);border-radius:9px;padding:0 6px;margin-left:4px}
.flagpage .ev-open{color:var(--ink-2,var(--ink))}
.flagpage .art-tag{margin:4px 0 0;font-family:var(--sans);font-size:11px;line-height:1.35;color:var(--ink-3)}
.flagpage .art-tag a{color:inherit}
.flagpage .art-wrong,.flagpage .art-no-reference{color:var(--ink)}
.flagpage .art-wrong{font-weight:600}
.flagpage .evidence-sum{margin:0 0 18px;padding:10px 14px;border:1px solid var(--rule);border-radius:3px;
  background:var(--panel);font-family:var(--sans);font-size:13px;line-height:1.5}
.flagpage .evidence-sum span{display:block;color:var(--ink-3);font-size:12px;margin-top:2px}
`;

/* AND THE SAME ADDRESSES INSIDE THE SCRIPTS. The index does not write its 210
   country links as markup — it holds them in a COUNTRIES array and renders
   them in the browser — so relink(), which only knows href= and src=, left
   every one of them pointing at the old .html. They still worked, because
   every old address now has a redirect stub, but that is a bounce on the main
   way into the flags atlas and the canonical URL never reaches the address
   bar. Rewritten by exact slug rather than by pattern: the set is known, so
   nothing else quoted in those scripts can be caught by accident. */
function relinkScripts(html, all) {
  for (const slug of all) {
    html = html.split(`"${slug}.html"`).join(`"${u("/flags/" + slug + "/")}"`)
               .split(`'${slug}.html'`).join(`'${u("/flags/" + slug + "/")}'`);
  }
  return html;
}

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
    css: scope(TOKENS + "\n" + css, ".flagpage") + WRAPPER,
    /* The link to the map goes FIRST, above the page's own <h1>, because it
       is the one thing on here a reader cannot get to any other way. */
    html: toTheMap(slug, title) + withEvidence(slug, relinkScripts(
      relink(body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")), slugs())),
    /* The head carried nothing else worth keeping: one font link, two metas
       and the stylesheet. Base supplies all three, better. */
    headLinks: (head.match(/<link[^>]+>/gi) || []).length,
  };
}
