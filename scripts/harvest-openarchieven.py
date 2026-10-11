#!/usr/bin/env python3
"""Open Archieven's Dutch and Belgian archives, as coverage claims per place.

WHY THIS ONE, AFTER IRELAND. The National Archives of Ireland took `free` from
3 dots to 2,325 and proved the diagnosis in row 76: surveying classifies a
PROVIDER, the map colours a PLACE, and only a coverage claim joins them.
scripts/sweep-crawl-policy.py then read all 314 free providers' robots.txt and
found 133 open. Ranked by how many GREY dots their ground holds — counted on
the real map, loud half and quiet half together, which is the count I got
wrong the first time — the Netherlands is the biggest at 1,706.

AND IT LIGHTS A COLOUR THAT HAS NEVER APPEARED. Open Archieven is an INDEX,
not a scan library: a record here is a name, a date, an event and a shelf
reference — «Nationaal Archief, Archive 2.12.14, Registry 488» — and no image.
That is exactly the atlas's `index` class, «An index only — no images», one of
the three swatches the legend has always drawn dead because no provider in
those classes had a single claim. 

THEIR RULES, IN THEIR WORDS. «Open Archieven is gebouwd op open data. De
gegevens stelt Open Archieven ook weer open beschikbaar.» The Spelregels: the
API is free, a few parts want a key, do no more than four requests a second,
send a recognisable program name — and VERMELD HET ARCHIEF ALS BRON, name the
holding archive as the source. So every claim here is titled with the archive
that holds it, which is the attribution, carried to the place page where a
reader actually sees it. This script stays under the rate limit and names
itself and this project.

WHAT IT ASKS FOR. /stats/archives.json lists the archives. For each,
/stats/breakdown.json?group_by=place gives record counts per event place, and
group_by=year gives the span. That is two requests per archive and nothing
else; no record is fetched and no person is read.

THE PER-ARCHIVE PLACE LIST IS CAPPED AT 199 BY THE API, which is a real limit
and not an argument against the claim: these are the 199 places each archive
holds the MOST records for, so a dot that misses out is one the archive barely
touches. The cap is recorded in the file.

WHICH COUNTRY AN ARCHIVE IS IN is read from its ISIL code where it has one
(NL-DtAD -> NL) and otherwise from its homepage's country TLD (.nl, .be, .fr).
An archive with neither is skipped and counted, because a claim filed under a
country this atlas guessed would reach the wrong ground.
"""
import json, os, re, time, urllib.request, urllib.error

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

API = "https://api.openarchieven.nl/1.1"
UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas recording which ground this collection covers)")
OUT = "data/coverage-claims-openarchieven.json"
PAUSE = 0.3                      # their Spelregels: no more than 4 a second
TLD2CC = {"nl": "NL", "be": "BE", "fr": "FR", "de": "DE", "lu": "LU"}


def get(url, tries=3):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:                                    # noqa: BLE001
            if n == tries - 1:
                return None
            time.sleep(2 * (n + 1))
    return None


def country_of(a):
    isil = (a.get("isilcode") or "").strip()
    if isil and "-" in isil:
        cc = isil.split("-", 1)[0].upper()
        if len(cc) == 2:
            return cc, "ISIL " + isil
    m = re.search(r"://[^/]*\.([a-z]{2,5})(?:[:/]|$)", (a.get("homepage") or "").lower())
    if m and m.group(1) in TLD2CC:
        return TLD2CC[m.group(1)], "homepage ." + m.group(1)
    return None, None


def main():
    archives = get(f"{API}/stats/archives.json") or []
    print(f"{len(archives)} archives listed", flush=True)
    rows, skipped, capped, empty = [], [], 0, 0
    for i, a in enumerate(archives, 1):
        code = a.get("archive_code")
        if not code:
            continue
        cc, how = country_of(a)
        if not cc:
            skipped.append(a.get("name") or code)
            continue
        pl = get(f"{API}/stats/breakdown.json?group_by=place"
                 f"&archive_code={code}&number_show=500")
        time.sleep(PAUSE)
        if not pl or not pl.get("results"):
            empty += 1
            continue
        places = [p for p in pl["results"] if (p.get("key") or "").strip()]
        if pl.get("total_groups") and len(places) >= pl["total_groups"]:
            capped += 1
        yr = get(f"{API}/stats/breakdown.json?group_by=year"
                 f"&archive_code={code}&number_show=500&sort=name_asc")
        time.sleep(PAUSE)
        years = [int(y["key"]) for y in (yr or {}).get("results", [])
                 if str(y.get("key", "")).isdigit()]
        rows.append({
            "id": "openarch-" + code,
            "provider": "openarchieven",
            # THE ARCHIVE'S NAME IS THE ATTRIBUTION, and it is in the title so
            # that it reaches the place page rather than a footer nobody reads.
            "title": a.get("name") or code,
            "url": a.get("search") or f"https://www.openarchieven.nl/{code}",
            "from": min(years) if years else None,
            "to": max(years) if years else None,
            "records": pl.get("total_records") or 0,
            "images": 0,
            "kind": "MISCELLANEOUS",
            "countries": [cc],
            "countryFrom": how,
            "holder": a.get("homepage") or None,
            "filedUnder": [],
            "crosses": [],
            "places": [{"name": f"{p['key']}, {cc}", "short": p["key"],
                        "type": "MUNICIPALITY", "lat": None, "lon": None,
                        "records": p.get("count") or 0}
                       for p in places],
        })
        if i % 25 == 0:
            print(f"  {i}/{len(archives)} — {len(rows)} claims so far", flush=True)

    from collections import Counter
    doc = {
        "source": "Open Archieven (openarchieven.nl), the open API of Coret Genealogie",
        "endpoint": API,
        "licence": ("Open data — Open Archieven publishes its data openly and asks "
                    "that the HOLDING ARCHIVE be named as the source, which every "
                    "row here does in its title; no more than four requests a "
                    "second, and a recognisable program name, both observed."),
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("One claim per archive, carrying the places it holds records for "
                 "and the archive's own record count for each. THESE ARE INDEX "
                 "ENTRIES, NOT SCANS: a record is a name, a date and a shelf "
                 "reference, and whether an image exists is the holding archive's "
                 "business. The per-archive place list is capped at 199 by the "
                 "API, so an archive that reaches further is represented by the "
                 "199 places it holds the most records for."),
        "counts": {
            "claims": len(rows),
            "places": sum(len(r["places"]) for r in rows),
            "records": sum(r["records"] for r in rows),
            "byCountry": dict(Counter(r["countries"][0] for r in rows)),
            "archivesHitTheApiCap": capped,
            "archivesWithNoPlaceData": empty,
            "archivesWithNoCountry": len(skipped),
        },
        "archivesWithNoCountry": sorted(skipped),
        "collections": rows,
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = doc["counts"]
    print(f"\n-> {OUT}")
    print(f"   {c['claims']} archives, {c['places']:,} place rows, {c['records']:,} records")
    print(f"   by country: {c['byCountry']}")
    print(f"   hit the API's 199-place cap: {c['archivesHitTheApiCap']}; "
          f"no place data: {c['archivesWithNoPlaceData']}; "
          f"no country to file under: {c['archivesWithNoCountry']}")


if __name__ == "__main__":
    main()
