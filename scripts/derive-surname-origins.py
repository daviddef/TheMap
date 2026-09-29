#!/usr/bin/env python3
"""Where a surname is FROM, worked out from what this atlas already holds.

WHY. Wiktionary answers 2.8% of the corpus — 25,972 of 940,562 names — and it
was the only origin this map had. David: «I feel like we can harvest our own
origins for these… Wiktionary shouldn't be a reference or link it's far too
small just harvest the origin of the name.»

Measured before writing a line, across the 940,562 distinct names:

    a national register       908,452   96.6%
    register WITH a count     706,444   75.1%
    first attested            191,615   20.4%
    a homonymous place        119,501   12.7%
    ctx.lang from Wikidata     64,536    6.9%
    ANY of the above          912,913   97.1%

WHAT A DERIVED ORIGIN IS, AND IS NOT. It is not an etymology. Nothing here
knows that Fornasar is an occupational name for a furnace-keeper. What it
knows is WHERE THE NAME IS AND WHERE IT WAS FIRST SEEN, and for a genealogist
that is usually the more useful half — «Croatian» is a guess about a word,
«91% of the people of this name a state counted are in Croatia, and the
earliest record of it we hold is Croatia in the 1710s» is a fact with a
source.

SO EVERY ROW CARRIES ITS WORKING. `basis` lists the evidence used, in words;
`confidence` is a rule applied to how much of it agrees. Nothing prints a bare
country name, because a bare country name is exactly the inference this atlas
refuses elsewhere.

THE RULES, AND WHY EACH ONE IS DRAWN WHERE IT IS.

  strong  the earliest attestation and the register concentration name the
          SAME country, and that country holds at least 60% of the counted
          people. Two independent sources agreeing is the only thing here
          worth the word.
  fair    one decisive signal — a register share of 80% or more — or agreement
          between two weaker ones.
  weak    a single signal, usually an earliest attestation with no register
          behind it, or a register share under half.

A HOMONYMOUS PLACE SUPPORTS, IT NEVER DECIDES. «De Franceschi» is a village
in Italy of 20 people and the name is far older than the hamlet; plenty of
places are named after a family rather than the other way round. It can raise
a confidence by one step when it sits in a country the other evidence already
points at, and it can never nominate a country by itself.

REGISTER COUNTS ARE COUNTS OF PEOPLE NOW. This map holds national registers
for six countries only, so a share is a share OF WHAT WE HOLD. A name in
Croatia and Poland will read as 100% Croatian when Poland's register is not
among the six. That limit is written into every row rather than assumed read.

    python3 scripts/derive-surname-origins.py [--out data/surname-origins.json]
"""
import argparse
import collections
import gzip
import glob
import io
import json
import os
import sys
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OUT = "data/surname-origins.json.gz"

CN = {}


def load_country_names():
    try:
        idx = json.load(io.open("site/public/index.json", encoding="utf-8"))
        CN.update(idx.get("countries") or {})
    except Exception:
        pass


def name_of(cc):
    return CN.get(cc, cc)


# A LANGUAGE IS NOT A COUNTRY, EXCEPT WHERE IT IS. Mapping «Italian» to Italy
# is safe; mapping «German» to Germany throws away Austria and Switzerland,
# «English» is meaningless as a country, and «Spanish» would put every Latin
# American name in Spain. So only languages with ONE unambiguous home are
# here, and the rest contribute nothing rather than a guess. This is the
# signal that was missing when Falco — «Italian · Spanish · Catalan» to
# Wikidata — came out as Germany on the strength of one notable birth in 1590.
LANG_CC = {
    "italian": "IT", "polish": "PL", "slovene": "SI", "slovenian": "SI",
    "french": "FR", "japanese": "JP", "turkish": "TR", "russian": "RU",
    "ukrainian": "UA", "estonian": "EE", "hungarian": "HU", "czech": "CZ",
    "swedish": "SE", "romanian": "RO", "slovak": "SK", "croatian": "HR",
    "serbian": "RS", "greek": "GR", "finnish": "FI", "danish": "DK",
    "norwegian": "NO", "lithuanian": "LT", "latvian": "LV", "bulgarian": "BG",
    "icelandic": "IS", "albanian": "AL", "maltese": "MT", "irish": "IE",
    "welsh": "GB", "basque": "ES", "korean": "KR", "vietnamese": "VN",
    "thai": "TH", "indonesian": "ID", "hebrew": "IL", "armenian": "AM",
    "georgian": "GE", "macedonian": "MK", "bosnian": "BA", "belarusian": "BY",
}
# Left out on purpose: German (DE/AT/CH), English, Spanish, Portuguese,
# Dutch (NL/BE), Catalan, Arabic, Chinese, «multiple languages».

# THE SPELLING ITSELF IS EVIDENCE, and it is the only signal that reaches a
# name no dictionary has heard of. A caron is not decoration: «Defrančeski»
# is written the way Croatian and Slovene write it and «Defranceschi» is not.
# Kept to letters that genuinely narrow the field — anything that merely
# suggests a family of languages is left out, because a wrong country is
# worse than none.
ORTHO = [
    ("ł", "PL"), ("ń", "PL"), ("ś", "PL"), ("ż", "PL"), ("ź", "PL"),
    ("ř", "CZ"), ("ů", "CZ"), ("ě", "CZ"),
    ("ő", "HU"), ("ű", "HU"),
    ("ø", "NO"), ("å", "NO"), ("æ", "NO"),
    ("ğ", "TR"), ("ş", "TR"), ("ı", "TR"),
    ("ă", "RO"), ("ț", "RO"), ("ș", "RO"),
    ("ļ", "LV"), ("ņ", "LV"), ("ģ", "LV"),
    ("ė", "LT"), ("ų", "LT"), ("ū", "LT"),
]


def ortho_cc(name):
    """A country the spelling itself points at, or None."""
    low = (name or "").lower()
    for ch, cc in ORTHO:
        if ch in low:
            return cc
    return None


def derive(r):
    """One surname's origin, with its working. None when nothing supports one."""
    basis, votes = [], collections.Counter()   # basis kept for --explain

    # 1. THE EARLIEST RECORD WE HOLD. The archive timeline first: it is this
    #    project's own family research, ordinary people in parish registers,
    #    and it reaches centuries further back than the notable one.
    # BOTH SERIES, AND THE EARLIEST YEAR WINS — not whichever series exists.
    # The archive timeline used to short-circuit the notable one, so one
    # incidental Austrian record in a family archive (Franceschi, tla AT 1650)
    # erased Italy 1470 from Wikidata and sent an obviously Italian name to
    # Austria. The archives are the better source PER RECORD and a tiny,
    # family-shaped sample; they earn a bonus, never a veto. A tie in years
    # goes to the archive because it is an ordinary person in a register
    # rather than somebody an encyclopaedia noticed.
    first = None
    for key, what in (("tla", "this project's own family archives"),
                      ("tl", "Wikidata's notable births, thin before 1900")):
        for cc, ds in (r.get(key) or {}).items():
            ys = [d for d in ds if isinstance(d, int)]
            if not ys:
                continue
            lo = min(ys)
            if first is None or lo < first["year"] or (
                    lo == first["year"] and key == "tla"):
                first = {"cc": cc, "year": lo, "src": key, "what": what}
    if first:
        basis.append("earliest record held: %s, %ss (%s)"
                     % (name_of(first["cc"]), first["year"], first["what"]))
        # AN EARLIEST RECORD IS TWO VOTES WHICHEVER SERIES IT CAME FROM. It is
        # evidence the name EXISTED on that ground at that date, which is the
        # question; a notable birth is a thinner sample than a parish register
        # but it is the same kind of claim.
        votes[first["cc"]] += 2

    # 2. WHERE THE PEOPLE ARE, per the national registers.
    counts = {c["cc"]: c["n"] for c in (r.get("countries") or [])
              if c.get("how") == "register" and c.get("n")}
    share = None
    if counts:
        total = sum(counts.values())
        top_cc, top_n = max(counts.items(), key=lambda kv: kv[1])
        share = top_n / total if total else 0
        basis.append("%d%% of %s people a state counted are in %s (%d of %d, "
                     "across the %d national registers this atlas holds)"
                     % (round(share * 100), r["n"], name_of(top_cc), top_n,
                        total, len(counts)))
        # A REGISTER SAYS WHERE PEOPLE ARE NOW, NOT WHERE THE NAME IS FROM,
        # and at 60% it was outvoting both of the signals that do. 2,655 of
        # France's Franceschis against 75 of Italy's is not a fact about the
        # name — it is a fact about which of the six registers this atlas
        # holds, and France's is large while Italy's is thin. Emigration runs
        # one way and the counting runs the other. So a register share now
        # has to be overwhelming, 80%, before it weighs as much as the
        # earliest record of the name's existence.
        votes[top_cc] += 2 if share >= .8 else 1

    # 3. A PLACE OF THE SAME NAME. Supporting only — see the header.
    place_cc = set()
    for p in (r.get("places") or []):
        if p.get("cc"):
            place_cc.add(p["cc"])

    # 4. WIKIDATA'S LANGUAGE FOR THE NAME. A language is not a country and is
    #    recorded as what it is, never converted into one.
    langs = (r.get("ctx") or {}).get("lang") or []
    lang_cc = None
    for lg in langs:
        lang_cc = LANG_CC.get(str(lg).strip().lower())
        if lang_cc:
            basis.append("Wikidata calls the name %s" % lg)
            # TWO VOTES, because what language a name IS bears on where it is
            # from more directly than one 16th-century birth in a country that
            # happens to have an encyclopaedia entry. It is still a vote and
            # not a veto: a register share of 60% or more outvotes it.
            votes[lang_cc] += 2
            break

    # 5. THE SPELLING, for the names nothing else reaches.
    o_cc = ortho_cc(r.get("n"))
    if o_cc and not lang_cc:
        basis.append("the spelling of %s is written the way %s writes it"
                     % (r["n"], name_of(o_cc)))
        votes[o_cc] += 1

    # LEVER 1 — A REGISTER THAT NAMES THE NAME AND DOES NOT COUNT IT.
    # 169,141 names sit on exactly one national register with no number
    # attached — 169,131 of them Denmark's, whose harvest gives names without
    # counts — and they were producing nothing at all. That a state's register
    # LISTS a name is positive evidence the name is there; what it does not
    # give is how strongly, so this can never be more than a lead, and it only
    # fires when there is exactly ONE register and nothing else has voted.
    # Five names in the whole corpus have two such registers; they are left
    # alone rather than tie-broken on no evidence.
    if not votes:
        named = [c["cc"] for c in (r.get("countries") or [])
                 if c.get("how") == "register"]
        if len(named) == 1:
            basis.append("%s's national register names %s, without a count"
                         % (name_of(named[0]), r["n"]))
            return {"cc": named[0], "c": 1, "r": 1}

    if not votes:
        return None
    # A TIE WAS BEING BROKEN BY DICT INSERTION ORDER, which is how Franceschi
    # — Austria, Italy and France all on two votes — came out Austrian. The
    # order is now stated: the language the name IS beats where its bearers
    # are now, which beats the earliest single record, and the country code
    # last so the same corpus always gives the same answer.
    top = max(votes.values())
    tied = sorted(c for c, v in votes.items() if v == top)
    if len(tied) > 1:
        rank = {}
        for i, c in enumerate(tied):
            # Language first, then the EARLIEST RECORD, then where the
            # bearers are now. The middle two used to be the other way round,
            # which is how «De Franceschi» — first recorded in Italy in the
            # 1550s — came out French on the strength of 232 people.
            rank[c] = (0 if c == lang_cc else 1,
                       0 if (first and c == first["cc"]) else 1,
                       0 if (counts and c == max(counts, key=counts.get)) else 1,
                       c)
        cc = sorted(tied, key=lambda c: rank[c])[0]
    else:
        cc = tied[0]
    top_reg = max(counts.items(), key=lambda kv: kv[1])[0] if counts else None
    # Agreement is now ANY two independent signals naming the same country —
    # earliest record, register share, or the language the name is in.
    sigs = [x for x in (first["cc"] if first else None, top_reg, lang_cc) if x]
    agree = sum(1 for x in sigs if x == cc) >= 2

    if agree and share is not None and share >= .6:
        conf = "strong"
    elif (share is not None and share >= .8) or agree:
        conf = "fair"
    else:
        conf = "weak"

    supported = cc in place_cc
    if supported:
        basis.append("a place of the same name is in %s, which supports the "
                     "ground without proving the name came from it" % name_of(cc))
        if conf == "weak":
            conf = "fair"
        elif conf == "fair" and agree:
            conf = "strong"

    # STRUCTURED, NOT PROSE. The first cut wrote the working as sentences and
    # came out at 197 MB for 723,300 names — the same sentence stems repeated
    # three quarters of a million times. The repository has already paid 330 MB
    # for committed generated files and written that down; this stores the
    # FACTS and lets the panel compose the sentence, which is also the only way
    # the wording can be changed without rebuilding the corpus.
    #   c  3 strong · 2 fair · 1 weak
    #   f  [cc, year, "a" archive | "n" notable]  — the earliest record held
    #   s  the top register's share, thousandths, and how many registers held it
    #   p  1 when a place of the same name sits in the same country
    out = {"cc": cc, "c": {"strong": 3, "fair": 2, "weak": 1}[conf]}
    if first:
        out["f"] = [first["cc"], first["year"],
                    "a" if first["src"] == "tla" else "n"]
    if share is not None:
        out["s"] = round(share, 3)
        out["t"] = [top_n, total, len(counts)]
    if supported:
        out["p"] = 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()
    load_country_names()

    seen, out = {}, {}
    for f in glob.glob("site/public/s/*.json"):
        try:
            d = json.load(io.open(f, encoding="utf-8"))
        except Exception:
            continue
        for r in (d if isinstance(d, list) else d.get("names", [])):
            if r.get("n") and r["n"] not in seen:
                seen[r["n"]] = r
    print(f"{len(seen):,} distinct surnames read")

    conf = collections.Counter()
    for n, r in seen.items():
        g = derive(r)
        if g:
            out[n] = g
            conf[{3: "strong", 2: "fair", 1: "weak"}[g["c"]]] += 1

    # LEVER 2 — INHERIT FROM A SPELLING VARIANT, AND ONLY A SPELLING ONE.
    # 38,613 names with no origin have a variant that has one, but the corpus
    # distinguishes `spelling` from `sounds` and the sounds half is a phonetic
    # neighbour rather than the same name: «Ferjá» would inherit Uruguay from
    # «Feria», «Faraonel» Switzerland from «Franel». The panel already warns
    # about «the same name by sound, not by a record» and this would quietly
    # contradict it. So spelling variants only, always a lead, and the row
    # says whose origin it borrowed so a reader can disagree with it.
    borrowed = 0
    for n, r in seen.items():
        if n in out:
            continue
        for v in (r.get("variants") or []):
            vn, how = v.get("n"), v.get("how")
            if how != "spelling" or vn not in out:
                continue
            src = out[vn]
            if src.get("v"):        # never inherit an inheritance
                continue
            out[n] = {"cc": src["cc"], "c": 1, "v": vn}
            conf["weak"] += 1
            borrowed += 1
            break
    print(f"    inherited from a spelling variant {borrowed:,}")

    json.dump({
        "note": ("Where a surname is FROM, derived from what this atlas holds "
                 "rather than looked up. NOT an etymology: it does not know "
                 "what a name means. It knows where the name is, where it was "
                 "first recorded, and whether a place carries it too. Every "
                 "row lists its own working in `basis`."),
        "claim": ("DERIVED, AND SAID SO EVERYWHERE IT IS SHOWN. A `strong` row "
                  "is two independent signals agreeing; `weak` is one signal "
                  "and should be read as a lead. Register shares are shares of "
                  "the national registers THIS ATLAS HOLDS — six countries — "
                  "so a name common in an unheld country will overstate the "
                  "ones that are held. A homonymous place supports a country "
                  "and never nominates one: plenty of places are named after a "
                  "family rather than the reverse."),
        "source": "Derived by scripts/derive-surname-origins.py from this atlas's own data",
        "licence": "CC0-1.0",
        "built": time.strftime("%Y-%m-%d"),
        "counts": {"surnamesRead": len(seen), "withAnOrigin": len(out),
                   "strong": conf["strong"], "fair": conf["fair"],
                   "weak": conf["weak"]},
        "origins": out,
    }, gzip.open(args.out, "wt", encoding="utf-8"), ensure_ascii=False,
        separators=(",", ":"))

    print(f"\n{args.out}")
    print(f"    surnames with a derived origin  {len(out):,} "
          f"({100*len(out)/len(seen):.1f}%)")
    for k in ("strong", "fair", "weak"):
        print(f"      {k:<8} {conf[k]:>8,}")
    for probe in ("Falco", "Blažević", "Defrančeski", "Kosina", "Peeters"):
        g = out.get(probe)
        if g:
            lvl = {3: "strong", 2: "fair", 1: "weak"}[g["c"]]
            bits = []
            if g.get("f"):
                bits.append("earliest %s %ss (%s)" % (
                    name_of(g["f"][0]), g["f"][1],
                    "archives" if g["f"][2] == "a" else "notables"))
            if g.get("s") is not None:
                bits.append("%d%% of %d counted, %d registers"
                            % (round(g["s"] * 100), g["t"][1], g["t"][2]))
            if g.get("p"):
                bits.append("a place of the name is there too")
            print(f"    {probe:<14} {name_of(g['cc']):<22} {lvl:<7} {' · '.join(bits)}")


if __name__ == "__main__":
    main()
