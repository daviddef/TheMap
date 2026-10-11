#!/usr/bin/env python3
"""The Danish National Archives' parish inventory, as coverage claims.

WHY DENMARK. scripts/sweep-crawl-policy.py read all 314 free providers'
robots.txt; ranked by GREY dots on the real map, Denmark was the largest with
an open provider left after Ireland and the Netherlands — 1,024 of its 1,025
dots had no colour at all.

TWO HOSTNAMES, TWO ANSWERS, AND THE DIFFERENCE IS THE WHOLE JOB.
soeg.rigsarkivet.dk is the search and says `User-agent: * / Disallow: /`, so
it is closed to us and nothing here touches it. arkivalieronline.rigsarkivet.dk
is the viewer and says `Disallow:` with nothing after it, which permits
everything. This reads only the second.

AND IT IS ONE REQUEST PER COLLECTION, NOT A CRAWL. The first estimate in the
work list said parish coverage here would mean walking something like 2,100
pages over several hours. That was wrong: each geographic collection embeds
its ENTIRE inventory in the page as `var data = [...]` to feed two combo
boxes — 2,999 rows for the nationwide church books, every parish with the
county it is filed under. Nine pages hold the lot.

WHAT IS TAKEN AND WHAT IS NOT. The parish names and their counties, which are
facts about what the archive holds. No images: the 1814-1892 colour scans were
produced by Ancestry and the archive's own page says downloading more than a
few of them needs Ancestry's written permission. Nothing here downloads an
image, and a claim that an archive holds a parish's church books says nothing
about who may copy them.

NO RECORD COUNTS AND NO YEAR SPANS, because the page carries neither. The
Irish claims have both and these do not; an invented number would be worth
less than an absent one.
"""
import json, os, re, time, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

HOST = "https://arkivalieronline.rigsarkivet.dk"
UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas recording which ground this collection covers)")
OUT = "data/coverage-claims-rigsarkivet.json"
THEMES = (1, 12, 30)        # the ones that browse geographically
PAUSE = 0.5

# What a creator is called when it is not a parish. These are kept, because an
# estate's or a hospital's records are still records for that ground, but the
# suffix comes off so the name can meet a place.
SUFFIX = re.compile(r"\s+(Sogn|Sogns Distrikt|Sogns distrikt|Kirke|Sognekald)$")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def main():
    seen, claims = {}, []
    for t in THEMES:
        h = get(f"{HOST}/da/collection/theme/{t}")
        time.sleep(PAUSE)
        for cid, name in re.findall(r'/da/geo/geo-collection/(\d+)"[^>]*>([^<]{1,60})', h):
            seen.setdefault(cid, " ".join(name.split()))
    print(f"{len(seen)} geographic collections across themes {THEMES}", flush=True)

    rows_total = 0
    for cid, label in sorted(seen.items(), key=lambda kv: int(kv[0])):
        try:
            h = get(f"{HOST}/da/geo/geo-collection/{cid}")
        except Exception as e:                                # noqa: BLE001
            print(f"  {cid} {label}: not read ({str(e)[:40]})")
            continue
        time.sleep(PAUSE)
        blocks = re.findall(r"<script[^>]*>([\s\S]*?)</script>", h)
        data = None
        for b in blocks:
            m = re.search(r"var\s+data\s*=\s*(\[[\s\S]*?\]);", b)
            if m:
                try:
                    data = json.loads(m.group(1))
                except ValueError:
                    data = None
                break
        if not data:
            print(f"  {cid} {label}: no inventory in the page")
            continue
        rows_total += len(data)
        bycounty = {}
        for r in data:
            amt = (r.get("Amt") or "").strip()
            who = (r.get("Arkivskaber") or "").strip()
            if not who:
                continue
            bycounty.setdefault(amt or "(no county given)", {})[SUFFIX.sub("", who)] = who
        for amt, places in sorted(bycounty.items()):
            claims.append({
                "id": f"ra-dk-{cid}-" + re.sub(r"[^a-z0-9]+", "-", amt.lower()).strip("-")[:40],
                "provider": "sa-dk",
                "title": f"{label} — {amt}",
                "url": f"{HOST}/da/geo/geo-collection/{cid}",
                "from": None, "to": None,
                "records": 0, "images": 0,
                "kind": "CHURCH_RECORD" if cid in ("5", "47", "3", "12", "59") else "LEGAL",
                "countries": ["DK"],
                "filedUnder": [amt] if amt else [],
                "crosses": [],
                # `short` is what reach() matches a place's own name against,
                # so it carries the parish without its «Sogn»; `name` keeps
                # what the archive calls it.
                "places": [{"name": f"{full}, {amt}" if amt else full,
                            "short": short, "type": "PARISH",
                            "lat": None, "lon": None}
                           for short, full in sorted(places.items())],
            })
        print(f"  {cid:>3} {label[:38]:<40} {len(data):>5} rows, "
              f"{len(bycounty):>2} counties", flush=True)

    doc = {
        "source": "Rigsarkivet (the Danish National Archives), Arkivalieronline geographic browse",
        "endpoint": HOST + "/da/geo/geo-collection/",
        "licence": ("No licence stated — parish names and the counties they are "
                    "filed under, read from the archive's own browse pages. These "
                    "are facts about what the archive holds, not the records "
                    "themselves, and the archive states no terms for them. The "
                    "1814-1892 colour scans were made by Ancestry and the archive "
                    "says downloading more than a few needs Ancestry's written "
                    "permission; no image is touched here."),
        "harvested": time.strftime("%Y-%m-%d"),
        "note": ("One claim per collection per county, carrying the parishes it "
                 "holds. soeg.rigsarkivet.dk, which is the search, answers "
                 "`Disallow: /` and is not read; arkivalieronline, which is the "
                 "viewer, answers `Disallow:` and is. Each page embeds its whole "
                 "inventory as `var data` to feed its own combo boxes, so this is "
                 "one request per collection rather than a crawl of every parish. "
                 "NO RECORD COUNTS AND NO YEAR SPANS: the pages carry neither, and "
                 "an invented number would be worth less than an absent one."),
        "counts": {"collections": len(seen), "claims": len(claims),
                   "inventoryRows": rows_total,
                   "places": sum(len(c["places"]) for c in claims)},
        "collections": claims,
    }
    json.dump(doc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = doc["counts"]
    print(f"\n-> {OUT}: {c['claims']} claims over {c['collections']} collections, "
          f"{c['places']:,} place rows from {c['inventoryRows']:,} inventory rows")


if __name__ == "__main__":
    main()
