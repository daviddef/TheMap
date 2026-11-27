#!/usr/bin/env python3
"""Contacts from OpenStreetMap: places of worship, burial grounds, archives, libraries, museums, universities and town halls that carry an
e-mail, telephone, website, or the organisation that runs them. One country at a time, into data/contacts/osm/<CC>.json.gz.

LICENCE. ODbL 1.0, (c) OpenStreetMap contributors: these rows stay in their own files all the way to the browser.

POLITE. Overpass is a free service run for everybody: one query per country, a pause between countries, a name it can be reached by, and
two retries that back off. A country too large for one query belongs in an extract download (docs/contacts-plan.md), not in a louder loop.

    python3 scripts/contacts/harvest_osm.py HR SI
    python3 scripts/contacts/harvest_osm.py HR --from-json saved.json     # a saved Overpass answer; no network
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from contacts import core  # noqa: E402

API = "https://overpass-api.de/api/interpreter"
UA = "RecordAtlas/1.0 (+https://recordatlas.org; contact details of record-keepers for a genealogy atlas)"
TAGS = "^(contact:)?(email|phone|website)$|^operator(:wikidata)?$"
QUERY = """[out:json][timeout:300];
area["ISO3166-1"="%(cc)s"]["admin_level"="2"]->.a;
(
  nwr(area.a)["amenity"~"^(place_of_worship|grave_yard|archive|library|townhall|university)$"][~"%(tags)s"~"."];
  nwr(area.a)["landuse"="cemetery"][~"%(tags)s"~"."];
  nwr(area.a)["tourism"="museum"][~"%(tags)s"~"."];
);
out center tags;"""


def kind_of(tags):
    if tags.get("amenity") == "grave_yard" or tags.get("landuse") == "cemetery":
        return "cemetery"
    return {"place_of_worship": "church", "archive": "archive", "library": "library", "townhall": "town-hall",
            "university": "university"}.get(tags.get("amenity")) or ("museum" if tags.get("tourism") == "museum" else None)


def address(tags):
    street = tags.get("addr:street") or tags.get("addr:place")
    town = " ".join(x for x in (tags.get("addr:postcode"), tags.get("addr:city")) if x)
    if not street or not town:
        return ""
    return f"{street} {tags.get('addr:housenumber', '')}".strip() + ", " + town


def row_from(element, cc):
    tags = element.get("tags") or {}
    kind = kind_of(tags)
    at = element if "lat" in element else element.get("center") or {}
    if not kind or "lat" not in at:
        return None
    oid = element["type"][0] + str(element["id"])
    ids = [f"osm:{oid}"]
    wd = tags.get("wikidata", "")
    if wd.startswith("Q") and wd[1:].isdigit():
        ids.append(f"wd:{wd}")

    def both(key):
        return [tags[k] for k in (key, f"contact:{key}") if tags.get(k)]

    return core.make_row({"id": f"osm:{oid}", "kind": kind, "name": tags.get("name"), "y": at["lat"], "x": at["lon"], "cc": cc, "ids": ids,
                          "email": both("email"), "tel": both("phone"), "web": both("website"), "post": address(tags),
                          "operator": tags.get("operator"), "url": f"https://www.openstreetmap.org/{element['type']}/{element['id']}"})


def rows_from(answer, cc):
    rows = {}
    for element in answer.get("elements", []):
        row = row_from(element, cc)
        if row:
            rows[row["id"]] = row
    return list(rows.values())


def ask(cc, query=None, timeout=320):
    body = urllib.parse.urlencode({"data": query or QUERY % {"cc": cc, "tags": TAGS}}).encode()
    for attempt in range(3):
        try:
            req = urllib.request.Request(API, data=body, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as fh:
                answer = json.load(fh)
            # Overpass answers 200 with a «remark» when it ran out of time or memory: that is a partial answer, not a small country.
            if "remark" in answer:
                raise RuntimeError(answer["remark"])
            return answer
        except Exception as e:
            if attempt == 2:
                raise
            print(f"  {cc}: retrying after {e}")
            time.sleep(60 * (attempt + 1))


def main(argv=None):
    ap = argparse.ArgumentParser(description="Harvest contacts from OpenStreetMap, a country at a time.")
    ap.add_argument("countries", nargs="+", help="two-letter country codes")
    ap.add_argument("--from-json", help="read a saved Overpass answer instead of asking (one country)")
    args = ap.parse_args(argv)
    failed = []
    for i, cc in enumerate(c.upper() for c in args.countries):
        try:
            if args.from_json:
                with open(args.from_json, encoding="utf-8") as fh:
                    answer = json.load(fh)
            else:
                if i:
                    time.sleep(20)
                answer = ask(cc)
        except Exception as e:
            print(f"{cc}: not harvested ({e})")
            failed.append(cc)
            continue
        rows = rows_from(answer, cc)
        if not rows:
            print(f"{cc}: the answer held no rows, so nothing is written")
            failed.append(cc)
            continue
        path = core.write_source("osm", cc, rows, time.strftime("%Y-%m-%d"))
        counts = core.read_file(path)["counts"]
        print(f"{cc}: {len(answer.get('elements', [])):,} elements, {counts}")
    if failed:
        sys.exit("not harvested: " + " ".join(failed))


if __name__ == "__main__":
    main()
