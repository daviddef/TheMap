#!/usr/bin/env python3
"""Test every distinct URL in David's contributed directory CSV.

The atlas's one rule is that a directory which lies is worse than no
directory, so nothing from this file reaches a page until its link has been
tried and the answer written down beside it. 632 distinct addresses, a dozen
at a time, one attempt each with a real timeout.

A 403 is kept rather than dropped: plenty of archives answer that to any
script while serving people perfectly well, and the atlas's standing position
is to record the gate rather than climb over it.
"""
import csv, json, os, ssl, sys, time
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

SRC = "/Users/daviddefranceski/Downloads/Global_Genealogy_Collections_Directory.csv"
OUT = "data/directory-linkcheck.json"
UA = "RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; link checker)"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE   # we are asking "does this answer", not "is the cert good"

def test(url):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            return {"url": url, "status": r.status, "final": r.url}
    except urllib.error.HTTPError as e:
        return {"url": url, "status": e.code, "final": url}
    except Exception as e:
        return {"url": url, "status": 0, "error": type(e).__name__ + ": " + str(e)[:90]}

def main():
    urls = sorted({r["Collection Level URL / Link"].strip()
                   for r in csv.DictReader(open(SRC, encoding="utf-8-sig"))
                   if r["Collection Level URL / Link"].strip().startswith("http")})
    print(f"{len(urls)} distinct addresses to try", flush=True)
    done, t0 = [], time.time()
    with ThreadPoolExecutor(max_workers=12) as ex:
        for i, res in enumerate(ex.map(test, urls), 1):
            done.append(res)
            if i % 50 == 0:
                print(f"  {i}/{len(urls)}  ({int(time.time()-t0)}s)", flush=True)
    ok = sum(1 for d in done if 200 <= d["status"] < 400)
    gated = sum(1 for d in done if d["status"] in (401, 403, 429))
    dead = sum(1 for d in done if d["status"] == 404 or d["status"] == 410)
    silent = sum(1 for d in done if d["status"] == 0)
    json.dump({"checked": time.strftime("%Y-%m-%d"), "results": done},
              open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"\nanswered {ok} · gated {gated} · gone {dead} · no answer {silent} "
          f"· other {len(done)-ok-gated-dead-silent}")
    print(f"-> {OUT}")

if __name__ == "__main__":
    main()
