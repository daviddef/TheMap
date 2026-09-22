#!/usr/bin/env python3
"""Give a country its first provider: the national archive.

data/world-archives.json holds 393 national archives and libraries across
164 countries, every one with a URL that answered when it was harvested.
They already do useful work — the panel falls back to them so that
clicking a place in Bolivia stops answering with FamilySearch and nothing
else — but they are not providers, so 123 of those countries still have
no institution in the directory, no dot on the archives layer, and no
answer to «whose archive do I write to».

Promoted with the same discipline as the French and German runs: the URL
is opened again before it is written down, and every row is access
«unsurveyed», because a national archive's existence says nothing about
what it holds for a genealogist or what it costs to look.

A COORDINATE IS NOT OPTIONAL AND IS NOT INVENTED. This layer is drawn on
a map. world-archives.json carries no position, so each row is joined to
the Wikidata archive harvest by its QID; the ones Wikidata has no
coordinate for are reported and skipped. Placing a national archive at
its country's centroid would put a dot in a field and call it the
national archive.
"""
import collections, io, json, os, sys, time
import concurrent.futures as cf

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
sys.path.insert(0, "scripts")
from importlib.machinery import SourceFileLoader
_pa = SourceFileLoader("_pa", "scripts/promote-archives.py").load_module()
verify, slug = _pa.verify, _pa.slug

WHAT = ("{x} — {k} of {c}. Promoted so the country has somewhere to write "
        "to at all; its address was opened and nothing else about it has "
        "been checked, including whether it holds anything genealogical.")


def main():
    write = "--write" in sys.argv
    wa = json.load(open("data/world-archives.json"))["archives"]
    wd = {r["q"]: r for r in
          json.load(open("data/archives-wikidata.json"))["archives"]}
    prov = json.load(open("data/providers.json"),
                     object_pairs_hook=collections.OrderedDict)
    cn = json.load(open("site/public/index.json")).get("countries") or {}

    have_cc = set()
    for p in prov["providers"]:
        for cc in p.get("countries") or []:
            have_cc.add(cc)

    def norm(u):
        u = (u or "").lower().rstrip("/")
        for pre in ("https://", "http://"):
            if u.startswith(pre):
                return u[len(pre):]
        return u
    have_url = {norm(r.get("url")) for r in prov["providers"] if r.get("url")}
    have_id = {r["id"] for r in prov["providers"]}

    cand, noxy = [], []
    for r in wa:
        if r.get("status") != "ok" or r["cc"] in have_cc:
            continue
        g = wd.get(r.get("wikidata"))
        (cand if g else noxy).append((r, g))
    print(f"{len(cand)} candidates with a position, "
          f"{len(noxy)} skipped for having none")

    with cf.ThreadPoolExecutor(8) as ex:
        checked = list(ex.map(lambda t: (t[0], t[1], *verify(t[0]["url"])), cand))

    added, dropped = [], collections.Counter()
    for r, g, verdict, url in checked:
        if verdict != "https" or norm(url) in have_url:
            dropped[verdict if verdict != "https" else "duplicate-url"] += 1
            continue
        i = slug("na-", r["cc"].lower() + "-" + r["name"])
        if i in have_id:
            dropped["duplicate-id"] += 1
            continue
        have_id.add(i); have_url.add(norm(url))
        kind = ("national archive" if r.get("kind") == "national-archive"
                else "national library")
        added.append(collections.OrderedDict([
            ("id", i), ("name", r["name"]), ("url", url),
            ("kind", r.get("kind") or "national-archive"),
            ("access", "unsurveyed"), ("countries", [r["cc"]]),
            ("what", WHAT.replace("{x}", r["name"]).replace("{k}", kind)
                         .replace("{c}", cn.get(r["cc"], r["cc"]))),
            ("deepLink", None), ("checked", time.strftime("%Y-%m-%d")),
            ("at", collections.OrderedDict([("lat", round(g["y"], 4)),
                                            ("lon", round(g["x"], 4)),
                                            ("place", cn.get(r["cc"], r["cc"]))])),
            ("wikidata", r.get("wikidata")),
        ]))

    gained = {r["countries"][0] for r in added} - have_cc
    print(f"{len(added)} to add, {len(gained)} countries gaining their first "
          f"provider; dropped: {dict(dropped)}")
    if not write:
        print("(dry run — pass --write to apply)")
        return
    prov["providers"].extend(added)
    io.open("data/providers.json", "w", encoding="utf-8").write(
        json.dumps(prov, ensure_ascii=False, indent=1) + "\n")
    cc = set()
    for p in prov["providers"]:
        for c in p.get("countries") or []:
            cc.add(c)
    print(f"written. {len(prov['providers'])} providers across {len(cc)} countries")


if __name__ == "__main__":
    main()
