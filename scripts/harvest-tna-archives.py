#!/usr/bin/env python3
"""Every archive The National Archives' Discovery knows about, and where it is.

DAVID LOGGED IN LOOKING FOR AN API KEY AND THERE IS NO KEY TO FIND. Discovery's
API is open — no registration, no token, no rate-limit header. It was on this
project's list as «blocked on a human» for no better reason than that its two
neighbours on that list, NARA and Trove, genuinely are. The account he created
is for bookmarks and record-copying orders and has nothing to do with it.

WHAT THIS IS WORTH. Discovery is not a catalogue of Kew. It indexes the
holdings of roughly two and a half THOUSAND British repositories — county
record offices, diocesan archives, university special collections, regimental
museums — and knows the postal address of each. That is the «whose archive
holds this» layer for England, Wales and Northern Ireland, which this atlas has
been answering with one row called «The National Archives — Discovery».

A county record office is where English parish registers actually live. Saying
so, by name and address, for every county, is the difference between a
directory and a signpost.

    python3 scripts/harvest-tna-archives.py

SOURCE. The National Archives, Discovery API. Crown copyright, released under
the Open Government Licence v3.0 — attribution, and compatible with the rest.
"""
import json, os, re, string, subprocess, sys, time, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
API = "https://discovery.nationalarchives.gov.uk/API/search/archives"
UA = "RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap)"


# ONE REQUEST EVERY TWO SECONDS, AND THE FIRST RUN OF THIS EARNED THE RULE.
# It swept the alphabet as fast as curl would go — thirty-six requests in a
# couple of minutes — and Discovery stopped answering, for hours. The API has
# no key, no quota page and no rate-limit header, which is not permission to
# hammer it; it is a public service with no way to tell you to stop except by
# stopping. An open API is a courtesy and this is what the courtesy costs.
PAUSE = 2.0
_last = [0.0]


def get(url):
    """curl rather than urllib: several archive hosts refuse urllib's TLS, and
    a harvester that reports a live service as dead is worse than none."""
    gap = time.time() - _last[0]
    if gap < PAUSE:
        time.sleep(PAUSE - gap)
    _last[0] = time.time()
    for attempt in range(3):
        r = subprocess.run(["curl", "-sS", "-L", "--max-time", "60",
                            "-H", "Accept: application/json", "-A", UA, url],
                           capture_output=True, text=True)
        if r.returncode == 0:
            try:
                return json.loads(r.stdout)
            except ValueError:
                # Not JSON means a challenge or a block page, and retrying
                # harder is exactly the wrong response to being asked to stop.
                time.sleep(10 * (attempt + 1))
                continue
        time.sleep(5 * (attempt + 1))
    return None


# The search wants a query; there is no «everything» endpoint. Sweeping the
# alphabet by first letter of title is the documented way round it, and the
# API returns titleFirstLetters itself, so the sweep is its own inventory.
def main():
    seen, pages, blocked = {}, 0, 0
    letters = list(string.ascii_uppercase) + list("0123456789")
    for ch in letters:
        mark = "*"
        while True:
            url = (f"{API}?sps.titleFirstLetter={ch}&sps.resultsPageSize=1000"
                   f"&sps.batchStartMark={mark}")
            d = get(url)
            pages += 1
            if not d:
                blocked += 1
                print(f"  {ch}: no answer — Discovery is not serving this request. "
                      f"If this repeats for every letter, back off and come back "
                      f"in an hour rather than retrying.", flush=True)
                break
            rows = d.get("repositories") or []
            for r in rows:
                rid = r.get("id")
                if not rid or rid in seen:
                    continue
                addr = re.sub(r"\s+", " ", (r.get("address") or "")).strip()
                # The address ends «…, County, Country, POSTCODE» often enough
                # to be worth splitting, and is left whole when it is not.
                parts = [p.strip() for p in addr.split(",") if p.strip()]
                post = ""
                if parts and re.match(r"^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$",
                                      parts[-1].upper()):
                    post = parts.pop().upper()
                seen[rid] = {"id": rid, "name": (r.get("title") or "").strip(),
                             "ref": r.get("reference") or "", "address": addr,
                             "postcode": post,
                             "place": parts[-3] if len(parts) >= 3 else
                                      (parts[-1] if parts else "")}
            nxt = d.get("nextBatchMark") or ""
            if not rows or not nxt or nxt == mark:
                break
            mark = nxt
        print(f"  {ch}  {len(seen):5} repositories so far", flush=True)

    rows = sorted(seen.values(), key=lambda r: r["name"])
    byplace = collections.Counter(r["place"] for r in rows if r["place"])
    path = "data/archives-tna.json"
    json.dump({
        "source": "The National Archives, Discovery — the UK archives directory",
        "url": "https://discovery.nationalarchives.gov.uk/",
        "licence": "Open Government Licence v3.0",
        "licenceNote": ("Crown copyright under the OGL: attribution and nothing more, "
                        "so this may sit beside the CC0 and CC BY data rather than "
                        "in the ODbL pen."),
        "note": ("Discovery indexes the holdings of British repositories far beyond "
                 "Kew — county record offices, diocesan archives, university special "
                 "collections, regimental museums — and knows the address of each. "
                 "The county record office is where English parish registers actually "
                 "live, so this is the «whose archive» layer for England, Wales and "
                 "Northern Ireland. UNCHECKED: these are Discovery's own addresses, "
                 "not visited or confirmed by this project."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"repositories": len(rows),
                   "withPostcode": sum(1 for r in rows if r["postcode"])},
        "archives": rows,
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    if not rows:
        sys.exit(f"nothing came back from {pages} requests ({blocked} refused). "
                 f"Not writing an empty file over a good one. Discovery rate-limits "
                 f"silently — wait an hour and run it again.")
    print(f"\n{len(rows):,} repositories from {pages} requests -> {path}")
    print("  " + " · ".join(f"{k}:{v}" for k, v in byplace.most_common(10)))


if __name__ == "__main__":
    main()
