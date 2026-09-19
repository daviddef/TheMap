#!/usr/bin/env python3
"""Put the harvested volumes onto places this map already knows.

scripts/harvest-fs-waypoints.py brings back books with the path that led to
them — ["Betanzos", "Betanzos"] labelled ["City or Municipality", "Parish"].
A book is only useful here once it sits on a dot, so this joins that path to
the atlas's own places.

DEEPEST FIRST, AND ONLY INSIDE THE COLLECTION'S OWN COUNTRIES. A parish is a
better answer than the municipality containing it, and "Betanzos" must not
be allowed to match a Betanzos somewhere else in the world. Every candidate
is tried against the folded name and every former name a place answers to,
which is the whole point of the gazetteer: a book filed under Gallignana
belongs on Gračišće.

WHAT DOES NOT MATCH IS REPORTED, NOT DISCARDED QUIETLY. The names that fail
are the map's next places — they are real settlements FamilySearch has books
for and this atlas has never heard of — so they are written out in
descending order of how many books are waiting on them.

    python3 scripts/match-fs-volumes.py
"""
import collections, json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SRC = "data/fs-waypoints.json"
OUT = "data/fs-volumes-world.json"
GAPS = "data/fs-volumes-unplaced.json"


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def bare(s):
    """«Albanasi (Zadar)» -> «Albanasi». The bracket disambiguates for a
       human and gets in the way of a join."""
    return re.sub(r"\s*\([^)]*\)\s*$", "", s or "").strip()


def main():
    if not os.path.exists(SRC):
        sys.exit(f"{SRC} is not there — run harvest-fs-waypoints.py first.")
    wp = json.load(open(SRC))
    places = json.load(open("data/places.json"))["places"]

    # (country, folded name) -> places. Scoped by country from the start,
    # because an unscoped index of 7,391 places puts Santa Maria in nine
    # countries and the first one wins, silently and wrongly.
    idx = collections.defaultdict(list)
    for p in places:
        cc = p.get("country")
        if not cc:
            continue
        forms = {p["name"]}
        for n in p.get("names", []):
            v = n.get("n", "")
            forms.add(v)
            # Names arrive hierarchical — "A Coruña, Galicia, Spain" — and a
            # waypoint says only "A Coruña", so index the leading segment too.
            if "," in v:
                forms.add(v.split(",")[0])
        for f in forms:
            for cand in {fold(f), fold(bare(f))}:
                if len(cand) > 2:
                    idx[(cc, cand)].append(p)

    by_place = collections.defaultdict(list)
    unplaced = collections.Counter()
    unplaced_cc = {}
    matched = miss = noname = 0
    seen = set()

    for cid, col in (wp.get("byCollection") or {}).items():
        ccs = [c for c in (col.get("cc") or []) if c != "*"]
        for v in col.get("volumes", []):
            path = [x for x in (v.get("path") or []) if x]
            if not path:
                noname += 1
                continue
            hit = None
            # Deepest first: the parish beats the municipality above it.
            for name in reversed(path):
                for cand in (name, bare(name)):
                    for cc in ccs:
                        got = idx.get((cc, fold(cand)))
                        if got:
                            hit = got[0]
                            break
                    if hit:
                        break
                if hit:
                    break
            if not hit:
                miss += 1
                deepest = path[-1]
                unplaced[deepest] += 1
                unplaced_cc.setdefault(deepest, ccs[0] if ccs else "")
                continue
            matched += 1
            # One book can be reached by more than one route through the
            # tree; the waypoint id is the book, so dedupe on it.
            key = (hit["id"], v.get("wp") or v["t"])
            if key in seen:
                continue
            seen.add(key)
            by_place[hit["id"]].append({
                "t": v["t"], "from": v.get("from"), "to": v.get("to"),
                "wp": v.get("wp"),
                "url": ("https://www.familysearch.org/search/image/index?owc="
                        + v["wp"]) if v.get("wp") else None,
                "col": cid, "colTitle": col.get("title"),
                "in": " › ".join(path),
            })

    total = matched + miss + noname
    json.dump({
        "source": "FamilySearch records waypoint API",
        "note": ("One row per book, on the place its waypoint path names. "
                 "Matched deepest-first and only within the collection's own "
                 "countries. Titles are FamilySearch's."),
        "harvested": wp.get("harvested"),
        "counts": {"places": len(by_place),
                   "volumes": sum(len(v) for v in by_place.values()),
                   "matched": matched, "unmatched": miss,
                   "noPathName": noname},
        "byPlace": {k: v for k, v in sorted(by_place.items())},
    }, open(OUT, "w"), ensure_ascii=False, indent=1)

    json.dump({
        "note": ("Settlements FamilySearch has books for and this atlas has "
                 "never heard of — the map's next places, commonest first."),
        "counts": {"names": len(unplaced), "volumes": sum(unplaced.values())},
        "names": [{"n": n, "cc": unplaced_cc.get(n, ""), "volumes": c}
                  for n, c in unplaced.most_common(4000)],
    }, open(GAPS, "w"), ensure_ascii=False, indent=1)

    print(f"{total:,} volumes considered")
    print(f"  {matched:,} matched a place on this shelf "
          f"({100*matched/max(total,1):.0f}%)")
    print(f"  {miss:,} named a place this atlas does not hold")
    print(f"  {noname:,} had no place in their path at all")
    print(f"\n{sum(len(v) for v in by_place.values()):,} distinct books on "
          f"{len(by_place):,} places -> {OUT}")
    print(f"{len(unplaced):,} unknown place names -> {GAPS}")
    if unplaced:
        print("  most wanted: " + ", ".join(
            f"{n} ({c})" for n, c in unplaced.most_common(6)))


if __name__ == "__main__":
    main()
