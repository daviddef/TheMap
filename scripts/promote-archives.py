#!/usr/bin/env python3
"""Promote archives from the unchecked Wikidata layer into providers.

THE LAYER IS NOT THE DIRECTORY, AND THE DIFFERENCE IS THE POINT.

data/archives-wikidata.json holds 10,786 institutions with coordinates
and 5,276 with websites. They are drawn apart from the curated providers
because nobody here has opened them, and a great many are corporate
record offices, film archives and museum collections with nothing
genealogical in them. Turning the whole layer into providers would say
this project has checked ten thousand institutions. It has not.

What CAN be done at scale is narrower and honest: for a given country,
promote the institutions whose NAME says what they are — Landesarchiv,
Landeskirchliches Archiv, Arquivo Público do Estado — open every URL
before writing it down, and mark every one `unsurveyed`, because the
name tells you the kind of body and not one thing about what is online
or what it costs.

This is the French départementales pattern generalised. That run added
204 providers to a country that had four, and the useful part was what
it refused: two hosts that no longer resolved, two archives serving
départements abolished in 1968, and one whose only working address was a
generic transparency portal that it would have been a lie to label.

    python3 scripts/promote-archives.py --cc DE \\
        --match "Landesarchiv|Staatsarchiv|Landeskirchliches Archiv" \\
        --prefix de- --kind regional-archive \\
        --what "A German state or church archive. {x}."
"""
import argparse, collections, io, json, os, re, socket, sys
import urllib.error, urllib.parse, urllib.request
import concurrent.futures as cf

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
UA = ("RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; "
      "a map of genealogical sources)")


def verify(url):
    """Open it, or do not publish it.

    Returns (verdict, url). A 403 or 418 counts as WORKING: that is a bot
    gate answering, which says the address is right and that we are not
    welcome to read it — this atlas links to such places rather than
    climbing them. A host that does not resolve is dropped outright,
    because this project shipped one NXDOMAIN (ARHiNET, Croatia's
    national catalogue) to everyone who clicked it for weeks.
    """
    https = ("https://" + url.split("://", 1)[-1]
             if url.startswith("http://") else url)
    host = urllib.parse.urlparse(https).netloc.split(":")[0]
    if not host:
        return "bad-url", url
    try:
        socket.getaddrinfo(host, None)
    except socket.gaierror:
        return "dead-host", url
    for candidate in (https, url):
        try:
            req = urllib.request.Request(candidate, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=35) as r:
                final = r.geturl()
                if final.startswith("https://"):
                    return "https", final
                return ("https", candidate) if candidate.startswith("https://") \
                    else ("http", final)
        except urllib.error.HTTPError as e:
            if candidate.startswith("https://") and e.code in (403, 418, 429):
                return "https", candidate
        except Exception:
            continue
    return "no-answer", url


def slug(prefix, name):
    t = name.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"),
                 ("é", "e"), ("è", "e"), ("á", "a"), ("ó", "o"),
                 ("ç", "c"), ("í", "i"), ("ú", "u"), ("ã", "a"), ("õ", "o")):
        t = t.replace(a, b)
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return (prefix + t)[:72].rstrip("-")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cc", required=True)
    ap.add_argument("--match", required=True, help="regex over the name")
    ap.add_argument("--prefix", required=True, help="id prefix, e.g. de-")
    ap.add_argument("--kind", default="regional-archive")
    ap.add_argument("--what", required=True,
                    help="sentence; {x} is replaced by the archive's name")
    ap.add_argument("--limit", type=int, default=400)
    ap.add_argument("--write", action="store_true",
                    help="without this it only reports")
    a = ap.parse_args()

    wd = json.load(open("data/archives-wikidata.json"))["archives"]
    pat = re.compile(a.match, re.I)
    cand = [r for r in wd
            if r["cc"] == a.cc and r.get("sites") and pat.search(r["n"])]
    cand.sort(key=lambda r: r["n"])
    cand = cand[:a.limit]
    print(f"{len(cand)} candidates in {a.cc} matching /{a.match}/")

    prov = json.load(open("data/providers.json"),
                     object_pairs_hook=collections.OrderedDict)
    # DEDUPED ON THE WHOLE ADDRESS, NOT THE HOST.
    # Ten Bavarian state archives share gda.bayern.de and differ only by
    # path, and dropping nine of them as duplicates would lose nine real
    # institutions. The precedent is already in this file: 119 Italian
    # state archives sit under antenati.cultura.gov.it, correctly, each
    # with its own path. A host is a landlord, not an archive.
    def norm(u):
        u = (u or "").lower().rstrip("/")
        return u[8:] if u.startswith("https://") else u[7:] if u.startswith("http://") else u
    have_host = {norm(r.get("url")) for r in prov["providers"] if r.get("url")}
    have_id = {r["id"] for r in prov["providers"]}

    with cf.ThreadPoolExecutor(8) as ex:
        checked = list(ex.map(lambda r: (r, *verify(r["sites"][0])), cand))

    added, dropped = [], collections.Counter()
    for r, verdict, url in checked:
        if verdict != "https":
            dropped[verdict] += 1
            print(f"  {verdict:<10} {r['n'][:52]:<52} {r['sites'][0][:40]}")
            continue
        host = norm(url)
        i = slug(a.prefix, r["n"])
        if host in have_host or i in have_id:
            dropped["already-here"] += 1
            continue
        have_host.add(host); have_id.add(i)
        added.append(collections.OrderedDict([
            ("id", i), ("name", r["n"]), ("url", url), ("kind", a.kind),
            ("access", "unsurveyed"), ("countries", [a.cc]),
            ("what", a.what.replace("{x}", r["n"])),
            ("deepLink", None),
            ("checked", __import__("time").strftime("%Y-%m-%d")),
            ("at", collections.OrderedDict([("lat", round(r["y"], 4)),
                                            ("lon", round(r["x"], 4)),
                                            ("place", a.cc)])),
            ("wikidata", r["q"]),
        ]))

    print(f"\n{len(added)} would be added; dropped: {dict(dropped)}")
    if not a.write:
        print("(dry run — pass --write to apply)")
        return
    prov["providers"].extend(added)
    io.open("data/providers.json", "w", encoding="utf-8").write(
        json.dumps(prov, ensure_ascii=False, indent=1) + "\n")
    n = sum(1 for r in prov["providers"] if a.cc in (r.get("countries") or []))
    print(f"written. {a.cc} now has {n} providers; {len(prov['providers'])} in all")


if __name__ == "__main__":
    main()
