#!/usr/bin/env python3
"""Give every unplaced place name back the path it was found in.

THE PROBLEM THIS SOLVES IS A FIELD THAT WAS THROWN AWAY.

data/fs-volumes-unplaced.json is «the map's next places, commonest first»:
45,668 names FamilySearch has books for and this atlas has never heard of,
carrying 1,181,581 volumes. Each row is a name, a country and a count:

    {"n": "Kings County", "cc": "US", "volumes": 103480}

which cannot be placed. There is a Kings County in New York, another in
California and another in Washington, and 103,480 books is far too many to
guess with. The same name appears across the list dozens of times — 507 US
rows say «County» or «Parish» and between them hold 249,248 volumes, a fifth
of the whole backlog behind 507 lookups.

But the state was KNOWN. Every volume in data/fs-waypoints.json carries the
waypoint path it was filed under and a parallel `labels` array saying what each
element is:

    "path":  ["New York", "Kings"]
    "labels": ["Place", "Place"]

and match-fs-volumes.py reduces that to one element before writing the gaps
file. The context was discarded at the moment it would have been useful, which
is why this list has sat unplaceable rather than unplaced.

So: stream the waypoints, and for each name in the gaps file record the full
Place path the books were actually filed under, commonest first. «Kings County»
becomes «New York › Kings County», which a gazetteer can answer.

STREAMED, NOT LOADED. The file is 740 MB and a json.load of it wants several
gigabytes for a pass that needs one row at a time. Volume rows are matched with
a regex over overlapping chunks and parsed individually.

    python3 scripts/unplaced-context.py --country US
    python3 scripts/unplaced-context.py            # every country
"""
import argparse, collections, json, os, re, sys, unicodedata

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# WHAT ACTUALLY DISAMBIGUATES A US COUNTY, and it is not the path.
#
# I expected the waypoint path to carry the state, and for Italy it does —
# «Province | Comune or Frazione», a million rows deep. For the American
# counties it does not. «Kings County» is 103,480 volumes filed under the bare
# string «Kings County», and the state appears on 12 of Forsyth County's 13,572
# rows and 3 of Mecklenburg's 8,415. Those collections are organised
# «County | Surname Letter» with no state level at all, so there was never a
# state in the path to discard.
#
# It is in the COLLECTION TITLE. FamilySearch names its American collections by
# state — «Georgia, County Marriages, 1785-1950», «North Carolina, Estate
# Files» — so the collection a volume sits in says which Kings County it is.
# fs-waypoints.json groups its rows under byCollection, so the id is available
# while streaming; data/collections.json turns the id into the title.
# byCollection maps an id to an OBJECT, not an array:
#     "byCollection":{"2040054":{"title":"Croatia, Church Books, 1516-1994",
#                                "cc":["HR"],"volumes":[ … ]}}
# so the id is followed by `{`, and the title is right there in the stream —
# which means collections.json is not needed to name it. Matching `"id":[` found
# zero boundaries in an 8 MB chunk and left every row with no collection, in
# silence, which is how the first two attempts at this produced empty output.
COLLECTION = re.compile(r'"(\d{6,9})"\s*:\s*\{"title"\s*:\s*"((?:[^"\\]|\\.)*)"')
WAYPOINTS = "data/fs-waypoints.json"
GAPS = "data/fs-volumes-unplaced.json"
OUT = "data/_unplaced-context.json"

ROW = re.compile(r'\{"t":.*?"wp":"[^"]*"\}')
CHUNK = 8 << 20

# WHICH PATH ELEMENTS ARE GROUND, AND WHY THIS IS A DENY-LIST.
#
# The first version of this kept elements labelled "Place" and found nothing for
# «Kings County», 103,480 volumes. Because FamilySearch does not label US
# counties "Place" — it labels them "County". The vocabulary is dozens of terms
# and it is per-collection: "Comune or Frazione", "Province", "Parish",
# "Municipality", "District", "City or Town", "Okres", "Obec", "Místo",
# "Civil Parish", "Place/Parish", "City or Municipality". Allowing one of them
# reads a twentieth of the file's geography:
#
#     Province | Comune or Frazione   1,007,987 rows   (all of Italy)
#     County | Surname Letter           308,972 rows   (US counties, by surname)
#     Okres | Obec | Místo              124,575 rows   (Czech, three deep)
#     Place                             153,509 rows   <- the only one kept
#
# So the list below names what is NOT ground, which is a short and stable set —
# a record type, a religion, a surname bucket — and everything else is treated
# as a level of geography. Getting this wrong in the safe direction means an
# extra element in a path, which a person can see; getting it wrong the other
# way means silently ignoring a million books, which is what happened.
NOT_GROUND = {
    "surname letter", "first two letters of surname", "record type",
    "record category", "religion", "denomination", "type", "event",
    "record", "collection", "language", "author", "film", "volume",
}


def is_ground(label):
    l = (label or "").strip().lower()
    if not l:
        return False
    # Composite labels — "City, Record Category", "Place/Parish" — are ground if
    # any part of them is; the record-type half is extra precision, not a reason
    # to discard the city.
    parts = [x.strip() for x in re.split(r"[,/]", l) if x.strip()]
    return any(x not in NOT_GROUND for x in parts) if parts else False


def fold(s):
    s = unicodedata.normalize("NFD", (s or "").strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", help="only names in this ISO2")
    ap.add_argument("--min-volumes", type=int, default=0,
                    help="skip gap rows smaller than this")
    ap.add_argument("--top", type=int, default=0,
                    help="only the N largest gap rows")
    a = ap.parse_args()

    gaps = json.load(open(GAPS))["names"]
    if a.country:
        gaps = [g for g in gaps if g.get("cc") == a.country]
    if a.min_volumes:
        gaps = [g for g in gaps if g["volumes"] >= a.min_volumes]
    gaps.sort(key=lambda g: -g["volumes"])
    if a.top:
        gaps = gaps[:a.top]

    # A name can be wanted for more than one country; keep the countries.
    want = collections.defaultdict(set)
    for g in gaps:
        want[fold(g["n"])].add(g.get("cc") or "")
    print(f"looking for {len(want):,} names "
          f"({sum(g['volumes'] for g in gaps):,} volumes) in {WAYPOINTS}")

    titles = {}
    try:
        cj = json.load(open("data/collections.json"))
        for c in (cj.get("collections") or cj):
            # The field is `cc` — the FamilySearch COLLECTION code, not a
            # country code, despite the name. Reading it as `id` returned None
            # for all 3,504 rows and produced an empty title map in silence.
            cid = str(c.get("cc") or "")
            t = c.get("title") or c.get("t")
            if cid and t:
                titles[cid] = t
    except Exception:
        pass

    # name -> full place path -> how many volumes were filed there
    found = collections.defaultdict(collections.Counter)
    # name -> collection title -> volumes, which is what names the US state
    incol = collections.defaultdict(collections.Counter)
    rows = hits = 0
    size = os.path.getsize(WAYPOINTS)
    cur_col = cur_title = ""
    with open(WAYPOINTS, encoding="utf-8") as f:
        tail = ""
        read = 0
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            read += len(chunk)
            buf = tail + chunk
            last = 0
            # Track which collection's array we are inside. The ids and the rows
            # interleave in one stream, so the last id seen before a row is the
            # collection that row belongs to.
            marks = [(m.start(), m.group(1), m.group(2))
                     for m in COLLECTION.finditer(buf)]
            mi = 0
            for m in ROW.finditer(buf):
                while mi < len(marks) and marks[mi][0] < m.start():
                    cur_col, cur_title = marks[mi][1], marks[mi][2]
                    mi += 1
                last = m.end()
                rows += 1
                try:
                    r = json.loads(m.group(0))
                except Exception:
                    continue
                path, labels = r.get("path") or [], r.get("labels") or []
                places = [p for p, l in zip(path, labels) if is_ground(l)]
                if not places:
                    continue
                for p in places:
                    k = fold(p)
                    if k in want:
                        found[k][" › ".join(places)] += 1
                        if cur_col:
                            incol[k][cur_title or titles.get(cur_col, cur_col)] += 1
                        hits += 1
            # Keep enough tail that a row straddling the boundary survives.
            tail = buf[max(last, len(buf) - 4000):]
            pct = 100 * read / size
            if rows and pct % 1 < 0.0001:
                pass
            print(f"\r  {pct:5.1f}%  rows={rows:,}  hits={hits:,}",
                  end="", file=sys.stderr, flush=True)
    print(file=sys.stderr)

    out = []
    for g in gaps:
        k = fold(g["n"])
        paths = found.get(k)
        if not paths:
            out.append(dict(n=g["n"], cc=g.get("cc"), volumes=g["volumes"],
                            paths=[], resolved=False))
            continue
        top = paths.most_common(6)
        # ONE PATH OR SEVERAL, AND THE DIFFERENCE MATTERS.
        # A name found under exactly one place path is placeable: the books all
        # came from the same ground. A name under several is genuinely
        # ambiguous — three Kings Counties — and must be SPLIT rather than
        # picked between, or one state's books land in another's.
        out.append(dict(n=g["n"], cc=g.get("cc"), volumes=g["volumes"],
                        resolved=True, distinct=len(paths),
                        paths=[{"path": p, "volumes": c} for p, c in top],
                        collections=[{"title": t, "volumes": c}
                                     for t, c in incol.get(k, {}).most_common(4)]))

    one = [r for r in out if r.get("distinct") == 1]
    many = [r for r in out if (r.get("distinct") or 0) > 1]
    none = [r for r in out if not r["resolved"]]
    print(f"  one path only : {len(one):,} names, "
          f"{sum(r['volumes'] for r in one):,} volumes")
    print(f"  several paths : {len(many):,} names, "
          f"{sum(r['volumes'] for r in many):,} volumes  (must be split, not chosen)")
    print(f"  no path found : {len(none):,} names, "
          f"{sum(r['volumes'] for r in none):,} volumes")

    json.dump({"note": "The full waypoint Place path behind each unplaced name, "
                       "recovered from fs-waypoints.json. `distinct` is how many "
                       "different paths the name was filed under: 1 is placeable, "
                       "more than 1 is ambiguous and must be split by path rather "
                       "than resolved to one dot.",
               "licence": "FamilySearch catalogue metadata (not an open licence)",
               "rows": out},
              open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
