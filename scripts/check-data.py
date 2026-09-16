#!/usr/bin/env python3
"""The build gate. A directory that lies is worse than no directory.

Everything here is a rule that, broken, would put a wrong answer in front of
somebody who then drives to an archive. It runs before every deploy and fails
the build rather than warning into a log nobody reads.
"""
import json, os, re, sys, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from geo import country_of

import os as _os
_ROOT = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
_os.chdir(_ROOT)

ERR = []
WARN = []


def err(m):
    ERR.append(m)


def warn(m):
    WARN.append(m)


# Coordinates inside the country they claim. A geocoder that silently puts a
# Croatian parish in Chad is the single likeliest way this map ships a lie, and
# it is cheap to catch — against real outlines, not a rectangle.


def main():
    places = json.load(open("data/places.json"))["places"]
    regions = json.load(open("data/regions.json"))
    provs = json.load(open("data/providers.json"))
    OVR = json.load(open("data/country-overrides.json"))["overrides"]
    for k, v in OVR.items():
        if not v.get("why"):
            err(f"country-override {k}: no reason given")
    try:
        PIN = json.load(open("data/place-overrides.json"))["overrides"]
    except FileNotFoundError:
        PIN = {}
    for k, v in PIN.items():
        if not v.get("why"):
            err(f"place-override {k}: no reason given")
        if v.get("lat") is None or v.get("lon") is None:
            err(f"place-override {k}: no coordinates")

    legend = set(provs["access"])
    pids = set()
    for p in provs["providers"]:
        if p["id"] in pids:
            err(f"provider {p['id']}: duplicate id")
        pids.add(p["id"])
        if p["access"] not in legend:
            err(f"provider {p['id']}: access '{p['access']}' is not in the legend")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", p.get("checked", "")):
            err(f"provider {p['id']}: no usable `checked` date")
        else:
            age = (datetime.date.today()
                   - datetime.date.fromisoformat(p["checked"])).days
            if age > 365:
                warn(f"provider {p['id']}: not re-checked in {age} days")
        if not p.get("url", "").startswith("https://"):
            err(f"provider {p['id']}: url is not https")

    rids = set()
    for r in regions["regions"]:
        if r["id"] in rids:
            err(f"region {r['id']}: duplicate id")
        rids.add(r["id"])
        if len(r.get("ring", [])) < 3:
            err(f"region {r['id']}: a ring needs at least three points")
        last = None
        for e in r["eras"]:
            if e["regime"] not in regions["regimes"]:
                err(f"region {r['id']} {e['from']}: unknown regime '{e['regime']}'")
            if e["from"] > e["to"]:
                err(f"region {r['id']} {e['from']}: era ends before it begins")
            if last is not None and e["from"] < last:
                err(f"region {r['id']} {e['from']}: eras are out of order or overlap")
            last = e["to"]
            for f in e["filedUnder"]:
                if f not in pids:
                    err(f"region {r['id']} {e['from']}: filedUnder '{f}' is not a provider")

    seen = set()
    for p in places:
        pid = p.get("id")
        if not pid or pid in seen:
            err(f"place {pid!r}: missing or duplicate id")
        seen.add(pid)
        if not p.get("name"):
            err(f"place {pid}: no name")
        if p.get("lat") is None or p.get("lon") is None:
            err(f"place {pid}: no coordinates")
            continue
        if not p.get("country"):
            err(f"place {pid}: no country")
        elif pid not in OVR:
            actual = country_of(p["lat"], p["lon"])
            if actual and actual != p["country"]:
                err(f"place {pid}: filed as {p['country']} but {p['lat']},{p['lon']} "
                    f"is in {actual} — fix the coordinates, or add a reasoned "
                    f"entry to data/country-overrides.json")
        if p.get("region") and p["region"] not in rids:
            err(f"place {pid}: unknown region '{p['region']}'")

        for c in p.get("collections", []):
            if c.get("provider") not in pids:
                err(f"place {pid}: collection provider '{c.get('provider')}' is unknown")
            if c.get("access") not in legend:
                err(f"place {pid}: collection access '{c.get('access')}' is not in the legend")
            if c.get("from") and c.get("to") and c["from"] > c["to"]:
                err(f"place {pid}: volume '{c.get('title')}' ends before it begins")
            if c.get("url") and not c["url"].startswith("https://"):
                err(f"place {pid}: collection url is not https")
            # An access class that promises images must have something to open.
            if c.get("access") in ("free", "account", "paid") and not c.get("url"):
                err(f"place {pid}: '{c.get('title')}' claims {c['access']} but carries no link")

    for w in WARN[:12]:
        print("warn:", w)
    if len(WARN) > 12:
        print(f"warn: … and {len(WARN)-12} more")
    for e in ERR[:40]:
        print("FAIL:", e)
    if len(ERR) > 40:
        print(f"FAIL: … and {len(ERR)-40} more")

    print(f"\n{len(places)} places, "
          f"{sum(len(p.get('collections',[])) for p in places)} collections, "
          f"{len(provs['providers'])} providers, {len(regions['regions'])} regions")
    if ERR:
        print(f"{len(ERR)} error(s) — build stopped")
        sys.exit(1)
    print("data is sound" + (f" ({len(WARN)} warning(s))" if WARN else ""))


if __name__ == "__main__":
    main()
