#!/usr/bin/env python3
"""Build site/public/leaders.json for /history/ from data/leaders.json (Wikidata, CC0).

One row per holder: [name, wikidataId, fromYear, toYear|null, startDay, endDay|null]. The page picks,
for a country and a year, the holder whose term covers the middle of that year (the longest term
wins a tie, so a caretaker of a few days does not displace a president). A country-year with no
holder is silent: Wikidata names none, which is not the same as nobody ruling.

Holders of under thirty days and rows with an end before their start are dropped as caretakers or
errors; the full harvest stays in data/leaders.json.
"""
import json, os, time
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "public", "leaders.json")


def d(s):
    try:
        y, m, dd = s.split("-")
        return date(int(y), int(m), int(dd))
    except Exception:
        return None


def build():
    src = json.load(open(os.path.join(ROOT, "data", "leaders.json"), encoding="utf-8"))["countries"]
    out, n, dropped = {}, 0, 0
    for cc, v in sorted(src.items()):
        rows = []
        for h in v["holders"]:
            a, b = d(h["start"]), d(h["end"]) if h.get("end") else None
            if h["from"] < 1000:
                continue
            if a and b and (b < a or (b - a).days < 30):
                dropped += 1
                continue
            rows.append([h["name"], h["q"], h["from"], h["to"], h["start"], h.get("end")])
        # A holder with no end who is followed by someone else started a term that never ended on
        # paper: a data error (Wikidata carries at least one fictional president this way). Drop it.
        rows.sort(key=lambda r: r[4] or "")
        keep = []
        for i, r in enumerate(rows):
            if r[5] is None and i < len(rows) - 1 and rows[-1][4] != r[4]:
                dropped += 1
                continue
            keep.append(r)
        rows = keep
        if rows:
            out[cc] = rows
            n += len(rows)
    return {
        "note": ("Heads of state by country from Wikidata (CC0), 1000 CE onward. A country-year with no holder here "
                 "means Wikidata names none. Built by scripts/build-leaders.py from data/leaders.json."),
        "source": "https://www.wikidata.org", "licence": "CC0 1.0 Universal (public domain)",
        "generated": time.strftime("%Y-%m-%d"),
        "counts": {"countries": len(out), "holders": n, "droppedShort": dropped},
        "countries": out,
    }


def main():
    doc = build()
    s = json.dumps(doc, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(s)
    c = doc["counts"]
    print(f"leaders.json   {len(s)/1024:8.1f} KB   {c['holders']} holders across {c['countries']} countries ({c['droppedShort']} caretakers dropped)")


if __name__ == "__main__":
    main()
