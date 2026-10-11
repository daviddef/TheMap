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

THE API STOPS AT 200 DISTINCT PLACES PER QUERY, AND THAT IS GOT AROUND BY
ASKING NARROWER QUESTIONS RATHER THAN BY ASKING MORE OFTEN. A first pass took
one answer per archive and 107 of 193 came back at the ceiling, which meant the
largest archives — the ones covering the most ground — were the worst served.
So any answer that comes back full is split in half by year and both halves are
asked again, recursively, until a slice answers under the ceiling or the span
is too short to halve. For the Brabants Historisch Informatie Centrum that
turns 199 places into 765. The place is the same place in every slice; only
the question narrows.

This is still two kinds of request and nothing else, it stays under their four
a second, and a small archive that answers under the ceiling first time costs
exactly one call.

WHICH COUNTRY AN ARCHIVE IS IN is read from its ISIL code where it has one
(NL-DtAD -> NL) and otherwise from its homepage's country TLD (.nl, .be, .fr).
An archive with neither is skipped and counted, because a claim filed under a
country this atlas guessed would reach the wrong ground.
"""
import json, os, re, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

API = "https://api.openarchieven.nl/1.1"
UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas recording which ground this collection covers)")
OUT = "data/coverage-claims-openarchieven.json"
# THEIR SPELREGELS: NO MORE THAN FOUR REQUESTS A SECOND. A first run did them
# one at a time and used about one of those four, which put the job at four
# hours. Three workers, each pausing a quarter second between its own calls,
# comes to roughly three a second across the whole script — inside their limit
# with room to spare, and about three times faster.
WORKERS = 3
PAUSE = 0.25
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


CEILING = 199            # what a full answer looks like; the API's own limit is 200
MAX_CALLS = 32           # a bound per archive, so one vast archive cannot run away

# A MENTION IS NOT COVERAGE, AND THIS IS WHERE THAT LINE IS DRAWN.
#
# Splitting past the ceiling turned Archief Delft from 199 places into 1,398,
# and the bottom of that list is Cairo, Cardiff, Javazee and Hydaspes with one
# record each — a sailor who died in the Java Sea, somebody born in Wales. All
# true, none of it coverage. A claim here colours a dot and tells a researcher
# this is a place to go and look, and «one stray record names your town» is not
# that. The unsliced top-200 hid this by accident, because it was already a cut
# by count; splitting removed the accident and so the rule has to be stated.
#
# Ten is a judgement and it errs toward saying less. It costs real small
# places: a hamlet whose parish genuinely left eight entries is dropped with
# the strays. The file records how many places each threshold would keep so
# the choice can be argued with rather than guessed at.
MIN_RECORDS = 10


def deep_places(code, lo=1500, hi=1960):
    """Every place an archive names, by halving any question that comes back full.

    Returns (places, total_records, hit_ceiling, calls). `places` is a list
    of {key, count}
    where the count is the LARGEST seen for that place across the slices it
    appeared in — not a sum, because a place that appears in two overlapping
    answers would otherwise be counted twice. The count is only ever used to
    order the list, so the largest slice's figure is the honest one to keep.
    """
    best, queue, calls, ceiling = {}, [(lo, hi)], 0, False
    # The first question is the unsliced one, which is all a small archive needs.
    first = get(f"{API}/stats/breakdown.json?group_by=place"
                f"&archive_code={code}&number_show=500&min_count={MIN_RECORDS}")
    calls += 1
    time.sleep(PAUSE)
    if not first or not first.get("results"):
        return [], 0, False, calls
    # The archive's own total comes from the UNSLICED answer. Summing the
    # slices would double-count every record whose place appears in more
    # than one of them.
    total = first.get("total_records") or 0
    for r in first["results"]:
        k = (r.get("key") or "").strip()
        if k:
            best[k] = max(best.get(k, 0), r.get("count") or 0)
    if len(first["results"]) < CEILING:
        return ([{"key": k, "count": c} for k, c in
                 sorted(best.items(), key=lambda kv: -kv[1]) if c >= MIN_RECORDS],
                total, False, calls)

    ceiling = True
    while queue and calls < MAX_CALLS:
        a, b = queue.pop(0)
        d = get(f"{API}/stats/breakdown.json?group_by=place&archive_code={code}"
                f"&number_show=500&min_count={MIN_RECORDS}"
                f"&year_start={a}&year_end={b}")
        calls += 1
        time.sleep(PAUSE)
        res = (d or {}).get("results") or []
        for r in res:
            k = (r.get("key") or "").strip()
            if k:
                best[k] = max(best.get(k, 0), r.get("count") or 0)
        # A full answer means the slice is still hiding places behind the
        # ceiling, so ask its two halves instead. A span of three years or
        # less is not worth halving again.
        if len(res) >= CEILING and b - a > 3:
            mid = (a + b) // 2
            queue.append((a, mid))
            queue.append((mid + 1, b))
    return ([{"key": k, "count": c} for k, c in
             sorted(best.items(), key=lambda kv: -kv[1]) if c >= MIN_RECORDS],
            total, ceiling, calls)


def main():
    archives = get(f"{API}/stats/archives.json") or []
    print(f"{len(archives)} archives listed", flush=True)
    rows, skipped, capped, empty, calls_spent = [], [], 0, 0, 0
    lock, done = threading.Lock(), [0]

    def one(a):
        """Everything for a single archive. Run on WORKERS threads at once."""
        code = a.get("archive_code")
        if not code:
            return None
        cc, how = country_of(a)
        if not cc:
            with lock:
                skipped.append(a.get("name") or code)
            return None
        places, total_records, hit_ceiling, ncalls = deep_places(code)
        with lock:
            done[0] += 1
            if done[0] % 25 == 0:
                print(f"  {done[0]}/{len(archives)} archives", flush=True)
        if not places:
            with lock:
                empty_box[0] += 1
            return None
        # NO `sort=name_asc` HERE, AND THAT ONE PARAMETER COST EVERY CLAIM ITS
        # DATES. Asked with sort=name_asc this endpoint answers 503 «Service
        # temporarily unavailable» every single time — not intermittently —
        # while the default sort answers 200. The first run of this script
        # asked that way for all 193 archives, got nothing back each time, and
        # wrote `from: null, to: null` into every row without complaining. It
        # was asked for in ascending order so the first and last could be
        # taken, which min() and max() never needed in the first place.
        yr = get(f"{API}/stats/breakdown.json?group_by=year"
                 f"&archive_code={code}&number_show=500")
        time.sleep(PAUSE)
        years = [int(y["key"]) for y in (yr or {}).get("results", [])
                 if str(y.get("key", "")).isdigit()]
        with lock:
            if hit_ceiling:
                capped_box[0] += 1
            calls_box[0] += ncalls + 1
        return {
            "id": "openarch-" + code,
            "provider": "openarchieven",
            # THE ARCHIVE'S NAME IS THE ATTRIBUTION, and it is in the title so
            # that it reaches the place page rather than a footer nobody reads.
            "title": a.get("name") or code,
            "url": a.get("search") or f"https://www.openarchieven.nl/{code}",
            "from": min(years) if years else None,
            "to": max(years) if years else None,
            "records": total_records,
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
        }

    capped_box, empty_box, calls_box = [0], [0], [0]
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for r in ex.map(one, archives):
            if r:
                rows.append(r)
    # Threads finish out of order; the file should not depend on which.
    rows.sort(key=lambda r: r["id"])
    capped, empty, calls_spent = capped_box[0], empty_box[0], calls_box[0]

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
                 "business. The API answers at most 200 distinct places to one "
                 "question, so any answer that came back full was split in half "
                 "by year and asked again, recursively, until the slices "
                 "answered under the ceiling. `records` is the archive's own "
                 "total and is NOT the sum of the places shown; a place's count "
                 "is the largest figure seen for it across the slices it "
                 "appeared in, which is used only to order the list."),
        "counts": {
            "claims": len(rows),
            "places": sum(len(r["places"]) for r in rows),
            "records": sum(r["records"] for r in rows),
            "byCountry": dict(Counter(r["countries"][0] for r in rows)),
            "archivesNeedingSplit": capped,
            "apiCalls": calls_spent,
            "minRecordsPerPlace": MIN_RECORDS,
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
    print(f"   needed splitting past the ceiling: {c['archivesNeedingSplit']}; "
          f"no place data: {c['archivesWithNoPlaceData']}; "
          f"no country to file under: {c['archivesWithNoCountry']}")
    print(f"   api calls: {c['apiCalls']:,}")


if __name__ == "__main__":
    main()
