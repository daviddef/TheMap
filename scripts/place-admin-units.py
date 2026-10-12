#!/usr/bin/env python3
"""The 158 names Wikidata said were provinces, given the point they always had.

WHAT WAS SITTING THERE. match-via-wikipedia.py resolves an unplaced name
through the article it redirects to, reads P625 and P31, and then SORTS what it
found: a settlement is placed, and a name Wikidata calls an administrative unit
is set aside under `isAnAdminUnitNotASettlement` — 158 names holding 10,526
volumes. Setting them aside was right. Placing «Toscana» as though it were a
village would put 1,001 books on a dot that claims to be a parish.

BUT IT THREW THE COORDINATE AWAY. facts_for() fetched P625 for every one of
those names in the same call that identified them, and the sorting step kept
only the name, the country and what Wikidata called it. So 10,526 volumes have
been sitting in the unplaced list — described in that file as «the map's next
places» — when the point to draw them on was already in hand and merely not
written down.

AN AREA GETS AN AREA. These rows do not become placements, which are towns
somebody researched. They go in beside the admin divisions, through
division_label, so the dot says «Abaúj-Torna (area)» on its face and nobody
reads a county as a parish. That rule is older than this script and this is
the second source feeding it, not a new idea.

WHAT IS IN THE PILE, and it is not a long tail: Philippine provinces (Albay,
Cebu, Zambales, Pampanga), Hungarian counties the kingdom kept until 1920
(Abaúj-Torna), English and Welsh historic counties (Berkshire,
Glamorganshire), Spanish comarques (Bages), and US counties that were
abolished — Bute County, North Carolina, dissolved in 1779 and holding 148
books. GeoNames lists what exists now, so none of these can ever be in it.

THE COUNTRY IS CHECKED, not taken on trust, by the same geo.country_of() the
resolver uses on every point it keeps. A county of the Kingdom of Hungary whose
ground is in Slovakia today is filed where the ground is.

    python3 scripts/place-admin-units.py            # dry run
    python3 scripts/place-admin-units.py --write
"""
import argparse, json, os, sys, time
from importlib.machinery import SourceFileLoader

_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
os.chdir(_ROOT)
sys.path.insert(0, _HERE)

import geo                                                   # noqa: E402

SRC = "data/fs-volumes-wikipedia.json"
OUT = "data/fs-volumes-areas.json"

# A BORDER THAT MOVED, OR THE WRONG NAMESAKE — and for an administrative unit
# those look identical until you ask which continents are involved.
#
# 24 of these resolved to a point outside the country their books are filed
# under. Some are real: Abaúj-Torna was a county of the Kingdom of Hungary and
# its ground has been Slovak since 1920, which is 320 volumes and the largest
# row in the pile. Gömör the same. Lužice is Lusatia, genuinely split with
# Poland. «Grand Duché du Luxembourg» filed under France really is Luxembourg.
#
# And some are the empire exporting its county names. «Buckinghamshire» in a
# CANADIAN collection is a historic county of Quebec; «Glamorgan» in an
# AUSTRALIAN one is a Tasmanian municipality; «Hampshire» in Canada is on
# Prince Edward Island. Asked of the English Wikipedia, every one of them
# resolves to the English original, and placing those books in England would
# be the exact error this project refuses everywhere else.
#
# The two cases separate cleanly on continent: a border that moved is within
# one, a reused name is across an ocean. So a move is accepted inside a
# continent and refused across one, and the refused rows stay unplaced, which
# is the honest answer for a name nothing has actually resolved.
#
# THIS TABLE IS A SECOND COPY — match-fs-volumes.py holds the same one inside
# its main(), where it cannot be imported from. Two copies of a fact is a
# thing to fix, not to hide: it belongs in geo.py and moving it there means
# changing the matcher too, which is a separate change from this one.
CONTINENT = {}
for _c, _set in {
    "EU": "AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GI GR HU IS IE IT LV "
          "LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB",
    "AM": "AG AR AW BS BB BZ BM BO BR CA KY CL CO CR CU CW DM DO EC SV GL GD GP "
          "GT GY HT HN JM MQ MX MS NI PA PY PE PR KN LC VC SR TT TC US UY VE",
    "AF": "DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH "
          "GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RE RW ST SN SC SL SO "
          "ZA SS SD TZ TG TN UG ZM ZW",
    "AS": "AF AM AZ BH BD BT KH CN GE HK IN ID IR IQ IL JP JO KZ KW KG LA LB MO "
          "MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE "
          "UZ VN YE",
    "OC": "AS AU CK FJ PF GU KI MH FM NR NC NZ NU PW PG WS SB TO TV VU",
}.items():
    for _cc in _set.split():
        CONTINENT.setdefault(_cc, _c)

# facts_for() and its User-Agent, pause and word lists, rather than a second
# copy of them. The module is a script with a hyphen in its name, which import
# cannot spell, so it is loaded by path.
_mvw = SourceFileLoader("_mvw", os.path.join(_HERE, "match-via-wikipedia.py")) \
    .load_module()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    d = json.load(open(SRC, encoding="utf-8"))
    rows = d.get("isAnAdminUnitNotASettlement") or []
    print(f"{len(rows):,} names Wikidata calls an administrative unit, "
          f"{sum(r.get('volumes') or 0 for r in rows):,} volumes\n")

    qids = [r["qid"] for r in rows if r.get("qid")]
    coords, isadmin = {}, {}
    for i in range(0, len(qids), 50):
        c, k = _mvw.facts_for(qids[i:i + 50])
        coords.update(c)
        isadmin.update(k)
        print(f"  asked Wikidata for {min(i + 50, len(qids))}/{len(qids)} "
              f"points")
        time.sleep(_mvw.PAUSE)

    out, no_point, wrong_cc, moved, refused = [], [], [], [], []
    for r in rows:
        q = r.get("qid")
        if not q or q not in coords:
            no_point.append(r)
            continue
        lat, lon = coords[q]
        cc = (r.get("cc") or "").upper()
        # WHERE THE GROUND IS, which is geo.py's rule and the resolver's.
        true_cc = geo.country_of(lat, lon)
        if not true_cc:
            wrong_cc.append((r, None))
            continue
        if true_cc != cc:
            if CONTINENT.get(true_cc) != CONTINENT.get(cc):
                refused.append((r, true_cc))
                continue
            moved.append((r, true_cc))
        out.append({
            "n": r["n"], "cc": cc, "placeCountry": true_cc,
            "volumes": r.get("volumes") or 0,
            "name": r.get("resolvedTo") or r["n"],
            "lat": round(float(lat), 4), "lon": round(float(lon), 4),
            "qid": q, "is": (r.get("wikidataSaysItIs") or "").strip(),
        })

    print(f"\n  {len(out):,} names given a point, "
          f"{sum(r['volumes'] for r in out):,} volumes")
    print(f"  {len(no_point):,} have no P625 on Wikidata and stay unplaced")
    if wrong_cc:
        print(f"  {len(wrong_cc):,} whose point is in no country geo.py knows")
    if refused:
        print(f"  {len(refused):,} refused — the point is on another "
              f"continent, so the name is a reused one and not a moved "
              f"border ({sum(r.get('volumes') or 0 for r, _ in refused):,} "
              f"volumes stay unplaced):")
        for r, tc in sorted(refused, key=lambda x: -(x[0].get('volumes') or 0))[:6]:
            print(f"      {r['n']:<24} filed {r['cc']}, point in {tc}")
    if moved:
        print(f"  {len(moved):,} filed under one country with their ground in "
              f"another, within the continent — a border that moved:")
        for r, tc in sorted(moved, key=lambda x: -(x[0].get('volumes') or 0))[:8]:
            print(f"      {r['n']:<24} {r['cc']} -> {tc}  "
                  f"({r.get('volumes') or 0:,} volumes)")
    print("\n  biggest:")
    for r in sorted(out, key=lambda r: -r["volumes"])[:12]:
        print(f"   {r['volumes']:>5,} {r['cc']} {r['name']:<24} {r['is'][:34]:<34} "
              f"{r['lat']},{r['lon']}")

    if not a.write:
        print("\n  dry run — pass --write to save")
        return
    json.dump({
        "source": "Wikidata (CC0), P625 for the names match-via-wikipedia.py "
                  "identified as administrative units rather than settlements",
        "licence": "CC0",
        "note": ("Names FamilySearch files books under that are provinces, "
                 "counties and comarques rather than towns. They are drawn as "
                 "AREAS — through division_label, so the dot says «(area)» — "
                 "because a book filed to a county must not look like a book "
                 "filed to a parish. The coordinate was already fetched when "
                 "these were identified and was not being written down; this "
                 "file is that omission fixed. Every point is checked against "
                 "geo.country_of() and filed where the ground is, so a county "
                 "of the Kingdom of Hungary whose ground is Slovak today is "
                 "Slovak here."),
        "counts": {"names": len(out),
                   "volumes": sum(r["volumes"] for r in out),
                   "noCoordinate": len(no_point),
                   "groundInAnotherCountry": len(moved),
                   "refusedAsAReusedName": len(refused)},
        "areas": out,
    }, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"\n  -> {OUT}")


if __name__ == "__main__":
    main()
