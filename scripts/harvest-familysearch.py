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
# NOT .../places/reps/{id}. THAT IS A DIFFERENT NUMBERING AND IT SILENTLY
# ANSWERED THE WRONG PLACE FOR EVERY COLLECTION IN THIS FILE.
#
# A collection's `placeIds` are PLACE ids. The /reps/ endpoint reads the same
# number as a place-REPRESENTATION id, finds an unrelated row, and returns it
# with HTTP 200 — so nothing failed and nothing looked wrong. placeId 1927178
# belongs to "Italy, Pola and Trieste, Catholic Church Records"; through
# /reps/ it came back as "Monomie, New South Wales, Australia". That is why
# "Caribbean, Deaths and Burials, 1790-1906" was filed under Australia, and
# why the countries on 3,504 collections could not be trusted.
PLACE_URL = "https://www.familysearch.org/service/standards/place/ws/places/{}"
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
# GENERATED FIRST, HAND-WRITTEN SECOND.
#
# The dict below was typed by hand and covered the ground this map started
# on. Everywhere else fell through it and got NO COUNTRY AT ALL — 51
# collections, including every one for the Isle of Man, Benin, Micronesia,
# Lesotho and the Cook Islands. A collection with no country cannot be
# scoped, so none of its books could ever be placed: 1,008 volumes sat in
# the unplaced list looking like a matching problem when they were a missing
# line in a lookup table.
#
# data/countries.json already carries 237 authoritative names from Natural
# Earth, so those are loaded and the hand-written entries layered on top —
# they are the ones the generated list cannot know: other languages
# (Hrvatska, Magyarország), and polities that no longer exist and must land
# on every modern country they covered (Prussia, Ottoman Empire).
def _generated_iso():
    out = {}
    try:
        for code, v in json.load(open("data/countries.json"))["countries"].items():
            nm = (v or {}).get("name")
            if nm and code and len(code) == 2:
                out[nm] = [code]
    except Exception:
        pass
    # Names FamilySearch uses that Natural Earth spells differently.
    out.update({
        "Cook Islands": ["CK"], "Federated States of Micronesia": ["FM"],
        "Niue": ["NU"], "Tokelau": ["TK"], "Wallis and Futuna": ["WF"],
        "Saint Helena": ["SH"], "Curacao": ["CW"], "Sint Maarten": ["SX"],
        "Caribbean Netherlands": ["BQ"], "Vatican City": ["VA"],
        "Czechia": ["CZ"], "Turkiye": ["TR"], "Cabo Verde": ["CV"],
        "Eswatini": ["SZ"], "Timor-Leste": ["TL"],
    })
    return out


ISO_GENERATED = _generated_iso()

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
    "Barbados": ["BB"], "Jamaica ": ["JM"], "Trinidad and Tobago": ["TT"],
    "Dominican Republic": ["DO"], "Costa Rica": ["CR"], "Nicaragua": ["NI"],
    "Honduras": ["HN"], "El Salvador": ["SV"], "Haiti": ["HT"], "Panama": ["PA"],
    "Belize": ["BZ"], "Guyana": ["GY"], "Suriname": ["SR"], "Grenada": ["GD"],
    "Saint Lucia": ["LC"], "Bahamas": ["BS"], "Bermuda": ["BM"],
    "Sierra Leone": ["SL"], "Liberia": ["LR"], "Nigeria": ["NG"], "Kenya": ["KE"],
    "Zimbabwe": ["ZW"], "Zambia": ["ZM"], "Botswana": ["BW"], "Namibia": ["NA"],
    "Fiji": ["FJ"], "Papua New Guinea": ["PG"], "Samoa": ["WS"], "Tonga": ["TO"],
    "Vanuatu": ["VU"], "Solomon Islands": ["SB"], "Kiribati": ["KI"],
    "Gibraltar": ["GI"], "Malta": ["MT"], "Cyprus": ["CY"], "Bulgaria": ["BG"],
    "Croatia ": ["HR"], "North Macedonia": ["MK"], "Indonesia": ["ID"],
    "Thailand": ["TH"], "Vietnam": ["VN"], "Korea": ["KR"], "Taiwan": ["TW"],
    "Sri Lanka": ["LK"], "Pakistan": ["PK"], "Bangladesh": ["BD"],
    "Cabo Verde": ["CV"], "Cape Verde": ["CV"], "Angola": ["AO"],
    "Saint Helena": ["SH"], "Falkland Islands": ["FK"],

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

# A title often leads with a SUBDIVISION rather than a country — "New York,
# Births and Christenings" or "Queensland, Cemetery Records" — and until these
# were listed the mismatch guard had nothing to compare against, so it let the
# junk through. Eleven New York collections carry place id 22, which resolves
# to MOROCCO, and Vermont's carry 47, which is PAKISTAN. Low place ids in this
# catalogue are legacy rubbish and cannot be trusted at all.
SUBDIVISION = {}
for _st in ("Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware "
            "Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana "
            "Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana "
            "Nebraska Nevada Ohio Oklahoma Oregon Pennsylvania Tennessee Texas Utah "
            "Vermont Virginia Washington Wisconsin Wyoming").split():
    SUBDIVISION[_st] = ["US"]
for _st in ("New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina",
            "North Dakota", "Rhode Island", "South Carolina", "South Dakota",
            "West Virginia", "District of Columbia", "Puerto Rico", "Guam",
            "American Samoa", "Virgin Islands", "Northern Mariana Islands"):
    SUBDIVISION[_st] = ["US"]
for _st in ("Ontario", "Quebec", "Québec", "Nova Scotia", "New Brunswick", "Manitoba",
            "British Columbia", "Saskatchewan", "Alberta", "Newfoundland",
            "Prince Edward Island", "Yukon", "Northwest Territories", "Nunavut"):
    SUBDIVISION[_st] = ["CA"]
for _st in ("Queensland", "New South Wales", "Victoria", "Tasmania",
            "Western Australia", "South Australia", "Northern Territory",
            "Australian Capital Territory"):
    SUBDIVISION[_st] = ["AU"]


# The catalogue's own title is a better country signal than its place id, and
# this is not a theory: twenty «Germany, Prussia, Brandenburg …» collections
# carry a place id that resolves to MINTO, NEW SOUTH WALES. That is
# FamilySearch's data being wrong, and a map that repeats it would put Cottbus
# church books in Australia. Where the two disagree, the title wins.
def from_title(title):
    head = title.split(",")[0].strip()
    return ISO.get(head) or SUBDIVISION.get(head)


# FamilySearch's own region for a collection, reduced to a continent. This is
# a SANITY CHECK ONLY and it is deliberately coarse.
#
# "Caribbean, Deaths and Burials, 1790-1906" resolved to Moolboolaman,
# Queensland and Mitta Mitta, New South Wales — an outright resolution
# failure, and the sort of thing that makes a directory untrustworthy. But
# the fix must not also veto the case this atlas exists for: a collection
# filed under Italy holding Croatian places is CORRECT and is the whole
# product. Both are "the places disagree with the title", and only a
# continent-scale test tells them apart — Italy and Croatia are both Europe,
# Queensland and Barbados are not both anywhere.
FS_CONTINENT = {
    "UNITED_STATES": "AM", "CANADA": "AM", "MEXICO": "AM",
    "CARIBBEAN_CENTRAL_AMERICA": "AM", "SOUTH_AMERICA": "AM",
    "EUROPE": "EU", "UNITED_KINGDOM_IRELAND": "EU",
    "AFRICA": "AF", "ASIA_MIDDLE_EAST": "AS",
    "AUSTRALIA_NEW_ZEALAND": "OC", "PACIFIC_ISLAND": "OC",
    # OTHER is left out on purpose: no region claim, so nothing to check.
}
CC_CONTINENT = {
    "EU": set("AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GI GR HU IS IE IT "
              "LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE "
              "CH UA GB VA XK".split()),
    "AM": set("AG AR AW BS BB BZ BM BO BR CA KY CL CO CR CU CW DM DO EC SV GL "
              "GD GP GT GY HT HN JM MQ MX MS NI PA PY PE PR BL KN LC MF PM VC "
              "SR TT TC US UY VE VG VI".split()),
    "AF": set("DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA "
              "GM GH GN GW KE LS LR LY MG MW ML MR MU YT MA MZ NA NE NG RE RW "
              "SH ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW".split()),
    "AS": set("AF AM AZ BH BD BT BN KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG "
              "LA LB MO MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ "
              "TH TL TR TM AE UZ VN YE".split()),
    "OC": set("AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK "
              "TO TV VU WF".split()),
}
CONTINENT_OF = {cc: k for k, v in CC_CONTINENT.items() for cc in v}


def plausible(cc, region):
    """Could a collection FamilySearch files under `region` really cover `cc`?

    Only a continent apart is refused. Anything closer — Italy and Croatia,
    Prussia and Poland, Texas and Mexico — is exactly what this map is for.
    """
    want = FS_CONTINENT.get(region or "")
    got = CONTINENT_OF.get(cc)
    if not want or not got:
        return True          # no claim either way; do not invent one
    return want == got


# Hand-written last, so a historical polity or a foreign spelling always
# beats the plain modern name.
_merged = dict(ISO_GENERATED)
_merged.update(ISO)
ISO = _merged


def resolve(pid):
    def fetch():
        time.sleep(1.0)                       # one a second. Nobody is being hammered.
        return get(PLACE_URL.format(pid))
    try:
        # The shape differs too: places/{id} wraps a place holding a list of
        # representations, where places/reps/{id} returned one rep directly.
        doc = cached(f"place-{pid}.json", fetch)
        reps = (doc.get("place") or {}).get("reps") or []
        if not reps:
            return None
        rep = reps[0]
    except Exception:
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

    implausible = 0
    crossed = 0
    for c in cl:
        reps = [seen[p] for p in (c.get("placeIds") or []) if p in seen]
        ccs = set()
        for r in reps:
            ccs.update(r.get("cc") or [])
        titled = from_title(c["title"])
        region = c.get("region")

        # THIS USED TO THROW THE ANSWER AWAY. When the place ids resolved to a
        # country the title did not name, the old code called it a mismatch,
        # dropped every resolved place and kept only the title's country. That
        # is precisely backwards. "Italy, Pola and Trieste, Catholic Church
        # Records" holding Croatian parishes is not an error in the data — it
        # is the single most useful fact this atlas can tell anybody with
        # Istrian family, and the reason the project exists. Discarding it
        # meant that of 1,165 Croatian places, exactly none were reached by a
        # collection filed under another country.
        #
        # So the place authority is believed, and the title is added to it
        # rather than allowed to veto it. The only thing refused is a
        # resolution a continent away from where FamilySearch itself files
        # the collection, which is a broken lookup rather than a border.
        bad = {x for x in ccs if not plausible(x, region)}
        if bad:
            implausible += 1
            ccs -= bad
            reps = [r for r in reps
                    if not (set(r.get("cc") or []) & bad) or
                    (set(r.get("cc") or []) - bad)]
        if titled:
            # Recorded separately so a page can say "filed under Italy,
            # covers this Croatian place" instead of flattening the two.
            crossings = sorted(ccs - set(titled))
            ccs.update(titled)
        else:
            crossings = sorted(ccs)
        if not a.all and not (ccs & want):
            continue
        if crossings:
            crossed += 1
        best = reps[0] if reps else None
        kept.append({
            "cc": c["collectionId"], "title": c["title"],
            "from": c.get("startYear"), "to": c.get("endYear"),
            "records": c.get("recordCount") or 0,
            "images": c.get("imageCount") or 0,
            "kind": c.get("recordType"),
            "url": f"https://www.familysearch.org/search/collection/{c['collectionId']}",
            "countries": sorted(ccs),
            # The countries the TITLE names, and the ones only the place
            # authority knows about. A collection where these differ is the
            # interesting kind.
            "filedUnder": sorted(titled) if titled else [],
            "crosses": crossings,
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
    print(f"  {crossed} reach a country their own title never names — the "
          f"cross-border collections, which are the point of this map")
    print(f"  {implausible} had a place id resolve a continent from where "
          f"FamilySearch files the collection; only those were refused")
    ex = [c for c in kept if c["crosses"]][:6]
    for c in ex:
        print(f"      filed {','.join(c['filedUnder']) or '—':8s} "
              f"reaches {','.join(c['crosses']):18s} {c['title'][:44]}")
    print("  " + " · ".join(f"{k}:{n}" for k, n in by.most_common(16)))


if __name__ == "__main__":
    main()
