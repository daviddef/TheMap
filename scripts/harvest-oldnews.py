#!/usr/bin/env python3
"""OldNews.com's newspaper catalogue: which paper served which town.

WHY A NEWSPAPER BELONGS IN A RECORD ATLAS. A parish register names you when you
are born, married and buried. A newspaper names you for everything in between —
and, crucially, it names the people a register never reaches: the obituary of
somebody who died in the next county, the marriage notice for a couple who
emigrated, the death notice placed by a family who had already moved away. This
atlas already holds The Gazette, Trove, ANNO and Gazettes.Africa for that
reason. OldNews is indexed at TOWN level, which is this atlas's own grain.

READ BECAUSE IT IS OFFERED, WHICH IS THE ONLY REASON THIS PROJECT EVER READS
ANYTHING. Their robots.txt is explicit:

    Allow: /en/newspapers/*
    Disallow: /fr/newspapers/*   (and es, da, nl, it, de, no, pb, fi, sv, cs)

and it names nine crawlers it refuses — Baiduspider, MJ12bot, AhrefsBot,
Bytespider among them. This crawler is not one of them. So the English path is
taken as offered and the other eleven language paths are left alone, even where
the same newspaper sits under both.

THE CATALOGUE IS IN THE URLS, so no page is scraped for it:

    /en/newspapers/czechia/central-bohemia/kolin/labske-proudy
              country ──┘      region ──┘   town ─┘  paper ──┘

462 per-place sitemaps, a few hundred bytes each, declared in their own
sitemap.xml.gz. That is the whole structural catalogue for the price of 463
small requests, and not one article page.

WHAT IS NOT TAKEN. The year span each paper covers lives on the paper's own
page, at about 110 KB each. Thousands of those fetches to learn a date range is
not a polite trade for a catalogue, so the span is left out and the row says so
rather than guessing. The link is recorded; a reader who needs the span can
open the page this atlas sends them to.

    python3 scripts/harvest-oldnews.py            # dry run
    python3 scripts/harvest-oldnews.py --write
"""
import argparse, gzip, io, json, os, re, sys, time, urllib.error, urllib.request

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

SRC = "https://www.oldnews.com/sitemap.xml.gz"
OUT = "data/oldnews-catalogue.json"
UA = ("ClaudeBot/1.0 (+https://www.anthropic.com/claudebot) "
      "Record Atlas newspaper catalogue")
PAUSE = 0.7           # their sitemaps are tiny; this is still a crawl
ALLOWED = re.compile(r"^https://www\.oldnews\.com/en/newspapers/")


def get(url, tries=3):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read()
            if url.endswith(".gz") or raw[:2] == b"\x1f\x8b":
                raw = gzip.decompress(raw)
            return raw.decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(4 * (i + 1))


def titlecase(slug):
    """A slug back into something printable. Not a claim about spelling —
    «labske-proudy» cannot give back «Labské Proudy», and the row keeps the
    slug so nobody mistakes the pretty form for the paper's real name."""
    return " ".join(w.capitalize() for w in slug.split("-"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="stop after N sitemaps")
    a = ap.parse_args()

    index = get(SRC)
    maps = [u for u in re.findall(r"<loc>([^<]+)</loc>", index)
            if "sitemap-newspapers-" in u]
    if a.limit:
        maps = maps[:a.limit]
    print(f"{len(maps)} per-place sitemaps declared\n")

    papers, refused, seen = [], 0, set()
    for i, u in enumerate(maps, 1):
        try:
            body = get(u)
        except Exception as e:
            print(f"  {u.rsplit('/', 1)[-1]}: refused ({type(e).__name__})")
            continue
        for loc in re.findall(r"<loc>([^<]+)</loc>", body):
            # THE ALLOWED PATH ONLY, checked per URL and not assumed from the
            # sitemap's name. A sitemap is their file; the rule is their rule.
            if not ALLOWED.match(loc):
                refused += 1
                continue
            parts = loc.split("/en/newspapers/", 1)[1].strip("/").split("/")
            if len(parts) < 4:
                continue                      # country / region / town index
            country, region, town, slug = parts[0], parts[1], parts[2], parts[3]
            if loc in seen:
                continue
            seen.add(loc)
            papers.append({
                "paper": titlecase(slug), "slug": slug,
                "town": titlecase(town), "townSlug": town,
                "region": titlecase(region), "country": titlecase(country),
                "url": loc,
            })
        if i % 50 == 0 or i == len(maps):
            print(f"  {i}/{len(maps)} sitemaps, {len(papers):,} papers so far")
        time.sleep(PAUSE)

    towns = {(p["country"], p["region"], p["town"]) for p in papers}
    countries = sorted({p["country"] for p in papers})
    print(f"\n  {len(papers):,} newspapers in {len(towns):,} towns "
          f"across {len(countries)} countries")
    if refused:
        print(f"  {refused} urls outside the allowed path, skipped")
    print("  biggest:")
    import collections
    for c, n in collections.Counter(p["country"] for p in papers).most_common(8):
        print(f"    {c:<22} {n:>5} papers")

    if not a.write:
        print("\n  dry run — pass --write to save")
        return
    papers.sort(key=lambda p: (p["country"], p["region"], p["town"], p["paper"]))
    with io.open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "source": "OldNews.com sitemaps, under the Allow: /en/newspapers/* "
                      "in their own robots.txt",
            "licence": "No licence stated — a catalogue of which paper served "
                       "which town, read from the path their sitemaps publish; "
                       "no article text, no images and no year spans are taken",
            "note": ("Which newspaper served which town, and a link to it. The "
                     "English path only: their robots.txt disallows the other "
                     "eleven language paths and those are left alone. The year "
                     "span each paper covers is NOT here — it lives on the "
                     "paper's own 110 KB page, and thousands of fetches for a "
                     "date range is not a polite trade for a catalogue. Town "
                     "and paper names are title-cased slugs, not the papers' "
                     "own spelling; «labske-proudy» cannot give back «Labské "
                     "Proudy», so the slug is kept beside it."),
            "harvested": time.strftime("%Y-%m-%d"),
            "counts": {"papers": len(papers), "towns": len(towns),
                       "countries": len(countries)},
            "papers": papers,
        }, f, ensure_ascii=False, indent=1)
    print(f"\n  -> {OUT}")


if __name__ == "__main__":
    main()
