#!/usr/bin/env python3
"""Ireland's filing units, from the one source that will actually hand them over.

DAVID ASKED WHETHER IRISHGENEALOGY.IE COULD BE HARVESTED FOR RECORD LOCATIONS,
and noted that it loads in Chrome and not in mine. It is not a TLS problem and
not a broken link: the site sits behind a Cloudflare MANAGED CHALLENGE, which
is a deliberate bot gate that a browser solves and a script is meant not to.
Its own challenge page carries «noindex, nofollow». Working around that is not
something this project will do, so IrishGenealogy stays what it already is
here — a provider row with a link a human clicks. It is recorded in
data/_declined.json with the reason.

The question underneath it was the good one, and it has a much better answer.

WHAT IRELAND ACTUALLY NEEDS IS NOT A SEARCH FORM, IT IS THE HIERARCHY. Irish
records are filed by CIVIL PARISH — Griffith's Valuation, the Tithe Applotment
books, the registration districts, the census fragments. And an Irish family
record almost never names a parish: it names a TOWNLAND, a unit of a few
hundred acres, of which there are sixty-one thousand, many of them sharing a
name with a dozen others in other counties. «Ballybeg» is not an address until
you know which of the twenty-odd Ballybegs it is, and nothing else on this map
can tell you.

Townlands.ie publishes the whole chain — county, barony, civil parish,
electoral division, townland — with both the English and the Irish name of
each, built from OpenStreetMap and Logainm. That is the Irish equivalent of
everything this atlas does for Istria, handed over as a CSV.

    curl -O https://www.townlands.ie/static/downloads/civil_parishes-no-geom.csv.zip
    curl -O https://www.townlands.ie/static/downloads/townlands-no-geom.csv.zip
    python3 scripts/harvest-ireland.py --src <dir with the unzipped csv>

LICENCE. OpenStreetMap-derived, so ODbL 1.0 — share-alike. It is written to
its own file for that reason, exactly as data/archives-osm.json is, and never
merged into the CC0 or CC BY sets.

COVERAGE IS PARTIAL AND SAYS SO. Townlands.ie is a mapping project in progress;
some counties are complete and some are not. The counts per county are written
into the file so the gap is visible rather than implied.
"""
import argparse, csv, json, os, sys, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
csv.field_size_limit(10 ** 7)


def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            yield r


def coord(r):
    try:
        return round(float(r["LATITUDE"]), 5), round(float(r["LONGITUDE"]), 5)
    except (TypeError, ValueError):
        return None, None


def names(r):
    """Every form the place answers to, English first, then Irish, then alts."""
    out = []
    for k in ("NAME_EN", "NAME_TAG", "NAME_GA", "ALT_NAME", "ALT_NAME_G"):
        v = (r.get(k) or "").strip()
        for part in v.split(";"):
            part = part.strip()
            if part and part not in out:
                out.append(part)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="directory with the unzipped CSVs")
    a = ap.parse_args()

    parishes, seen = [], set()
    for r in rows(os.path.join(a.src, "civil_parishes-no-geom.csv")):
        lat, lon = coord(r)
        n = names(r)
        if lat is None or not n:
            continue
        key = (n[0], r.get("CO_NAMES") or "")
        if key in seen:
            continue
        seen.add(key)
        rec = {"n": n[0], "y": lat, "x": lon,
               "co": (r.get("CO_NAMES") or "").split(";")[0].strip()}
        if len(n) > 1:
            rec["a"] = n[1:]
        if r.get("LOGAINM_RE"):
            rec["logainm"] = r["LOGAINM_RE"]
        parishes.append(rec)

    towns, tseen = [], set()
    for r in rows(os.path.join(a.src, "townlands-no-geom.csv")):
        lat, lon = coord(r)
        n = names(r)
        if lat is None or not n:
            continue
        # A townland name repeats across the island; the county and parish are
        # what make it an address, so they are the key as well as the payload.
        key = (n[0], r.get("CO_NAME"), r.get("CP_NAME"))
        if key in tseen:
            continue
        tseen.add(key)
        rec = {"n": n[0], "y": lat, "x": lon,
               "co": (r.get("CO_NAME") or "").strip(),
               "cp": (r.get("CP_NAME") or "").strip(),
               "bar": (r.get("BAR_NAME") or "").strip()}
        if len(n) > 1:
            rec["a"] = n[1:]
        towns.append({k: v for k, v in rec.items() if v not in ("", None)})

    byco = collections.Counter(t["co"] for t in towns if t.get("co"))
    dupes = collections.Counter(t["n"] for t in towns)
    worst = dupes.most_common(6)

    out = "data/ireland-osm.json"
    json.dump({
        "source": "Townlands.ie — county, barony, civil parish and townland boundaries "
                  "built from OpenStreetMap and Logainm",
        "url": "https://www.townlands.ie/page/download/",
        "licence": "ODbL 1.0",
        "licenceNote": ("SHARE-ALIKE, and kept in its own file for that reason. "
                        "Never merge this into the CC0 or CC BY datasets here; a "
                        "derived database that mixes them inherits the strictest "
                        "term, and the point of keeping them apart is that a reuser "
                        "can take the CC0 half without taking the obligation."),
        "note": ("Irish records are filed by CIVIL PARISH; Irish family records name "
                 "a TOWNLAND. A townland is a few hundred acres, there are sixty "
                 "thousand of them, and the same name recurs across the island — so "
                 "a townland is not an address until the county and parish are "
                 "attached to it, which is what this file does. Coverage is partial: "
                 "Townlands.ie is a mapping project in progress and some counties are "
                 "further along than others. The per-county counts are here so the "
                 "gap can be seen."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"civilParishes": len(parishes), "townlands": len(towns),
                   "counties": len(byco),
                   "byCounty": dict(byco.most_common())},
        "civilParishes": parishes,
        "townlands": towns,
    }, open(out, "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"{len(parishes):,} civil parishes · {len(towns):,} townlands · "
          f"{len(byco)} counties -> {out}")
    print("  " + " · ".join(f"{k}:{v}" for k, v in byco.most_common(8)))
    print(f"\nThe reason the county matters — the commonest townland names, and how "
          f"many places carry each:")
    for n, c in worst:
        print(f"  {n:22}{c}")
    bare = sum(1 for t in towns if not t.get("cp"))
    print(f"\n{bare:,} townlands carry no civil parish in the source — findable by "
          f"name and county, and not yet placed in a filing unit")


if __name__ == "__main__":
    main()
