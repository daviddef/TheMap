#!/usr/bin/env python3
"""The unplaced volumes, resolved through the name a place used to have.

WHAT THIS IS FOR. data/fs-volumes-unplaced.json holds 257,524 volumes under
16,541 names FamilySearch has books for and this atlas cannot place. A reader
whose parish is in that pile is told there is nothing.

WHAT THE PILE TURNED OUT TO BE. The largest country in it is ITALY — 44,387
volumes — which is also the country with the best gazetteer coverage here,
63,163 places. That asymmetry is the whole clue: these are not villages nobody
has mapped, they are names that no longer exist. Traetto was renamed Minturno
in 1879. Caccavone became Poggio Sannita in 1921. Pietrafesa became Satriano di
Lucania in 1887. FamilySearch files a register under the name on its spine.

AND THE SOURCES THIS ATLAS ALREADY HOLDS DO NOT KNOW THEM. Measured, not
assumed: of 1,411 unplaced Italian names, the gazetteer — names and GeoNames
alternates together — knows ZERO. Minturno's Wikidata item carries no Italian
aliases at all. Istat publishes administrative variations and the downloadable
file begins in 1991, a century after the renames that matter; the older history
is in SITUAS, behind a JavaScript application.

WIKIPEDIA KNOWS THEM, AS REDIRECTS. `Caccavone` redirects to `Poggio Sannita`,
and that redirect is Wikipedia's own editorial statement that they are one
place — not a resemblance, which is the standard this atlas refuses everywhere
else. Each country is asked in ITS OWN language edition, fifty titles a call.

THE COUNTRY IS CHECKED AGAINST THE COORDINATES, NOT TAKEN ON TRUST. Every
resolved point is put through geo.country_of(), whose own docstring is this
exact lesson: guessing a country from the importer's context is how a Carnian
comune got filed as Croatian, and asking the coordinates is how it stops. A
point that lands outside the country the volumes are filed under is REJECTED
and counted, not quietly kept.

IT FAILS SAFE. An ambiguous old name — `Laureana`, which is two different
comuni today — lands on a disambiguation page, and a disambiguation page has no
coordinates, so it is skipped rather than guessed at.

WHAT IT WILL NOT DO. Over half the Italian names have no article in any form:
1,055 names and 23,175 volumes. Those are not a matcher problem and nothing
here invents a coordinate for them.
"""
import json, os, sys, time, urllib.parse, urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
os.chdir(os.path.dirname(_HERE))
import geo                                     # noqa: E402

UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas resolving historical place names)")
OUT = "data/fs-volumes-wikipedia.json"
BATCH = 50
PAUSE = 0.2

# WHICH WIKIPEDIA TO ASK. The old name of an Italian comune is an Italian
# word and lives in the Italian Wikipedia; asking the English one for
# «Caccavone» finds nothing. Only countries with a clear majority language
# are listed — a country whose names could be in either of two languages is
# left out rather than asked in the wrong one. `en` is the fallback for the
# anglophone ones and for nothing else.
LANG = {
    "IT": "it", "DE": "de", "AT": "de", "CH": "de", "SE": "sv", "NO": "no",
    "DK": "da", "FI": "fi", "NL": "nl", "BE": "nl", "CZ": "cs", "SK": "sk",
    "PL": "pl", "HU": "hu", "RO": "ro", "RU": "ru", "BY": "be", "UA": "uk",
    "BG": "bg", "RS": "sr", "HR": "hr", "SI": "sl", "GR": "el", "PT": "pt",
    "ES": "es", "MX": "es", "AR": "es", "CL": "es", "FR": "fr", "TR": "tr",
    "US": "en", "GB": "en", "CA": "en", "AU": "en", "NZ": "en", "IE": "en",
    # A SECOND PASS, BECAUSE THE FIRST TABLE WAS THE GAP. Thirty-six countries
    # were listed and every other one was skipped without being asked —
    # 1,274 names and 19,167 volumes, with the Philippines alone holding
    # 6,591. These are the rest of the countries that carry a hundred volumes
    # or more, each sent to the edition a place there is most likely written
    # in.
    #
    # THE PHILIPPINES WAS SENT TO `es` ON AN ARGUMENT THAT DID NOT SURVIVE
    # BEING TESTED — that parish registers there are Spanish and English long
    # before they are Tagalog, so the Spanish edition would know the old
    # names. Fifty Philippine names, asked of all three: es found 46, en 48,
    # tl 48, and all three returned the same ten coordinates. The argument was
    # plausible and made no difference, so the edition with the most articles
    # is the one used. Asking the LOCAL edition still matters in general —
    # «Caccavone» exists only in it.wikipedia — but it is a rule about where a
    # name is written down, not a story about who colonised whom.
    "PH": "en", "MD": "ro", "JP": "ja", "ZW": "en", "CN": "zh", "GU": "en",
    "NI": "es", "ZA": "af", "BB": "en", "ID": "id", "PY": "es", "IN": "en",
    "CK": "en", "CV": "pt", "BR": "pt", "IM": "en", "FM": "en", "CR": "es",
    "JM": "en", "LS": "en", "AM": "hy", "PR": "es", "DO": "es", "CU": "es",
    "VE": "es", "CO": "es", "PE": "es", "EC": "es", "BO": "es", "GT": "es",
    "HN": "es", "SV": "es", "PA": "es", "UY": "es", "LU": "fr", "LI": "de",
    "EE": "et", "LV": "lv", "LT": "lt", "IS": "is", "MT": "mt", "AL": "sq",
    "MK": "mk", "BA": "bs", "ME": "sr", "GE": "ka", "AZ": "az", "KZ": "ru",
    "IL": "he", "EG": "ar", "MA": "ar", "TN": "ar", "DZ": "ar", "VN": "vi",
    "TH": "th", "KR": "ko", "MY": "ms", "SG": "en", "NG": "en", "GH": "en",
    "KE": "en", "TZ": "en", "UG": "en", "ZM": "en", "MW": "en", "NA": "af",
    "MZ": "pt", "AO": "pt", "FJ": "en", "TO": "en", "WS": "en", "VU": "en",
    "PG": "en", "SB": "en", "KI": "en", "TV": "en", "NR": "en", "PW": "en",
    "MH": "en", "AS": "en", "VI": "en", "BM": "en", "BS": "en", "TT": "en",
    "GY": "en", "SR": "nl", "BZ": "en", "AG": "en", "DM": "en", "GD": "en",
    "KN": "en", "LC": "en", "VC": "en", "AI": "en", "KY": "en", "MS": "en",
    "TC": "en", "VG": "en", "FO": "da", "GL": "da", "AD": "ca", "MC": "fr",
    "SM": "it", "VA": "it", "CY": "el", "LB": "ar", "SY": "ar", "JO": "ar",
    "IQ": "ar", "IR": "fa", "PK": "ur", "BD": "bn", "LK": "si", "NP": "ne",
    "MM": "my", "KH": "km", "LA": "lo", "MN": "mn", "TW": "zh", "HK": "zh",
}


def ask(lang, titles):
    u = (f"https://{lang}.wikipedia.org/w/api.php?action=query&format=json"
         "&redirects=1&prop=coordinates|pageprops&ppprop=wikibase_item"
         "&titles=" + urllib.parse.quote("|".join(titles)))
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:                                        # noqa: BLE001
        return None


# A REGION IS NOT A DOT. «Toscana» carries 1,001 volumes and resolves
# perfectly to the Italian region — and putting those volumes on a point would
# plant them in a field in the Tuscan hills and tell a reader that is where the
# registers are. 502 of the unplaced names are admin units like this, holding
# 10,864 volumes. They are a real finding and they are not settlements, so they
# are set aside under their own heading rather than placed or discarded.
#
# What counts as one is read from Wikidata rather than guessed from the name:
# the English label of whatever the item is an instance of. That works across
# countries without a table of every country's own word for a county.
ADMIN_WORD = ("region", "province", "county", "oblast", "department",
              "district", "voivodeship", "prefecture", "canton", "governorate",
              "state of", "comarca", "okres", "powiat", "megye", "län",
              "metropolitan city", "arrondissement", "krai", "raion")

# AND A TOWN WITH COUNTY RIGHTS IS STILL A TOWN. A first pass tested only for
# the words above and set aside Sopron, Győr and Esztergom — 1,367 volumes
# between them — because Wikidata calls each one a «city with county rights»,
# which is a Hungarian town status and contains the word «county». They are
# towns. So a settlement word WINS: a thing is only set aside when nothing it
# is an instance of is a settlement at all, which is true of Toscana and is
# not true of Sopron.
SETTLEMENT_WORD = ("town", "city", "municipality", "village", "commune",
                   "hamlet", "settlement", "locality", "parish", "borough",
                   "comune", "human settlement", "big village")


def facts_for(qids):
    """P625 and what the thing IS, from Wikidata, in two batched calls."""
    if not qids:
        return {}, {}
    def _get(u):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:                                    # noqa: BLE001
            return {}
    d = _get("https://www.wikidata.org/w/api.php?action=wbgetentities"
             "&format=json&props=claims&ids=" + "|".join(qids))
    coords, kinds, want = {}, {}, set()
    for qid, e in (d.get("entities") or {}).items():
        for c in (e.get("claims") or {}).get("P625", []):
            v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value")
            if v and v.get("latitude") is not None:
                coords[qid] = (v["latitude"], v["longitude"])
                break
        ks = []
        for c in (e.get("claims") or {}).get("P31", []):
            v = (c.get("mainsnak") or {}).get("datavalue", {}).get("value")
            if isinstance(v, dict) and v.get("id"):
                ks.append(v["id"]); want.add(v["id"])
        kinds[qid] = ks
    labels = {}
    want = list(want)[:50]
    if want:
        time.sleep(PAUSE)
        d2 = _get("https://www.wikidata.org/w/api.php?action=wbgetentities"
                  "&format=json&props=labels&languages=en&ids=" + "|".join(want))
        for qid, e in (d2.get("entities") or {}).items():
            labels[qid] = ((e.get("labels") or {}).get("en") or {}).get("value", "")
    isadmin = {}
    for qid, ks in kinds.items():
        lab = " · ".join(labels.get(k, "") for k in ks).lower()
        if any(w in lab for w in SETTLEMENT_WORD):
            isadmin[qid] = (None, lab)            # a settlement, whatever else
        else:
            isadmin[qid] = (next((w for w in ADMIN_WORD if w in lab), None), lab)
    return coords, isadmin


def main():
    only = sys.argv[1].upper() if len(sys.argv) > 1 else None
    d = json.load(open("data/fs-volumes-unplaced.json", encoding="utf-8"))
    names = [r for r in d["names"] if not only or r["cc"] == only]
    bycc = {}
    for r in names:
        bycc.setdefault(r["cc"], []).append(r)

    placed, moved, noarticle, nolang, admin = [], [], [], [], []
    for cc in sorted(bycc, key=lambda c: -sum(r["volumes"] for r in bycc[c])):
        lang = LANG.get(cc)
        rows = bycc[cc]
        if not lang:
            nolang += rows
            continue
        print(f"{cc} ({lang}.wikipedia): {len(rows):,} names, "
              f"{sum(r['volumes'] for r in rows):,} volumes", flush=True)
        for i in range(0, len(rows), BATCH):
            batch = rows[i:i + BATCH]
            j = ask(lang, [r["n"] for r in batch])
            time.sleep(PAUSE)
            if not j:
                continue
            q = j.get("query", {})
            norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
            rd = {x["from"]: x["to"] for x in q.get("redirects", [])}
            pages = {p.get("title"): p for p in (q.get("pages") or {}).values()}
            pending = []
            for r in batch:
                t0 = norm.get(r["n"], r["n"])
                t = rd.get(t0, t0)
                p = pages.get(t)
                if not p or "missing" in p:
                    noarticle.append(r)
                    continue
                qid = (p.get("pageprops") or {}).get("wikibase_item")
                co = (p.get("coordinates") or [{}])[0]
                lat, lon = co.get("lat"), co.get("lon")
                if lat is None and qid:
                    pending.append((r, t, qid, t != t0))
                    continue
                if lat is None:
                    noarticle.append(r)
                    continue
                pending.append((r, t, qid, t != t0, lat, lon))
            # ASK ABOUT EVERY ONE, not only the ones missing a coordinate:
            # what a thing IS has to be known before it is placed, and an
            # article that carries its own coordinate is just as likely to be
            # a province as one that does not.
            allq = [x[2] for x in pending if x[2]]
            got, kindof = facts_for(allq) if allq else ({}, {})
            if allq:
                time.sleep(PAUSE)
            for item in pending:
                if len(item) == 6:
                    r, t, qid, viaredir, lat, lon = item
                else:
                    r, t, qid, viaredir = item
                    if qid not in got:
                        noarticle.append(r)
                        continue
                    lat, lon = got[qid]
                # WHERE IT ACTUALLY IS, WHICH IS NOT ALWAYS WHERE IT IS FILED.
                #
                # A first run threw away every match whose coordinate landed in
                # another country, and the Italian list showed what that cost:
                # San Michele di Postumia, Capriva nel Carso, Alber di Sesana
                # for Avber, Poverio for Povir — Italian names for the Julian
                # March, ground that was Italian when the register was written
                # and has been Slovene since 1947. Calino is the Italian name
                # for Kalymnos, which Italy held from 1912 to 1947. Not one of
                # them is a bad match; all of them were correct, and all of
                # them were discarded for being correct about a border.
                #
                # geo.py exists for this and says so: the disagreement is
                # either a coarse outline or «the SOURCE filing by a polity
                # that no longer exists». So the match is kept, the ground
                # decides where the dot goes, and both the country the volumes
                # are FILED under and the country they are IN are written down.
                # Nothing is merged into one confident answer.
                # A REGION IS NOT A DOT — checked before anything else, so
                # that «Toscana» is never planted in a Tuscan field.
                word, lab = kindof.get(qid, (None, ""))
                if word:
                    admin.append({"n": r["n"], "cc": r["cc"],
                                  "volumes": r["volumes"], "resolvedTo": t,
                                  "wikidataSaysItIs": lab[:80], "qid": qid})
                    continue
                where = geo.country_of(lat, lon)
                if where != r["cc"]:
                    moved.append({"n": r["n"], "filedUnder": r["cc"],
                                  "nowIn": where, "volumes": r["volumes"],
                                  "resolvedTo": t, "lat": round(lat, 5),
                                  "lon": round(lon, 5), "qid": qid,
                                  "km": round(geo.km_to(lat, lon, r["cc"]), 1)
                                        if where else None,
                                  "how": "redirect" if viaredir else "article"})
                    continue
                placed.append({"n": r["n"], "cc": r["cc"], "volumes": r["volumes"],
                               "resolvedTo": t, "lat": round(lat, 5),
                               "lon": round(lon, 5), "qid": qid,
                               "how": "redirect" if viaredir else "article",
                               # THE DOT IS THE MODERN PLACE, NOT THE OLD NAME.
                               # `gazetteer` is what match-fs-volumes.py names
                               # the promoted place, and this atlas's whole
                               # premise is that Gallignana finds Gračišće —
                               # the dot is Minturno and Traetto is a way in,
                               # not a second dot beside it.
                               "gazetteer": t,
                               "why": (f"{LANG.get(r['cc'], '??')}.wikipedia "
                                       + ("redirects" if viaredir else "has")
                                       + f" «{r['n']}» "
                                       + ("to " if viaredir else "as ")
                                       + f"«{t}»")})

    tot = lambda rs: sum(r["volumes"] for r in rs)
    doc = {
        "source": "Wikipedia, per country in its own language edition, following redirects",
        "licence": ("CC BY-SA 4.0 (Wikipedia) — what is taken is which modern "
                    "article an old place name resolves to, and the coordinate "
                    "on that article; no prose is copied."),
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("Old place names resolved to the modern article that answers "
                 "to them. A redirect is the encyclopaedia's own statement that "
                 "two names are one place. EVERY COORDINATE IS CHECKED against "
                 "the country the volumes are filed under, with geo.country_of, "
                 "and one that lands in a different country is kept under "
                 "`theGroundIsInAnotherCountryNow` with BOTH the country it is "
                 "filed under and the country it is in — the Julian March and "
                 "the Italian Dodecanese are filed Italian and are not in "
                 "Italy. A name with no article, or one that lands on a "
                 "disambiguation page — which carries no coordinate — is left "
                 "unplaced; nothing here is placed on resemblance."),
        "counts": {
            "placed": len(placed), "placedVolumes": tot(placed),
            "viaRedirect": sum(1 for p in placed if p["how"] == "redirect"),
            "theGroundIsInAnotherCountryNow": len(moved),
            "movedVolumes": tot(moved),
            "noArticleOrNoCoordinate": len(noarticle),
            "noArticleVolumes": tot(noarticle),
            "isAnAdminUnitNotASettlement": len(admin),
            "adminUnitVolumes": tot(admin),
            "countryHasNoLanguageListed": len(nolang),
            "noLanguageVolumes": tot(nolang),
        },
        "placed": sorted(placed, key=lambda r: -r["volumes"]),
        "theGroundIsInAnotherCountryNow": sorted(moved, key=lambda r: -r["volumes"]),
        "isAnAdminUnitNotASettlement": sorted(admin, key=lambda r: -r["volumes"]),
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = doc["counts"]
    print(f"\n-> {OUT}")
    print(f"   placed              {c['placed']:>6,} names  {c['placedVolumes']:>8,} volumes"
          f"  ({c['viaRedirect']:,} via a redirect)")
    print(f"   ground now elsewhere{c['theGroundIsInAnotherCountryNow']:>6,} names  {c['movedVolumes']:>8,} volumes")
    print(f"   an admin unit       {c['isAnAdminUnitNotASettlement']:>6,} names  {c['adminUnitVolumes']:>8,} volumes")
    print(f"   no article/coord    {c['noArticleOrNoCoordinate']:>6,} names  {c['noArticleVolumes']:>8,} volumes")
    print(f"   no language listed  {c['countryHasNoLanguageListed']:>6,} names  {c['noLanguageVolumes']:>8,} volumes")


if __name__ == "__main__":
    main()
