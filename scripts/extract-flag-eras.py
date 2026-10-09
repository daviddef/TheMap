#!/usr/bin/env python3
"""Free the flag timelines out of page markup, once.

Phase 2 of the merger. The 245 flag pages carry 1,471 era cards — who governed
which ground, when, and what they flew — and every one of them exists only as
HTML. A search cannot read them, so the flags sit beside the records rather
than with them.

THIS IS A ONE-TIME EXTRACTION OF OUR OWN CONTENT, which is a different thing
from the build-time scraping this project argued against a few hours ago. That
objection was to a PERMANENT dependency on someone else's markup — re-parsing
prose on every build, breaking silently when they reword. These pages are in
this repository now. This runs when somebody runs it, its output is reviewed and
committed, and a gate checks the two have not drifted.

WHAT IT REFUSES TO GUESS. The dates are hand-written prose and 311 of the 1,471
are not a plain «1102 – 1527»:

    pre-1885 · antiquity – 636 · c. 550 – 1206 · 1523/1537 – 1814
    c. 1st – 7th century CE · before c. 1700 · to 1524

Most of those yield a usable year with care. Some do not, and for those the
row keeps its `dates` string and carries `from`/`to` as null rather than a
number somebody invented. The display string is ALWAYS kept, so nothing is lost
by refusing: a consumer that needs a number uses from/to, a consumer that shows
a period shows the words the author wrote.

    python3 scripts/extract-flag-eras.py            # report
    python3 scripts/extract-flag-eras.py --write    # data/flag-eras.json
"""
import argparse, collections, glob, html, json, os, re, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

PAGES = "site/src/flags-pages"
OUT = "data/flag-eras.json"

ENTRY = re.compile(r'<div class="entry"([^>]*)>(.*?)(?=<div class="entry"|<footer|\Z)', re.S)
ATTR = lambda s, k: (re.search(k + r'="([^"]*)"', s) or [None, None])[1]
DATES = re.compile(r'<div class="card-dates">(.*?)</div>', re.S)
TITLE = re.compile(r'<h3 class="card-title">(.*?)</h3>', re.S)
TAG = re.compile(r'<span class="tag"[^>]*>(?:<span class="dot"[^>]*></span>)?(.*?)</span>', re.S)
ROW = re.compile(r'<div class="(tag-row|migro-row|noble-row)">(.*?)</div>', re.S)


def text(s):
    """Tags out, entities out, whitespace collapsed — in that order.

    The order is the point, and this project has already paid for getting it
    wrong once: stripping tags leaves `&eacute;` untouched, so a page dense with
    entities reads as though it says nothing.
    """
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


YEAR = r"(\d{1,4})"


def parse_dates(raw):
    """Return (from, to, present, approx, ok). None where it will not guess."""
    t = html.unescape(raw)
    t = re.sub(r"\s+", " ", t).replace("–", "-").replace("—", "-").strip()
    # A FULL DATE CARRIES ITS YEAR IN PLAIN SIGHT. «15 August 2021 - present»
    # was thrown away as unparseable when the year is the one thing it states
    # unambiguously. Reducing a day to its year is not a guess; it is the grain
    # this atlas works at, and every era boundary here is already a year.
    _M = ("January|February|March|April|May|June|July|August|September|"
          "October|November|December")
    t = re.sub(r"\b\d{1,2}\s+(?:" + _M + r")\s+(\d{4})\b", r"\1", t, flags=re.I)
    t = re.sub(r"\b(?:" + _M + r")\s+(\d{4})\b", r"\1", t, flags=re.I)

    approx = bool(re.search(r"\bc\.|\bcirca\b|antiquity|before\b|pre-", t, re.I))
    present = bool(re.search(r"\bpresent\b", t, re.I))
    # BCE APPLIES TO THE SIDE IT IS WRITTEN ON, not to the whole string.
    _h = t.split("-", 1)
    bce_a = bool(re.search(r"\bBCE?\b", _h[0]))
    bce_b = bool(re.search(r"\bBCE?\b", _h[1])) if len(_h) > 1 else bce_a
    bce = bce_a and bce_b

    # A century is a range, not a year, and this refuses to flatten one.
    if re.search(r"\bcentur|\b\d+(st|nd|rd|th)\b", t, re.I):
        return None, None, present, True, False

    # «pre-1885», «before c. 1700», «to 1524» — an end with no beginning.
    m = re.match(r"^(?:pre-|before\s+(?:c\.\s*)?|to\s+)" + YEAR + r"\b", t, re.I)
    if m:
        y = int(m.group(1))
        return None, (-y if bce else y), present, True, True

    # «antiquity - 636»
    m = re.match(r"^antiquity\s*-\s*(?:c\.\s*)?" + YEAR, t, re.I)
    if m:
        y = int(m.group(1))
        return None, (-y if bce else y), present, True, True

    # «1102 - 1527», «c. 550 - 1206», «320 - 550 CE», «1523/1537 - 1814»
    m = re.match(r"^(?:c\.\s*)?" + YEAR + r"(?:/\d{1,4})?\s*-\s*(?:c\.\s*)?" + YEAR
                 + r"(?:/\d{1,4})?\b", t, re.I)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        # BCE APPLIES TO THE SIDE IT IS WRITTEN ON. «247 BCE - 224 CE» spans
        # the turn of the era; one flag for both ends would have filed 224 CE
        # as 224 BCE — four hundred and forty-eight years wrong, in the
        # direction that looks plausible.
        if bce_a:
            a = -a
        if bce_b:
            b = -b
        return a, b, present, approx, True

    # «990 - present»
    m = re.match(r"^(?:c\.\s*)?" + YEAR + r"(?:/\d{1,4})?\s*-\s*present\b", t, re.I)
    if m:
        a = int(m.group(1))
        return (-a if bce else a), None, True, approx, True

    # a bare year
    m = re.match(r"^(?:c\.\s*)?" + YEAR + r"$", t, re.I)
    if m:
        y = int(m.group(1))
        return (-y if bce else y), (-y if bce else y), present, approx, True

    return None, None, present, approx, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    files = sorted(glob.glob(os.path.join(PAGES, "*.html")))
    rows, unparsed = [], []
    noid = 0
    for f in files:
        base = os.path.basename(f)
        if base == "index.html":
            continue
        slug = base[:-5]
        h = open(f, encoding="utf-8", errors="replace").read()
        page_title = text((re.search(r"<title>(.*?)</title>", h, re.S) or ["", ""])[1])
        for attrs, body in ENTRY.findall(h):
            d = DATES.search(body)
            t = TITLE.search(body)
            if not d or not t:
                continue
            raw = text(d.group(1))
            frm, to, present, approx, ok = parse_dates(d.group(1))
            eid = ATTR(attrs, "id")
            if not eid:
                noid += 1
            tags = []
            for kind, inner in ROW.findall(body):
                for tg in TAG.findall(inner):
                    v = text(tg)
                    if v:
                        tags.append({"row": kind, "t": v})
            row = {
                "page": f"flags/{base}", "slug": slug, "pageTitle": page_title,
                "id": eid, "n": ATTR(attrs, "data-n"),
                "dates": raw, "from": frm, "to": to,
                "present": present or None, "approx": approx or None,
                "polity": text(t.group(1)),
                "tags": tags or None,
            }
            rows.append({k: v for k, v in row.items() if v is not None})
            if not ok:
                unparsed.append((slug, raw))

    parsed = sum(1 for r in rows if "from" in r or "to" in r)
    print(f"{len(rows):,} era cards across {len(files) - 1} pages")
    print(f"  {parsed:,} carry a usable year ({round(100 * parsed / len(rows))}%)")
    print(f"  {len(unparsed):,} keep their words and no number — listed below")
    print(f"  {noid:,} have no id and cannot be deep-linked")
    seen = collections.Counter(d for _, d in unparsed)
    for d, n in seen.most_common(12):
        print(f"      {n:>3}  {d[:58]}")
    if len(seen) > 12:
        print(f"      … and {len(seen) - 12} more distinct forms")

    if not a.write:
        print("  (dry run — pass --write)")
        return 0

    json.dump({
        "note": ("The flag timelines, extracted once from the pages in "
                 "site/src/flags-pages/. `dates` is always the author's own words; "
                 "`from`/`to` are present only where a year could be read out of "
                 "them without guessing. A card about «c. 1st - 7th century CE» "
                 "keeps its words and carries no number, because a century is a "
                 "range and flattening one to a year would be an invention."),
        "source": "site/src/flags-pages/*.html — this project's own pages",
        "licence": "This atlas's own compilation",
        "generatedBy": "scripts/extract-flag-eras.py",
        "counts": {"eras": len(rows), "withYears": parsed,
                   "wordsOnly": len(unparsed), "withoutId": noid,
                   "pages": len(files) - 1},
        "eras": rows,
    }, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
