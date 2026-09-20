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
PROMOTE = "data/fs-volumes-promote.json"


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


# NOT EVERY LEVEL OF THE TREE IS A PLACE, and treating them all as one is a
# way to put books in the wrong country. Croatia's tree opens on RELIGION —
# Civil, Evangelical, Greek Catholic, Jewish, Military, Orthodox, Roman
# Catholic — and other collections branch on record type or on an archive.
# Matching "Military" or "Index" against a gazetteer of 45,985 settlements
# will eventually hit something, and the hit will be nonsense.
#
# So levels are read by their LABEL, which FamilySearch supplies. Anything
# named here is never treated as a place; everything else may be.
NOT_A_PLACE = re.compile(
    r"religion|denomination|record type|event|type and years|volume|film|"
    r"language|collection|series|archive|repository|source|category", re.I)

# The same labels tell us the CONFESSION for free, which is the one thing the
# browser walk had that this was assumed not to: "Roman Catholic" beside a
# book, not inferred from its title.
IS_RELIGION = re.compile(r"religion|denomination", re.I)


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

    # SECOND CHANCE, FROM THE GAZETTEER. A parish FamilySearch has books for
    # is very often a real settlement this atlas simply has not drawn yet —
    # 45,985 of them are sitting in the gazetteer with coordinates and every
    # name they answer to. Matching against those turns an unplaced book into
    # a new dot instead of a line in a report nobody actions.
    #
    # It is a SECOND pass, never a competing one: a place already on the
    # shelf wins, because it has been through the checks the gazetteer has
    # not. And population breaks ties — where a country has four villages of
    # the same name, the largest is the likeliest subject of a record
    # collection, and the alternative is picking whichever came first in the
    # file.
    gaz_idx = collections.defaultdict(list)
    try:
        gaz = json.load(open("data/gazetteer.json"))["places"]
    except FileNotFoundError:
        gaz = []
    for g in gaz:
        cc = g.get("k")
        if not cc:
            continue
        for f in {g.get("n", "")} | set(g.get("a") or []):
            cand = fold(f)
            if len(cand) > 2:
                gaz_idx[(cc, cand)].append(g)
    for key in gaz_idx:
        gaz_idx[key].sort(key=lambda g: -(g.get("p") or 0))

    by_place = collections.defaultdict(list)
    promote = {}
    unplaced = collections.Counter()
    unplaced_cc = {}
    matched = miss = noname = 0
    seen = set()

    for cid, col in (wp.get("byCollection") or {}).items():
        ccs = [c for c in (col.get("cc") or []) if c != "*"]
        for v in col.get("volumes", []):
            raw = v.get("path") or []
            labels = v.get("labels") or []
            conf = None
            path = []
            for i, name in enumerate(raw):
                if not name:
                    continue
                lab = labels[i] if i < len(labels) else None
                if lab and IS_RELIGION.search(lab):
                    conf = name
                    continue
                if lab and NOT_A_PLACE.search(lab):
                    continue
                path.append(name)
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
                # Try the gazetteer before giving up on it.
                for name in reversed(path):
                    for cand in (name, bare(name)):
                        for cc in ccs:
                            got = gaz_idx.get((cc, fold(cand)))
                            if got:
                                g = got[0]
                                pid = "g-" + re.sub(r"[^a-z0-9]+", "-",
                                                    fold(g["n"])).strip("-")[:48] \
                                      + "-" + cc.lower()
                                hit = {"id": pid}
                                promote.setdefault(pid, {
                                    "id": pid, "name": g["n"], "country": cc,
                                    "lat": g["y"], "lon": g["x"],
                                    "from": "gazetteer"})
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
                "conf": conf,
                "in": " › ".join(raw),
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

    json.dump({
        "note": ("Settlements the gazetteer knows, with coordinates, that "
                 "FamilySearch has books for and this shelf had not drawn. "
                 "Promoted to places so the books have somewhere to land."),
        "counts": {"places": len(promote)},
        "places": sorted(promote.values(), key=lambda x: x["id"]),
    }, open(PROMOTE, "w"), ensure_ascii=False, indent=1)

    print(f"{total:,} volumes considered")
    print(f"  {matched:,} matched a place "
          f"({100*matched/max(total,1):.0f}%), of which "
          f"{len(promote):,} are new dots promoted from the gazetteer")
    print(f"  {miss:,} named a place this atlas does not hold")
    print(f"  {noname:,} had no place in their path at all")
    print(f"\n{sum(len(v) for v in by_place.values()):,} distinct books on "
          f"{len(by_place):,} places -> {OUT}")
    print(f"{len(unplaced):,} unknown place names -> {GAPS}")
    print(f"{len(promote):,} promoted places -> {PROMOTE}")
    if unplaced:
        print("  most wanted: " + ", ".join(
            f"{n} ({c})" for n, c in unplaced.most_common(6)))


if __name__ == "__main__":
    main()
