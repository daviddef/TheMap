#!/usr/bin/env python3
"""Gate that runs AFTER astro build, on the files that will actually ship.

Six gates ran before the build and every one of them passed while the site
went out for days with no navigation styling at all. They could not have
caught it: they read the source, and the fault was in what the source became.

This reads site/dist.

THE CSS CHECK IS THE POINT, AND SO IS WHERE IT LOOKS. Every selector the
layout declares must appear in the shipped page — and it may arrive by either
of two routes, a file under _astro/ or a style block inlined into the HTML,
because Astro inlines a stylesheet below a size threshold. Checking only the
first is what kept three wrong diagnoses alive: `grep topnav dist/_astro/*.css`
returns zero however healthy the CSS is, so it reported failure for a fix that
had already worked and for one that had never been broken that way.

A check that looks in one of the two places a thing can be is not a check.
"""
import glob, os, re, sys

# npm runs this from site/, so every relative path below would resolve one
# directory too deep. Anchor on the repository root the way the other scripts
# do, rather than depending on where it happens to be invoked from.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

FAIL = []
def err(m):
    FAIL.append(m)
    print("FAIL: " + m)

DIST = "site/dist"

def selectors_declared():
    """Class selectors written in a layout or component's own style block."""
    want = {}
    for f in glob.glob("site/src/**/*.astro", recursive=True):
        src = open(f, encoding="utf-8").read()
        for m in re.finditer(r"<style\b[^>]*>(.*?)</style>", src, re.S):
            body = re.sub(r"/\*.*?\*/", " ", m.group(1), flags=re.S)
            for sel in re.findall(r"\.([a-zA-Z][\w-]{2,})", body):
                want.setdefault(sel, f)
    return want

def main():
    if not os.path.isdir(DIST):
        sys.exit(f"{DIST} is not there — run this after astro build.")

    pages = glob.glob(DIST + "/**/*.html", recursive=True)
    if len(pages) < 100:
        err(f"only {len(pages)} html pages in {DIST} — the build did not finish")

    # EVERY ROUTE CSS CAN TRAVEL, AND THERE ARE THREE. A hashed bundle under
    # _astro/; a plain stylesheet copied straight out of public/, which is
    # where this project's nav rules actually live; and a block inlined into a
    # page, which is what Astro does with a stylesheet below its size
    # threshold. My first cut of this gate read only the first and promptly
    # reported the navigation broken when it was fine — the same mistake, in
    # the check written to stop it.
    bundle = ""
    for c in glob.glob(DIST + "/_astro/*.css") + glob.glob(DIST + "/*.css"):
        bundle += open(c, encoding="utf-8").read()
    # A component's styles are inlined only into the pages that use it, so one
    # page is not a sample. Take the home page plus one from each section.
    pages_to_read = [os.path.join(DIST, "index.html")]
    for d in sorted(os.listdir(DIST)):
        sub = os.path.join(DIST, d)
        if os.path.isdir(sub) and d != "_astro":
            found = sorted(glob.glob(sub + "/**/*.html", recursive=True))[:1]
            pages_to_read += found
    inlined = ""
    for f in pages_to_read:
        if os.path.exists(f):
            inlined += " ".join(re.findall(r"<style[^>]*>(.*?)</style>",
                                           open(f, encoding="utf-8").read(), re.S))
    home = open(os.path.join(DIST, "index.html"), encoding="utf-8").read()
    shipped = bundle + " " + inlined

    missing = []
    for sel, where in sorted(selectors_declared().items()):
        if ("." + sel) not in shipped:
            missing.append(f"{sel} (declared in {where})")
    if missing:
        err("selectors declared in a style block never reach the built CSS — "
            + "; ".join(missing[:8])
            + (f" …and {len(missing)-8} more" if len(missing) > 8 else ""))

    # The nav is the specific thing that shipped broken, so name it directly.
    for probe, why in ((".topnav", "the main navigation"),
                       (".brand", "the masthead")):
        if probe not in shipped:
            err(f"{probe} has no rule in the shipped CSS — {why} will render unstyled")

    # An icon a browser cannot parse is an icon that is not there.
    import xml.dom.minidom as xd
    for svg in glob.glob(DIST + "/**/*.svg", recursive=True):
        try:
            xd.parse(svg)
        except Exception as e:
            err(f"{svg}: shipped but not well-formed XML — {e}")

    # A page that declares an ad slot must also ship the loader, or the slot is
    # a permanently empty box.
    if 'class="adslot"' in home and "adsbygoogle.js" not in home:
        err("the page renders an ad slot but never loads adsbygoogle.js")

    print(f"\n{len(pages)} pages · {len(bundle)}b bundled css · {len(inlined)}b inlined")
    if FAIL:
        print(f"{len(FAIL)} error(s) — the build output is not sound")
        sys.exit(1)
    print("built output is sound")

if __name__ == "__main__":
    main()
