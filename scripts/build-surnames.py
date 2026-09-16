#!/usr/bin/env python3
"""The surname dataset: names, their variants, and where each is attested.

THREE KINDS OF FACT, NEVER MIXED. A dataset that says «Llerena is a variant of
Lerena» should say who thinks so, because the three sources here are not of
equal quality and pretending otherwise is the sort of thing this project keeps
refusing to do.

  curated   Wikidata's «said to be the same as», and the variant clusters the
            seven family archives worked out from documents. A human looked at
            two spellings of one family and said they were the same family.
  archive   The surname appears in one of those archives, whose ground is
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
PROJ = "/Users/daviddefranceski/Claude/Projects"

# The seven archives, their ground, and where their people data lives.
ARCHIVES = [
    ("Defranceschi", "Defranceski Family", ["HR", "IT"]),
    ("Falco",        "Falco Family",       ["IT"]),
    ("Blažević",     "Blazevic Family",    ["HR"]),
    ("Booyzen",      "Booyzen Family",     ["ZA"]),
    ("Lerena",       "Lerena Family",      ["AR", "UY", "ES"]),
    ("D'Arcy",       "D'arcy Family",      ["GB", "IE", "AU"]),
    ("Mazza",        "Mazza Family",       ["IT", "AU", "US"]),
    ("Luwinski",     "Luwinski Family",    ["PL", "DE"]),
]


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
    (r"sch", "s"), (r"sz", "s"), (r"cz", "c"), (r"ch", "c"), (r"ck", "k"),
    (r"ph", "f"), (r"th", "t"), (r"gh", "g"), (r"kh", "h"), (r"zh", "z"),
    (r"ci", "si"), (r"ce", "se"), (r"gi", "ji"), (r"ge", "je"),
    (r"qu", "k"), (r"x", "ks"), (r"w", "v"), (r"y", "i"), (r"j", "i"),
    (r"ll", "l"), (r"(.)\1+", r"\1"),
]
VOWELS = "aeiou"


def skeleton(name):
    s = fold(name)
    for pat, rep in SUBS:
        s = re.sub(pat, rep, s)
    s = re.sub(r"(.)\1+", r"\1", s)
    if not s:
        return ""
    head, rest = s[0], s[1:]
    rest = "".join(c for c in rest if c not in VOWELS)
    return (head + rest)[:8]


def main():
    rec = {}          # folded name -> record

    def touch(name):
        k = fold(name)
        if not k:
            return None
        r = rec.get(k)
        if not r:
            r = rec[k] = {"n": name, "variants": [], "countries": []}
        elif len(name) > len(r["n"]) and name[:1].isupper():
            pass      # keep the first spelling seen as canonical
        return r

    def link(a, b, how):
        ra, rb = touch(a), touch(b)
        if not ra or not rb or fold(a) == fold(b):
            return
        for src, dst in ((ra, b), (rb, a)):
            if not any(v["n"] == dst for v in src["variants"]):
                src["variants"].append({"n": dst, "how": how})

    def attest(name, cc, how, who):
        r = touch(name)
        if not r:
            return
        if not any(c["cc"] == cc and c["by"] == who for c in r["countries"]):
            r["countries"].append({"cc": cc, "how": how, "by": who})

    # ---- 1. Wikidata's curated «said to be the same as» -------------------
    try:
        pairs = json.load(open("/tmp/wd-variant-pairs.json"))
    except FileNotFoundError:
        pairs = []
    for a, b in pairs:
        link(a, b, "curated")
    print(f"Wikidata: {len(pairs)} curated variant pairs")

    # ---- 2. The seven archives --------------------------------------------
    import glob
    for label, folder, ccs in ARCHIVES:
        names = collections.Counter()
        for p in glob.glob(os.path.join(PROJ, folder, "site/src/data/*.json")):
            try:
                j = json.load(open(p))
            except Exception:
                continue
            rows = j.get("people") if isinstance(j, dict) else (j if isinstance(j, list) else None)
            if not isinstance(rows, list):
                continue
            for r in rows:
                if isinstance(r, dict) and r.get("surname"):
                    names[r["surname"].strip()] += 1
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
            for cc in ccs:
                attest(head, cc, "archive", label)
        if names:
            print(f"{label:14} {len(names):5} surnames -> {','.join(ccs)}")

    # ---- 3. What merely sounds alike --------------------------------------
    by_skel = collections.defaultdict(list)
    for k, r in rec.items():
        s = skeleton(r["n"])
        if s:
            by_skel[s].append(r)
    sounded = 0
    for s, group in by_skel.items():
        if len(group) < 2 or len(group) > 12:      # a huge cluster is noise
            continue
        for r in group:
            for other in group:
                if other is r:
                    continue
                if not any(v["n"] == other["n"] for v in r["variants"]):
                    r["variants"].append({"n": other["n"], "how": "sounds"})
                    sounded += 1
    print(f"phonetic: {sounded} «sounds alike» links across {len(by_skel)} skeletons")

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
        "sources": [
            "Wikidata, instance of family name (Q101352), property P460. CC0.",
            "The seven Defranceski-family archives — David Defranceski's own research.",
            "Phonetic skeletons computed here; algorithmic, not evidence.",
        ],
        "counts": {
            "surnames": len(out),
            "withVariants": sum(1 for r in out if r["variants"]),
            "withCountries": sum(1 for r in out if r["countries"]),
            "curatedLinks": sum(1 for r in out for v in r["variants"] if v["how"] == "curated"),
        },
        "surnames": out,
    }
    json.dump(doc, open("data/surnames.json", "w"), ensure_ascii=False, indent=1)
    print(f"\n{len(out)} surnames -> data/surnames.json")
    print("  " + " · ".join(f"{k}: {v}" for k, v in doc["counts"].items()))


if __name__ == "__main__":
    main()
