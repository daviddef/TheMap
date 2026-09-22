#!/usr/bin/env python3
"""France's departmental and communal archives, from Wikidata.

WHY FRANCE WAS A HOLE THE SIZE OF FRANCE.

This atlas had four providers covering France: Bas-Rhin, Haut-Rhin,
Moselle, and a link to Geneanet. Alsace-Moselle and an aggregator, for the
country with one of the deepest register series in Europe.

The reason it stayed that way is worth naming. Geneanet publishes a
catalogue of what it holds, and Geneanet sits behind a Cloudflare managed
challenge whose own page carries «noindex, nofollow» — so the obvious
route to «what collections cover France» is shut, and this project does
not climb bot gates. What it can do is notice that Geneanet is largely an
aggregator OF the archives départementales, and go to them instead.

There are 109 of them on Wikidata and 106 carry both a website and
coordinates. Every département has one, they hold that département's
parish registers and civil registers, and most have put them online. They
are the answer to «whose archive is this ground» for the whole country.

WHAT THIS DOES NOT CLAIM.

Every new row is `access: "unsurveyed"` — «Nobody has walked this one
yet». That is not modesty, it is the truth: nobody here has opened 106
archive sites to see whether the registers are free, paywalled, indexed or
absent. The three Alsace-Moselle rows say «free» because a person checked
them. Marking the rest «free» because departmental archives usually are
would be the map asserting 106 things nobody verified, which is the one
thing it exists not to do.

AND THE COORDINATES ARE CHECKED, because they have lied before.
The audit once found Alessandria's archive in Calabria, 842 km from
itself, and Prato geocoded to Prato Carnico. Wikidata coordinates are
fine until they are not, and a wrong one looks exactly like a right one.
Each archive is therefore measured against the coordinates of the
département it is filed under, and anything improbably far is written to
a review list rather than the map. Overseas départements are the reason
this is not a France bounding box: Réunion and Mayotte are France and are
nowhere near it.
"""
import io, json, math, os, sys, time, urllib.parse, urllib.request

QLEVER = "https://qlever.dev/api/wikidata"
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")

# TWO CLASSES, AND THEY ARE NOT THE SAME ANSWER.
#
# A département's archive is where that département's PARISH AND CIVIL
# REGISTERS are deposited — the series a genealogist actually wants, for
# every commune in it. A commune's archive holds the commune's own
# papers: its copy of the état civil, council deliberations, the cadastre,
# school and electoral rolls. Useful, sometimes the only surviving copy,
# and a different claim. Listing 500 town halls as though each were a
# register office would overstate what this map knows, so the two are
# harvested apart and say different things about themselves.
#
# The distance a coordinate may stray from its own town differs too: a
# département is a region and a commune is a town.
KINDS = {
    "departementales": {
        "qid": "Q2860456",
        "out": "data/departementales.json",
        "prefix": "ad-",
        "maxKm": 120.0,
        "label": "archives départementales",
        "what": ("The archives d\u00e9partementales for {x} \u2014 in France, "
                 "where a d\u00e9partement's parish registers and civil "
                 "registers are deposited. Harvested from Wikidata and not "
                 "yet opened: what is online, and at what price, is "
                 "unchecked."),
    },
    "communales": {
        "qid": "Q604177",
        "out": "data/communales.json",
        "prefix": "ac-",
        "maxKm": 30.0,
        "label": "archives communales",
        "what": ("The municipal archive of {x} \u2014 a French commune's own "
                 "papers: its copy of the \u00e9tat civil, council "
                 "deliberations, the cadastre. NOT the d\u00e9partement's "
                 "register series, which is held by its archives "
                 "d\u00e9partementales. Harvested from Wikidata and not yet "
                 "opened."),
    },
}
KIND = KINDS["departementales"]      # replaced by main() from argv
OUT = KIND["out"]

PREFIXES = """PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
"""

# The archive, its site, where it stands, and the département it serves
# with that département's own coordinates — which is what makes the
# distance check possible.
QUERY_TEMPLATE = PREFIXES + """
SELECT ?a ?al ?site ?coord ?dep ?depl ?depcoord ?code WHERE {
  ?a wdt:P31 wd:%QID% .
  # FRANCE, EXPLICITLY.
  # «archives départementales» is a French institution by definition, so
  # the first version of this query did not bother saying so. «archives
  # communales» is not: Q604177 is the generic municipal archive, and
  # asking it without a country returned 998 rows including the City of
  # Boston Archives, Stadtarchiv Winterthur, the Arxiu Municipal de
  # Sants-Montjuïc and the general archives of Rio de Janeiro — each of
  # which this script was about to describe as «a French commune's own
  # papers». A class that happens to be national is not the same as a
  # constraint, and only one of those survives being reused.
  ?a wdt:P17 wd:Q142 .
  # ABOLISHED ARCHIVES ARE NOT PLACES TO WRITE TO.
  # «Archives de la Seine» and «Archives départementales de Seine-et-Oise»
  # both served départements dissolved in 1968. They came through the first
  # run and were dropped only because they happen to have no website — an
  # accident, not a check. The US county harvest learned the same lesson
  # with P576 and this asks the same question.
  FILTER NOT EXISTS { ?a wdt:P576 ?dissolved }
  ?a rdfs:label ?al . FILTER(LANG(?al) = "fr")
  OPTIONAL { ?a wdt:P856 ?site }
  OPTIONAL { ?a wdt:P625 ?coord }
  OPTIONAL {
    ?a wdt:P131 ?dep .
    ?dep rdfs:label ?depl . FILTER(LANG(?depl) = "fr")
    OPTIONAL { ?dep wdt:P625 ?depcoord }
    OPTIONAL { ?dep wdt:P2586 ?code }
  }
}
"""



def verify(url):
    """Resolve a Wikidata website value to something worth publishing.

    WIKIDATA'S P856 IS OFTEN YEARS OLD. Of 104 departmental archives, 59
    carried a plain http:// URL and two named hosts that no longer resolve
    at all — the same NXDOMAIN this atlas shipped for ARHiNET until
    somebody clicked it. A directory that lies is worse than no directory,
    so every URL is opened before it is published.

    Returns (verdict, url):
      "https"  — https answers, and this is the address to publish
      "http"   — the host is alive but only over http; held back, because
                 this project's data gate requires https and weakening a
                 rule to admit one's own data is the wrong way round
      "dead"   — the host does not resolve; dropped
      "unsure" — no answer, and no reason to call it dead
    A 403 or 418 counts as https WORKING: that is a bot gate answering,
    which says the address is right and that we are not welcome to read
    it, and this atlas links to such places rather than climbing them.
    """
    import socket
    https = "https://" + url.split("://", 1)[-1] if url.startswith("http://") else url
    host = urllib.parse.urlparse(https).netloc.split(":")[0]
    try:
        socket.getaddrinfo(host, None)
    except socket.gaierror:
        return "dead", url
    for candidate in (https, url):
        try:
            req = urllib.request.Request(candidate, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                final = r.geturl()
                if final.startswith("https://"):
                    return "https", final
                return ("https", candidate) if candidate.startswith("https://") \
                    else ("http", final)
        except urllib.error.HTTPError as e:
            # It answered. A gate is not a missing address.
            if candidate.startswith("https://"):
                return "https", candidate
        except Exception:
            continue
    return "unsure", url


def ask(query):
    url = QLEVER + "?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={
        "Accept": "application/sparql-results+json", "User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())["results"]["bindings"]
        except Exception as e:
            # QLever rate-limits, and this project has hammered it before
            # by retrying in a tight loop. Back off properly.
            if attempt == 3:
                raise
            wait = 20 * (attempt + 1)
            print(f"  {e} — waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def point(wkt):
    """'POINT(2.3522 48.8566)' -> (48.8566, 2.3522).

    CASE-INSENSITIVE, because it cost a run. QLever returns «POINT(...)»
    in capitals; matching «Point(» silently parsed nothing and the
    harvest reported all 107 archives as having no coordinates, which
    looks exactly like Wikidata being empty rather than this function
    being wrong.
    """
    if not wkt:
        return None
    w = wkt.strip()
    if not w[:6].upper().startswith("POINT("):
        return None
    try:
        lon, lat = w[6:w.rindex(")")].split()
        return float(lat), float(lon)
    except (ValueError, IndexError):
        return None


def haversine(a, b, c, d):
    R = 6371.0
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def main():
    rows = ask(QUERY_TEMPLATE.replace("%QID%", KIND["qid"]))
    print(f"{len(rows)} rows from Wikidata")

    seen, keep, noplace, faraway = {}, [], [], []
    for r in rows:
        qid = r["a"]["value"].rsplit("/", 1)[-1]
        xy = point(r.get("coord", {}).get("value"))
        site = (r.get("site") or {}).get("value")
        rec = seen.setdefault(qid, {
            "qid": qid, "name": r["al"]["value"], "url": site,
            "lat": xy[0] if xy else None, "lon": xy[1] if xy else None,
            "dep": (r.get("depl") or {}).get("value"),
            "code": (r.get("code") or {}).get("value"),
            "depxy": point((r.get("depcoord") or {}).get("value")),
        })
        # A second binding row can carry the field the first one lacked.
        rec["url"] = rec["url"] or site
        if rec["lat"] is None and xy:
            rec["lat"], rec["lon"] = xy
        rec["dep"] = rec["dep"] or (r.get("depl") or {}).get("value")
        rec["code"] = rec["code"] or (r.get("code") or {}).get("value")
        rec["depxy"] = rec["depxy"] or point((r.get("depcoord") or {}).get("value"))

    for rec in seen.values():
        if rec["lat"] is None or not rec["url"]:
            noplace.append(rec)
            continue
        if rec["depxy"]:
            km = haversine(rec["lat"], rec["lon"], *rec["depxy"])
            rec["kmFromItsDepartement"] = round(km, 1)
            if km > KIND["maxKm"]:
                faraway.append(rec)
                continue
        keep.append(rec)

    # Every surviving URL is opened before it is written down.
    import concurrent.futures as cf
    print(f"opening {len(keep)} archive sites...")
    with cf.ThreadPoolExecutor(8) as ex:
        for rec, (verdict, url) in zip(keep, ex.map(lambda r: verify(r["url"]), keep)):
            rec["urlVerdict"], rec["url"] = verdict, url
    # THE TEST IS THE ADDRESS, NOT WHETHER IT ANSWERED TODAY.
    # Lumping «no answer» in with «http only» held back Haut-Rhin, Vosges,
    # Mayotte and the Alsace collectivité — every one of them an https
    # address that merely timed out while eight requests went at once.
    # Haut-Rhin is already a hand-checked provider here, on https. A slow
    # server is not a bad URL: what this project must not publish is a
    # host that does not resolve, or a scheme its own gate rejects.
    dead = [r for r in keep if r["urlVerdict"] == "dead"]
    httponly = [r for r in keep
                if r["urlVerdict"] != "dead" and not r["url"].startswith("https://")]
    unsure = [r for r in keep if r["urlVerdict"] == "unsure"
              and r["url"].startswith("https://")]
    keep = [r for r in keep
            if r["urlVerdict"] != "dead" and r["url"].startswith("https://")]

    keep.sort(key=lambda r: (r["code"] or "zz", r["name"]))
    out = {
        "note": (f"France's {KIND['label']}, from Wikidata "
                 f"(P31 = {KIND['qid']}). NOTHING HERE HAS BEEN "
                 "OPENED: no claim is made about what any of them puts "
                 "online, which is why every provider row built from this "
                 "file is access «unsurveyed». `kmFromItsDepartement` is "
                 "the distance from the coordinates of the département the "
                 "archive is filed under — a check, not a fact about the "
                 "archive, and the reason `needsReview` exists."),
        "source": "Wikidata via QLever",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"found": len(seen), "usable": len(keep),
                   "missingSiteOrCoordinates": len(noplace),
                   "needsReview": len(faraway),
                   "deadHost": len(dead), "notHttps": len(httponly),
                   "httpsButNoAnswerToday": len(unsure)},
        "archives": keep,
        "needsReview": faraway,
        "missingSiteOrCoordinates": noplace,
        "deadHost": dead,
        "notHttps": httponly,
        "httpsButNoAnswerToday": [r["qid"] for r in unsure],
    }
    out["note"] += (
        " `deadHost` did not resolve on a public resolver and is dropped; "
        "ARHiNET taught this project that a dead link is worse than a "
        "missing one. `notHttps` is alive on http only, which this "
        "project's own data gate refuses — they are real archives and "
        "belong on the map, and the way to get them there is to find "
        "their current address, not to relax the rule to admit them.")
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"{OUT}: {len(keep)} usable, {len(noplace)} without a site or "
          f"coordinates, {len(faraway)} too far from their own département")
    for r in faraway:
        print(f"  REVIEW {r['name'][:46]} — {r.get('kmFromItsDepartement')} km "
              f"from {r['dep']}")
    for r in dead:
        print(f"  DEAD   {r['name'][:46]} — {r['url'][:44]}")
    for r in httponly:
        print(f"  HTTP   {r['name'][:46]} — {r['url'][:44]}")


def merge_providers():
    """Fold the harvest into data/providers.json, without touching curation.

    Rows already written by a person win. Bas-Rhin, Haut-Rhin and Moselle
    carry «free» and a sentence somebody wrote after looking, and this
    must never overwrite that with «unsurveyed» and a template.
    """
    import collections, re, urllib.parse
    prov = json.load(open("data/providers.json"), object_pairs_hook=collections.OrderedDict)
    have_host = {urllib.parse.urlparse(r.get("url") or "").netloc.lower()
                 for r in prov["providers"] if r.get("url")}
    have_id = {r["id"] for r in prov["providers"]}
    d = json.load(open(OUT))

    def slug(name):
        t = name.lower()
        t = re.sub(r"^archives?\s+(d[eé]partementales?|de)\s+", "", t)
        t = re.sub(r"^(de\s+la|du|des|de|d')\s*", "", t)
        t = (t.replace("é", "e").replace("è", "e").replace("ê", "e")
              .replace("à", "a").replace("ô", "o").replace("û", "u")
              .replace("ç", "c").replace("î", "i").replace("ï", "i"))
        t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
        return KIND["prefix"] + t

    def served(name):
        """The place an archive is for, taken out of its own name.

        Wikidata's French labels are not one shape. Most read «archives
        municipales de X», but «Archives Municipales et Métropolitaines de
        Grenoble», «Archives de Nantes», «archives de Bordeaux Métropole»
        and «archives de l'agglomération Évreux Portes de Normandie» all
        exist. The first version stripped «archives départementales » and
        then «archives », which left the connector behind: every row this
        script has written so far says «for de Maine-et-Loire», and the
        communal ones would have said «the municipal archive of
        Municipales et Métropolitaines de Grenoble».

        So: take off the institution words wherever they sit, then the
        connector, and if that leaves nothing keep the whole name rather
        than publish a fragment.
        """
        t = re.sub(r"^\s*[Aa]rchives?\b", "", name)
        for _ in range(3):
            t = re.sub(r"^\s*(d[eé]partementales?|communales?|municipales?"
                       r"|m[eé]tropolitaines?|g[eé]n[eé]rales?|patrimoniales?"
                       r"|et)\b", "", t, flags=re.I)
        t = re.sub(r"^\s*(de\s+la|de\s+l'|de\s+l\u2019|du|des|de|d'|d\u2019)\s*",
                   "", t, flags=re.I)
        t = t.strip(" .,\u2019'")
        return t or name.strip()

    added, skipped = [], []
    for r in d["archives"]:
        host = urllib.parse.urlparse(r["url"]).netloc.lower()
        if host in have_host:
            skipped.append(r["name"])
            continue
        i = slug(r["name"])
        if i in have_id:
            skipped.append(r["name"])
            continue
        have_id.add(i)
        have_host.add(host)
        added.append(collections.OrderedDict([
            ("id", i),
            ("name", r["name"][:1].upper() + r["name"][1:]),
            ("url", r["url"]),
            ("kind", "regional-archive"),
            ("access", "unsurveyed"),
            ("countries", ["FR"]),
            ("what", KIND["what"].format(x=served(r["name"]))),
            ("deepLink", None),
            ("checked", d["harvested"]),
            ("at", collections.OrderedDict([
                ("lat", round(r["lat"], 4)), ("lon", round(r["lon"], 4)),
                ("place", (r.get("dep") or "France") + ", France")])),
            ("wikidata", r["qid"]),
        ]))

    prov["providers"].extend(added)
    io.open("data/providers.json", "w", encoding="utf-8").write(
        json.dumps(prov, ensure_ascii=False, indent=1) + "\n")
    print(f"providers.json: +{len(added)} added, {len(skipped)} already "
          f"present ({', '.join(x[:28] for x in skipped)})")
    print(f"  France now has "
          f"{sum(1 for r in prov['providers'] if 'FR' in (r.get('countries') or []))} "
          f"providers")


if __name__ == "__main__":
    for name in KINDS:
        if "--" + name in sys.argv:
            KIND = KINDS[name]
            OUT = KIND["out"]
            break
    if "--merge" in sys.argv:
        merge_providers()
    else:
        main()
