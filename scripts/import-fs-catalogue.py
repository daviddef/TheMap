#!/usr/bin/env python3
"""The volumes themselves — the level below «a collection covers this place».

WHAT THIS MAP HAS SAID UNTIL NOW is «Croatia, Church Books, 1516–1994 covers
Gračišće», which is true, useful, and still one step short of the thing a
researcher needs: WHICH BOOK, FOR WHICH YEARS, AND WHERE IS IT. The Defranceski
archive answers that for Croatia — «Births (Rođeni) 1798–1858», with a link —
and this atlas did not.

SUPERSEDED IN PART — SEE scripts/harvest-fs-waypoints.py. What follows was
half right and the wrong half mattered. The CATALOGUE is indeed gated. But
api.familysearch.org/platform/records/collections/<id>/waypoints answers 200
to an ordinary identified request, with no token and no browser, and walks
down to the individual book. I recorded the door as shut having tried only
one of them — the same mistake as declaring Scotland's parishes closed when
data.gov.uk had had them all along. This script still does its job: it
imports the Croatian walk that was already done, at a depth and quality the
API does not match, including confession and film numbers.

THE CATALOGUE CANNOT BE HARVESTED FROM HERE, AND THAT MUCH IS NOT EFFORT.
FamilySearch's catalogue and waypoint tree are behind a security service; every
path answers 404 or a challenge to anything that is not a signed-in browser.
The Defranceski archive's own ingest script says so in its header: «the harvest
itself is done in the browser, because FamilySearch's security service blocks
the in-app browser's egress IP and only David's own Chrome gets through».

So this imports the walk that has already been done — 1,339 Croatian parishes
and their books — rather than pretending to repeat it. Croatia becomes the
worked example at volume depth, and the shape it proves is the shape every
other country's walk would land in.

    python3 scripts/import-fs-catalogue.py

WHAT COMES ACROSS: the volume title, the years it covers, the record kinds it
names, and the waypoint that opens the images. WHAT DOES NOT: people, progress,
or anything about who has read what. That is the family archive's business.
"""
import json, os, re, sys, unicodedata, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
SRC = os.path.join(os.path.dirname(_ROOT), "Defranceski Family",
                   "data", "fs-catalogue.json")
if not os.path.exists(SRC):
    sys.exit(f"the Croatian catalogue walk is not here: {SRC}\n"
             "This is a HAND-RUN snapshot importer and must never be wired "
             "into npm run build.")

CONF = {"rc": "Roman Catholic", "orth": "Orthodox", "gc": "Greek Catholic",
        "jew": "Jewish", "mil": "Military", "ref": "Reformed",
        "civil": "Civil", "ev": "Evangelical"}

# A volume title is a run of «Event (Hrvatski) years» clauses, so one book can
# be births AND marriages AND deaths, and its true span is the whole run.
EVENT = re.compile(r"(Births|Marriages|Deaths|Church Census|Confirmations|Index)"
                   r"\s*\(([^)]*)\)\s*([0-9,\s\-–]*)")


def fold(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", fold(s)).strip("-")[:60]


def parse(title):
    kinds, years = [], []
    for m in EVENT.finditer(title or ""):
        kinds.append(m.group(1))
        years += [int(y) for y in re.findall(r"\b(1[5-9]\d\d|20[0-2]\d)\b", m.group(3) or "")]
    if not years:
        years = [int(y) for y in re.findall(r"\b(1[5-9]\d\d|20[0-2]\d)\b", title or "")]
    return sorted(set(kinds)), (min(years), max(years)) if years else (None, None)


def main():
    cat = json.load(open(SRC, encoding="utf-8"))
    parishes, books = cat["p"], cat["b"]

    doc = json.load(open("data/places.json"))
    by_fold = collections.defaultdict(list)
    for p in doc["places"]:
        if p.get("country") == "HR":
            by_fold[fold(p["name"])].append(p)
            for n in p.get("names", []):
                by_fold[fold(n.get("n", ""))].append(p)

    out, matched, unmatched, vols = {}, 0, [], 0
    for layer, parish, way in parishes:
        rows = books.get(f"{layer}|{parish}") or []
        if not rows:
            continue
        # «Albanasi (Zadar)» — the bracket disambiguates, and the shelf knows
        # the bare name. Try both, widest first.
        bare = re.sub(r"\s*\([^)]*\)\s*$", "", parish).strip()
        hit = None
        for cand in (parish, bare):
            for p in by_fold.get(fold(cand), []):
                hit = p
                break
            if hit:
                break
        if not hit:
            unmatched.append(parish)
            continue
        matched += 1
        bucket = out.setdefault(hit["id"], [])
        for row in rows:
            title = row[0] if len(row) > 0 else ""
            wp = row[1] if len(row) > 1 else ""
            film = row[2] if len(row) > 2 else ""
            ark = row[3] if len(row) > 3 else ""
            kinds, (a, b) = parse(title)
            rec = {"t": title, "conf": CONF.get(layer, layer)}
            if kinds:
                rec["kinds"] = kinds
            if a:
                rec["from"], rec["to"] = a, b
            if wp:
                rec["url"] = "https://www.familysearch.org/ark:/61903/3:1:" + wp \
                    if wp.count(":") == 0 else wp
                rec["waypoint"] = wp
            if film:
                rec["film"] = film
            if ark:
                rec["ark"] = "https://www.familysearch.org/ark:/61903/" + ark
            bucket.append(rec)
            vols += 1

    path = "data/fs-volumes.json"
    json.dump({
        "source": "FamilySearch catalogue walk of the Croatian church-book "
                  "collection, harvested in a browser by the Defranceski archive "
                  "and imported here as a snapshot",
        "why": ("FamilySearch's catalogue cannot be read by a script — every path "
                "answers 404 or a challenge to anything that is not a signed-in "
                "browser. This is the walk that was already done, not a repeat of "
                "it. Every other country needs the same walk, in a browser, and "
                "scripts/ingest-fs-catalogue.py in the Defranceski archive is the "
                "extractor that does it."),
        "note": ("Volume-level detail: which book, for which years, and the link "
                 "that opens its images. UNCHECKED — these are the catalogue's own "
                 "titles and nobody here has opened a single one."),
        "counts": {"places": len(out), "volumes": vols,
                   "parishesWalked": len(parishes),
                   "parishesUnmatched": len(unmatched)},
        "unmatched": sorted(set(unmatched))[:60],
        "byPlace": out,
    }, open(path, "w"), ensure_ascii=False, separators=(",", ":"))

    print(f"{vols:,} volumes across {len(out):,} places -> {path}")
    print(f"  {matched:,} of {len(parishes):,} walked parishes matched a place on "
          f"this shelf; {len(unmatched)} did not")
    if unmatched:
        print("  " + ", ".join(sorted(set(unmatched))[:8]) + " …")


if __name__ == "__main__":
    main()
