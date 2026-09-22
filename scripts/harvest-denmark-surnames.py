#!/usr/bin/env python3
"""Danish surnames, from Statistics Denmark by way of Digitaliseringsstyrelsen.

WHY THIS FILE EXISTS, WHICH IS THE INTERESTING PART.

data/frequencies/_refused.json said of Denmark: «zero name tables in the
whole bank», and it had the receipts — all 2,308 tables in api.statbank.dk
downloaded and searched for «navn», not one hit. That was true, it was
checked twice, and it was useless, because Statistics Denmark does not put
its name statistics in the statistics bank. It puts them on its website.

The same mistake as Croatia, found the same way, on the same afternoon: a
reader looked at the institution's site instead of its API. A negative
from one endpoint is not a negative from an institution. This project had
built a habit of asking machines and concluding about organisations.

What is actually published, under CC BY 4.0, is a zip of plain text lists:
every surname borne by three or more people in Denmark as of January 2020
— 294,515 of them — plus the thousand and the five thousand commonest in
rank order.

AND THERE ARE NO COUNTS IN IT. Not one number. This is an attestation
list, not a frequency table, and conflating the two would be the third
version of the same error: Denmark tells you WHICH surnames exist and
declines to say how many carry each. The `counted: false` flag says so,
the rows carry no `c`, and the rank of the top 5,000 is kept as `r`
because a rank is what the file actually asserts. Anyone wanting a figure
for one name can have it from «Hvor mange hedder...?», which is Denmark's
version of the Croatian lookup.
"""
import io, json, os, re, time, urllib.request, zipfile

ZIP = ("https://sprogtek-ressources.digst.govcloud.dk/"
       "danmarks%20statistik/navne_registreret_i_danmark_2020.zip")
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")
CACHE = "data/.denmark-names-2020.zip"
OUT = "data/frequencies/dk.json"
ALL = "Efternavne - alle.txt"
TOP = "Efternavne - 5000 mest frekvente.txt"


def fetch():
    if os.path.exists(CACHE) and os.path.getsize(CACHE) > 100000:
        return CACHE
    req = urllib.request.Request(ZIP, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        blob = r.read()
    # A ZIP OR NOTHING. A portal that has moved answers 200 with an HTML
    # page, and writing that to a .zip fails four steps later with a
    # confusing error instead of here with a clear one.
    if blob[:2] != b"PK":
        raise SystemExit(f"that URL did not return a zip ({blob[:60]!r})")
    open(CACHE, "wb").write(blob)
    return CACHE


def lines(z, member):
    with z.open(member) as f:
        for raw in io.TextIOWrapper(f, encoding="utf-8", newline=""):
            name = raw.strip().strip("\t").strip()
            if name:
                yield name


def main():
    z = zipfile.ZipFile(fetch())
    names = list(lines(z, ALL))
    rank = {n: i + 1 for i, n in enumerate(lines(z, TOP))}
    if not names:
        raise SystemExit(f"{ALL} was empty — the file layout has changed")

    # The list is already unique, but say so rather than assume it.
    seen, rows = set(), []
    for n in names:
        k = n.casefold()
        if k in seen:
            continue
        seen.add(k)
        row = {"n": n}
        if n in rank:
            row["r"] = rank[n]
        rows.append(row)

    out = {
        "country": "DK",
        "source": ("Navne registreret i Danmark, January 2020 (Danmarks "
                   "Statistik, republished by Digitaliseringsstyrelsen)"),
        "url": ("https://sprogteknologi.dk/dataset/"
                "fornavne-og-efternavne-i-befolkningen-i-danmark"),
        "licence": "CC BY 4.0 (Danmarks Statistik)",
        "counted": False,
        "note": ("WHICH SURNAMES EXIST, NOT HOW MANY CARRY THEM. Denmark "
                 "publishes every surname borne by three or more people and "
                 "no figures at all, so these rows have no count and must "
                 "never be summed into a population. `r` is the rank among "
                 "the 5,000 commonest, which is the strongest thing the "
                 "source actually asserts. A figure for a single name can be "
                 "had from Danmarks Statistik's «Hvor mange hedder...?» "
                 "lookup. Found on the statistics office's WEBSITE after its "
                 "API had been searched exhaustively and truthfully reported "
                 "as holding nothing — see data/frequencies/_refused.json."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"surnames": len(rows), "ranked": len(rank), "people": None},
        "surnames": rows,
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{OUT}: {len(rows):,} Danish surnames, {len(rank):,} of them ranked")
    print("  commonest:", ", ".join(n for n, i in
                                    sorted(rank.items(), key=lambda x: x[1])[:8]))


if __name__ == "__main__":
    main()
