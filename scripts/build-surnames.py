#!/usr/bin/env python3
"""The surname dataset: names, their variants, and where each is attested.

THREE KINDS OF FACT, NEVER MIXED. A dataset that says «Llerena is a variant of
Lerena» should say who thinks so, because the three sources here are not of
equal quality and pretending otherwise is the sort of thing this project keeps
refusing to do.

  curated   Wikidata's «said to be the same as», and the variant clusters the
            seven family archives worked out from documents. A human looked at
            two spellings of one family and said they were the same family.
  register  A national register says the name is there, and how many people
            carry it. The strongest geography this dataset has.
  grammar   Two forms that a language makes of one name. Kowalski and Kowalska
            are the same surname in Polish, and that is a rule rather than an
            opinion — stronger than a phonetic guess, weaker than a human
            looking at a specific family.
  archive   The surname appears in one of the family archives, whose ground is
            known. «Attested in» means IT IS IN A DATASET WE HOLD — never that
            it exists in that country and nowhere else.
  sounds    An algorithm thinks they sound alike. Useful for casting a net,
            worthless as evidence, and labelled so nobody mistakes it.

LICENCE. Wikidata is CC0 and the archive material is David's own, so the output
is CC0 and can go anywhere. No CC BY source is folded in — GeoNames stays out
of this file deliberately, so that attribution does not have to travel with it.

    python3 scripts/build-surnames.py
"""
import json, os, re, sys, time, unicodedata, collections

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
# NO ABSOLUTE PATHS. The archives arrive through data/archive-surnames.json,
# which is in this repository; see scripts/harvest-archive-surnames.py for why.

# The seven archives, their ground, and where their people data lives.


def fold(s):
    s = (s or "").translate(str.maketrans({"đ": "d", "ł": "l", "ø": "o", "ß": "ss",
                                           "æ": "ae", "œ": "oe"}))
    s = unicodedata.normalize("NFKD", s)
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


# A consonant skeleton, language-agnostic on purpose. Soundex is built around
# English and mangles Slavic and Romance names; this instead folds the
# spelling differences that actually separate one family's variants —
# Defranceschi/Defranceski, Blazevic/Blazevich, Lerena/Llerena.
SUBS = [
    (r"[^a-z ]", ""), (r"\bde\s+", "de"), (r"\bdi\s+", "di"), (r"\bvan\s+", "van"),
    # «sch» IS TWO DIFFERENT SOUNDS AND THIS RULE USED TO KNOW ONLY ONE. In
    # German, Schmidt begins /ʃ/. In Italian, -schi and -sche are /sk/ — the h
    # is there precisely to STOP the c softening. Folding both to «s» split the
    # one family this whole project grew out of:
    #
    #   Defranceschi  ->  dfrnss      the Italian spelling
    #   Defranceski   ->  dfrnssk     the Slovene and Croatian one
    #
    # Two skeletons, so they never met, so neither was ever offered as a
    # variant of the other. They are the same name. Italian «sch» before a
    # front vowel now goes to «sk», which is what it says, and the German rule
    # keeps the rest.
    (r"sch", "s"), (r"sz", "s"), (r"cz", "c"),
    (r"ch", "c"), (r"ck", "k"),
    (r"ph", "f"), (r"th", "t"), (r"gh", "g"), (r"kh", "h"), (r"zh", "z"),
    (r"ci", "si"), (r"ce", "se"), (r"gi", "ji"), (r"ge", "je"),
    (r"qu", "k"), (r"x", "ks"), (r"w", "v"), (r"y", "i"), (r"j", "i"),
    (r"ll", "l"), (r"(.)\1+", r"\1"),
]
VOWELS = "aeiou"


def _skel(s):
    for pat, rep in SUBS:
        s = re.sub(pat, rep, s)
    s = re.sub(r"(.)\1+", r"\1", s)
    if not s:
        return ""
    head, rest = s[0], s[1:]
    rest = "".join(c for c in rest if c not in VOWELS)
    return (head + rest)[:8]


def skeletons(name):
    """Every reading of a name worth clustering on. Usually one.

    «SCH» IS TWO DIFFERENT SOUNDS AND THE SPELLING DOES NOT SAY WHICH. In
    German it is /ʃ/ — Schmidt, Fischer. In Italian, -schi and -sche are /sk/,
    and the h is there precisely to STOP the c softening. One rule folding both
    to «s» split the family this whole project grew out of:

        Defranceschi  ->  dfrnss      the Italian spelling
        Defranceski   ->  dfrnssk     the Slovene and Croatian one

    Two skeletons, so they never met, so neither was ever offered as a variant
    of the other. They are the same name.

    Choosing the Italian reading instead would have broken Fischer/Fisher the
    same way, in the other direction. So a name carrying «sch» gets BOTH
    readings and sits in both buckets — which costs one extra string for the
    four per cent of names that contain it, and stops this having to guess a
    language it cannot see.
    """
    s = fold(name)
    out = {_skel(s)}
    if "sch" in s:
        out.add(_skel(re.sub(r"sch", "sk", s)))
    return {x for x in out if x}


def skeleton(name):
    s = fold(name)
    return _skel(s)


# ---- what a surname is allowed to look like -----------------------------
# Registers publish artefacts as well as names. The Polish, Spanish and
# American files between them carry «[BRIGIDO?]», «[S», «A/GADIR» and a
# scattering of one-letter rows — a transcriber's doubt, a truncation and a
# separator, none of them a surname. A shareable dataset that ships them is a
# dataset somebody else has to clean.
JUNK = re.compile(r"[\[\]?*/\\|<>{}()\d]|^.$|^\W")

# 448,364 of 647,425 names arrived SHOUTING, because three of the six national
# registers publish in capitals and three do not. The same family reads
# «KOWALSKI» from Poland and «Kowalski» from France, which is one name printed
# two ways and looks like two facts.
#
# So the display form is normalised — and carefully, because the casing of a
# surname is not merely cosmetic. McDonald is not Mcdonald, d'Arcy is not
# D'arcy, and van der Berg is not Van Der Berg. The source spelling is never
# lost: every register keeps its own file under data/frequencies/.
PARTICLE = {"de", "del", "della", "dei", "di", "da", "das", "dos", "du", "des",
            "van", "von", "der", "den", "ter", "te", "op", "af", "al", "el",
            "la", "le", "lo", "y", "e", "i", "zu", "bin", "ibn", "abu"}


def display(name):
    """The form to print. Leaves anything already mixed-case alone."""
    name = " ".join((name or "").split())
    if not name or not name.isupper():
        return name                      # already cased by whoever wrote it
    out = []
    for i, word in enumerate(name.split(" ")):
        low = word.lower()
        if i and low in PARTICLE:
            out.append(low)              # Ferrer i Guàrdia, van der Berg
            continue
        # Split on the marks that start a new capital inside a word, and keep
        # them: O'Brien, Martin-Dupont, D'Angelo.
        part = re.split(r"([-'\u2019])", low)
        w = "".join(p if p in "-'\u2019" else p.capitalize() for p in part)
        # Mc and Mac take a capital on the stem. «Mace» and «Macey» do not,
        # which is why this needs the length test and not just the prefix.
        m = re.match(r"^(Mc|Mac)(.{3,})$", w)
        if m and low not in ("mackay", "mackie", "mackin", "macey", "macedo"):
            w = m.group(1) + m.group(2).capitalize()
        out.append(w)
    return " ".join(out)


def main():
    rec = {}          # folded name -> record
    SRC = {}          # short key -> the source it stands for
    dropped = [0]

    def touch(name):
        k = fold(name)
        if not k or JUNK.search(name or ""):
            dropped[0] += 1
            return None
        r = rec.get(k)
        if not r:
            r = rec[k] = {"n": display(name), "variants": [], "countries": []}
        elif r["n"].isupper() and not display(name).isupper():
            # A later, better-cased sighting of a name first seen shouting.
            r["n"] = display(name)
        elif len(name) > len(r["n"]) and name[:1].isupper():
            pass      # keep the first spelling seen as canonical
        return r

    def link(a, b, how):
        ra, rb = touch(a), touch(b)
        if not ra or not rb or fold(a) == fold(b):
            return
        for src, dst in ((ra, display(b)), (rb, display(a))):
            if not any(v["n"] == dst for v in src["variants"]):
                src["variants"].append({"n": dst, "how": how})

    def attest(name, cc, how, who, n=None):
        r = touch(name)
        if not r:
            return
        for c in r["countries"]:
            if c["cc"] == cc and c["by"] == who:
                return
        rec = {"cc": cc, "how": how, "by": who}
        if n is not None:
            rec["n"] = n
        r["countries"].append(rec)

    # ---- 1. Wikidata's curated «said to be the same as» -------------------
    try:
        pairs = json.load(open("data/wikidata-variants.json"))
    except FileNotFoundError:
        pairs = []
    for a, b in pairs:
        link(a, b, "curated")
    print(f"Wikidata: {len(pairs)} curated variant pairs")

    # ---- 2. The eight archives, from a COMMITTED SNAPSHOT ------------------
    # This used to glob the sibling repositories through an absolute path on
    # one Mac. GitHub Actions checks out this repository and nothing else, so
    # in CI the glob matched nothing, every archive attestation was dropped,
    # and the site served a dataset quietly missing them:
    #
    #     LIVE   Lerena -> Spain, United States
    #     LOCAL  Lerena -> ARGENTINA, Spain, United States, URUGUAY
    #
    # It was silent because iterating an empty list prints nothing. The snapshot
    # is written by scripts/harvest-archive-surnames.py and committed, which is
    # the same rule this project already applies to places: a cross-repo
    # dependency is a snapshot, never a live read.
    snap = json.load(open("data/archive-surnames.json"))["archives"]
    for label, a in sorted(snap.items()):
        ccs = a["countries"]
        names = a["surnames"]
        # PER SURNAME WHERE THE ARCHIVE CAN SAY SO. An archive's country list
        # applied to every name in it is the coarse answer — «everything in the
        # Lerena archive is in Argentina, Spain, Uruguay and South Africa» —
        # and it is how Lerena came to be attested in Croatia, because the
        # Defranceschi archive happens to mention the name once.
        #
        # Where an archive links its people to a place, and the place resolves
        # to a country, the attribution is exact: LERENA in South Africa
        # because five Lerenas are recorded at Cape Town, not because the
        # archive as a whole touches South Africa.
        by_name = a.get("bySurname") or {}
        mentions = a.get("mentions") or {}
        # A PASSING MENTION IS NOT RESEARCH. The Defranceschi archive names
        # «D'Arcy» exactly once — and its own name 830 times — and under the
        # old rule that one mention lent D'Arcy all twenty-nine countries that
        # archive touches, so the site shipped «D'Arcy, attested in Cuba».
        #
        # A name inherits an archive's country list when it is mentioned three
        # times or more, OR when the archive is small enough that its whole
        # list is deliberate: Booyzen's 94 surnames are DNA-cluster names, each
        # written once, and every one of them IS that archive's research. A
        # long tail of single mentions in a large archive is not.
        deliberate = len(names) < 150
        for n in names:
            # A SLASH IS A PROMISE, A BRACKET IS A GUESS.
            #
            # "Žubrinić / Xubrinich" and "Prpic / Perpic" are the archive
            # saying flatly that one family spelt its name two ways. Brackets
            # are not so reliable: "Papić (Papa)" and "Gerkacs (Gergacs)" are
            # variants, but "Blažević (Sojat)" is a maiden name and a
            # different family — and the first cut of this shipped Sojat as a
            # CURATED variant of Blažević, which is exactly the kind of
            # confident wrong answer the three-tier labelling exists to stop.
            #
            # So a bracketed form is only believed when the phonetic skeleton
            # agrees with it. The weak signal is not good enough to assert a
            # link on its own; it is good enough to corroborate an ambiguous
            # one, and to refuse it.
            slashed = [x.strip() for x in n.split("/") if x.strip()]
            head = slashed[0]
            bracket = re.search(r"\(([^)]*)\)", head)
            if bracket:
                head_clean = head[:bracket.start()].strip() or head
                inner = bracket.group(1).strip()
                if inner and len(inner) > 1 and skeleton(inner) == skeleton(head_clean):
                    link(head_clean, inner, "curated")
                head = head_clean
            for other in slashed[1:]:
                other = re.sub(r"\s*\([^)]*\)", "", other).strip()
                if len(other) > 1:
                    link(head, other, "curated")
            # THE EXACT LIST, OR NOTHING — NOT THE WHOLE ARCHIVE'S MAP.
            #
            # This used to fall back to every country the archive touches
            # anywhere, for any name it could not place precisely. On David's
            # own name that put "De Franceschi" in Albania, Cuba, Paraguay,
            # Zimbabwe, Greece, Turkey, Russia and Hong Kong — 29 countries,
            # from one Friulian family's archive, every one of them tagged as
            # attested. It is the same fault that once put D'Arcy in Cuba,
            # fixed then for passing mentions and left standing for the rest.
            #
            # The archives that place their names individually do it for most
            # of them: Defranceschi names 82, Mazza 76, Lerena 56. When one of
            # those does NOT name a surname, that silence is information — the
            # archive did not place it, so this must not either.
            #
            # The fallback survives only where it cannot mislead: an archive
            # whose whole geography is a single country. Falco and Booyzen
            # have no per-name lists and one country each, so inheriting it
            # says exactly what the archive says.
            where = by_name.get(n) or by_name.get(head)
            if not where and len(ccs) == 1 and (deliberate or mentions.get(n, 1) >= 3):
                where = ccs
            for cc in (where or []):
                attest(head, cc, "archive", label)
        print(f"{label:14} {len(names):5} surnames -> {','.join(ccs)}")

    # ---- 3. National registers --------------------------------------------
    # The only source here that says how MANY people carry a name, and the
    # only one whose geography is a fact about the country rather than about
    # one family's research.
    import glob as _g
    # Files beginning with an underscore are notes about the directory rather
    # than countries in it — _refused.json records the four that said no, and
    # feeding it to this loop broke every build until it was noticed.
    for p in sorted(_g.glob("data/frequencies/*.json")):
        if os.path.basename(p).startswith("_"):
            continue
        fq = json.load(open(p))
        cc = fq["country"]
        # Intern the source name. Written out in full it is seventy bytes
        # repeated 260,000 times — eighteen megabytes of the same sentence.
        # KEY BY FILE, NOT BY COUNTRY. The United States now has two — the
        # 2000 and 2010 census files — and keying on the country made the
        # second overwrite the first, losing which of them a name came from
        # just when that is the interesting part: 5,155 surnames are in the
        # 2000 list and not the 2010 one.
        key = os.path.basename(p)[:-5]
        SRC[key] = {"name": fq["source"], "url": fq.get("url"),
                    "licence": fq.get("licence"), "harvested": fq.get("harvested")}
        for row in fq["surnames"]:
            attest(row["n"], cc, "register", key, row["c"])
        for fem, masc in (fq.get("gendered") or {}).items():
            link(fem, masc, "grammar")
        print(f"{cc}: {len(fq['surnames'])} surnames from a national register, "
              f"{len(fq.get('gendered') or {})} grammatical pairs")

    # ---- 3b. The same name, spelt two ways --------------------------------
    #
    # David is researching a Martin KOZINA from a Slovene parish, recorded
    # elsewhere as KOSINA. Those did not link. s/z is the commonest
    # orthographic alternation in the Slavic languages and half of Central
    # Europe writes a name both ways depending on which clerk held the pen —
    # but this atlas had no tier for it. Curated means somebody checked;
    # grammar meant only the gendered pairs a register happened to publish;
    # and the phonetic tier is not offered to names carrying nothing but a
    # register row, which is exactly what Kosina and Kozina are.
    #
    # SAFE BECAUSE BOTH FORMS MUST ALREADY EXIST. A rule that generates
    # spellings would invent names; this only connects two surnames that are
    # both independently attested, which is a much smaller claim. One
    # substitution, four letters or more, and the pair has to be real.
    ALTERNATIONS = [
        ("s", "z"),      # Kosina / Kozina, Josip / Jozip
        ("c", "k"),      # Marcek / Markek
        ("c", "z"),      # Vucic / Vuzic
        ("w", "v"),      # Kowal / Koval
        ("i", "y"),      # Kosinski / Kosynski
        ("ch", "h"),     # Blachut / Blahut
        ("tz", "z"),     # Schultz / Schulz
        ("ck", "k"),     # Stucki / Stuki
        ("ff", "f"),     # Hoffman / Hofman
        ("ll", "l"), ("nn", "n"), ("tt", "t"), ("ss", "s"),
        # WHERE ONE ALPHABET WAS USED TO WRITE ANOTHER LANGUAGE'S SOUNDS.
        # The list above catches a slip of the pen. These catch a border.
        # David's own name is the case: Italian spells the ending -schi and
        # Croatian spells the same sound -ski, so Defranceschi and
        # Defranceski were two unrelated surnames on this site, each listing
        # the other nowhere, while the archive's own card calls them one
        # family. An Istrian clerk writing Gallignana and a Croatian one
        # writing Galinjana are doing this too.
        ("sch", "sk"),   # Defranceschi / Defranceski
        ("ch", "k"),     # Chersano / Kersano, Michel / Mikel
        ("gn", "nj"),    # Gallignana / Galinjana, Bagnoli / Banjoli
        ("gl", "lj"),    # Veglia / Velja
        ("ph", "f"),     # Stephan / Stefan
        ("th", "t"),     # Mathias / Matias
        ("sz", "s"),     # Hungarian and Polish against everyone else
        ("cz", "c"),     # Czajka / Cajka
        ("j", "i"),      # Jakov / Iakov
        # German umlauts, written out where the diacritic could not be.
        ("ae", "a"), ("oe", "o"), ("ue", "u"),
    ]
    # `rec` is keyed by the folded name already, and holds every surname
    # this build has seen from any source.
    _known = {_k: _v["n"] for _k, _v in rec.items()}
    _spelt = 0
    for _f, _real in list(_known.items()):
        if len(_f) < 4:
            continue
        for _a, _b in ALTERNATIONS:
            for _x, _y in ((_a, _b), (_b, _a)):
                if _x not in _f:
                    continue
                # One substitution only: two makes a different name.
                if _f.count(_x) != 1:
                    continue
                _cand = _f.replace(_x, _y)
                _other = _known.get(_cand)
                if _other and _other != _real:
                    link(_real, _other, "spelling")
                    _spelt += 1
    print(f"spelling: {_spelt} pairs that differ by one systematic substitution "
          f"and are both real surnames")

    # ---- 4. What merely sounds alike --------------------------------------
    # Only names that already carry something — a curated link, an archive, a
    # country beyond a bare register row — get phonetic neighbours. Clustering
    # all 277,000 would generate millions of «sounds alike» links between
    # Polish surnames nobody asked about, and bury the useful ones.
    # WHICH NAMES GET PHONETIC NEIGHBOURS, IN TWO PASSES — and the second pass
    # is the fix. Clustering all 667,000 would generate millions of «sounds
    # alike» links between Polish surnames nobody asked about and bury the
    # useful ones, so the first pass admits only names that already carry
    # something: a curated link, or a country attested by an archive rather
    # than by a bare register row.
    #
    # That gate was the whole gate, and it was too tight by exactly one step.
    # Defranceski qualified — three archives attest it. DEFRANCESCHI DID NOT:
    # it is a French register row and nothing else, so it never entered a
    # bucket, so it could not be offered as a variant of the name it is a
    # variant of. The interesting name was looking for neighbours in a room the
    # neighbours were not allowed into.
    #
    # So the first pass SEEDS the skeletons worth clustering, and the second
    # admits anybody who shares one. Kowalski still never seeds a skeleton, so
    # the 72,761 Polish grammatical pairs stay out, which is what the gate was
    # for.
    seeds = set()
    for r in rec.values():
        # A grammatical pair is not a reason to go looking: every one of
        # Poland's Kowalski/Kowalska pairs qualified under an earlier rule and
        # the clustering blew out to 234,775 links, which is noise wearing the
        # shape of data.
        if (any(v["how"] == "curated" for v in r["variants"])
                or any(c["how"] != "register" for c in r["countries"])):
            seeds |= skeletons(r["n"])
    by_skel = collections.defaultdict(list)
    for r in rec.values():
        for sk in skeletons(r["n"]) & seeds:
            by_skel[sk].append(r)
    print(f"phonetic: {len(seeds)} skeletons seeded by a name that carries something")
    # A BUCKET IS NOT A LIST OF VARIANTS, IT IS A SHORTLIST. The old rule threw
    # away any bucket over twelve as noise, which was right when the gate was
    # tight and wrong the moment it was loosened: «lrn» now holds Lerena,
    # Lerina, Llerena, Lorena, Larena and forty Polish names that merely
    # skeletonise the same way, and dropping the bucket lost the four real
    # ones with the forty.
    #
    # So nothing is dropped for being crowded. Every bucket-mate is scored
    # against the name by edit distance on the spelling, the far ones are cut,
    # and the nearest eight are kept. Lerena/Lerina is one edit. Lerena and a
    # Polish name sharing a consonant skeleton is six, and six is not a
    # variant of anything.
    # Separators are stripped ONCE PER NAME, here, and never inside the
    # comparison. «De Franceschi» and «Defranceschi» are the same name written
    # by two clerks rather than two edits apart, and counting the space as a
    # difference cost Defranceski its closest relative — but the first cut did
    # the stripping inside near(), which runs 23,870,844 times across these
    # buckets. Two re.sub calls per comparison is forty-eight million regex
    # executions to answer a question that has 667,561 distinct answers. The
    # build went from three minutes to not finishing.
    SEP = re.compile(r"[ '’-]")
    bare = {}

    def strip(name):
        v = bare.get(name)
        if v is None:
            v = bare[name] = SEP.sub("", fold(name))
        return v

    letters = {}

    def chars(name):
        v = letters.get(name)
        if v is None:
            v = letters[name] = frozenset(strip(name))
        return v

    def near(a, b, cap):
        """Edit distance, and it only has to be right up to `cap`.

        23,870,844 pairs go through this. A full Levenshtein on each one is
        the whole cost of this build, and almost all of that work is spent
        proving that two names are FAR APART — which is a much easier question
        than how far.

        Two cheap refusals first. A length gap wider than the cap cannot be
        closed. And each edit can remove at most one distinct letter from each
        side, so if the two names differ by more than 2·cap distinct letters,
        no sequence of `cap` edits reconciles them: «Kowalski» and «Brzezinka»
        are dismissed on a set operation rather than a 72-cell table.

        Then a BANDED table: an alignment that ever wanders more than `cap`
        cells off the diagonal has already spent more than `cap` edits getting
        there, so those cells are not computed. The row is abandoned the moment
        its cheapest cell exceeds the cap."""
        if abs(len(a) - len(b)) > cap:
            return 99
        prev = [0] * (len(b) + 1)
        for j in range(len(b) + 1):
            prev[j] = j
        for i, ca in enumerate(a, 1):
            lo, hi = max(1, i - cap), min(len(b), i + cap)
            cur = [99] * (len(b) + 1)
            cur[lo - 1] = i if lo == 1 else 99
            best = 99
            for j in range(lo, hi + 1):
                v = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != b[j - 1]))
                cur[j] = v
                if v < best:
                    best = v
            if best > cap:
                return 99
            prev = cur
        return prev[len(b)]

    sounded = 0
    for sk, group in by_skel.items():
        if len(group) < 2:
            continue
        for r in group:
            fa = strip(r["n"])
            # Three edits on a short name is most of the name. Scale the
            # allowance: Bo/Ba is not a variant, Defranceschi/Defranceski is.
            cap = max(1, min(3, len(fa) // 4))
            cand = []
            la = chars(r["n"])
            for other in group:
                if other is r:
                    continue
                if len(la ^ chars(other["n"])) > 2 * cap:
                    continue
                d = near(fa, strip(other["n"]), cap)
                if d <= cap:
                    cand.append((d, len(other["n"]), other["n"]))
            cand.sort()
            have = {v["n"] for v in r["variants"]}
            for _, _, n in cand[:8]:
                if n not in have:
                    r["variants"].append({"n": n, "how": "sounds"})
                    have.add(n)
                    sounded += 1
    print(f"phonetic: {sounded} «sounds alike» links across {len(by_skel)} skeletons")

    # ---- 5. The name that is also a place ---------------------------------
    # DAVID ASKED FOR THREE THINGS AND THIS FILE COULD ANSWER ONE. «Attested in»
    # was doing the work of all of them: where a name is BORNE, where a record
    # NAMES it, and where it CAME FROM. The first two are already here under
    # different evidence tiers and only needed telling apart. The third had no
    # evidence at all, and the honest answer to «where did this name come from»
    # is usually that nobody can cite it — every site that answers confidently
    # is quoting an unsourced etymology.
    #
    # There is one piece of origin evidence that CAN be cited, and this project
    # already holds it: a surname that is also the name of a place. Llerena is
    # a town of 5,716 people in Extremadura and it is the nearest spelling to
    # Lerena. That is not proof of origin — plenty of surnames are occupations
    # or patronymics that happen to collide with a place name, and plenty of
    # places are named after families rather than the other way round — but it
    # is a FACT with a source, which is more than an etymology page offers.
    #
    # MATCHED ON PHONETIC NEIGHBOURS TOO, AND THE FIRST CUT DID NOT — which
    # threw away the case that prompted the whole feature. Lerena has no place
    # of its own; LLERENA is a town of 5,716 in Extremadura and is Lerena's
    # nearest spelling, and excluding phonetic variants meant the one surname
    # David asked about got nothing at all while the town sat in the gazetteer.
    #
    # So they are included and they are LABELLED. A match on the name itself is
    # a different claim from a match on something that merely sounds like it,
    # and the panel says which — «Llerena, a town in Spain, though that is a
    # phonetic neighbour of your name rather than a spelling of it». Silently
    # merging the two would be the coincidence generator; saying which is which
    # is just the evidence tiering this file already does everywhere else.
    gaz = collections.defaultdict(list)
    try:
        for g in json.load(open("data/gazetteer.json"))["places"]:
            gaz[fold(g["n"])].append((g["n"], g.get("k"), g.get("p") or 0, "gazetteer"))
    except OSError:
        pass
    try:
        for c in json.load(open("data/italy-comuni.json"))["comuni"]:
            for form in [c["n"]] + (c.get("a") or []):
                gaz[fold(form)].append((form, "IT", 0, "comune"))
    except OSError:
        pass
    toponym = 0
    for r in rec.values():
        # form -> how we got to it, strongest first so a form reached two ways
        # keeps the stronger label.
        forms = {}
        for v in r["variants"]:
            if v["how"] == "sounds":
                forms.setdefault(fold(v["n"]), "sounds")
        for v in r["variants"]:
            if v["how"] != "sounds":
                forms[fold(v["n"])] = "variant"
        forms[fold(r["n"])] = "name"
        hits, seen_p = [], set()
        for f, via in forms.items():
            for nm, cc, pop, kind in gaz.get(f, []):
                key = (fold(nm), cc)
                if key in seen_p:
                    continue
                seen_p.add(key)
                hits.append({"n": nm, "cc": cc, "pop": pop, "kind": kind, "via": via})
        if hits:
            order = {"name": 0, "variant": 1, "sounds": 2}
            hits.sort(key=lambda h: (order[h["via"]], -h["pop"]))
            r["places"] = hits[:6]
            toponym += 1
    print(f"toponyms: {toponym} surnames are also the name of a place")

    out = []
    for k, r in sorted(rec.items()):
        # One row per country, carrying everyone who attests it. Falco and
        # Mazza both reach Italy, and the answer to «where is this name» is
        # «Italy», not «Italy, Italy».
        merged = {}
        for c in r["countries"]:
            m = merged.setdefault(c["cc"], {"cc": c["cc"], "how": c["how"], "by": []})
            if c["by"] not in m["by"]:
                m["by"].append(c["by"])
            # The count is the single most useful field a register gives and
            # the first cut of this merge dropped every one of them.
            if c.get("n") is not None:
                m["n"] = max(m.get("n", 0), c["n"])
            if c["how"] == "register":
                m["how"] = "register"
        r["countries"] = sorted(merged.values(), key=lambda c: c["cc"])
        r["skel"] = skeleton(r["n"])
        r["q"] = k
        out.append(r)

    doc = {
        "name": "Record Atlas surname dataset",
        "licence": "CC0-1.0",
        "built": time.strftime("%Y-%m-%d"),
        "note": "Three kinds of fact, never mixed. `how` on every variant and every "
                "country says which: `curated` means a human linked them, `archive` "
                "means the name appears in a named family archive whose ground is "
                "known, `sounds` means only that an algorithm thinks they sound alike. "
                "«Attested in» means the name appears in a dataset held here — never "
                "that it exists in that country, and never that it exists nowhere else.",
        "attestedBy": SRC,
        "sources": [
            "Wikidata, instance of family name (Q101352), property P460. CC0.",
            "The seven Defranceski-family archives — David Defranceski's own research.",
            "National surname registers — see data/frequencies/ for each one's "
            "source, licence and date.",
            "Phonetic skeletons computed here; algorithmic, not evidence.",
        ],
        "counts": {
            "surnames": len(out),
            "withRegisterCount": sum(1 for r in out
                                     if any(c.get("n") for c in r["countries"])),
            "withVariants": sum(1 for r in out if r["variants"]),
            "withCountries": sum(1 for r in out if r["countries"]),
            "curatedLinks": sum(1 for r in out for v in r["variants"] if v["how"] == "curated"),
            "alsoAPlace": sum(1 for r in out if r.get("places")),
        },
        "surnames": out,
    }
    # Compact, and NOT committed: 293,210 surnames is 84 MB pretty-printed and
    # it is derived in full from data/frequencies/ and data/wikidata-variants.json,
    # both of which are. Keep the sources in git and make the merge.
    json.dump(doc, open("data/surnames.json", "w"), ensure_ascii=False,
              separators=(",", ":"))
    print(f"\n{len(out)} surnames -> data/surnames.json")
    print(f"  {dropped[0]} rows refused as not-a-surname — brackets, slashes, "
          f"digits or a single character")
    print("  " + " · ".join(f"{k}: {v}" for k, v in doc["counts"].items()))


if __name__ == "__main__":
    main()
