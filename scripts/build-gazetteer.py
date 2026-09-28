#!/usr/bin/env python3
"""The worldwide gazetteer — every name a place has ever been written under.

THE FIRST OF THE THREE PROBLEMS, SOLVED FOR THE WHOLE WORLD. The shelf is deep
in one corner and will be for a long time. But "the name changed" does not need
a shelf to answer: it needs a gazetteer, and one exists, openly licensed, with
the historical exonyms in it. Pressburg is Bratislava. Fiume is Rijeka.
Lemberg is Lviv. A researcher holding a document that says Pressburg can be
told what to type next, in any country on earth, whether or not this map has
walked a single register there.

SOURCE. GeoNames `cities5000`, CC BY 4.0 — 69,722 populated places, 59,159 of
them carrying alternate names. Downloaded, not scraped: the providers this
project would otherwise have ingested (Matricula, Antenati, the Polish state
archives) all refuse robots, and the honest answer to that is to use the data
that is actually offered rather than to take what is not.

WHAT IS THROWN AWAY, AND WHY. GeoNames lists every script a name is written in
— Риека, リエカ, ريجيكا. Those are transliterations of the CURRENT name, not
historical forms, and they are the bulk of the bytes. What a genealogist needs
is the name on the document in their hand, which for European records is Latin
script. Airport codes go too. What is left is the useful half.

SHARDED BY FIRST LETTER, because 69,722 places will not ride in the index that
draws the map, and should not: this is a search corpus, fetched only when
somebody types something the shelf cannot answer.

    python3 scripts/build-gazetteer.py --src cities5000.txt
"""
import argparse, difflib, json, os, sys, unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

XLAT = str.maketrans({"đ": "d", "Đ": "D", "ł": "l", "Ł": "L", "ø": "o", "Ø": "O",
                      "ß": "ss", "æ": "ae", "œ": "oe", "ı": "i"})


def fold(s):
    s = (s or "").translate(XLAT)
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def latin(s):
    """Is this written in the alphabet the documents are written in?"""
    letters = [c for c in unicodedata.normalize("NFKD", s) if c.isalpha()]
    if not letters:
        return False
    lat = sum(1 for c in letters if "LATIN" in unicodedata.name(c, ""))
    return lat / len(letters) > 0.9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, nargs="+",
                    help="GeoNames dump files — cities5000.txt, or per-country "
                         "files like HR.txt (several may be given)")
    ap.add_argument("--out", default="data/gazetteer.json")
    a = ap.parse_args()

    rows, kept_alts, skipped_class = [], 0, 0
    seen_ids = set()
    lines = []
    for src in a.src:
        with open(src, encoding="utf-8") as fh:
            lines += fh.readlines()
    for line in lines:
        f = line.rstrip("\n").split("\t")
        if len(f) < 15:
            continue
        gid, name, ascii_name, alts = f[0], f[1], f[2], f[3]
        lat, lon, fclass, cc, pop = f[4], f[5], f[6], f[8], f[14]

        # POPULATED PLACES ONLY, which cities5000 guaranteed and a country file
        # does not. HR.txt holds 26,632 rows and only 11,631 of them are places
        # anybody lived in; the rest are mountains, streams, forests, chapels
        # and stretches of road. A gazetteer that answers «Velebit» with a
        # mountain range when somebody typed it looking for a village is worse
        # than one that says nothing.
        if fclass != "P":
            skipped_class += 1
            continue
        # The same place can appear in two source files when a country file is
        # given alongside cities5000. First wins; they are the same row.
        if gid in seen_ids:
            continue
        seen_ids.add(gid)

        base = {fold(name), fold(ascii_name)}
        fname = fold(name)
        cand = []
        for alt in alts.split(",") if alts else []:
            alt = alt.strip()
            if len(alt) < 4:                       # airport and rail codes
                continue
            if alt.isupper():                      # ditto, and shouting
                continue
            if not latin(alt):                     # a transliteration, not a former name
                continue
            # GeoNames also carries ROMANISATIONS of non-Latin scripts —
            # "bu la di si la fa" for Bratislava, "lywyw" for Lviv, "pwlh" for
            # Pula. They pass the Latin test because they are spelt in Latin
            # letters, and they are worthless here: nobody's certificate says
            # them. They come through uncapitalised, where every genuine
            # European exonym is capitalised, so that is the tell.
            if not alt[0].isupper():
                continue
            fa = fold(alt)
            if fa in base:                         # the same name, differently accented
                continue
            base.add(fa)
            cand.append(alt)

        # CLUSTER FIRST, THEN RANK, THEN CAP — in that order, because getting
        # it wrong loses the names that matter.
        #
        # Ranking alphabetically was the first mistake: it kept Bratislava's
        # "An Bhrataslaiv" and "Baratislawa" and threw away Pressburg, Pozsony
        # and Posonium, which are the only forms anyone has seen on a document.
        #
        # Ranking by difference fixed that and left a subtler one. Wrocław
        # carries seventy-five alternates, six of which are the same name —
        # Breslavia, Breslávia, Breslavl', Breslava, Breslū, Breslu — and they
        # crowded BRESLAU itself out of the top ten. A cap applied to a list
        # that is mostly one name repeated spends itself on the repetition.
        #
        # So: collapse near-identical forms to one representative, preferring
        # the shortest, which is reliably the historical name rather than a
        # romance-language elaboration of it. THEN rank what is left by how
        # different it is from the current name, because a different WORD is
        # the one you could never have guessed, and cap.
        clusters = []
        for alt in sorted(cand, key=len):
            fa = fold(alt)
            for c in clusters:
                if difflib.SequenceMatcher(None, fold(c[0]), fa).ratio() > 0.85:
                    c.append(alt)
                    break
            else:
                clusters.append([alt])
        reps = [c[0] for c in clusters]
        reps.sort(key=lambda alt: difflib.SequenceMatcher(None, fname, fold(alt)).ratio())
        out = reps[:12]
        # A PLACE WITH NO OTHER NAME IS STILL A PLACE. This used to drop every
        # row that carried no alternate, which was right while the source was
        # cities5000 and the question was «the name changed»: Pressburg is
        # Bratislava, and a town nobody ever wrote differently added nothing.
        #
        # It is wrong now the source is the per-country files. David searched
        # for Lovinac and found nothing; the gazetteer held 73 Croatian places
        # against the country file's 11,631. Krivi Put has 39 people and no
        # German name, so it has no alternates and was discarded — and it is
        # precisely the village a reader working the Blažević registers needs
        # to type. The second question a gazetteer answers is not «what was
        # this called» but «does this place exist, and where», and a row with
        # no exonym answers that one perfectly well.
        #
        # It costs little: a row without alternates is a name, a point and a
        # country, and the alternate blob was always the bulk of the bytes.
        kept_alts += len(out)
        rows.append({"n": name, "y": round(float(lat), 4), "x": round(float(lon), 4),
                     "k": cc, "p": int(pop or 0), "a": out,
                     "q": " ".join(sorted(base))})

    rows.sort(key=lambda r: -r["p"])
    out = {"note": "Worldwide place-name gazetteer. n=name y=lat x=lon k=country "
                   "p=population a=other names it has been written under q=every form "
                   "folded for search. Built by scripts/build-gazetteer.py.",
           "source": "GeoNames cities5000, CC BY 4.0 — https://www.geonames.org/",
           "licence": "CC BY 4.0 (GeoNames)",
           "built": "2026-09-16",
           "places": rows}
    json.dump(out, open(a.out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} places carrying {kept_alts} other names -> {a.out}")
    print(f"{os.path.getsize(a.out)/1024/1024:.1f} MB")
    print("countries:", len({r['k'] for r in rows}))


if __name__ == "__main__":
    main()
