#!/usr/bin/env python3
"""The worldwide gazetteer — every name a place has ever been written under.

THE FIRST OF THE THREE PROBLEMS, SOLVED FOR THE WHOLE WORLD. The shelf is deep
in one corner and will be for a long time. But "the name changed" does not need
a shelf to answer: it needs a gazetteer, and one exists, openly licensed, with
the historical exonyms in it. Pressburg is Bratislava. Fiume is Rijeka.
Lemberg is Lviv. A researcher holding a document that says Pressburg can be
told what to type next, in any country on earth, whether or not this map has
walked a single register there.

SOURCE. GeoNames cities5000 as a worldwide floor, PLUS per-country dumps for
the ground this atlas actually works — CC BY 4.0.

BOTH, BECAUSE EITHER ALONE IS WRONG. The country files answer «Lovinac», which
cities5000 cannot: it starts at five thousand people and Lovinac has 290, Krivi
Put 39, Mrzli Dol 23. But nineteen country files cover nineteen countries, and
swapping one for the other would have taken the gazetteer away from the eighty
other countries that have a walked place in this atlas — trading a hole in
Croatia for eighty holes elsewhere. Layered, and deduplicated on the GeoNames
id, every country keeps what it had and nineteen of them gain their villages.

WAS. GeoNames per-country dumps, CC BY 4.0 — HR.txt, IT.txt and the rest,
which is what «Lovinac» needed: cities5000 starts at five thousand people and
Lovinac has 290, Krivi Put 39, Mrzli Dol 23. The country files carry every
populated place, so the gazetteer answers the villages a parish register
actually names. Written gzipped — see scripts/gazetteer.py for why.

WAS. GeoNames `cities5000`, CC BY 4.0 — 69,722 populated places, 59,159 of
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
import time as _time
import gazetteer as _gazetteer

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


# THE SCRIPT THE RECORDS ARE ACTUALLY IN, WHICH IS NOT ALWAYS LATIN.
#
# `latin()` above threw away every name not written in Latin letters, on the
# reasoning that those are transliterations of the CURRENT name and what a
# genealogist needs is the name on the document in their hand. That reasoning
# is sound for Europe west of the Bug and wrong everywhere east of it: a
# Russian parish register says Тверь, and FamilySearch files it under Тверь.
#
# MEASURED, NOT ASSUMED. 112,938 volumes sat unplaced under Cyrillic names —
# RU 68,048, BY 39,588, MD 5,302 — against a gazetteer that held the Latin
# «Tver» and had been made to forget the Cyrillic «Тверь» that would have
# matched it. It also forgot «Калинин», the name the town carried from 1931 to
# 1990, which is precisely the «what was this called» question this file
# exists to answer. Both were in the GeoNames row all along.
#
# This is an EXACT match restored, not a romanisation guessed. A transliterator
# that turned Тверь into Tver would be placing a book on resemblance; keeping
# the name GeoNames already records for the place places it on identity.
NATIVE = {
    "RU": "CYRILLIC", "BY": "CYRILLIC", "UA": "CYRILLIC", "MD": "CYRILLIC",
    "BG": "CYRILLIC", "RS": "CYRILLIC", "MK": "CYRILLIC", "ME": "CYRILLIC",
    "KZ": "CYRILLIC", "KG": "CYRILLIC", "TJ": "CYRILLIC", "MN": "CYRILLIC",
    "GR": "GREEK",
}


# ROMANISED ONLY TO RANK, NEVER TO MATCH — and the difference is the whole
# reason this is allowed to exist.
#
# A transliterator that turned «Тверь» into «Tver» and then PLACED a book on
# the strength of it was measured and refused: it would put a book somewhere
# on resemblance, and this atlas does not do that. Deciding which of a place's
# OWN recorded names to keep is not that. Every candidate here is already a
# name GeoNames holds for this exact place; the worst a bad score can do is
# keep a true name in a worse order, and nothing is placed either way.
#
# It exists because `nat[:6]` took GeoNames' own order, which is arbitrary.
# Ulyanovsk's first six native forms are «Оулиꙗновьскъ, Сембер, Синбирск,
# Сімбір, Ульск, Ульянаўск» — Old Church Slavonic, Belarusian and three
# historical spellings — and the one name a Russian document actually says,
# Ульяновск, fell off the end. Two of fourteen major cities tested had lost
# their own modern name that way.
ROMAN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    "і": "i", "ї": "yi", "є": "ye", "ґ": "g", "ў": "w",          # UA, BY
    "ђ": "dj", "ј": "j", "љ": "lj", "њ": "nj", "ћ": "c", "џ": "dz",  # RS
    "α": "a", "β": "v", "γ": "g", "δ": "d", "ε": "e", "ζ": "z",   # GR
    "η": "i", "θ": "th", "ι": "i", "κ": "k", "λ": "l", "μ": "m",
    "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s",
    "ς": "s", "τ": "t", "υ": "y", "φ": "f", "χ": "ch", "ψ": "ps", "ω": "o",
}


def romanise(s):
    """Rough Latin for a native-script name. For ranking only — see above."""
    return "".join(ROMAN.get(c, c) for c in fold(s))


def native(s, cc):
    """Is this the place's name in the script its own records are written in?"""
    want = NATIVE.get(cc)
    if not want:
        return False
    letters = [c for c in unicodedata.normalize("NFKD", s) if c.isalpha()]
    if not letters:
        return False
    hit = sum(1 for c in letters if want in unicodedata.name(c, ""))
    return hit / len(letters) > 0.9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, nargs="+",
                    help="GeoNames dump files — cities5000.txt, or per-country "
                         "files like HR.txt (several may be given)")
    ap.add_argument("--out", default="data/gazetteer.json.gz")
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
        fcode = f[7]

        # POPULATED PLACES, AND ISLANDS. The first rule was «class P only»,
        # which cities5000 guaranteed and a country file does not: HR.txt holds
        # 26,632 rows and only 11,631 are places anybody lived in, the rest
        # mountains, streams, forests, chapels and stretches of road. A
        # gazetteer that answers «Velebit» with a mountain range when somebody
        # typed it looking for a village is worse than one that says nothing,
        # and that is still true of every class this does not name.
        #
        # IT WAS TOO BROAD BY ONE CLASS. David searched Mljet and the map had
        # never heard of it. Mljet is an island, so it fell out — while all
        # thirteen of its villages stayed in, Babino Polje and Sobra and
        # Goveđari and Polače. The records were there under names nobody types.
        # Measured against Croatia's 48 inhabited islands: 11 could not be
        # found at all — Brač, Mljet, Lošinj, Dugi Otok, Šipan, Iž, Prvić,
        # Kornat, both Drveniks, Male Srakane — and the other 37 only by the
        # luck of a settlement sharing the name.
        #
        # AN ISLAND IS NOT A MOUNTAIN RANGE. People were born on Mljet, the
        # parish registers say Mljet, and a reader writing to an archive writes
        # Mljet. It is the unit the record is filed under, which is the test
        # this gazetteer exists to serve.
        #
        # NO INHABITEDNESS TEST, BECAUSE THERE IS NO HONEST ONE. GeoNames gives
        # a population for 9 of Croatia's 478 islands — Mljet's is 0 and an
        # islet of four people has one. Distance to the nearest village does
        # not separate them either: at 3km it admits 321 of 478, nearly all
        # bare rock, and Brač still needs 3.5. Nor does the alternate-name
        # count: 351 of 478 carry three or more, because Venetian charts named
        # every rock in the Adriatic. Every candidate test was an inference
        # dressed as evidence, so none is used.
        #
        # RANKED INSTEAD OF EXCLUDED, which answers the Velebit objection
        # properly. Rows are sorted by population below and islands carry 0, so
        # a name that is both a village and an islet answers the village first
        # — 124 of the 478 collide that way and every one of them still leads
        # with its settlement. The other 354 answer a name nothing in this map
        # held at all.
        #
        # AND THE EXONYMS COME FREE, which is the larger prize. GeoNames
        # already files Brazza, Lesina, Meleda, Lussino, Veglia, Giuppana and
        # Curicta as other names for these islands — the words actually written
        # on Venetian and Austrian-era documents. A reader holding a certificate
        # that says Meleda got nothing before this.
        if fclass != "P" and not (fclass == "T" and fcode == "ISL"):
            skipped_class += 1
            continue
        # The same place can appear in two source files when a country file is
        # given alongside cities5000. First wins; they are the same row.
        if gid in seen_ids:
            continue
        seen_ids.add(gid)

        base = {fold(name), fold(ascii_name)}
        fname = fold(name)
        cand, nat = [], []
        for alt in alts.split(",") if alts else []:
            alt = alt.strip()
            # AN AIRPORT CODE IS THREE LATIN LETTERS, AND «Уфа» IS A CITY.
            # This dropped everything shorter than four characters to clear
            # out LHR and BRU, and then the native-script pool inherited a
            # rule written for Latin: Уфа is three characters and vanished,
            # along with every other short name in its script. The codes this
            # is aimed at are Latin, so the rule stays where it belongs.
            if len(alt) < 4 and (latin(alt) or not native(alt, cc)):
                continue
            if alt.isupper():                      # ditto, and shouting
                continue
            if not latin(alt):
                # NOT LATIN IS NOT THE SAME AS NOT USEFUL. A name in the
                # country's own script goes to its own pool below, because the
                # clustering the Latin names go through would destroy it:
                # «Твер» and «Тверь» score 0.89 against each other, so they
                # collapse to one and the rule «prefer the shortest» — right
                # for a Latin exonym, since the short form is the historical
                # one rather than a romance elaboration — keeps «Твер» and
                # throws away «Тверь», the only form anybody files under.
                if native(alt, cc):
                    fa = fold(alt)
                    if fa not in base:
                        base.add(fa)
                        nat.append(alt)
                continue                           # a transliteration, not a former name
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
        # EVERY NATIVE NAME, UNCAPPED AND UNCLUSTERED — and it took three
        # wrong diagnoses to get here, so they are written down.
        #
        # The Latin pool beside this is clustered and capped for a good
        # reason: GeoNames lists dozens of romanisations of one name and a
        # reader wants a curated handful. This list is not for reading. It is
        # what a DOCUMENT might say, and every entry in it is a name GeoNames
        # records for this exact place.
        #
        #   1. «nat[:6]» in GeoNames' own order lost Ульяновск and Уфа, so I
        #      ranked by closeness to the place's ASCII name.
        #   2. Ranking filled all six slots with Ульяновск, Ульяновськ,
        #      Уляновск, Улјановск, Уљановск and Ульянаўск — one name in six
        #      national spellings — so I clustered them, as the Latin pool
        #      does.
        #   3. Clustering lost Тверь to Твер, which romanise alike; a
        #      length tie-break fixed that and lost Минск and Кишинёв.
        #      Removing the cap did not bring them back, which is what showed
        #      the cap had never been the problem: CLUSTERING was. «Минск»
        #      and «Мінск» romanise identically and are Russian and
        #      Belarusian, and a register may be written in either.
        #
        # Each heuristic won some names and lost others, and the ones it lost
        # were different every time. There is no ordering that chooses
        # correctly between a place's own names, because the choice itself is
        # the mistake — the romanisation is deliberately rough and cannot tell
        # a soft sign from nothing, a Ukrainian и from a Russian и.
        #
        # So: keep them all. Ordered modern-name-first for display only,
        # because `a` is also what a panel prints.
        _ascii = fold(ascii_name or name)
        _sim = lambda a: difflib.SequenceMatcher(None, _ascii, romanise(a)).ratio()
        nat.sort(key=lambda a: (-_sim(a), -len(a)))
        nat = nat[:1] + sorted(nat[1:], key=_sim)
        out = nat + reps[:12]
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
        # AN ISLAND HAS TO HAVE BEEN WRITTEN DOWN TWICE. Admitting the class
        # outright means 164,854 islands across these countries, and 48,766 of
        # them are Finnish lake skerries and 19,667 Canadian ones — bare rock,
        # the exact objection the class-P rule was written to answer, at scale.
        #
        # THE TEST IS DOCUMENTARY PRESENCE, NOT INHABITEDNESS, because there is
        # no honest test for the second (see above) and because the first is
        # the one this atlas actually turns on: a reader is holding a paper
        # with a name on it. An island somebody once wrote down in another
        # language is an island that can appear on a certificate. One that
        # nobody has ever written twice cannot.
        #
        # It is not a new rule either — `out` is the builder's own curated
        # alternate list, already stripped of airport codes, romanisations and
        # accent variants. This just requires islands to survive it.
        # 164,854 becomes 40,775. Finland's 48,766 become 2,667, Canada's
        # 19,667 become 225, and every one of the eleven Croatian islands that
        # could not be found before comes back.
        #
        # DELIBERATELY NOT APPLIED TO VILLAGES, which keep their rows with no
        # alternates at all. Krivi Put has 39 people and no German name and is
        # exactly the row a reader working the Blažević registers needs. A
        # village with no exonym is still where somebody was born; a rock with
        # no exonym is not anywhere.
        if fclass == "T" and not out:
            skipped_class += 1
            continue
        rec = {"n": name, "y": round(float(lat), 4), "x": round(float(lon), 4),
               "k": cc, "p": int(pop or 0), "a": out,
               "q": " ".join(sorted(base))}
        # SAID ON THE ROW, so the panel can call it an island rather than
        # letting a reader assume a town. Only set when it is one; a row
        # without `f` is a populated place, as every row was before.
        if fclass == "T":
            rec["f"] = "isl"
        rows.append(rec)

    rows.sort(key=lambda r: -r["p"])
    # SAID, NOT ASSUMED. The first cut of this change left «Worldwide» and
    # «cities5000» in place while the data underneath had become 19 country
    # files — a gazetteer misdescribing its own coverage, which is the one
    # thing this atlas is built not to do. The countries and the date are
    # counted from what was actually read.
    # BIGGEST FIRST, GUARANTEED RATHER THAN INHERITED. RecordMap.astro sorts
    # its gazetteer hits by match quality alone and notes that «the shard is
    # already in population order, which is the right tie-break: somebody
    # typing Czernowitz means Chernivtsi, not a suburb of Brno». That was true
    # only because cities5000.txt happens to be sorted by population and
    # happened to be listed first; build.py drops the population field when it
    # shards, so nothing downstream can recover the order if it is lost.
    #
    # It matters far more now. Croatia alone has 55 places whose name starts
    # «Rij» and 30 called Rijeka — full country coverage means common village
    # names repeat — so a reader typing «Rijeka» gets the city or gets a
    # hamlet depending on an argument order nobody would think to preserve.
    rows.sort(key=lambda r: -int(r.get("p") or 0))
    ccs_in = sorted({r["k"] for r in rows})
    # AND THE NOTE WAS STILL OVERCLAIMING, IN THE OTHER DIRECTION. It read
    # «every populated place GeoNames holds for the countries listed in
    # `countries`, NOT worldwide», which is true of the countries a per-country
    # file was read for and false of the two hundred reached only by the
    # cities5000 floor. The Netherlands had 582 places in a gazetteer that
    # described itself as holding every one of them; the real number is tens of
    # thousands, and 43,246 Dutch volumes sat unplaced because of the gap the
    # note denied. `full` now says which countries the strong claim covers.
    #
    # TAKEN FROM THE FILES THAT WERE READ, which is the only exact answer.
    #
    # The first cut inferred it from the rows — a populated place under five
    # thousand people can only have come from a country file, because that is
    # where the cities5000 floor starts — and it was wrong in both directions.
    # cities5000 carries administrative seats whatever their population, so one
    # such row was enough to mark a country fully covered: 151 countries
    # claimed it and 50 had earned it. A count threshold fixed the arithmetic
    # and left a threshold, which is a number to be wrong about later.
    #
    # The source list is not a guess. `HR.txt` is Croatia and `cities5000.txt`
    # is not a country, and nothing about that can drift.
    full = sorted({os.path.basename(src).split(".")[0].upper()
                   for src in a.src
                   if len(os.path.basename(src).split(".")[0]) == 2}
                  & {r["k"] for r in rows})
    out = {"note": "Place-name gazetteer. For the countries listed in `full`, "
                   "every populated place GeoNames holds, down to the "
                   "single-farm hamlet, plus every island written down twice "
                   "— `f`:\"isl\" marks one. For every OTHER country in "
                   "`countries` this is the cities5000 floor only: places of "
                   "five thousand people and up, so villages are missing. "
                   "Neither is worldwide-complete. "
                   "n=name y=lat x=lon k=country p=population a=other names it "
                   "has been written under q=every form folded for search. "
                   "Names are kept in Latin script and, for the countries "
                   "whose own records are not written in it, in that script "
                   "too — Тверь as well as Tver. "
                   "A row with no `a` is a place nobody wrote differently — "
                   "usually a village — and is here so that it can be found at "
                   "all. Built by scripts/build-gazetteer.py.",
           "source": "GeoNames cities5000 as a worldwide floor plus per-country "
                     "dumps, CC BY 4.0 — https://www.geonames.org/",
           "licence": "CC BY 4.0 (GeoNames)",
           "countries": ccs_in,
           "full": full,
           "built": _time.strftime("%Y-%m-%d"),
           "places": rows}
    # WRITTEN THROUGH THE SHARED HELPER, which decides gzip by the extension.
    # Renaming the default to .gz without changing this line produced a 56 MB
    # file of plain JSON wearing a .gz suffix — every reader then failed
    # trying to gunzip it, and the size that justified the whole change never
    # materialised.
    _gazetteer.dump(out, a.out)
    print(f"{len(rows)} places carrying {kept_alts} other names -> {a.out}")
    print(f"{os.path.getsize(a.out)/1024/1024:.1f} MB")
    print("countries:", len({r['k'] for r in rows}))


if __name__ == "__main__":
    main()
