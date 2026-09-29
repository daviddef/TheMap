#!/usr/bin/env python3
"""What the eight family archives have already searched, as marks you can import.

WHY THIS EXISTS.

David: «can you look at all our family research sessions and establish what our
current research has done, what pages, books, volumes, etc, and mark all those
sources?»

Six of the eight archives keep a `searched.json` — 1,349 rows of real work,
«the REGISTER walked page by page — all 174» — and Record Atlas knew none of
it. A reader who had personally walked a register saw the same unmarked row as
somebody who had never opened it.

WHAT IT CANNOT DO, SAID FIRST.

PROGRESS IS NOT IN THIS REPOSITORY AND THIS SCRIPT DOES NOT PUT IT THERE.
Marks live in localStorage, in one browser, by design — there are no accounts
and nothing is ever sent to the server. So the output here is an EXPORT FILE
in exactly the shape /my-research/ already imports, and importing merges
rather than replaces. Nothing is written to anybody's browser by a script.

PAGE RANGES ARE PROSE, NOT A FIELD. «all 174» parses. «walked page by page»
does not, and is not guessed at: that row becomes a mark with no range rather
than a mark claiming a range nobody recorded. A mark that overstates what was
searched is worse than no mark, because the whole point of the record is
knowing what still has to be done.

AND A MATCH IS A WAYPOINT, NOT A RESEMBLANCE. A row is tied to an atlas volume
only when its URL carries a FamilySearch waypoint that atlas volume also
carries. Titles are not matched on similarity — «Births 1858-1900» names a
hundred different books — so a row this cannot place is reported in the reject
list rather than attached to a plausible neighbour.

THE TWO SIDES BARELY SHARE AN IDENTIFIER, AND THAT IS THE HEADLINE.
Measured across all 1,349 rows: the family sessions cite FamilySearch by DGS
FILM NUMBER (`/search/film/005481649?i=363`, 79 rows) and by IMAGE ARK
(`3:1:3QS7-899X-1HVP`, 25 rows). The atlas holds WAYPOINTS and image-group
ids. Exactly one row in 1,349 carried a `wc=` waypoint, and the film numbers
overlap the atlas's `film` values ZERO times — the atlas's are image-group
ids of a different series, not DGS numbers. Defranceski's own
data/fs-catalogue.json turned out to hold the same waypoints and no DGS
numbers either, so there is no bridge on disk.

Resolving a DGS number to a waypoint means asking FamilySearch, behind a
login. This project does not go around that, so those rows stay unresolved and
say so.

SO THE WORK IS MARKED AT THE LEVEL IT CAN HONESTLY BE MARKED AT. A row that
names a source this atlas knows becomes a SOURCE mark — «searched, nothing
found» against Antenati for that place — which is a true statement of work
done and the thing a reader most needs to not repeat. A row that also carries
a waypoint additionally becomes a volume mark with its pages. Claiming the
volume level for a row that only supports the source level would be inventing
precision, and the page ranges are the part somebody will act on.

    python3 scripts/import-research-sessions.py [--out FILE]
"""
import argparse
import csv
import glob
import io
import json
import os
import re
import sys
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
PROJ = os.path.dirname(_ROOT)

ARCHIVES = ["Blazevic Family", "Booyzen Family", "D'arcy Family",
            "Defranceski Family", "Falco Family", "Lerena Family",
            "Luwinski Family", "Mazza Family"]

SRC_KEYS = ("src", "source")
WHAT_KEYS = ("what", "scope")
GOT_KEYS = ("got", "result", "outcome")
URL_KEYS = ("url", "href")
WHEN_KEYS = ("when",)

# ---------------------------------------------------------------------------
# THE SAME ID THE BROWSER WOULD COMPUTE. A faithful port of canonical() in
# site/src/components/ProgressKit.astro — if these two ever disagree the
# import lands in a tally nothing else reads, which is the exact failure that
# function was written to stop.
WC = re.compile(r"[?&]o?wc=([^&]+)")
ARK = re.compile(r"/ark:/61903/3:1:([0-9A-Z-]+)", re.I)


def canonical(raw):
    raw = str(raw or "")
    kind, _, rest = raw.partition(":")
    if kind != "volume":
        return raw
    m = WC.search(rest)
    if m:
        import urllib.parse
        wp = urllib.parse.unquote(m.group(1))
    elif not re.match(r"^https?:", rest):
        wp = rest
    else:
        return raw
    wp = wp.split(":")[0].strip()
    return "volume:" + wp if wp else raw


def waypoints_in(url):
    """Every waypoint a URL could be naming, best first."""
    out = []
    m = WC.search(url or "")
    if m:
        import urllib.parse
        out.append(urllib.parse.unquote(m.group(1)).split(":")[0].strip())
    for m in ARK.finditer(url or ""):
        out.append(m.group(1).split(":")[0].strip())
    return [w for w in out if w]


# ---------------------------------------------------------------------------
# RANGES, ONLY WHERE THE PROSE STATES ONE.
RANGE_PATS = [
    # «images 1-47», «pages 1 to 47»
    re.compile(r"\b(?:image|page|img|p)s?\.?\s*(\d{1,4})\s*(?:[-–—]|to)\s*(\d{1,4})\b", re.I),
    # «all 174», «all 110 images» — a whole volume walked
    re.compile(r"\ball\s+(?:the\s+)?(\d{1,4})\b(?:\s*(?:images|pages))?", re.I),
    # «174 images», «110 images walked»
    re.compile(r"\b(\d{1,4})\s+(?:images|pages)\b", re.I),
]
WALKED = re.compile(r"\bwalk(?:ed)?\b|\bpage by page\b|\bswept\b|\bin full\b|\bcover to cover\b", re.I)


def ranges_from(text):
    """[[a,b], ...] or None. `whole` says the range covers the book."""
    t = text or ""
    m = RANGE_PATS[0].search(t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        if 0 < a <= b <= 9999:
            return [[a, b]], False
    # A COUNT IS ONLY A RANGE WHEN THE ROW ALSO SAYS IT WAS WALKED. «110
    # images» on its own is the size of the book, not the part that was read;
    # «walked page by page — all 174» is both. Requiring the second phrase is
    # what keeps this from turning every volume's page count into a claim of
    # having read it.
    if WALKED.search(t):
        for pat in RANGE_PATS[1:]:
            m = pat.search(t)
            if m:
                n = int(m.group(1))
                if 0 < n <= 9999:
                    return [[1, n]], True
    return None, False


def rows_of(path):
    try:
        d = json.load(io.open(path, encoding="utf-8"))
    except Exception:
        return []
    if isinstance(d, list):
        return [r for r in d if isinstance(r, dict)]
    for key in ("searched", "rows", "entries"):
        if isinstance(d.get(key), list):
            return [r for r in d[key] if isinstance(r, dict)]
    return []


# `when` IS FREE TEXT AND SOME OF IT IS NOT A DATE. The archives write «15
# September 2026», «Sept 2026», and also «not yet» and «—». The last two are
# the row saying the work has NOT happened; carried into `since` they would
# date a mark to a string, and «not yet» would sort as though it were a month.
# Only something with a year in it is taken.
YEAR = re.compile(r"\b(19|20)\d{2}\b")


def when_of(row):
    v = first(row, WHEN_KEYS)
    return v if YEAR.search(v) else ""


def first(row, keys):
    for k in keys:
        v = row.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


# WHAT THE ARCHIVE SAID HAPPENED, IN THE VOCABULARY THE MARK UI ALREADY USES.
# The seven states in VolumeMarks.astro were not invented for this import and
# are not extended by it; a word that does not map leaves the row with no
# state rather than being forced into the nearest one.
OUTCOME = {
    "yield": "found", "hit": "found", "found": "found", "correction": "found",
    "done": "searched", "nothing": "searched", "null": "searched",
    "empty": "searched", "nil": "searched", "miss": "searched",
    "not there": "searched",
    "partial": "found", "part": "found", "mixed": "found",
    "blocked": "blocked",
    "pending": "written", "outstanding": "written",
    "planned": "planned", "not-yet": "planned",
}


def state_of(row):
    v = str(row.get("outcome") or row.get("status") or "").strip().lower()
    if v in OUTCOME:
        return OUTCOME[v]
    # «no Falco», «no Blažević» — a surname-shaped miss, which is a search
    # that happened and found nothing.
    if v.startswith("no "):
        return "searched"
    return ""


def host_of(url):
    m = re.match(r"https?://(?:www\.)?([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def build_provider_index():
    """host -> provider row. The atlas's own spine, not a guess at one."""
    doc = json.load(io.open("data/providers.json", encoding="utf-8"))
    provs = doc["providers"] if isinstance(doc, dict) else doc
    idx = {}
    for p in provs:
        h = host_of(p.get("url"))
        if h:
            idx.setdefault(h, p)
    return idx


def build_collection_index():
    """url -> title, for the few rows that cite a collection outright."""
    doc = json.load(io.open("data/collections.json", encoding="utf-8"))
    rows = doc["collections"] if isinstance(doc, dict) else doc
    return {r["url"].rstrip("/"): r.get("title") or r["url"]
            for r in rows if r.get("url")}


def build_volume_index():
    """waypoint -> {t, place}. Only volumes this atlas actually holds."""
    idx = {}
    for f, key in (("data/fs-volumes.json", "byPlace"),
                   ("data/fs-volumes-world.json", "byPlace")):
        if not os.path.exists(f):
            continue
        d = json.load(io.open(f, encoding="utf-8"))
        for place, vols in (d.get(key) or {}).items():
            for v in vols:
                wp = (v.get("waypoint") or v.get("wp") or "").split(":")[0].strip()
                if wp:
                    idx.setdefault(wp, {"t": v.get("t") or "", "place": place})
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="record-atlas-research-import.json")
    ap.add_argument("--rejects", default="")
    args = ap.parse_args()

    vols = build_volume_index()
    provs = build_provider_index()
    cols = build_collection_index()
    print(f"{len(vols):,} atlas volumes indexed by waypoint, "
          f"{len(provs):,} provider hosts")

    marks, rejects = {}, []
    seen = matched = ranged = srcmarked = 0
    per = {}

    for fam in ARCHIVES:
        path = os.path.join(PROJ, fam, "site/src/data/searched.json")
        rows = rows_of(path)
        hit = 0
        for r in rows:
            seen += 1
            src = first(r, SRC_KEYS)
            url = first(r, URL_KEYS)
            blob = " ".join(filter(None, [src, first(r, WHAT_KEYS), first(r, GOT_KEYS)]))
            when = when_of(r)
            st = state_of(r)
            wps = [w for w in waypoints_in(url) if w in vols]

            # THE SOURCE MARK FIRST, BECAUSE IT IS THE ONE MOST ROWS SUPPORT.
            # A row naming a source this atlas knows is a true statement that
            # the source was worked, whether or not the volume can be pinned.
            p = provs.get(host_of(url))
            if p and st:
                sid = "source:" + p["id"]
                m = marks.setdefault(sid, {})
                m["t"] = m.get("t") or p.get("name") or p["id"]
                m["state"] = m.get("state") or st
                m["href"] = m.get("href") or p.get("url")
                if when:
                    m["since"] = max(m.get("since", ""), when)
                if src and not m.get("note"):
                    m["note"] = f"{fam}: {src[:150]}"
                srcmarked += 1

            # A ROW THAT NAMES A WHOLE COLLECTION NAMES A REAL THING. Five
            # of 406 research URLs are a FamilySearch collection page rather
            # than an image; that is a coarser mark than a volume and a
            # truer one than a provider, so it is kept at its own level.
            cu = (url or "").rstrip("/")
            if cu in cols:
                cid = "collection:" + cu
                m = marks.setdefault(cid, {})
                m["t"] = m.get("t") or cols[cu]
                m["href"] = m.get("href") or cu
                if st and not m.get("state"):
                    m["state"] = st
                if when:
                    m["since"] = max(m.get("since", ""), when)
                if src and not m.get("note"):
                    m["note"] = f"{fam}: {src[:150]}"

            if not wps:
                rejects.append({"archive": fam, "src": src[:140], "url": url,
                                "sourceMarked": bool(p and st),
                                "why": ("cites a DGS film number or image ark; the "
                                        "atlas indexes waypoints and the two do not "
                                        "overlap" if url else "row carries no URL")})
                continue
            wp = wps[0]
            mid = canonical("volume:" + wp)
            rng, whole = ranges_from(blob)
            m = marks.setdefault(mid, {})
            m["t"] = m.get("t") or vols[wp]["t"] or src[:90]
            m["where"] = m.get("where") or vols[wp]["place"]
            m["href"] = m.get("href") or ("/TheMap/place/" + vols[wp]["place"] + "/")
            m["since"] = max(m.get("since", ""), when) if when else m.get("since", "")
            if st and not m.get("state"):
                m["state"] = st
            # THE NOTE IS THE ARCHIVE'S OWN SENTENCE, not a summary of it. A
            # reader opening this mark in six months needs to know which of
            # their own sessions produced it.
            note = f"{fam}: {src[:150]}" if src else fam
            m["note"] = note if not m.get("note") else m["note"]
            if rng:
                prev = m.get("done") or []
                m["done"] = sorted(prev + rng)
                if whole and not m.get("total"):
                    m["total"] = rng[0][1]
                ranged += 1
            matched += 1
            hit += 1
        per[fam] = (len(rows), hit)
        print(f"  {fam:<20} {len(rows):>4} rows, {hit:>4} matched to an atlas volume")

    # Merge overlapping ranges the way ProgressKit does, so an import is not
    # the one place a reader's ranges come back unmerged.
    for m in marks.values():
        if not m.get("done"):
            m.pop("done", None)
            continue
        out = []
        for a, b in sorted(m["done"]):
            if out and a <= out[-1][1] + 1:
                out[-1][1] = max(out[-1][1], b)
            else:
                out.append([a, b])
        m["done"] = out
        m["since"] = m.get("since") or time.strftime("%Y-%m-%d")

    for m in marks.values():
        m["since"] = m.get("since") or time.strftime("%Y-%m-%d")

    doc = {"v": 1, "exported": time.strftime("%Y-%m-%d"), "marks": marks}
    json.dump(doc, io.open(args.out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"\n{args.out}")
    print(f"    rows read                  {seen:,}")
    print(f"    tied to an atlas volume    {matched:,}")
    print(f"    distinct volumes marked    {len(marks):,}")
    print(f"    carrying a page range      {sum(1 for m in marks.values() if m.get('done')):,}")
    ncol = sum(1 for k in marks if k.startswith("collection:"))
    print(f"    collection marks          {ncol:,}")
    nvol = sum(1 for k in marks if k.startswith("volume:"))
    nsrc = sum(1 for k in marks if k.startswith("source:"))
    print(f"    source marks              {nsrc:,}  (from {srcmarked:,} rows)")
    print(f"    volume marks              {nvol:,}")
    print(f"    no volume could be placed {len(rejects):,}")

    if args.rejects:
        json.dump(rejects, io.open(args.rejects, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"    rejects written to         {args.rejects}")


if __name__ == "__main__":
    main()
