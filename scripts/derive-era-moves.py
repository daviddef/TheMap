#!/usr/bin/env python3
"""Who arrived, who left, and who took the ground — as movements a map can draw.

David asked for «a toggleable animation of migratory paths and conquerers
showing ins and outs». The data for it turned out to be already written: every
era card in the flags atlas carries a `migro-row` of tags, 1,250 of them, in
exactly that vocabulary — «Occupied by: Soviet Union (1979–1989)», «Conquered
by: Mongol Empire (1220s)», «Emigration: mass flight after 2021 Taliban
takeover». Nobody had ever turned them into geometry.

This reads flag-eras.json and writes one row per movement: who it happened to,
which direction, who the other party was, and between which years.

THE HONEST PART, AND IT HAS TO BE BUILT IN RATHER THAN DISCOVERED LATER.
An arrow needs two ends. The subject end is solid — every era belongs to one of
the 210 countries and 1,056 of the 1,250 tags sit on an era with a start year.
The OTHER end frequently does not exist as a place: «Arab Caliphate (7th–8th
c.)», «Venetian coastal enclaves», «mass flight after 2021 Taliban takeover».
Those are real history and they are not line segments.

So every movement is emitted either way and says which it is. A row with `o`
set can be drawn as an arrow between two countries; a row without it can only
be drawn as an arrow entering or leaving the subject's own shape, labelled with
what the source actually said. A map that drew only the resolvable half would
quietly imply the Mongols never came.

NO SUCCESSOR GUESSING. It would be easy to map «Soviet Union» to Russia and
«Ottoman Empire» to Turkey and lift the resolved share by a third. That is
editorialising dressed as data — the Soviet Union is not Russia to a Latvian,
and this atlas's whole argument is that it says what the source says. A name
resolves when it IS a country this map draws, and otherwise it stays text.
"""
import json, os as _os, re, time
import sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import geo
import os

# RUN FROM ANYWHERE, BECAUSE `npm run data` RUNS FROM site/. Every path below
# is written from the repository root, which is true when a human runs this
# and false when the pipeline does — the deploy failed with «No such file or
# directory: 'site/public/flag-eras.json'» because cwd was site/ and the path
# resolved to site/site/public/. build.py has chdir'd to the root since it was
# written; this did not, and nothing caught it until CI.
_os.chdir(_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

# THE COMMITTED SOURCE, NOT THE PUBLISHED COPY. build.py copies
# data/flag-eras.json into site/public on every run, so reading the copy works
# only if this runs after it — an ordering dependency with nothing enforcing
# it. The source is tracked and always there.
ERAS = "data/flag-eras.json"
INDEX = "data/flag-index.json"
COUNTRIES = "data/countries.json"
FLAGSJS = "site/src/lib/flags.js"
OUT = "site/public/era-moves.json"
ART = "data/era-flags.json"
FLAGOUT = "site/public/flag-map.json"

# The four things the map can draw, and the words the pages use for them. The
# verbs are kept apart from the direction because a reader toggling «who took
# this ground» and «who came and went» is asking two different questions.
VERB = {
    "conquered by": ("conquest", "in"),
    "conquest by": ("conquest", "in"),
    "attempted conquest by": ("conquest", "in"),
    "absorbed by": ("conquest", "in"),
    "occupied by": ("occupation", "in"),
    "displaced by": ("migration", "out"),
    "immigration": ("migration", "in"),
    "settlement": ("migration", "in"),
    "emigration": ("migration", "out"),
    "migration": ("migration", "out"),
}

# VERBS THE PAGES USE FOR THE SAME THINGS UNDER OTHER NAMES. A tag whose verb was not in the table above was dropped
# without a word: the audit (scripts/audit-history.py) found 62 of them, 20 inside the playable years («Raided by: Magyar
# raids (907)», «Settled by: Norse voyagers», «Ruled by:»…). They are kept now and carry the page's own verb in `vb`, so
# a raid is not labelled a conquest on the map. Verbs that name no movement (contact, cultural diffusion, trade
# network, weakened by …) stay out, and the audit lists them.
VERB_X = {
    "annexed by": ("conquest", "in"), "invasion by": ("conquest", "in"), "invaded by": ("conquest", "in"),
    "conquest": ("conquest", "in"), "destroyed by": ("conquest", "in"), "subjugated by": ("occupation", "in"),
    "raided by": ("conquest", "in"), "colonized by": ("occupation", "in"), "ruled by": ("occupation", "in"),
    "overlordship by": ("occupation", "in"), "overlordship": ("occupation", "in"), "tributary to": ("occupation", "in"),
    "settled by": ("migration", "in"), "coastal settlement": ("migration", "in"), "ancestral migration": ("migration", "in"),
    "annexation by": ("conquest", "in"), "conquest of malacca by": ("conquest", "in"), "tribute paid to": ("occupation", "in"),
    "colonization": ("migration", "in"), "resettlement": ("migration", "in"), "occupation of": ("occupation", "out"),
}

# PAGES THAT ARE NOT A COUNTRY. The empire and kingdom pages have no country the map draws, so their movements had
# nowhere to be anchored and were dropped (49 inside the playable years). Each now borrows the modern country it
# is filed under for its name and sits at the seat it ruled from.
PAGE_AT = {
    "mughal-empire-flags": ("IN", 27.18, 78.02), "ottoman-empire-flags": ("TR", 41.01, 28.98),
    "ancient-egypt-flags": ("EG", 25.70, 32.64), "mongol-empire-flags": ("MN", 47.20, 102.84),
    "persian-empire-flags": ("IR", 32.65, 51.67), "roman-empire-flags": ("IT", 41.90, 12.50),
    "spanish-empire-flags": ("ES", 40.42, -3.70), "ryukyu-kingdom-flags": ("JP", 26.22, 127.72),
    "tannu-tuva-flags": ("RU", 51.72, 94.45), "british-empire-flags": ("GB", 51.51, -0.13),
    "hawaii-flags": ("US", 21.31, -157.86), "newfoundland-flags": ("CA", 47.56, -52.71),
    "sikkim-flags": ("IN", 27.33, 88.61),
}


def load_alias():
    """The 22 flags-atlas-name -> ISO-name aliases already kept in lib/flags.js."""
    js = open(FLAGSJS, encoding="utf-8").read()
    blk = re.search(r"const ALIAS = \{(.*?)\n\};", js, re.S)
    return dict(re.findall(r'"([^"]+)":\s*"([^"]+)"', blk.group(1))) if blk else {}


def main():
    eras = json.load(open(ERAS, encoding="utf-8"))["eras"]
    index = json.load(open(INDEX, encoding="utf-8"))["countries"]
    countries = json.load(open(COUNTRIES, encoding="utf-8"))["countries"]
    alias = load_alias()

    name2cc = {v["name"].lower(): k for k, v in countries.items() if v.get("name")}
    slug2cc, slug2name = {}, {}
    for c in index:
        slug = c["url"].split("/")[-1].replace(".html", "")
        cc = name2cc.get(c["name"].lower()) or name2cc.get(alias.get(c["name"], "").lower())
        slug2name[slug] = c["name"]
        if cc:
            slug2cc[slug] = cc

    # EVERY NAME THIS MAP COULD POSSIBLY MEAN, longest first so that «Papua New
    # Guinea» is not matched as «Guinea» and «South Sudan» not as «Sudan».
    known = {}
    for n, cc in name2cc.items():
        known[n] = cc
    for c in index:
        cc = name2cc.get(c["name"].lower()) or name2cc.get(alias.get(c["name"], "").lower())
        if cc:
            known[c["name"].lower()] = cc
    # THE HOME NATIONS AND THE ONE WORD EVERYBODY USES. lib/flags.js already
    # documents that England, Scotland, Wales and Northern Ireland all alias to
    # the United Kingdom, because the flags atlas draws them separately and the
    # ISO table does not. The pages also say «Britain» thirteen times and
    # «England» three, meaning the state that did the thing. Resolving those is
    # not successor-guessing — it is the same country under the name the source
    # used — unlike «Ottoman Empire» or «Soviet Union», which stay text.
    for n in ("britain", "great britain", "england", "scotland", "wales",
              "northern ireland"):
        known.setdefault(n, "GB")
    order = sorted(known, key=len, reverse=True)

    # «Occupied by: Soviet Union (1979–1989)» — the tag's own dates are finer
    # than the era's and are used when present.
    YEARS = re.compile(r"\((?:c\.\s*)?(\d{3,4})\s*[–\-—]\s*(\d{3,4})\)")
    ONEYEAR = re.compile(r"\((?:c\.\s*)?(\d{3,4})s?\)")

    moves, unresolved, skipped = [], 0, 0
    for e in eras:
        slug = e.get("slug")
        subj = slug2cc.get(slug) or (PAGE_AT.get(slug) or (None,))[0]
        for t in e.get("tags") or []:
            if t.get("row") != "migro-row":
                continue
            txt = (t.get("t") or "").strip()
            m = re.match(r"^([^:]{3,40}):\s*(.+)$", txt)
            if not m:
                skipped += 1
                continue
            verb_raw, obj = m.group(1).strip().lower(), m.group(2).strip()
            kind = VERB.get(verb_raw)
            vb = None
            if not kind and verb_raw in VERB_X:
                kind, vb = VERB_X[verb_raw], m.group(1).strip()
            if not kind or not subj:
                skipped += 1
                continue
            what, direction = kind

            frm, to = e.get("from"), e.get("to")
            ym = YEARS.search(obj)
            if ym:
                frm, to = int(ym.group(1)), int(ym.group(2))
            else:
                y1 = ONEYEAR.search(obj)
                if y1:
                    frm = int(y1.group(1))
            if not ym and not y1 and not re.search(r"BCE|\bBC\b|\bya\b", obj):
                # NO YEAR IN PARENTHESES: read a century («7th–8th c.») or a bare year («c. 1000», «1820s–30s») from the words
                cm = re.search(r"(\d{1,2})(?:st|nd|rd|th)(?:\s*[\u2013\-]\s*(\d{1,2})(?:st|nd|rd|th))?\s*c\b", obj)
                by = re.search(r"(?<![\d/])(\d{3,4})s?(?![\d\w])", obj)
                if cm:
                    c1 = int(cm.group(1)); c2 = int(cm.group(2) or c1)
                    frm, to = (c1 - 1) * 100 + 50, c2 * 100 - 50
                elif by and 600 <= int(by.group(1)) <= 2030:
                    frm = int(by.group(1))
            if not frm:
                skipped += 1
                continue

            # The counterpart, with its parenthetical stripped before matching.
            bare = re.sub(r"\s*\([^)]*\)", " ", obj).strip().lower()
            other = None
            for n in order:
                if len(n) < 4:
                    continue
                if re.search(r"(?<![a-z])" + re.escape(n) + r"(?![a-z])", bare):
                    other = known[n]
                    break
            if other == subj:
                other = None            # a country does not migrate to itself
            if not other:
                unresolved += 1

            moves.append({
                "s": subj, "v": what, "d": direction,
                "o": other, "ot": re.sub(r"\s+", " ", obj)[:120],
                "f": frm, "t": to or (frm if e.get("present") else to),
                "present": bool(e.get("present")) and not ym,
                "e": e.get("id"), "p": slug,
                **({"vb": vb} if vb else {}),
                **({"sa": [PAGE_AT[slug][1], PAGE_AT[slug][2]]} if slug in PAGE_AT and slug not in slug2cc else {}),
            })

    # A POINT PER COUNTRY, CARRIED HERE SO THE LAYER IS ONE FETCH.
    # An arrow needs two coordinates, and the alternative was for the client to
    # pull a country outline per end — up to 237 files to draw one year. The
    # rings are already open in this process, so the midpoint of each bounding
    # box rides along in the same file. It is a label anchor, not a centroid:
    # for Chile or Norway it sits in the sea, which is the right place for the
    # tail of an arrow about a whole country anyway.
    # SEA IS FINE. ANOTHER COUNTRY IS NOT. The comment above is right that a
    # midpoint in the Pacific is the honest place for a label about Chile — a
    # label has to go somewhere and the sea claims nothing. But a midpoint that
    # lands inside a NEIGHBOUR is a different thing entirely: David found the
    # Croatian flag flying near Drvar, which is in Bosnia and Herzegovina.
    # Croatia is a horseshoe around Bosnia, so the midpoint of its box is
    # inside Bosnia, and the map was making a claim rather than placing a
    # label. Measured across all 194: 166 landed at home, 20 at sea, and
    #
    #     HR -> BA, LS -> ZA, IL -> PS, GQ -> CM, GN -> SL, LA -> TH, VN -> LA
    #
    # and, best of all, US -> FR: the United States box runs from Alaska to
    # Florida, so its midpoint is in south-west France.
    #
    # So the midpoint stands unless it falls in someone else's country, and
    # then the anchor moves to the point inside this country's own rings that
    # is furthest from any of its edges. That is the pole of inaccessibility,
    # approximated on a grid, which is cheap at eight countries and puts the
    # flag in the widest part of the land rather than the middle of the box.
    def _inside(lat, lon, rings):
        return any(geo.in_ring(lat, lon, r) for r in rings)

    def _deep_point(rings, lo_lat, hi_lat, lo_lon, hi_lon):
        """The inside point furthest from the edge, found by narrowing a grid."""
        best, best_d = None, -1.0
        for _ in range(4):                       # four passes, tightening
            step_lat = (hi_lat - lo_lat) / 24.0
            step_lon = (hi_lon - lo_lon) / 24.0
            if step_lat <= 0 or step_lon <= 0:
                break
            for i in range(25):
                for j in range(25):
                    la = lo_lat + i * step_lat
                    lo = lo_lon + j * step_lon
                    if not _inside(la, lo, rings):
                        continue
                    # distance to the nearest edge, as the smallest step that
                    # walks off the land in any of eight directions
                    d = 0.0
                    for k in range(1, 13):
                        r = k * max(step_lat, step_lon) * 0.5
                        if all(_inside(la + r * dy, lo + r * dx, rings)
                               for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                              (.7, .7), (.7, -.7), (-.7, .7), (-.7, -.7))):
                            d = r
                        else:
                            break
                    if d > best_d:
                        best, best_d = (la, lo), d
            if not best:
                break
            la, lo = best
            span_lat = (hi_lat - lo_lat) / 6.0
            span_lon = (hi_lon - lo_lon) / 6.0
            lo_lat, hi_lat = la - span_lat, la + span_lat
            lo_lon, hi_lon = lo - span_lon, lo + span_lon
        return best

    def anchors(where_used=None):
        """A label anchor per country, inside the country wherever possible.

        TWO COPIES OF THIS EXISTED and only one got fixed, which is how the
        flag kept flying over Drvar after the arrows had been corrected: `at`
        fed era-moves.json and `fat` fed flag-map.json, the same fifteen lines
        written twice. One function now, called twice.
        """
        out, moved = {}, []
        for cc, v in countries.items():
            rings = v.get("rings") or []
            if not rings:
                continue
            if where_used is not None and cc not in where_used:
                continue
            lons = [p[0] for r in rings for p in r]
            lats = [p[1] for r in rings for p in r]
            mid = [round((min(lats) + max(lats)) / 2, 3),
                   round((min(lons) + max(lons)) / 2, 3)]
            # THE TEST IS «IS IT ON SOMEBODY ELSE'S LAND», NOT «WHAT DOES
            # country_of SAY». Those differ for an enclave: Lesotho is
            # surrounded by South Africa and ZA's ring carries no hole for it,
            # so every point in Lesotho is inside ZA too and country_of can
            # never answer LS. Asking country_of alone moved Lesotho's anchor
            # for no reason. Asking whether the point is on THIS country's own
            # land as well settles it — and leaves Chile's midpoint in the
            # Pacific, which the note above is right to want.
            where = geo.country_of(mid[0], mid[1])
            if (where is not None and where != cc
                    and not _inside(mid[0], mid[1], rings)):
                deep = _deep_point(rings, min(lats), max(lats), min(lons), max(lons))
                if deep:
                    out[cc] = [round(deep[0], 3), round(deep[1], 3)]
                    moved.append((cc, where))
                    continue
            out[cc] = mid
        return out, moved

    at, moved_home = anchors()
    if moved_home:
        print("  anchors moved out of a neighbour's country: " +
              ", ".join(f"{c} (was in {w})" for c, w in sorted(moved_home)))
    used = {m["s"] for m in moves} | {m["o"] for m in moves if m["o"]}
    at = {k: v for k, v in at.items() if k in used}

    moves.sort(key=lambda r: (r["f"], r["s"]))
    out = {
        "note": ("One row per movement of people or power, derived from the "
                 "migro-row tags on every era card in the flags atlas. `s` is "
                 "the country it happened to, `v` what kind — conquest, "
                 "occupation or migration — and `d` whether it was into that "
                 "ground or out of it. `o` is the other party WHEN IT IS A "
                 "COUNTRY THIS MAP DRAWS, and null when it is not: an empire, "
                 "a caliphate, a wave of refugees. `ot` always carries what "
                 "the page actually said. A row with `o` can be an arrow "
                 "between two shapes; a row without can only be an arrow "
                 "entering or leaving one, and drawing only the first kind "
                 "would imply the Mongols never came."),
        "source": "site/public/flag-eras.json, itself extracted from the flags atlas pages",
        "licence": "this project's own pages",
        "generatedBy": "scripts/derive-era-moves.py",
        "generated": time.strftime("%Y-%m-%d"),
        "counts": {
            "moves": len(moves),
            "resolved": len(moves) - unresolved,
            "unresolved": unresolved,
            "skipped": skipped,
            "countries": len({m["s"] for m in moves}),
            "points": None,  # filled below, once `at` is known
            "conquest": sum(1 for m in moves if m["v"] == "conquest"),
            "occupation": sum(1 for m in moves if m["v"] == "occupation"),
            "migration": sum(1 for m in moves if m["v"] == "migration"),
        },
        "at": at,
        "names": known,          # every name this map can resolve to a country, for reading the other end out of a sentence
        "moves": moves,
    }
    out["counts"]["points"] = len(at)

    # ---- THE FLAG THAT FLEW HERE, FOR EVERY COUNTRY AND EVERY YEAR --------
    #
    # David asked for two things and only one was built: «is there a way we
    # could start placing every flag on the country shape on the map? and then
    # secondly can we animate a toggleable animation of migratory paths and
    # conquerers». The animation is the rest of this file. This is the first
    # half, four weeks late.
    #
    # It is cheap because the work was already done and read by one table.
    # data/era-flags.json holds the art for all 210 countries — 1,454 images,
    # 0.6 MB in total, averaging 0.4 KB, because they are small flat SVGs —
    # and build.py was writing out only the 34 that regions.json names. The
    # eras already carry `from` and `to`, so «which flag in 1848» is a lookup
    # rather than a judgement.
    #
    # ANCHORS FOR EVERY COUNTRY, NOT ONLY THE ONES A MOVEMENT TOUCHED. The
    # `at` table above is filtered to the countries an arrow reaches; a flag
    # layer wants all of them, so this builds its own from the same rings.
    # Same caveat as there: it is the midpoint of a bounding box, a label
    # anchor rather than a centroid, which for Chile or Norway sits in the sea.
    # A flag is a label, so that is the right place for it.
    art = {}
    try:
        art = json.load(open(ART, encoding="utf-8"))["art"]
    except (FileNotFoundError, KeyError):
        print("  no data/era-flags.json — the flag layer will have nothing to draw")

    fat, _ = anchors()

    flags, skipped_noimg, skipped_nocc = {}, 0, 0
    for e in eras:
        slug, eid = e.get("slug"), e.get("id")
        if not (slug and eid):
            continue
        if eid not in (art.get(slug) or {}):
            skipped_noimg += 1
            continue
        cc = slug2cc.get(slug)
        if not cc or cc not in fat:
            skipped_nocc += 1
            continue
        frm = e.get("from")
        if not frm:
            continue
        # `to` absent and `present` set means «still flying»; absent and not
        # present means the page gave a start and no end, which is still a
        # usable span — it runs until the next era begins, and sorting below
        # is what closes it.
        flags.setdefault(cc, []).append([frm, e.get("to"), slug + "--" + eid])
    for cc, rows in flags.items():
        rows.sort(key=lambda r: r[0])
        # CLOSE EVERY OPEN SPAN AGAINST THE NEXT ONE, so the client's lookup
        # is «the last era that had started by this year» and never has to
        # guess. An era left open would otherwise claim every year after it,
        # including the centuries another flag plainly held.
        for i, r in enumerate(rows):
            if r[1] is None and i + 1 < len(rows):
                r[1] = rows[i + 1][0] - 1

    fout = {
        "note": ("One row per era per country: [from, to, image]. `image` is "
                 "the basename of an SVG in /fl/, so a year resolves to a "
                 "flag with one lookup and one fetch. `at` is a label anchor "
                 "per country — the midpoint of its bounding box, which for "
                 "Chile sits in the sea and is the right place for a label. "
                 "An era whose page gave no end year is closed against the "
                 "next era's start, so a span never claims centuries another "
                 "flag plainly held; the last era of a country stays open."),
        "source": "data/flag-eras.json and data/era-flags.json, both extracted from the flags atlas pages",
        "generatedBy": "scripts/derive-era-moves.py",
        "generated": time.strftime("%Y-%m-%d"),
        "counts": {"countries": len(flags),
                   "eras": sum(len(v) for v in flags.values()),
                   "noImage": skipped_noimg,
                   "notACountryThisMapDraws": skipped_nocc},
        "at": {k: v for k, v in fat.items() if k in flags},
        "f": flags,
        # WHICH FLAGS PAGE IS WHICH COUNTRY, so the pages can link to the map
        # and the map back to the pages. The resolution is done here because
        # it is done here already, for the arrows; a second copy in Astro
        # would be a third place this mapping lives.
        "slug": {sl: cc for sl, cc in slug2cc.items() if cc in flags},
    }
    json.dump(fout, open(FLAGOUT, "w"), ensure_ascii=False, separators=(",", ":"))
    fc = fout["counts"]
    print(f"{FLAGOUT}: {fc['eras']:,} flag eras across {fc['countries']} countries"
          f" ({os.path.getsize(FLAGOUT)/1024:.0f} KB)")
    print(f"  eras with no image: {fc['noImage']:,}; eras whose country this "
          f"map does not draw: {fc['notACountryThisMapDraws']:,}")

    json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    c = out["counts"]
    print(f"{OUT}: {c['moves']:,} movements across {c['countries']} countries")
    print(f"  conquest {c['conquest']:,} · occupation {c['occupation']:,} · "
          f"migration {c['migration']:,}")
    print(f"  the other end is a country this map draws: {c['resolved']:,} "
          f"({100*c['resolved']/max(1,c['moves']):.0f}%); text only: {c['unresolved']:,}")
    print(f"  tags that are not a movement this can draw: {c['skipped']:,}")


if __name__ == "__main__":
    main()
