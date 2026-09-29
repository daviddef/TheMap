#!/usr/bin/env python3
"""HR-DAZD-378, the Zadar register collection, from its own analytical inventory.

WHAT THIS IS. Državni arhiv u Zadru holds 2,291 parish register books covering
coastal Dalmatia from 1565, and publishes a 91-page analytical inventory
naming every one of them: parish, record type, book signature, years, language
and script. The atlas already listed the archive — David: «can you make sure
you have dazd.hr/hr/knjige/maticne-knjige in your sources list?» — but held
none of its books, so a reader was told an archive existed and nothing about
what was on its shelves.

WHY A PDF AND NOT THE SITE. dazd.hr answers automated requests with 403 and
loads normally in an ordinary browser; the provider row has said so since it
was written. This project does not go around a block like that, so the
inventory is read from the PDF David supplied instead. That is the same
document the site publishes, and it is a better source anyway: it is the
archive's own finding aid, with the signatures a letter has to quote.

WHAT A ROW IS. One book. «Arbanasi, births, book 1, 1757–1813, Croatian in
Latin script.» The signature is the point — HR-DAZD-378 says citation must be
«institution, fonds number, book number, page», so a reader who can name book
1 is asking a question this archive can answer, and one who cannot is not.

THE SHAPE OF THE PAGE, WHICH IS WHY THIS NEEDS A PARSER AND NOT A REGEX.
A parish heading is printed letter-spaced and doubled by the PDF extractor —
«AA RR BB AA NN AA SS II» is ARBANASI. Under it, each record type opens with
its letter (R births, V marriages, M deaths, K confirmations, A status
animarum) and then TWO COLUMNS: every book signature, then every year range,
in the same order. They are extracted as separate runs of lines, so the join
is positional and is only trusted when the two counts agree. Where they do
not, the books are still emitted with their signatures and no years rather
than being paired off wrongly — a wrong year on a register sends somebody to
the wrong book.

    python3 scripts/import-dazd-378.py "<path to the PDF>"
"""
import io
import json
import os
import re
import sys
import time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
OUT = "data/dazd-378-registers.json"

KIND = {
    "R": "Births", "V": "Marriages", "M": "Deaths", "K": "Confirmations",
    "A": "Status animarum", "P": "Communions",
    "PI": "Communions and confessions", "GS": "Civil status",
}
LANG = {"lat": "Latin", "tal": "Italian", "hrv": "Croatian", "fr": "French",
        "gr": "Greek"}
SCRIPT = {"lt": "Latin", "gl": "Glagolitic", "bos": "Bosančica",
          "ćir": "Cyrillic"}

# A heading is every letter doubled by the extractor and spaced: «BB AA NNJJ».
# CROATIAN DIGRAPHS COME OUT AS FOUR CHARACTERS. NJ doubles to «NNJJ», LJ to
# «LLJJ», DŽ to «DDŽŽ» — so a rule that demanded two-letter tokens rejected
# «BB AA NNJJ» (Banj) as a heading, and every book under it was appended to
# the parish above instead. Silent, and wrong in the worst direction: it does
# not lose the books, it files them under someone else's parish. A token is
# accepted when it is genuinely a doubling, which is what is tested rather
# than its length.
# EVERY CHARACTER IS DOUBLED, NOT JUST THE LETTERS. The extractor renders a
# heading with each glyph twice — punctuation included — so «GLAVINA, (vidi
# IMOTSKI)» arrives as «GG  LL  AA  VV  II  NN  AA,,   (vidi  IMOTSKI)» and
# «VIDONJE (kraj Metkovića)» as «...((kkrraajj  MMeettkkoovviiććaa))».
# A rule that demanded pure letter tokens rejected both, and then every book
# under them was filed under the parish above — which is where the fourteen
# duplicated signatures came from, not from the archive.
# WORD BOUNDARIES ARE WIDER GAPS. Letters within a word are two spaces apart
# and words are separated by four or more, which is the only thing that tells
# «GLAVINA DONJA» from «GLAVINADONJA». Nothing else in the line carries it.
DBL_OK = re.compile(r"^[^\s]{2,}$")

# «R  k 1» opens a record type; a bare number continues its signature column.
# AND «R  k» ALONE OPENS ONE TOO, with its first signature on the next line —
# 83 of the 508 openers in this document are that shape, all of Pag among
# them. Demanding a number on the same line did not skip them, which would at
# least have been visible: it left the PREVIOUS record type open, so Pag's
# birth books were counted under the parish above. The number is optional.
OPEN = re.compile(r"^\s*(R|V|M|K|A|PI|P|GS)\s+k\.?\s*(\d+)?\s*$")
NUM = re.compile(r"^\s*(\d+)\s*$")
# «1757.-1813., J hrv., P lt., gl.» — also single years and «1830.»
YEARS = re.compile(r"^\s*(1[0-9]{3}|20[0-9]{2})\.?\s*(?:[-–—]\s*(1[0-9]{3}|20[0-9]{2})\.?)?[,.]")


def doubled(tok):
    """«AA» -> «A», «NNJJ» -> «NJ», «((kkrraajj» -> «(kraj», else None."""
    if not DBL_OK.match(tok) or len(tok) % 2:
        return None
    a, b = tok[0::2], tok[1::2]
    return a if a == b else None


def head_of(line):
    """The parish name, and any parenthetical note, or None."""
    st = line.strip()
    if not st or len(st) > 110:
        return None
    words = []
    for chunk in re.split(r"\s{3,}", st):
        toks = chunk.split()
        if not toks:
            continue
        out = []
        for t in toks:
            d = doubled(t)
            if d is None:
                return None
            out.append(d)
        # Inside a parenthetical the gaps are ordinary word gaps, so the
        # pieces are joined with a space rather than run together — «( i
        # SESTRUNJ )» is a sentence about the parish, not a spelling of it.
        # LETTERS RUN TOGETHER, WORDS DO NOT. Inside a name the pieces are
        # single letters or Croatian digraphs — B, O, S, I, Lj — and join
        # without spaces; inside a parenthetical they are whole words —
        # «kraj», «Trogira» — and keep them. Length is what separates the two,
        # and it has to be 2 rather than 1 or «BOSILJINA» comes out as
        # «B O S I Lj I N A».
        joiner = "" if all(len(x) <= 2 for x in out) else " "
        words.append(joiner.join(out))
    name = " ".join(words)
    letters = re.sub(r"[^A-Za-zČĆŽŠĐčćžšđ]", "", name)
    if len(letters) < 3:
        return None
    # «GLAVINA, (vidi IMOTSKI)» — a cross-reference, not a holding.
    note = None
    m = re.search(r"\(([^)]*)\)", name)
    if m:
        note = m.group(1).strip()
        name = name[:m.start()].strip()
    name = name.strip(" ,-–").strip()
    if not name:
        return None
    return {"name": name.title(), "note": note}


def parse(path):
    import pypdf
    r = pypdf.PdfReader(path)
    parishes, cur, kind, sigs, dates = [], None, None, [], []
    stats = {"pages": len(r.pages), "paired": 0, "unpaired": 0}

    def flush():
        """Close the open record type, pairing signatures to years positionally."""
        nonlocal sigs, dates
        # A TYPE THAT OPENED AND CLOSED WITH NO SIGNATURES IS THE TELL.
        # On pages like Rivanj's the extractor emits «R k» and «V k» BEFORE
        # any numbers, so every signature lands on whichever type happened to
        # be open last — Rivanj's three birth books were being recorded as
        # marriages. When that happens the column order on this page cannot be
        # read, and the parish is marked so rather than published as fact.
        if cur and kind and not sigs:
            cur["uncertain"] = ("record types and signatures could not be "
                                "matched on this page; verify against the "
                                "inventory before citing a book")
        if cur and kind and sigs:
            ok = len(sigs) == len(dates)
            for i, sig in enumerate(sigs):
                row = {"book": sig}
                # In an ambiguous parish the signature and the years are still
                # good — they came from the same row — but which register the
                # book is has been lost, so it is not asserted.
                if not cur.get("uncertain"):
                    row["k"] = KIND.get(kind, kind)
                if ok:
                    d = dates[i]
                    if d.get("from"):
                        row["from"] = d["from"]
                        row["to"] = d.get("to") or d["from"]
                    if d.get("lang"):
                        row["lang"] = d["lang"]
                    if d.get("script"):
                        row["script"] = d["script"]
                cur["books"].append(row)
            stats["paired" if ok else "unpaired"] += len(sigs)
        sigs, dates = [], []

    for page in r.pages:
        for raw in (page.extract_text() or "").split("\n"):
            line = raw.rstrip()
            if not line.strip() or line.strip().startswith("MATIČNE KNJIGE"):
                continue
            h = head_of(line)
            if h:
                flush()
                kind = None
                cur = {"parish": h["name"], "books": []}
                if h["note"]:
                    cur["note"] = h["note"]
                parishes.append(cur)
                continue
            if not cur:
                continue
            m = OPEN.match(line)
            if m:
                flush()
                kind = m.group(1)
                sigs = [int(m.group(2))] if m.group(2) else []
                continue
            if kind is None:
                continue
            m = NUM.match(line)
            if m and not dates:
                sigs.append(int(m.group(1)))
                continue
            m = YEARS.match(line)
            if m:
                lang = [LANG[k] for k in LANG if re.search(r"\b" + k + r"\b", line)]
                scr = [SCRIPT[k] for k in SCRIPT if re.search(r"\b" + re.escape(k) + r"\b", line)]
                dates.append({"from": int(m.group(1)),
                              "to": int(m.group(2)) if m.group(2) else None,
                              "lang": lang or None, "script": scr or None})
    flush()
    parishes = [p for p in parishes if p["books"]]

    # A SIGNATURE NAMES ONE BOOK IN THE FONDS, so two parishes claiming the
    # same number is either the inventory listing a parish twice under two
    # headings — «Crno» and «Dračevac - Crno» — or this parser mis-splitting a
    # page. From the outside those look identical, and citing the wrong one
    # wastes a letter, so both copies are flagged and neither is quietly
    # preferred. Fourteen of 1,840 at the time of writing.
    seen = {}
    for p in parishes:
        for b in p["books"]:
            seen.setdefault(b["book"], []).append((p, b))
    shared = 0
    for sig, rows in seen.items():
        if len(rows) < 2:
            continue
        names = sorted({p["parish"] for p, _ in rows})
        for _, b in rows:
            b["alsoListedUnder"] = names
        shared += 1
    stats["sharedSignatures"] = shared
    return parishes, stats


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src or not os.path.exists(src):
        sys.exit("usage: import-dazd-378.py <path to DAZD-378 inventory PDF>")
    parishes, stats = parse(src)
    books = sum(len(p["books"]) for p in parishes)
    dated = sum(1 for p in parishes for b in p["books"] if b.get("from"))
    doc = {
        "note": ("Every parish register book in HR-DAZD-378, the register "
                 "collection of Državni arhiv u Zadru, from its own published "
                 "analytical inventory (Burić and Modrinić, Zadar 2014). One "
                 "row is one book: parish, record type, the archive's own book "
                 "signature, and the years it covers. The signature is the "
                 "point — this archive asks to be cited as institution, fonds, "
                 "book number and page, so a letter that names book 1 is a "
                 "question it can answer."),
        "claim": ("READ FROM THE INVENTORY, NOT FROM THE SHELF. This says what "
                  "the finding aid says exists. It is not a statement that a "
                  "book is digitised, legible or currently produced to readers "
                  "— none of those are online, and the archive is `onsite`. "
                  "Books whose signature column and year column did not agree "
                  "in length are emitted with their signature and NO years, "
                  "because a wrong year sends somebody to the wrong book."),
        "source": ("HR-DAZD-378 Zbirka matičnih knjiga, analitički inventar, "
                   "Državni arhiv u Zadru, 2014"),
        "licence": "CC0-1.0",
        "provider": "dazd",
        "harvested": time.strftime("%Y-%m-%d"),
        "counts": {"parishes": len(parishes), "books": books,
                   "booksWithYears": dated,
                   "booksWithoutYears": books - dated,
                   "pagesRead": stats["pages"],
                   "parishesWhosePageCouldNotBeRead":
                       sum(1 for p in parishes if p.get("uncertain")),
                   "signaturesClaimedByTwoParishes":
                       stats.get("sharedSignatures", 0)},
        "parishes": parishes,
    }
    json.dump(doc, io.open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"{OUT}")
    print(f"    parishes            {len(parishes):,}")
    print(f"    books               {books:,}")
    print(f"    with years          {dated:,}")
    print(f"    without years       {books - dated:,}")
    for p in parishes[:3]:
        print(f"\n    {p['parish']}: {len(p['books'])} books")
        for b in p["books"][:3]:
            print(f"      {b}")


if __name__ == "__main__":
    main()
