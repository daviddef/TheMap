#!/usr/bin/env python3
"""PROPOSE a Wikidata id for catalogue rows that lack one — never write it.

A Wikidata id is what gives an archive its postal address, e-mail and telephone, and 1,355 of the catalogue's rows have none. A wrong id would hang another
institution's address on the row, so this only PROPOSES: it reads data/archives-wikidata.json (Wikidata's archives with their websites) and data/world-archives.json
and lists, for each row without an id, the Wikidata item whose official website is the SAME HOST (and, where the row names one, the same country). A proposal carries
the evidence (the two URLs). A person (or a later script run with explicit sign-off) decides.

    python3 scripts/propose-wikidata.py             # summary
    python3 scripts/propose-wikidata.py --write     # data/_wikidata-proposals.json
"""
import collections, json, os, sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def host(u):
    try:
        h = urlparse(u if "//" in u else "//" + u).netloc.lower().split(":")[0]
    except Exception:
        return ""
    return h[4:] if h.startswith("www.") else h


def main():
    prov = json.load(open("data/providers.json", encoding="utf-8"))["providers"]
    by_host = collections.defaultdict(list)
    for a in json.load(open("data/archives-wikidata.json", encoding="utf-8"))["archives"]:
        for s in a.get("sites") or []:
            by_host[host(s)].append(dict(q=a["q"], name=a["n"], cc=a.get("cc"), site=s, src="archives-wikidata.json"))
    for a in json.load(open("data/world-archives.json", encoding="utf-8"))["archives"]:
        if a.get("url"):
            by_host[host(a["url"])].append(dict(q=a["wikidata"], name=a["name"], cc=a.get("cc"), site=a["url"], src="world-archives.json"))
    used = collections.Counter(p.get("wikidata") for p in prov if p.get("wikidata"))
    out, amb = [], []
    for p in prov:
        if p.get("wikidata") or not p.get("url"):
            continue
        h = host(p["url"])
        c = [x for x in by_host.get(h, []) if not x["cc"] or not p.get("countries") or x["cc"] in p["countries"] or "*" in p["countries"]]
        # one item per host, dedupe by id
        seen, uniq = set(), []
        for x in c:
            if x["q"] not in seen:
                seen.add(x["q"])
                uniq.append(x)
        if not uniq:
            continue
        rec = {"id": p["id"], "name": p["name"], "url": p["url"], "countries": p.get("countries"), "candidates": uniq}
        # a host shared by many institutions (a city portal) proves nothing: only a single candidate on a host that no other row uses counts as a proposal
        same_host_rows = [q["id"] for q in prov if host(q.get("url") or "") == h]
        (out if len(uniq) == 1 and len(same_host_rows) == 1 and used[uniq[0]["q"]] == 0 else amb).append(rec)
    print(f"rows without an id: {sum(1 for p in prov if not p.get('wikidata'))}; clear proposals: {len(out)}; ambiguous (shared host or several items or id already used): {len(amb)}")
    if "--write" in sys.argv:
        json.dump({"note": "PROPOSALS ONLY. Each row has no Wikidata id; the item listed has the same official website host (and country). A person confirms before providers.json changes: an id brings the institution's address, e-mail and telephone, and a wrong one hangs another institution's contact on the row.",
                   "proposals": out, "ambiguous": amb}, open("data/_wikidata-proposals.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        open("data/_wikidata-proposals.json", "a").write("\n")


if __name__ == "__main__":
    main()
