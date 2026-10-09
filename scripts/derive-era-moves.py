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
import json, os, re, time

ERAS = "site/public/flag-eras.json"
INDEX = "site/public/flag-index.json"
COUNTRIES = "data/countries.json"
FLAGSJS = "site/src/lib/flags.js"
OUT = "site/public/era-moves.json"

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
        subj = slug2cc.get(slug)
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
            })

    # A POINT PER COUNTRY, CARRIED HERE SO THE LAYER IS ONE FETCH.
    # An arrow needs two coordinates, and the alternative was for the client to
    # pull a country outline per end — up to 237 files to draw one year. The
    # rings are already open in this process, so the midpoint of each bounding
    # box rides along in the same file. It is a label anchor, not a centroid:
    # for Chile or Norway it sits in the sea, which is the right place for the
    # tail of an arrow about a whole country anyway.
    at = {}
    for cc, v in countries.items():
        rings = v.get("rings") or []
        if not rings:
            continue
        lons = [p[0] for r in rings for p in r]
        lats = [p[1] for r in rings for p in r]
        at[cc] = [round((min(lats) + max(lats)) / 2, 3),
                  round((min(lons) + max(lons)) / 2, 3)]
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
        "moves": moves,
    }
    out["counts"]["points"] = len(at)
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
