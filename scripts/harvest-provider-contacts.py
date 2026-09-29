#!/usr/bin/env python3
"""Where to write, for the archives that answer letters rather than clicks.

WHY THIS EXISTS.

Five of Record Atlas's seven access tiers can be reached from a chair. Two
cannot: `catalogue` — «the paper is not photographed, this is a letter, not a
click» — and `onsite`, «somebody has to go, or ask somebody who can». Both told
a reader to write or to travel and then gave them a homepage and nothing else.
David: «when you talk about a "its a letter" is there any way we could add the
"known email / form / address" or institute to contact?»

WHAT IT TAKES, AND FROM WHERE. 305 of the 521 providers already carry a
Wikidata id, put there for other reasons. Wikidata holds, for institutions,
exactly the four things a letter needs — P6375 postal address, P968 email,
P1329 telephone, P281 postcode — under CC0. Measured before writing this:

    postal address   255 of 305   84%
    email            135 of 305   44%
    telephone        132 of 305   43%

NOTHING IS INVENTED AND NOTHING IS INFERRED. A provider with no Wikidata id
gets no contact block; one whose item carries no address gets no address line.
There is no «contact the national archive instead» fallback, because a reader
who writes to the wrong institution loses a month waiting for a reply that was
never going to come. An empty block is a true statement about what this atlas
knows; a plausible one is not.

ADDRESSES ARE LANGUAGE-TAGGED and Wikidata often holds several. The rule is
the local-language form first — an envelope is read by a postal worker in the
country it is going to, not by an English speaker — then English, then
whatever is there.

    python3 scripts/harvest-provider-contacts.py
"""
import json
import io
import os
import sys
import time
import urllib.parse
import urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

SRC = "data/providers.json"
OUT = "data/provider-contacts.json"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = "RecordAtlas/1.0 (https://github.com/daviddef/TheMap)"
CHUNK = 80

# The language an envelope is actually read in, by the country the archive is
# in. Only countries this atlas has providers in; anything else falls through
# to English and then to whatever the item carries.
LANG = {
    "AT": "de", "AR": "es", "BA": "bs", "BE": "nl", "BY": "be", "CZ": "cs",
    "DE": "de", "DK": "da", "EE": "et", "ES": "es", "FI": "fi", "FR": "fr",
    "HR": "hr", "HU": "hu", "IT": "it", "LT": "lt", "LV": "lv", "NL": "nl",
    "NO": "no", "PL": "pl", "PT": "pt", "RO": "ro", "RS": "sr", "RU": "ru",
    "SE": "sv", "SI": "sl", "SK": "sk", "UA": "uk",
}

QUERY = """SELECT ?item ?post ?postLang ?email ?tel ?zip WHERE {
  VALUES ?item { %s }
  OPTIONAL { ?item wdt:P6375 ?post . BIND(LANG(?post) AS ?postLang) }
  OPTIONAL { ?item wdt:P968 ?email }
  OPTIONAL { ?item wdt:P1329 ?tel }
  OPTIONAL { ?item wdt:P281 ?zip }
}"""


def ask(qids):
    q = QUERY % " ".join("wd:" + i for i in qids)
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=120) as fh:
        return json.load(fh)["results"]["bindings"]


def main():
    doc = json.load(io.open(SRC, encoding="utf-8"))
    provs = doc["providers"]
    by_q = {}
    for p in provs:
        if p.get("wikidata"):
            by_q.setdefault(p["wikidata"], []).append(p)
    qids = sorted(by_q)
    print(f"{len(provs)} providers, {len(qids)} with a Wikidata id")

    got = {}
    for i in range(0, len(qids), CHUNK):
        batch = qids[i:i + CHUNK]
        for attempt in range(3):
            try:
                rows = ask(batch)
                break
            except Exception as e:
                if attempt == 2:
                    sys.exit(f"Wikidata refused after 3 tries: {e}")
                print(f"  retrying ({e})")
                time.sleep(8)
        for r in rows:
            q = r["item"]["value"].rsplit("/", 1)[-1]
            g = got.setdefault(q, {"post": {}, "email": set(), "tel": set(), "zip": set()})
            if "post" in r:
                g["post"].setdefault(r.get("postLang", {}).get("value", ""), r["post"]["value"])
            for k in ("email", "tel", "zip"):
                if k in r:
                    g[k].add(r[k]["value"])
        print(f"  {min(i + CHUNK, len(qids)):>4} of {len(qids)} asked")
        time.sleep(1)

    out, n_post, n_mail, n_tel = {}, 0, 0, 0
    for q, g in got.items():
        # One provider row is enough to know the country; several providers
        # may share an item (a national archive with two portals).
        ccs = [c for p in by_q[q] for c in (p.get("countries") or [])]
        want = LANG.get(ccs[0]) if ccs else None
        post = None
        for key in ([want] if want else []) + ["en", ""]:
            if key in g["post"]:
                post = g["post"][key]
                break
        if not post and g["post"]:
            post = sorted(g["post"].values())[0]
        row = {}
        if post:
            row["post"] = post.replace("\n", ", ").strip()
            n_post += 1
        # An institution with two published addresses has two reading rooms,
        # not a contradiction — but a letter needs one, so the shortest is
        # taken and the rest are dropped rather than concatenated into a
        # string nobody could put on an envelope.
        if g["email"]:
            row["email"] = sorted(g["email"], key=len)[0].replace("mailto:", "")
            n_mail += 1
        if g["tel"]:
            row["tel"] = sorted(g["tel"], key=len)[0]
            n_tel += 1
        if g["zip"]:
            row["zip"] = sorted(g["zip"], key=len)[0]
        if row:
            out[q] = row

    json.dump({
        "note": ("Where to write to an archive that does not publish its "
                 "images. Keyed by the provider's Wikidata id, because that "
                 "is what providers.json already carries and several "
                 "providers can share one institution. Built by "
                 "scripts/harvest-provider-contacts.py."),
        "claim": ("ONLY WHAT WIKIDATA STATES. An institution absent from this "
                  "file is one whose item carries no contact details, not one "
                  "that cannot be written to — and no address here was "
                  "inferred from a parent body, a country, or a homepage."),
        "source": "Wikidata (P6375 address, P968 email, P1329 telephone, P281 postcode)",
        "licence": "CC0 1.0 (Wikidata)",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"providersWithAnId": len(qids), "withAnyContact": len(out),
                   "withPostalAddress": n_post, "withEmail": n_mail,
                   "withTelephone": n_tel},
        "contacts": out,
    }, io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n{OUT}: {len(out)} institutions")
    print(f"    postal address  {n_post}")
    print(f"    email           {n_mail}")
    print(f"    telephone       {n_tel}")


if __name__ == "__main__":
    main()
