#!/usr/bin/env python3
"""Ask every national open-data portal we can reach for surname data.

WHY A SWEEP AND NOT ANOTHER AFTERNOON PER COUNTRY.

Eight countries were checked one at a time, and four of those verdicts
turned out to be wrong in a single day — Croatia, Denmark, Sweden and
Belgium — every one because somebody searched a machine-readable index
and then made a claim about an institution. The lesson was written down
four times. The obvious next step is not a ninth afternoon: it is to ask
every portal at once, in its own language, and write down exactly what
each one answered.

This is a FINDER, not a harvester. It returns candidate datasets for a
person to look at. Nothing it prints is a verdict, because «the CKAN
search found nothing» is precisely the sentence that was wrong four
times — the data was on the website each time. A null here means «this
portal's index has nothing under these words», which is a much smaller
claim than «this country does not publish surnames», and the output says
so in those words.
"""
import json, sys, time, urllib.parse, urllib.request

UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")

# The word for «surname» in the language the portal is catalogued in.
# Missing one is how a sweep like this quietly finds nothing.
#
# FIVE OF THESE ANSWERED WITH AN ERROR AND NOT A VERDICT, and an error is
# not a negative — that distinction is the whole reason this file exists.
# Chased: Australia had moved its API under /data/, Chile needed a modern
# TLS client, Colombia is Socrata rather than CKAN and wanted a different
# path and result shape. All three answer now and none of them publishes
# surnames. Mexico still returns 403 to any client and Brazil 401 without
# an API key, so those two remain unanswered rather than answered no.
PORTALS = [
    ("IE", "data.gov.ie",     "https://data.gov.ie/api/3/action/package_search",      ["surname", "family name"]),
    ("LV", "data.gov.lv",     "https://data.gov.lv/dati/api/3/action/package_search", ["uzvārd", "vārdu"]),
    ("EE", "avaandmed.ee",    "https://avaandmed.eesti.ee/api/datasets/search",       ["perekonnanimi"]),
    ("PT", "dados.gov.pt",    "https://dados.gov.pt/api/1/datasets/",                 ["apelido", "nome"]),
    ("ES", "datos.gob.es",    "https://datos.gob.es/apidata/catalog/dataset/title/apellidos", []),
    ("RO", "data.gov.ro",     "https://data.gov.ro/api/3/action/package_search",      ["nume de familie"]),
    ("SK", "data.gov.sk",     "https://data.gov.sk/api/3/action/package_search",      ["priezvisko"]),
    ("SI", "podatki.gov.si",  "https://podatki.gov.si/api/3/action/package_search",   ["priimek"]),
    ("HR", "data.gov.hr",     "https://data.gov.hr/api/3/action/package_search",      ["prezime"]),
    ("GR", "data.gov.gr",     "https://data.gov.gr/api/3/action/package_search",      ["επώνυμο"]),
    ("AU", "data.gov.au",     "https://data.gov.au/data/api/3/action/package_search", ["surname"]),
    ("CA", "open.canada.ca",  "https://open.canada.ca/data/api/3/action/package_search", ["surname", "nom de famille"]),
    ("NZ", "catalogue.data.govt.nz", "https://catalogue.data.govt.nz/api/3/action/package_search", ["surname"]),
    ("MX", "datos.gob.mx",    "https://datos.gob.mx/busca/api/3/action/package_search", ["apellido"]),
    ("BR", "dados.gov.br",    "https://dados.gov.br/api/3/action/package_search",     ["sobrenome"]),
    ("AR", "datos.gob.ar",    "https://datos.gob.ar/api/3/action/package_search",     ["apellido"]),
    ("CL", "datos.gob.cl",    "https://datos.gob.cl/api/3/action/package_search",     ["apellido"]),
    # Socrata, not CKAN, and a different result shape.
    ("CO2", "datos.gov.co",   "https://www.datos.gov.co/api/catalog/v1",              ["apellido"]),
    ("UY", "catalogodatos.gub.uy", "https://catalogodatos.gub.uy/api/3/action/package_search", ["apellido"]),
]


def get(url, timeout=45):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def titles(payload):
    """Pull dataset titles out of whichever catalogue software answered."""
    out = []
    if not isinstance(payload, (dict, list)):
        return out
    if isinstance(payload, list):
        for x in payload[:40]:
            if isinstance(x, dict):
                out.append(str(x.get("name") or x.get("title") or "")[:90])
        return out
    res = payload.get("result")
    if isinstance(res, dict):
        for x in (res.get("results") or [])[:40]:
            out.append(str(x.get("title") or x.get("name") or "")[:90])
    elif isinstance(res, list):
        for x in res[:40]:
            if isinstance(x, dict):
                out.append(str(x.get("title") or x.get("name") or "")[:90])
    # Socrata (datos.gov.co) nests the title under results[].resource.name
    for x in (payload.get("results") or [])[:40]:
        if isinstance(x, dict) and isinstance(x.get("resource"), dict):
            out.append(str(x["resource"].get("name") or "")[:90])
    for key in ("data", "datasets", "items"):
        for x in (payload.get(key) or [])[:40]:
            if isinstance(x, dict):
                out.append(str(x.get("title") or x.get("name") or "")[:90])
    return [t for t in out if t]


def main():
    found = {}
    for cc, host, base, words in PORTALS:
        hits, err = [], None
        for w in (words or [""]):
            url = base
            if words:
                sep = "&" if "?" in base else "?"
                if "package_search" in base:
                    url = f"{base}{sep}q={urllib.parse.quote(w)}&rows=40"
                elif "datasets/" in base:
                    url = f"{base}{sep}q={urllib.parse.quote(w)}&page_size=40"
                else:
                    url = f"{base}{sep}q={urllib.parse.quote(w)}"
            try:
                hits += titles(get(url))
            except Exception as e:
                err = str(e)[:70]
            time.sleep(0.6)
        # CKAN RELEVANCE IS NOT A MATCH.
        # Searching data.gov.ie for «surname» returns burnt-out vehicles
        # and accessible parking spaces, because CKAN ranks loosely and
        # returns its best forty regardless. Reporting those as
        # «35 candidates» buries the one real hit — Argentina's
        # «Distribución de apellidos» — in nineteen portals of noise, and
        # a finder nobody can read is a finder nobody uses.
        # The title has to contain the word actually asked for.
        want = [w.lower() for w in (words or []) if w]
        keep = sorted({t for t in hits
                       if any(w in t.lower() for w in want)}) if want \
            else sorted(set(hits))
        found[cc] = {"portal": host, "error": err, "titles": keep[:12],
                     "n": len(keep)}
        mark = "!" if keep else ("?" if err else ".")
        print(f" {mark} {cc} {host:<26} {len(keep):>3} candidates"
              + (f"  [{err}]" if err else ""))
        for t in keep[:4]:
            print(f"       {t}")
    json.dump({"note": ("Candidate surname datasets found in national "
                        "open-data catalogues. A FINDER, NOT A VERDICT: an "
                        "empty list means this portal's index has nothing "
                        "under these words, which is a far smaller claim "
                        "than «this country publishes no surnames» — the "
                        "sentence that was wrong for Croatia, Denmark, "
                        "Sweden and Belgium on one day, because each of "
                        "them published on a website the catalogue did not "
                        "index."),
               "swept": time.strftime("%Y-%m-%d"), "portals": found},
              open("data/_surname-portal-sweep.json", "w"),
              ensure_ascii=False, indent=1)
    print("\ndata/_surname-portal-sweep.json written")


if __name__ == "__main__":
    main()
