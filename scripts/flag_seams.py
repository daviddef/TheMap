"""Where one flag era meets the next: gaps, overlaps, and eras with no id or no image.

THE AUDIT FOUND 68 GAPS AND 33 OVERLAPS between consecutive eras on the 210 flag pages, and
nothing in the data said which were meant. A gap can be honest — Pakistan has no flag
evidence between 3300 and 1300 BCE and the page does not pretend otherwise — and an overlap
can be honest, since Sri Lanka's Kotte kingdom and its Portuguese neighbour coexisted. What
cannot be honest is a seam nobody has looked at. So every seam is listed in
data/flag-seams.json with a verdict, a new one fails the build until somebody gives it a
verdict, and the number still marked `unreviewed` is printed on every build.

A year of difference is not a seam: 1971 followed by 1972 is a calendar edge, not a gap.
"""
import json
import os

VERDICTS = {
    "unreviewed": "Nobody has looked at this seam yet.",
    "concurrent": "Two polities existed at once and both are listed.",
    "unrecorded": "No flag evidence exists for the interval; it is left empty on purpose.",
    "dating": "The two dates conflict; one of them is a mistake to fix.",
}
KINDS = ("gap", "overlap")
SLACK = 1          # years that count as «the same moment»


def seams(eras):
    """[(slug, kind, from_id, to_id, years)] for every consecutive pair that does not meet."""
    by = {}
    for e in eras:
        by.setdefault(e.get("slug"), []).append(e)
    out = []
    for slug, es in by.items():
        srt = sorted([e for e in es if e.get("from") is not None],
                     key=lambda e: (e["from"], e.get("to") if e.get("to") is not None else 9999))
        for a, b in zip(srt, srt[1:]):
            end = 2026 if a.get("present") else a.get("to")
            if end is None:
                continue
            d = b["from"] - end
            if d > SLACK:
                out.append((slug, "gap", a.get("id"), b.get("id"), d))
            elif d < -SLACK:
                out.append((slug, "overlap", a.get("id"), b.get("id"), -d))
    return out


def structure(eras, art):
    """Eras with no id, and eras that have an id and no image."""
    noid = [(e["slug"], e.get("dates")) for e in eras if not e.get("id")]
    noimg = [(e["slug"], e["id"]) for e in eras
             if e.get("id") and e["id"] not in (art.get(e["slug"]) or {})]
    return sorted(noid), sorted(noimg)


def key(s):
    return f"{s[0]}|{s[2]}|{s[3]}"
