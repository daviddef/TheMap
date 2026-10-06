#!/usr/bin/env python3
"""Australia's digitised newspapers, from Trove's API.

WHY NEWSPAPERS ARE NOT A SIDE DISH FOR AUSTRALIA. There is no equivalent of a
parish register series covering the continent: civil registration is
state-by-state, closed for a lifetime, and mostly not online. What IS online,
free, and full-text searchable is 2,014 digitised newspapers — and Australian
papers printed births, marriages, deaths, funeral notices and obituaries in
volume. For most Australian ancestors before 1950 the newspaper is the record.

ONE CALL. /v3/newspaper/titles returns every title at once, about 530 KB, so
there is no crawl, no rate-limit problem and no reason to be clever.

WHAT THIS SCRIPT REFUSES TO DO, AND IT IS THE IMPORTANT PART.

A title reads «Molong Argus (NSW : 1896 - 1921)» or «Morning Chronicle (Sydney,
NSW : 1843 - 1846)». Only the second names its town. For the first the town is
usually the first word of the masthead — Molong IS a New South Wales village —
but «Morning Chronicle» and «Miners' Advocate» are not towns, and this atlas
has already been bitten twice today by inferring a place from a name. So only
the 995 titles that state their town are given one. The rest carry their state,
which is true, and can be attached to a state rather than invented into a town.

AND THE COUNTRY IS CHECKED, WHICH IS NOT PEDANTRY. Matching on town name alone
looked like it worked: 595 hits led by Sydney with 145 titles. The Sydney in
this atlas is Sydney, NOVA SCOTIA, and its Perth is Perth, SCOTLAND. Name-only
matching would have filed 102 Western Australian papers in Scotland and 145
Sydney papers in Canada — 151 titles into the wrong country. The state, mapped
to a country, is the guard.

TERMS, WHICH CONSTRAIN THE ARCHITECTURE RATHER THAN JUST THE CREDITS. The Trove
API terms permit copying and distributing this metadata in your own site, and
they cap caching at THIRTY DAYS. A static site bakes its data in until the next
build, so this file going stale is not untidiness, it is falling outside the
licence — scripts/build.py fails when it is older than that. Attribution must
name both the contributing source and Trove, with a link back.

    export TROVE_API_KEY=...        # or ~/.config/record-atlas/trove.key
    python3 scripts/harvest-trove.py
"""
import json, os, re, sys, time, urllib.error, urllib.request

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

UA = ("RecordAtlas/1.0 (+https://recordatlas.org; "
      "a map of genealogical sources)")
API = "https://api.trove.nla.gov.au/v3/newspaper/titles?encoding=json"
OUT = "data/trove-newspapers.json"

# Trove's `state` is a mix of Australian states and, for its overseas titles,
# nothing useful — so the country comes from the place clause of the title for
# those. Anything not on either list gets no country and therefore no place.
AU_STATES = {"NSW", "Vic.", "Qld", "SA", "WA", "Tas.", "NT", "ACT"}
ABROAD = {
    "East Timor": "TL", "Indonesia": "ID", "Papua New Guinea": "PG",
    "New Zealand": "NZ", "Fiji": "FJ", "China": "CN", "France": "FR",
    "Japan": "JP", "Malaysia": "MY", "Singapore": "SG", "India": "IN",
    "United Kingdom": "GB", "Vanuatu": "VU", "New Caledonia": "NC",
    "Norfolk Island": "NF", "Solomon Islands": "SB",
}


def key():
    k = os.environ.get("TROVE_API_KEY")
    if k:
        return k.strip()
    p = os.path.expanduser("~/.config/record-atlas/trove.key")
    if os.path.exists(p):
        return open(p).read().strip()
    sys.exit("No Trove API key. Set TROVE_API_KEY or put it in "
             "~/.config/record-atlas/trove.key (chmod 600). It is a credential "
             "and must never be committed.")


def parse_title(t):
    """Split «Morning Chronicle (Sydney, NSW : 1843 - 1846)» into its parts.

    Returns (masthead, town|None, where|None). The town is None unless the
    title actually states one: see the refusal in this module's docstring.
    """
    m = re.search(r"^(.*?)\s*\(([^)]*)\)\s*$", t)
    if not m:
        return t.strip(), None, None
    masthead, inner = m.group(1).strip(), m.group(2)
    before = inner.split(":")[0].strip()
    parts = [x.strip() for x in before.split(",") if x.strip()]
    if not parts:
        return masthead, None, None
    if len(parts) >= 2:
        return masthead, parts[0], parts[-1]
    return masthead, None, parts[0]


def main():
    req = urllib.request.Request(API, headers={
        "X-API-KEY": key(), "User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            doc = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Trove answered {e.code}. A 403 usually means the key is "
                 f"wrong or expired; this one runs to December 2026.")

    rows, placed, stateonly, nocountry = [], 0, 0, 0
    for t in doc.get("newspaper", []):
        masthead, town, where = parse_title(t.get("title", ""))
        cc = None
        if where in AU_STATES or t.get("state") in (
                "New South Wales", "Victoria", "Queensland", "South Australia",
                "Western Australia", "Tasmania", "Northern Territory", "ACT",
                "National"):
            cc = "AU"
        elif where in ABROAD:
            cc = ABROAD[where]
        rec = {
            "id": t.get("id"),
            "masthead": masthead,
            "title": t.get("title"),
            "town": town,
            "state": t.get("state"),
            "cc": cc,
            "from": (t.get("startDate") or "")[:4] or None,
            "to": (t.get("endDate") or "")[:4] or None,
            "url": t.get("troveUrl"),
        }
        if t.get("issn"):
            rec["issn"] = t["issn"]
        rows.append(rec)
        if town and cc:
            placed += 1
        elif cc:
            stateonly += 1
        else:
            nocountry += 1

    out = {
        "source": "Trove, National Library of Australia — /v3/newspaper/titles",
        "licence": "Trove API Terms of Use",
        "licenceNote": ("Metadata may be copied and distributed within your own "
                        "site, and cached for at most THIRTY DAYS — which is why "
                        "scripts/build.py FAILS when this file is older than "
                        "that. Attribution must name the contributing source AND "
                        "Trove, with a link to https://trove.nla.gov.au/."),
        "terms": "https://trove.nla.gov.au/about/create-something/using-api/trove-api-terms-use",
        "attribution": "Data sourced from Trove — https://trove.nla.gov.au/",
        "note": ("Every digitised newspaper title Trove holds, with the years it "
                 "ran and a permanent link. `town` is set ONLY where the title "
                 "states it; where it does not, the town is often the first word "
                 "of the masthead and this file refuses to guess. `cc` comes "
                 "from the state or the place clause, never from the town, "
                 "because the atlas holds a Sydney in Canada and a Perth in "
                 "Scotland."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"titles": len(rows), "townAndCountry": placed,
                   "countryOnly": stateonly, "neither": nocountry},
        "titles": rows,
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{len(rows):,} newspaper titles -> {OUT}")
    print(f"  {placed:,} name a town and a country — placeable")
    print(f"  {stateonly:,} name a country only — attachable to a state")
    print(f"  {nocountry:,} name neither")
    return 0


if __name__ == "__main__":
    sys.exit(main())
