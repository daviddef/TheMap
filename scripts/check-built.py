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
import glob, json, os, re, sys

# npm runs this from site/, so every relative path below would resolve one
# directory too deep. Anchor on the repository root the way the other scripts
# do, rather than depending on where it happens to be invoked from.
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

FAIL = []
def err(m):
    FAIL.append(m)
    print("FAIL: " + m)

DIST = "site/dist"

# ---------------------------------------------------------------------------
# ATTRIBUTION, CHECKED ON THE PAGES THAT SHIP RATHER THAN ON THE SOURCE.
#
# check-data.py already refuses a build whose data declares a licence the
# /data/ page does not name, and whose attribution licences are not credited
# in the footer. It reads site/src/layouts/Base.astro to do the second one,
# and that is the weaker half of the rule for exactly the reason this whole
# file exists: the source is not what ships. A credit inside a conditional
# that never renders, a layout a page does not use, a component dropped from
# the template — the source check passes through all three.
#
# The Defranceski archive's session made the same point from the other end
# and better: they check the pages that USE each dataset, because a site-wide
# footer satisfies a footer check while the page actually built on the data
# stays silent. Their repo needed it more than this one does — here the
# footer is on every page — but the principle holds, and the shipped-HTML
# version of it is strictly stronger than what was here.
#
# So: each holder that asks for credit is mapped to the page KINDS whose
# content depends on it, and the rendered HTML of a sample of each must name
# them. GeoNames is on the map because the gazetteer is the reason any old
# place name resolves at all; Statbel is on surname pages because that is
# where the commune-grain counts are read.
ATTRIBUTION_ON = {
    "GeoNames":    ["home", "place", "surname"],
    "Statbel":     ["home", "surname"],
    "Istat":       ["home"],
    "the National Records of Scotland": ["home"],
    "OpenStreetMap": ["home", "place"],
    "Townlands.ie": ["home"],
    # Trove's terms require the application to say it uses Trove data and link
    # to it. An unmet condition on a licence is not a missing footnote, so it
    # is gated like the CC BY ones rather than trusted to survive edits.
    "Trove": ["home", "place"],
}
# Which declared licence strings mean which holder.
LICENCE_HOLDER = {
    "geonames": "GeoNames",
    "statbel": "Statbel",
    "istat": "Istat",
    "national records of scotland": "the National Records of Scotland",
    "openstreetmap": "OpenStreetMap",
    "townlands.ie": "Townlands.ie",
}


def _sample(kind, n=3):
    """A few built pages of one kind, so this costs a handful of reads and
    not a walk of 46,000 files."""
    if kind == "home":
        return [os.path.join(DIST, "index.html")]
    return sorted(glob.glob(os.path.join(DIST, kind, "*", "index.html")))[:n]


def attribution_gate():
    """Every holder whose licence asks for credit must be named in the HTML
    of the pages built on their data — not merely in a source file."""
    wanted = set()
    for f in sorted(glob.glob("data/*.json")):
        base = os.path.basename(f)
        if base.startswith(".") or base.startswith("_"):
            continue
        try:
            with io.open(f, encoding="utf-8") as fh:
                d = json.load(fh)
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        lic = (d.get("licence") or d.get("license") or "").lower()
        for key, holder in LICENCE_HOLDER.items():
            if key in lic:
                wanted.add(holder)

    for holder in sorted(wanted):
        kinds = ATTRIBUTION_ON.get(holder)
        if not kinds:
            err(f"'{holder}' holds an attribution licence on data this build "
                f"uses and ATTRIBUTION_ON says nothing about where the credit "
                f"belongs. Add the page kinds, or the rule is decorative.")
            continue
        for kind in kinds:
            pages = _sample(kind)
            if not pages:
                err(f"no built '{kind}' pages to check '{holder}' against")
                continue
            for page in pages:
                try:
                    html = io.open(page, encoding="utf-8").read()
                except OSError:
                    continue
                if holder not in html:
                    err(f"{os.path.relpath(page, DIST)} is built on data "
                        f"licensed to '{holder}' and does not name them. "
                        f"Attribution is a condition of the licence, not a "
                        f"courtesy, and a credit in the source that does not "
                        f"reach the page is not a credit.")
                    break

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

# ---------------------------------------------------------------------------
# A NUMBER ONE FILE STATES ABOUT ANOTHER FILE.
# index.json carries `quiet.places`, the row count of index-quiet.json, so the
# map can say how many places the atlas holds before the second file arrives.
# Both are written by the same build, so they agree by construction — until
# they do not, and then the count on the page reads «21,479 of 21,473 places
# shown», which is wrong, impossible, and permanent. The page now recounts
# from the file once it lands; this makes sure the declaration was right in
# the first place, because it is what every visitor sees for the first second.
def quiet_count_gate():
    loud_p = os.path.join(DIST, "index.json")
    quiet_p = os.path.join(DIST, "index-quiet.json")
    if not (os.path.exists(loud_p) and os.path.exists(quiet_p)):
        err("index.json or index-quiet.json is missing from the build")
        return
    loud = json.load(open(loud_p, encoding="utf-8"))
    quiet = json.load(open(quiet_p, encoding="utf-8"))
    declared = ((loud.get("quiet") or {}).get("places"))
    actual = len(quiet.get("places") or [])
    if declared is None:
        err("index.json has no quiet.places — the map cannot count the atlas")
    elif declared != actual:
        err(f"index.json declares quiet.places={declared} and index-quiet.json "
            f"holds {actual} — the place count would be wrong by "
            f"{abs(actual - declared)} for every visitor")
    else:
        print(f"quiet half: {actual:,} places, declared and counted agree")


def main():
    if not os.path.isdir(DIST):
        sys.exit(f"{DIST} is not there — run this after astro build.")

    quiet_count_gate()

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

    attribution_gate()

    print(f"\n{len(pages)} pages · {len(bundle)}b bundled css · {len(inlined)}b inlined")
    if FAIL:
        print(f"{len(FAIL)} error(s) — the build output is not sound")
        sys.exit(1)
    print("built output is sound")

if __name__ == "__main__":
    main()
