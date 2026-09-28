#!/usr/bin/env python3
"""What Wiktionary says a surname is — the structured part of it, only.

WHY A SECOND SOURCE AT ALL.

data/surname-context.json holds what Wikidata says, and Wikidata says
something about 99,560 of the atlas's 943,938 names: 10.5%. That is the
ceiling of what structured Wikidata has, and no amount of interface work
raises it. The standard printed authority — the Oxford *Dictionary of
Family Names in Britain and Ireland* — is not openly licensed. Wiktionary
is.

AND IT IS NOT THE WIDER SOURCE, WHICH IS WHY IT IS A SECOND ONE AND NOT
A REPLACEMENT. Measured on the 2026-09-28 dump:

    wiktionary       78,628      wikidata only    63,281
    wikidata         99,560      wiktionary only  42,349
    both             36,279      union           141,909   15.0%

Wiktionary is SMALLER than Wikidata here and overlaps it by barely a
third. The value is the 42,349 names that had nothing at all, and the
36,279 where two independent sources can be read against each other. A
page that merged them would throw away the only thing that makes a
crowd-sourced claim checkable, which is knowing who made it.

WHAT IS TAKEN, AND WHAT IS LEFT ALONE.

A Wiktionary surname entry looks like this, and the useful part is a
template, not prose:

    ==English==
    ===Proper noun===
    # {{surname|en|English and Scottish|from=occupations|varform=Tailor}}.

    ==Polish==
    # {{surname|pl|from=given names}}

Three facts come out of that, each of them a controlled value somebody
typed into a field:

  langs   the LANGUAGE SECTIONS the name is tagged a surname under —
          English, Polish, Italian. Taken from the «==English==» heading
          itself, so the name is read in English off the page rather than
          decoded from a language code by a table this script would have
          to guess at.
  from    the template's `from=` — «occupations», «patronymics», «place
          names», «given names», «Polish», «Old English». Wiktionary's own
          controlled vocabulary; it is what drives its category tree.
  etymon  where `from=` names a specific word — «ga:táilliúir<t:tailor>»
          — the language, the word and the gloss, split out. This is the
          nearest thing to a real derivation in the file, and the rarest.

NOTHING ELSE. The Etymology sections are prose, the Statistics sections
are prose with their own citations, and both are somebody's writing.
Copying either would be a share-alike problem dressed up as a data
problem, and would put unattributed-looking etymology on a map whose
whole argument is against it. A template parameter is a fact in a field.

Every row carries the page URL and the revision id it was read at,
because that is the citation, and because Wiktionary changes.

LICENCE. Wiktionary is CC BY-SA 4.0. That is share-alike, and unlike the
CC0 Wikidata harvest it obliges this atlas to say so wherever the data is
shown and on /data/. check-data.py enforces the second half of that: the
licence string below must be named on the /data/ page or the build stops.

USAGE
    python3 scripts/harvest-surname-wiktionary.py [path-to-dump.xml.bz2]

The dump is enwiktionary-latest-pages-articles.xml.bz2, about 1.2 GB,
from https://dumps.wikimedia.org/enwiktionary/latest/. It is not
committed; tmp/ is gitignored and is where this expects to find it.
"""
import bz2
import json
import os
import re
import sys
import time
import unicodedata

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

DUMP = "tmp/enwiktionary-pages-articles.xml.bz2"
OUT = "data/surname-wiktionary.json"
LICENCE = "CC BY-SA 4.0 (English Wiktionary)"

# A page is worth parsing only if it carries the template at all. Checked on
# the raw chunk before any of the work below, because 9.6 million pages go
# past and fewer than a hundred thousand of them are surnames.
HAS = "{{surname"

RE_TITLE = re.compile(r"<title>(.*?)</title>", re.S)
RE_NS = re.compile(r"<ns>(\d+)</ns>")
RE_REV = re.compile(r"<revision>.*?<id>(\d+)</id>", re.S)
RE_TEXT = re.compile(r"<text[^>]*>(.*?)</text>", re.S)
# A language section heading: «==English==» at the start of a line, and not
# «===Etymology===», which is a sub-heading inside one.
RE_LANG = re.compile(r"^==\s*([^=\n][^=\n]*?)\s*==\s*$", re.M)
RE_SURN = re.compile(r"\{\{surname\s*\|")
# ga:táilliúir<alt:Táilliúir><t:tailor>  — code, word, and any <k:v> modifiers
RE_ETYMON = re.compile(r"^([a-z][a-z0-9-]{1,10}):([^<|]+)(.*)$")
RE_MOD = re.compile(r"<([a-z]+):([^>]*)>")
# A comma with nothing after it separates a list; a comma with a space after
# it is punctuation inside a phrase. See the note at the split.
RE_LIST = re.compile(r",(?!\s)")

XML_ENT = {"&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&amp;": "&"}


def unxml(s):
    for k, v in XML_ENT.items():
        s = s.replace(k, v)
    return s


def fold(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def template_args(text, start):
    """Read the arguments of the {{surname| … }} beginning at `start`.

    Written by hand rather than split on «|» because the parameters nest:
    «from=ga:táilliúir<alt:Táilliúir><t:tailor>» contains no braces but
    «{{surname|en|{{w|Cornish}}}}» does, and a naive split cuts a template
    in half and turns one field into two. Depth-counted, so a nested
    template stays inside the argument that holds it.
    """
    i = start
    depth = 0
    args, cur = [], []
    n = len(text)
    while i < n:
        c = text[i]
        if text.startswith("{{", i):
            depth += 1
            cur.append("{{")
            i += 2
            continue
        if text.startswith("}}", i):
            depth -= 1
            if depth == 0:
                args.append("".join(cur))
                return args, i + 2
            cur.append("}}")
            i += 2
            continue
        if c == "|" and depth == 1:
            args.append("".join(cur))
            cur = []
            i += 1
            continue
        cur.append(c)
        i += 1
    return args, n  # unclosed template: take what there is and move on


RE_W = re.compile(r"\{\{w\|([^|}]+)(?:\|[^}]*)?\}\}")
RE_LINK = re.compile(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]")


def clean(v):
    """Unwrap the two link forms that turn up inside `from=`, and refuse
    anything still carrying markup.

    «from={{w|Cornish}}» means Cornish and should read as Cornish; it should
    not reach the map as four braces and a pipe. Anything more tangled than
    a link is markup this script does not understand, and a value it does
    not understand is one it has no business publishing as a fact.
    """
    v = RE_W.sub(r"\1", v)
    v = RE_LINK.sub(r"\1", v).strip(" '\"")
    if any(c in v for c in "{}[]|="):
        return None
    return v.strip()


def parse_etymon(v):
    """«ga:táilliúir<alt:Táilliúir><t:tailor>» → language code, word, gloss.

    Returns None for a plain value like «occupations» or «Polish», which is
    the common case and belongs in `from` untouched.
    """
    m = RE_ETYMON.match(v.strip())
    if not m:
        return None
    code, word, rest = m.group(1), m.group(2).strip(), m.group(3)
    mods = dict(RE_MOD.findall(rest))
    out = {"code": code, "word": mods.get("alt") or word}
    if mods.get("t"):
        out["gloss"] = mods["t"]
    return out


def pages(path):
    """Yield one <page>…</page> chunk at a time, streamed.

    The decompressed dump is about 10 GB; nothing here holds more than one
    page, and the bz2 module decompresses as it reads.
    """
    buf = ""
    with bz2.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            buf += line
            if "</page>" not in line:
                continue
            chunk, buf = buf, ""
            i = chunk.find("<page>")
            if i >= 0:
                yield chunk[i:]


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DUMP
    if not os.path.exists(path):
        sys.exit(f"{path} is missing — download the enwiktionary "
                 "pages-articles dump into tmp/ first (see the docstring)")
    try:
        corpus = {fold(r["n"]) for r in
                  json.load(open("data/surnames.json"))["surnames"]}
    except FileNotFoundError:
        sys.exit("data/surnames.json is missing — run build-surnames.py first")
    print(f"{len(corpus):,} surnames in the corpus to match against")

    out = {}
    # code → the language name seen in the heading above it, counted. The
    # dump teaches this to itself: «==Irish==» over «{{surname|ga}}» says
    # what «ga» is, ten thousand times over, so no hand-written code table
    # has to be carried here and kept right.
    codename = {}
    seen = skipped = 0
    t0 = time.time()
    for chunk in pages(path):
        seen += 1
        if seen % 500000 == 0:
            print(f"  {seen:,} pages, {len(out):,} matched, "
                  f"{time.time() - t0:.0f}s", flush=True)
        if HAS not in chunk:
            continue
        m = RE_NS.search(chunk)
        if not m or m.group(1) != "0":
            continue
        mt = RE_TITLE.search(chunk)
        mx = RE_TEXT.search(chunk)
        if not mt or not mx:
            continue
        title = unxml(mt.group(1))
        text = unxml(mx.group(1))
        key = fold(title)
        if key not in corpus:
            skipped += 1
            continue
        mr = RE_REV.search(chunk)

        # Cut the page into its language sections, then read each one.
        heads = list(RE_LANG.finditer(text))
        spans = []
        for n, h in enumerate(heads):
            end = heads[n + 1].start() if n + 1 < len(heads) else len(text)
            spans.append((h.group(1).strip(), h.end(), end))
        if not spans:
            spans = [(None, 0, len(text))]

        rec = out.setdefault(key, {
            "n": title,
            "cite": "https://en.wiktionary.org/wiki/" + title.replace(" ", "_"),
            "langs": [], "from": {}, "etymon": [],
        })
        if mr:
            rec["rev"] = int(mr.group(1))
        for lang, lo, hi in spans:
            body = text[lo:hi]
            for ms in RE_SURN.finditer(body):
                args, _ = template_args(body, ms.start())
                code = None
                for a in args[1:]:
                    a = a.strip()
                    if "=" not in a:
                        if code is None and re.fullmatch(r"[a-z][a-z0-9-]{1,10}", a):
                            code = a
                        continue
                    k, v = a.split("=", 1)
                    if k.strip() != "from":
                        continue
                    # THE COMMA DOES TWO JOBS AND THE SPACE TELLS THEM APART.
                    # Splitting on every comma turned «from=Asian languages,
                    # particularly Persian» into a row reading «particularly
                    # Persian» — a piece of somebody's sentence presented as
                    # a field. Splitting on none of them mashed
                    # «es:Chará,sk:Chára,cs:Chára», which is three separate
                    # words in three languages, into one string.
                    #
                    # Measured across the dump, the template is written both
                    # ways and consistently: a LIST is written tight —
                    # «Spanish,Portuguese», «Czech,Slovak,Slovene» — and
                    # PROSE has the space after the comma, as prose does. So
                    # the separator is a comma with nothing after it.
                    #
                    # «<» is separate and always splits: «ga:táilliúir<t:tailor>
                    # < occupations» is a chain, and each link is its own fact.
                    for part in RE_LIST.split(v):
                        for bit in part.split(" < "):
                            e = parse_etymon(bit.strip())
                            if e:
                                # KEPT UNDER THE SECTION THAT SAID IT.
                                # Taylor's English section says «from
                                # occupations» and its French section says
                                # «from English»; flattened into one list
                                # those read as a name from occupations AND
                                # from English, which is two true statements
                                # made into one false one.
                                e["in"] = lang
                                if e not in rec["etymon"]:
                                    rec["etymon"].append(e)
                                continue
                            bit = clean(bit)
                            if bit and lang:
                                rec["from"].setdefault(lang, [])
                                if bit not in rec["from"][lang]:
                                    rec["from"][lang].append(bit)
                if lang and lang not in rec["langs"]:
                    rec["langs"].append(lang)
                if lang and code:
                    codename.setdefault(code, {})
                    codename[code][lang] = codename[code].get(lang, 0) + 1

    # Resolve each etymon's language code to the name the dump itself uses
    # for it, and drop the code when nothing in nine million pages named it —
    # a bare «ga» on the page would be a claim the reader cannot check.
    best = {c: max(v.items(), key=lambda kv: kv[1])[0] for c, v in codename.items()}
    unnamed = 0
    for rec in out.values():
        keep = []
        for e in rec["etymon"]:
            name = best.get(e["code"])
            if not name:
                unnamed += 1
                continue
            e = dict(e)
            e["lang"] = name
            del e["code"]
            keep.append(e)
        rec["etymon"] = keep
        for k in ("langs", "from", "etymon"):
            if not rec[k]:
                del rec[k]
    # A row with a title and a link and no fact in it is not worth shipping.
    out = {k: v for k, v in out.items()
           if any(f in v for f in ("langs", "from", "etymon"))}

    doc = {
        "note": ("What the English Wiktionary says a surname is, for names "
                 "this atlas already holds. NOTHING HERE IS GENERATED, "
                 "INFERRED OR PARAPHRASED, and no prose is copied: `langs` "
                 "are the language sections the name is tagged a surname "
                 "under, `from` is the template's own `from=` value, and "
                 "`etymon` is a specific word a name derives from where the "
                 "template names one. Every row carries the page and the "
                 "revision it was read at. Wiktionary is edited by anyone "
                 "and is wrong in places; it is shown as Wiktionary's claim, "
                 "with its citation, and never in this atlas's voice."),
        "source": "English Wiktionary, pages-articles dump, {{surname}} template",
        "licence": LICENCE,
        "attribution": ("Contains material from the English Wiktionary, "
                        "by its contributors, used under CC BY-SA 4.0. Each "
                        "row links the page it came from."),
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {
            "matched": len(out),
            "pagesRead": seen,
            "surnamesNotOurs": skipped,
            "withLanguage": sum(1 for r in out.values() if "langs" in r),
            "withFrom": sum(1 for r in out.values() if "from" in r),
            "withEtymon": sum(1 for r in out.values() if "etymon" in r),
            "etymonsDroppedForUnnamedLanguage": unnamed,
        },
        "surnames": out,
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"\n{OUT}: {len(out):,} of our surnames have a Wiktionary entry")
    for k, v in doc["counts"].items():
        print(f"    {k:<34} {v:,}")
    tally = {}
    for r in out.values():
        for vals in r.get("from", {}).values():
            for f in vals:
                tally[f] = tally.get(f, 0) + 1
    top = sorted(((n, f) for f, n in tally.items()), reverse=True)[:15]
    print("\n  commonest `from` values:")
    for n, f in top:
        print(f"    {n:>7,}  {f}")


if __name__ == "__main__":
    main()
