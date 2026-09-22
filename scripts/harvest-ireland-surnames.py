#!/usr/bin/env python3
"""Irish surnames, from the CSO — and they are BIRTHS, not people.

Found by sweeping national open-data catalogues rather than guessing:
data.gov.ie indexes VSA110, «Surnames of Babies in Ireland with 10 or
More Occurrences», CC BY 4.0, served by the CSO's PxStat API.

WHAT THE NUMBER IS, BECAUSE IT IS NOT WHAT THE OTHERS ARE.

Every other register in data/frequencies/ counts PEOPLE ALIVE: Belgium's
6.4 million, Spain's 89 million. This counts BABIES BORN in 2023, 2024
and 2025 — 80,922 of them across 908 surnames. Murphy at 1,717 does not
mean 1,717 Murphys in Ireland; it means 1,717 children given that
surname in three years.

Adding those together and calling it a population would be wrong by two
orders of magnitude, and it would be wrong in the direction that
flatters the atlas. So `counts.people` is null, every row carries `b`
for births rather than `c` for a head-count, and `basis` says so in the
file. build-surnames.py attests the name in Ireland and records no
number, which is the honest reading: the Irish state says this surname
is borne here, and has not said by how many.

It is also only names given to newborns with ten or more occurrences —
a living, fashionable slice, not a historical corpus. For an atlas of
records that is a real limitation and worth the sentence: a surname that
died out in Ireland in 1900 is not in here, and its absence means
nothing at all.
"""
import csv, io, json, os, time, urllib.request

URL = ("https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API."
       "ReadDataset/VSA110/CSV/1.0/en")
PAGE = "https://data.gov.ie/dataset/vsa110-surnames-of-babies-in-ireland"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")
OUT = "data/frequencies/ie.json"
COUNT_STAT = "VSA110C02"          # C01 is the rank, C02 the number


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read().decode("utf-8-sig", "replace")

    rows = list(csv.DictReader(io.StringIO(raw)))
    if not rows or "Surnames" not in rows[0]:
        raise SystemExit("VSA110 did not come back in the expected shape")

    births, years = {}, set()
    for r in rows:
        if r.get("STATISTIC") != COUNT_STAT:
            continue
        v = (r.get("VALUE") or "").strip()
        n = (r.get("Surnames") or "").strip()
        if not v or not n:
            continue                      # CSO suppresses under ten
        years.add(r.get("Year"))
        births[n] = births.get(n, 0) + int(float(v))

    if not births:
        raise SystemExit("no counted rows — has the statistic id changed?")

    rowsout = sorted(births.items(), key=lambda kv: (-kv[1], kv[0]))
    out = {
        "country": "IE",
        "source": (f"Surnames of babies with ten or more occurrences, "
                   f"{min(years)}–{max(years)} (CSO, VSA110)"),
        "url": PAGE,
        "licence": "CC BY 4.0 (Central Statistics Office)",
        "basis": "births",
        "counted": False,
        "note": ("BIRTHS, NOT PEOPLE. Every other register here counts the "
                 "living; this counts babies given the surname in "
                 f"{min(years)}–{max(years)}. Murphy at 1,717 is 1,717 "
                 "children in three years, not 1,717 Murphys in Ireland, "
                 "and summing these into a population would be wrong by "
                 "two orders of magnitude. The rows carry `b` for births "
                 "and no `c`, so the atlas attests the name in Ireland "
                 "without claiming a head-count nobody published. "
                 "It is also only newborns with ten or more occurrences — "
                 "a living slice, not a historical corpus. A surname that "
                 "died out in Ireland in 1900 is not here, and its absence "
                 "means nothing."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rowsout), "people": None,
                   "births": sum(births.values()),
                   "years": sorted(years)},
        "surnames": [{"n": n, "b": b} for n, b in rowsout],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: {len(rowsout):,} surnames, {sum(births.values()):,} births "
          f"{min(years)}–{max(years)}")
    for n, b in rowsout[:6]:
        print(f"  {b:>6,}  {n}")


if __name__ == "__main__":
    main()
