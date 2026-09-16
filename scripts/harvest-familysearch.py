#!/usr/bin/env python3
"""Every FamilySearch collection that covers ground this map knows about.

WHAT THIS IS NOT. The Defranceski archive harvests FamilySearch through David's
own Chrome, because "FamilySearch's security service blocks the in-app
browser's egress IP". That is a real constraint and it shaped this project's
assumptions — the plan had FamilySearch down as needing an API key and the
user's account.

It turned out not to. The collection list the site's own front end reads is a
PUBLIC JSON endpoint, served to a plain curl with no session, no key and no
cookie, and it carries all 3,488 collections in a single call with their year
spans, record counts and FamilySearch place-authority ids. The place authority
behind those ids is public too, with the full jurisdiction chain and
coordinates. Nothing here is scraped, nothing is logged in, and nothing hammers
anybody: one call for the catalogue, then one call per distinct place, once a
second, cached to disk so a second run asks for nothing it already has.

WHAT A COLLECTION IS, AND WHY IT IS NOT A VOLUME. «Italy, Napoli, Civil
Registration (State Archive), 1809-1936» is not a book standing in a town. It
is a COVERAGE CLAIM over an area, and it is attached to this map as one:
regions and places say which collections reach them, ranked by how specifically
they do it, so that a reader can see the difference between a collection for
their province and one for the whole country.

    python3 scripts/harvest-familysearch.py            # the map's own countries
    python3 scripts/harvest-familysearch.py --all      # the whole world
"""
import argparse, json, os, sys, time, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

LIST_URL = "https://www.familysearch.org/search/orchestration/collectionListData"
PLACE_URL = "https://www.familysearch.org/service/standards/place/ws/places/reps/{}"
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "public collection catalogue, one request per place, cached)")
CACHE = "/tmp/record-atlas-fs"


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def cached(name, fn):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        return json.load(open(p))
    v = fn()
    json.dump(v, open(p, "w"))
    return v


# FamilySearch names countries in several languages, and sometimes names a
# polity that has not existed for a century. Both have to land on an ISO code,
# and a historical one lands on ALL the modern countries it covered: a Posen
# church-book collection filed under «Prussia» is the single most useful thing
# on the map for somebody researching in Szubin, which is in Poland.
ISO = {
    "Italia": ["IT"], "Italy": ["IT"], "Hrvatska": ["HR"], "Croatia": ["HR"],
    "Polska": ["PL"], "Poland": ["PL"], "Deutschland": ["DE"], "Germany": ["DE"],
    "South Africa": ["ZA"], "Australia": ["AU"], "England": ["GB"], "Wales": ["GB"],
    "Scotland": ["GB"], "United Kingdom": ["GB"], "Ireland": ["IE"],
    "Northern Ireland": ["GB"], "Argentina": ["AR"], "Uruguay": ["UY"],
    "Österreich": ["AT"], "Austria": ["AT"], "Slovenija": ["SI"], "Slovenia": ["SI"],
    "Magyarország": ["HU"], "Hungary": ["HU"], "Česko": ["CZ"], "Czechia": ["CZ"],
    "Czech Republic": ["CZ"], "Bosna i Hercegovina": ["BA"],
    "Bosnia and Herzegovina": ["BA"], "Srbija": ["RS"], "Serbia": ["RS"],
    "Crna Gora": ["ME"], "Montenegro": ["ME"], "España": ["ES"], "Spain": ["ES"],
    "Portugal": ["PT"], "France": ["FR"], "United States": ["US"],
    "Canada": ["CA"], "New Zealand": ["NZ"], "Nederland": ["NL"],
    "Netherlands": ["NL"], "Schweiz": ["CH"], "Switzerland": ["CH"],
    "Sverige": ["SE"], "Sweden": ["SE"], "Norge": ["NO"], "Norway": ["NO"],
    "Danmark": ["DK"], "Denmark": ["DK"], "Suomi": ["FI"], "Finland": ["FI"],
    "Україна": ["UA"], "Ukraine": ["UA"], "România": ["RO"], "Romania": ["RO"],
    "Slovensko": ["SK"], "Slovakia": ["SK"], "Lietuva": ["LT"], "Lithuania": ["LT"],
    "Latvia": ["LV"], "Estonia": ["EE"], "Belarus": ["BY"], "Moldova": ["MD"],
    "Russia": ["RU"], "Belgium": ["BE"], "Luxembourg": ["LU"], "Greece": ["GR"],
    "Mexico": ["MX"], "Brazil": ["BR"], "Chile": ["CL"], "Peru": ["PE"],
    "Colombia": ["CO"], "Venezuela": ["VE"], "Ecuador": ["EC"], "Paraguay": ["PY"],
    "Bolivia": ["BO"], "Cuba": ["CU"], "Puerto Rico": ["PR"], "Guatemala": ["GT"],
    "Philippines": ["PH"], "India": ["IN"], "Ghana": ["GH"], "Mozambique": ["MZ"],
    "Madagascar": ["MG"], "Albania": ["AL"], "Jamaica": ["JM"], "Iceland": ["IS"],
    "Japan": ["JP"], "China": ["CN"], "Israel": ["IL"], "Turkey": ["TR"],

    # Polities that no longer exist, mapped onto the ground they held.
    "Prussia":                  ["DE", "PL"],
    "German Empire":            ["DE", "PL"],
    "Austria-Hungary":          ["AT", "HU", "CZ", "SK", "HR", "SI", "PL", "UA", "RO", "RS", "BA", "IT"],
    "Austro-Hungarian Empire":  ["AT", "HU", "CZ", "SK", "HR", "SI", "PL", "UA", "RO", "RS", "BA", "IT"],
    "Russian Empire":           ["RU", "PL", "UA", "LT", "LV", "EE", "BY", "MD"],
    "Soviet Union":             ["RU", "UA", "BY", "LT", "LV", "EE", "MD"],
    "Yugoslavia":               ["HR", "SI", "RS", "BA", "ME", "MK"],
    "Czechoslovakia":           ["CZ", "SK"],
    "British Colonial America": ["US"],
    "British North America":    ["CA"],
    "Ottoman Empire":           ["TR", "GR", "RS", "BA", "BG", "RO", "AL", "MK"],
}

# The catalogue's own title is a better country signal than its place id, and
# this is not a theory: twenty «Germany, Prussia, Brandenburg …» collections
# carry a place id that resolves to MINTO, NEW SOUTH WALES. That is
# FamilySearch's data being wrong, and a map that repeats it would put Cottbus
# church books in Australia. Where the two disagree, the title wins.
def from_title(title):
    head = title.split(",")[0].strip()
    return ISO.get(head)


def resolve(pid):
    def fetch():
        time.sleep(1.0)                       # one a second. Nobody is being hammered.
        return get(PLACE_URL.format(pid))
    try:
        rep = cached(f"place-{pid}.json", fetch)["rep"]
    except Exception as e:
        return None
    chain, j = [], rep.get("jurisdiction")
    while j:
        chain.append(j.get("name"))
        j = j.get("jurisdiction")
    country = chain[-1] if chain else rep.get("display", {}).get("name")
    # Every jurisdiction in the chain gets a look, not just the top one, so
    # that "Posen, Prussia" finds Prussia even though nothing above it does.
    ccs = []
    for nm in ([country] + chain):
        for k in ISO.get(nm, []):
            if k not in ccs:
                ccs.append(k)
    # The coordinates are a level down, under location.centroid — reading
    # location.latitude gets None for every place in the catalogue, which
    # silently turned the proximity ranking off and put Torino at the top of
    # Arienzo's page.
    loc = (rep.get("location") or {}).get("centroid") or {}
    out = {"id": pid,
           "name": rep.get("fullDisplay", {}).get("name") or rep.get("display", {}).get("name"),
           "short": rep.get("display", {}).get("name"),
           "type": (rep.get("type") or {}).get("code"),
           "chain": chain,
           "cc": ccs}
    if loc.get("latitude") is not None:
        out["lat"] = round(loc["latitude"], 4)
        out["lon"] = round(loc["longitude"], 4)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="the whole world, not just our ground")
    ap.add_argument("--out", default="data/collections.json")
    a = ap.parse_args()

    # Which countries this map actually stands on, so the harvest grows with it.
    places = json.load(open("data/places.json"))["places"]
    want = {p.get("country") for p in places if p.get("country")}
    want |= {"IT", "PL", "DE", "ZA", "AU", "GB", "AR", "AT", "CZ", "IE"}
    want.discard(None)

    print("fetching the collection catalogue…")
    cl = cached("collections.json", lambda: get(LIST_URL))["collectionList"]
    print(f"  {len(cl)} collections worldwide")

    pids = sorted({p for c in cl for p in (c.get("placeIds") or [])})
    print(f"  {len(pids)} distinct places to resolve — one a second, cached")

    seen, kept, t0 = {}, [], time.time()
    for i, pid in enumerate(pids, 1):
        rep = resolve(pid)
        if rep:
            seen[pid] = rep
        if i % 100 == 0:
            print(f"  {i}/{len(pids)} places ({time.time()-t0:.0f}s)")

    mismatched = 0
    for c in cl:
        reps = [seen[p] for p in (c.get("placeIds") or []) if p in seen]
        ccs = set()
        for r in reps:
            ccs.update(r.get("cc") or [])
        titled = from_title(c["title"])
        if titled:
            if ccs and not (ccs & set(titled)):
                mismatched += 1        # the place id points somewhere else entirely
                reps = []
                ccs = set()
            ccs.update(titled)
        if not a.all and not (ccs & want):
            continue
        best = reps[0] if reps else None
        kept.append({
            "cc": c["collectionId"], "title": c["title"],
            "from": c.get("startYear"), "to": c.get("endYear"),
            "records": c.get("recordCount") or 0,
            "images": c.get("imageCount") or 0,
            "kind": c.get("recordType"),
            "url": f"https://www.familysearch.org/search/collection/{c['collectionId']}",
            "countries": sorted(ccs),
            "places": [{"name": r["name"], "short": r["short"], "type": r["type"],
                        "cc": r.get("cc"), "lat": r.get("lat"), "lon": r.get("lon")}
                       for r in reps],
        })

    kept.sort(key=lambda c: (c["countries"][:1], -(c["records"] or 0)))
    json.dump({"source": "FamilySearch historical record collections, public catalogue endpoint",
               "harvested": time.strftime("%Y-%m-%d"),
               "note": "A collection is a COVERAGE CLAIM over an area, not a volume standing "
                       "in a town. Attached to regions and places by how specifically it "
                       "reaches them.",
               "collections": kept},
              open(a.out, "w"), ensure_ascii=False, indent=1)

    import collections as _c
    by = _c.Counter(cc for c in kept for cc in c["countries"])
    print(f"\n{len(kept)} collections kept -> {a.out}")
    print(f"  {mismatched} had a place id contradicting their own title; the title won")
    print("  " + " · ".join(f"{k}:{n}" for k, n in by.most_common(16)))


if __name__ == "__main__":
    main()
