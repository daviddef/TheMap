#!/usr/bin/env python3
"""The Census of Ireland, 1901 and 1911, as coverage claims the map can colour.

WHY. Row 76: 314 providers are classed `free` and three dots on the map are
coloured free. A dot takes its colour from the collections on it or from a
coverage claim that names its own ground, and every one of the 3,504 claims
this atlas holds is FamilySearch's. The survey classifies a PROVIDER; the map
colours a PLACE; nothing joined the two. This is the first join.

WHY THIS SOURCE. scripts/sweep-crawl-policy.py read all 314 free providers'
robots.txt and found 133 would serve us. The National Archives of Ireland is
the largest: its ground holds 2,130 of this atlas's drawn places, its census
is free and needs no account, and it is open to an identified crawler.

AND IT HAS AN API, WHICH IS WHY THIS IS NOT A SCRAPE. The browse page is a
JavaScript app, but it is driven by api-census.nationalarchives.ie, whose
robots.txt asks for a one-second crawl delay and disallows only /admin. One
request per census year returns every county with a RECORD COUNT. That count
is the evidence: it is the holder's own number for what it has, per county.

1901 AND 1911 ONLY. The browse tree also offers 1821, 1831, 1841 and 1851,
and those years return no county facet at all — the pre-Famine censuses
survive as fragments and the API does not break them down by county. No
county-level evidence, no claim. The fragments are real and a reader can find
them on the site; what cannot be done is say which ground they cover.
"""
import json, os, time, urllib.request, urllib.error

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

API = "https://api-census.nationalarchives.ie/census/facets"
BROWSE = "https://nationalarchives.ie/collections/search-the-census/browse/"
UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas recording which ground this collection covers)")
OUT = "data/coverage-claims.json"
YEARS = [1901, 1911]

# WHAT NAI CALLS A COUNTY AND WHAT THIS ATLAS CALLS IT. Written down rather
# than applied quietly, because every one of these is a judgement and the next
# person deserves to see them all at once.
#
#   King's Co. / Queen's Co. — the 1901 and 1911 names for Offaly and Laois,
#     renamed in 1922. The atlas keys Irish places on their modern county.
#   North Mayo / West Cork — NAI splits two counties in 1911 and not in 1901;
#     both halves are that county's ground.
#   Tryone — a misspelling of Tyrone in NAI's own data. 1911 carries both
#     spellings as separate facets. Recorded as the typo it is rather than
#     silently dropped, because 11,470 records sit behind it.
NAME = {
    "King's Co.": "Offaly",
    "Queen's Co.": "Laois",
    "North Mayo": "Mayo",
    "West Cork": "Cork",
    "Tryone": "Tyrone",
}
# The six counties of Northern Ireland are GB on this map, not IE. Saying so
# here is not a political claim, it is which country code the atlas files a
# place under, and a claim that named the wrong one would reach no place at all.
NI = {"Antrim", "Armagh", "Down", "Fermanagh", "Londonderry", "Tyrone"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8"))


def counties(year):
    d = get(f"{API}?census_year={year}&facet_fields=county&limit=50&sort=value")
    blk = [x for x in d if isinstance(x, dict) and x.get("field") == "county"]
    return blk[0]["counts"] if blk else []


def main():
    rows, seen_raw = [], {}
    for y in YEARS:
        cs = counties(y)
        print(f"{y}: {len(cs)} counties, {sum(c['ct'] for c in cs):,} records", flush=True)
        for c in cs:
            raw = c["value"]
            name = NAME.get(raw, raw)
            cc = "GB" if name in NI else "IE"
            seen_raw.setdefault(raw, name)
            rows.append({
                "id": f"nai-census-{y}-{name.lower().replace(' ', '-')}"
                      + ("-" + raw.lower().replace(" ", "-").replace("'", "").replace(".", "")
                         if raw != name else ""),
                "provider": "nai-ie",
                # NAI's own label is kept in the title; the atlas's name is used
                # for matching. A reader sees what the archive calls it.
                "title": f"Census of Ireland {y} — Co. {raw}",
                "url": f"{BROWSE}#census_year={y}&county={raw.replace(' ', '%20')}",
                "from": y,
                "to": y,
                "records": c["ct"],
                "images": 0,
                "kind": "CENSUS",
                "countries": [cc],
                "filedUnder": [name],
                "crosses": [],
                # `short` is what reach() matches a place's adm1 against, so it
                # carries the atlas's county name; `name` is the chain a reader
                # sees. No coordinates: inventing a county centroid to win a
                # distance tie-break would be a number nobody measured.
                "places": [{"name": f"{name}, Ireland", "short": name,
                            "type": "COUNTY", "lat": None, "lon": None}],
            })
        time.sleep(1)                      # the API's own robots.txt asks for it

    renamed = {k: v for k, v in seen_raw.items() if k != v}
    doc = {
        "source": "National Archives of Ireland, census browse API",
        "endpoint": API,
        "licence": "see nationalarchives.ie; the records are free to search and view",
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("Coverage claims, not volumes: one row per county per census "
                 "year, carrying the record count the archive's own API "
                 "reports for it. A claim colours a dot when it names that "
                 "dot's own county, which is why `places[].short` is the "
                 "atlas's county name while the title keeps the archive's. "
                 "1821-1851 are offered by the same browse tree and are NOT "
                 "here: those years survive as fragments and the API returns "
                 "no county breakdown for them, so there is no evidence of "
                 "which ground they cover."),
        "renamed": renamed,
        "counts": {"claims": len(rows),
                   "records": sum(r["records"] for r in rows),
                   "IE": sum(1 for r in rows if r["countries"] == ["IE"]),
                   "GB": sum(1 for r in rows if r["countries"] == ["GB"])},
        "collections": rows,
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = doc["counts"]
    print(f"\n-> {OUT}: {c['claims']} claims, {c['records']:,} records "
          f"({c['IE']} filed IE, {c['GB']} filed GB)")
    if renamed:
        print("  names mapped to the atlas's own:",
              ", ".join(f"{k} -> {v}" for k, v in sorted(renamed.items())))


if __name__ == "__main__":
    main()
