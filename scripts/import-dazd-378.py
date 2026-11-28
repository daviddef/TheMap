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

THE SHAPE OF THE PAGE, WHICH IS WHY THIS READS COORDINATES AND NOT TEXT.
A listing page is three columns under a centred parish heading: the record type
(R births, V marriages, M deaths, K confirmations, A status animarum), the book
signature, and the years with language and script. Read as a stream of text the
columns come apart — every signature, then every year range — and this script
used to join them back by position. That join failed wherever a signature sat on
the same line as its years, carried a suffix («1037/A»), or belonged to a
combined book («RVM k»), and a heading with a plain-type note after it was not
seen at all, so its books were filed under the parish above. `pdftotext -bbox`
gives every word its place on the page, so a signature and its years are read
off the same printed row.

WHERE THE YEARS ARE WITHHELD. Within one record-type block the number of
signatures and the number of year entries must agree. Where they do not, or
where several signatures share a line («1543,1544»), every book in the block is
emitted with its signature and NO years — a wrong year on a register sends
somebody to the wrong book.

    python3 scripts/import-dazd-378.py "<path to the PDF>"

Needs `pdftotext` (poppler) on the PATH.
"""
import html
import io
import json
import os
import re
import subprocess
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
        "gr": "Greek", "grčki": "Greek", "njem": "German"}
# «P lat.» is printed a few times for the Latin script.
SCRIPT = {"lt": "Latin", "lat": "Latin", "gl": "Glagolitic",
          "bos": "Bosančica", "ćir": "Cyrillic", "gr.alfabet": "Greek"}

# Column edges, in points, on the inventory's 612-point-wide page: the record
# type starts at 95, the signature at 145 and the years at 188–200.
SIG_FROM, TEXT_FROM, CENTRE = 137.0, 183.0, 306.0

WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" '
                  r'yMax="([\d.]+)">(.*?)</word>')
# «56/A», «470/1», «1994A», «1166 A», «2033 Va», «1543,1544»
SIG = re.compile(r"^(\d{1,4}(?:/[A-Z0-9]+|[A-Z])?(?: [A-Z][a-z]?)?)$")
SIGLIST = re.compile(r"^\d{1,4}(?:,\s*\d{1,4})+$")
YEAR = re.compile(r"(?<!\d)(1\d{3}|20\d\d)(?!\d)")
# The oldest books in the fonds date from 1565.
EARLIEST = 1500
# A line inside a combined book: «V 1825.-1830.,» or «A prva pol. 19. st.»
PART = re.compile(r"^(PI|GS|R|V|M|K|A|P)\s+(?=\d|prva\b)")
# The «J tal., P lt.» tail. Once an entry has it, the entry is complete.
TAIL = re.compile(r"\bJ\.?,?\s*(?:hrv|tal|lat|njem|grčki|fr|gr)\b|"
                  r"\bP\.?\s*(?:lt|gl|ćir|bos|lat)\b")


def pages_of(path):
    """Every page as a list of printed rows; a row is its words, left to right."""
    out = subprocess.run(["pdftotext", "-bbox", path, "-"], check=True,
                         capture_output=True).stdout.decode("utf-8")
    pages = []
    for line in out.split("\n"):
        if "<page " in line:
            pages.append([])
            continue
        m = WORD.search(line)
        if not m:
            continue
        x0, y0, x1, y1 = (float(v) for v in m.groups()[:4])
        # Private-use glyphs trail one heading («SVINIŠĆE»).
        text = re.sub(r"[\ue000-\uf8ff]", "",
                      html.unescape(m.group(5))).strip()
        # Running head, page number, and the superscript footnote marks
        # printed after two signatures («807¹», «808²»).
        if not text or y1 < 50 or (y0 > 720 and x0 > 480):
            continue
        if y1 - y0 < 7.5 and text.isdigit():
            continue
        pages[-1].append((x0, y1, x1, text))
    for i, words in enumerate(pages):
        rows = []
        for w in sorted(words, key=lambda w: (w[1], w[0])):
            if rows and w[1] - rows[-1][0] <= 4:
                rows[-1][1].append(w)
            else:
                rows.append((w[1], [w]))
        pages[i] = [(y, joined(sorted(ws))) for y, ws in rows]
    return pages


def joined(row):
    """Rejoin words that touch: one word split by a font change, or a date
    extracted a digit at a time («1 8 5 7 .»)."""
    out = row[:1]
    for w in row[1:]:
        if w[0] - out[-1][2] < 1:
            out[-1] = (out[-1][0], out[-1][1], w[2], out[-1][3] + w[3])
        else:
            out.append(w)
    return out


def spaced(words):
    """Join a heading's words, closing up letter-spacing.

    «G L A V I N A   D O NJ A»: letters sit about 3 points apart and words about
    6 to 12, so a narrow gap between two fragments of one or two capitals is
    inside a word. A hyphen closes up only if it does so on both sides
    («KOMIN-ROGOTIN», but «PAG - GORICA»).
    """
    def close(a, b):
        return (b[0] - a[2] < 4.5
                and all(len(w) <= 2 and w.isalpha() and w.isupper()
                        for w in (a[3].rstrip(","), b[3].rstrip(","))))

    out, i = words[0][3], 1
    while i < len(words):
        a, b = words[i - 1], words[i]
        if b[3] == "-" and i + 1 < len(words):
            c = words[i + 1]
            if (b[0] - a[2] < 4.5 and c[0] - b[2] < 4.5
                    and all(len(w) <= 2 and w.isalpha() and w.isupper()
                            for w in (a[3], c[3]))):
                out += "-" + c[3]
                i += 2
                continue
        out += b[3] if close(a, b) else " " + b[3]
        i += 1
    return out


def is_heading(words):
    text = " ".join(w[3] for w in words)
    if text.startswith("("):
        return False
    # The one heading with figures in it: «ZADAR - GRAĐANSKO STANJE K 1543 - 1545».
    if re.search(r"\d", text) and "STANJE" not in text.replace(" ", ""):
        return False
    if abs((words[0][0] + max(w[2] for w in words)) / 2 - CENTRE) > 50:
        return False
    letters = re.sub(r"[^A-Za-zČĆŽŠĐčćžšđ]", "",
                     re.sub(r"^S[vV]\.", "", text))
    return len(letters) >= 3 and letters[:3].isupper()


def heading(words):
    """The parish name and any note printed on the heading line."""
    full = spaced(words)
    notes = [n.strip() for n in re.findall(r"[(\[]([^)\]]*)[)\]]", full)]
    name = re.sub(r"\s*[(\[][^)\]]*[)\]]", "", full)
    name = re.sub(r"\s+K\s+\d+\s*-\s*\d+$", "", name)
    cross = bool(re.search(r"\bvidi\b", full))
    # «PERUŠIĆ, vidi Zmina» — a pointer elsewhere, printed after the name.
    see = re.search(r"[\s,-]*\b(vidi\b.*)$", name)
    if see:
        notes.insert(0, see.group(1).strip())
        name = name[:see.start()]
    m = re.search(r",\s*(prav\.)$", name)
    if m:
        notes.append(m.group(1))
        name = name[:m.start()]
    name = re.sub(r"\s+", " ", name).strip(" ,.-–")
    return {"name": name.title(), "note": "; ".join(notes) or None,
            "cross": cross}


def unbracketed(text):
    """The text without its parentheses — remarks, which quote other years."""
    out, depth = [], 0
    for c in text:
        if c == "(":
            depth += 1
        elif c == ")":
            depth = max(depth - 1, 0)
        elif not depth:
            out.append(c)
    return "".join(out)


def date_column(text):
    """The text up to the first remark or the language, which is the dates."""
    return re.split(r"\(|\bJ\b", text)[0]


def years_of(text):
    return [int(y) for y in YEAR.findall(date_column(text))]


def misprinted(text):
    """True for a date that cannot be right: «1753.-1730.», «1233.-1854.»,
    «1825.-185.». It is quoted as printed, never repaired."""
    dates = date_column(text)
    return (any(y < EARLIEST for y in years_of(text))
            or any(int(a) > int(b) for a, b in re.findall(
                r"(?<!\d)(\d{4})\.?\s*[-–]\s*(\d{4})", dates))
            or bool(re.search(r"\d{4}\.?\s*[-–]\s*\d{1,3}(?![\d/])", dates)))


def language_of(text):
    plain = unbracketed(text)
    # Without a «J» (one entry has «K tal., hrv.») the words before «P» are read.
    tongue = (re.search(r"\bJ\b(.*?)(?=\bP\b|$)", plain)
              or re.search(r"^(.*?)(?=\bP\b|$)", plain)).group(1)
    script = re.search(r"\bP\b(.*)$", plain) or re.search(r"\bJ\b(.*)$", plain)
    script = script.group(1) if script else ""
    # «J hrv., P lat.» — «lat» is a script only after the P.
    if not re.search(r"\bP\b", plain):
        script = re.sub(r"\blat\b", "", script)
    lang = [v for k, v in LANG.items() if re.search(r"\b" + k + r"\b", tongue)]
    scr = [v for k, v in SCRIPT.items()
           if re.search(r"\b" + re.escape(k) + r"\b", script)]
    return list(dict.fromkeys(lang)), list(dict.fromkeys(scr))


def kind_of(block):
    """(label, is_combined) for a record-type column entry, or (None, False)."""
    words = " ".join(block["label"]).replace("- ", "").split()
    joined = " ".join(words)
    if joined.startswith("Krizma"):
        return KIND["K"], False
    if joined.startswith("Ispovje"):
        return KIND["PI"], False
    if joined.startswith("Dnevnik"):
        return "Dnevnik darivanja", False
    if words and words[0] in ("Anagraf",):
        return KIND["A"], False
    index = any(w.lower() in ("kazalo", "indeks") for w in words)
    words = [w for w in words if w.lower() not in ("kazalo", "indeks")]
    code = "".join(words)
    code = code[:-1] if code[-1:] in ("k", "K") and code != "K" else code
    if code in ("PI", "GS"):
        types = [code]
    elif code and all(c in "RVMKAP" for c in code.upper()):
        types = list(code.upper())
    else:
        types = []
    label = combined_label(types)
    if index:
        return ("Index" + (f" ({label.lower()})" if label else "")), False
    return label, len(types) > 1


def combined_label(types):
    names = [KIND[t] for t in dict.fromkeys(types)]
    if not names:
        return None
    return ", ".join([names[0]] + [n.lower() for n in names[1:]])


def book_of(block, entry, paired):
    sig = entry["sig"]
    row = {"book": int(sig) if sig.isdigit() else sig}
    text = " ".join(t for part in entry["parts"] for t in part[1])
    label, combined = kind_of(block)
    typed = [p for p in entry["parts"] if p[0]]
    index = bool(label) and label.startswith("Index")
    if typed:
        row["k"] = combined_label([p[0] for p in typed])
        if index:
            row["k"] = f"Index ({row['k'].lower()})"
    elif index and not entry["onLabel"]:
        # «V kazalo» heads indexes of more than marriages.
        row["k"] = "Index"
    elif label and not (combined and not entry["onLabel"]):
        # A single book listed without a type under a combined one is not
        # said to be any of them, so it is given none.
        row["k"] = label
    if paired:
        # A combined book is dated line by line, a plain one as a whole.
        groups = ([(t, " ".join(lines)) for t, lines in entry["parts"]]
                  if len(typed) > 1 else [(None, text)])
        years, parts = [], []
        for t, lines in groups:
            ys = [] if misprinted(lines) else years_of(lines)
            years += ys
            if t:
                part = {"k": KIND[t]}
                if ys:
                    part["from"], part["to"] = min(ys), max(ys)
                elif misprinted(lines):
                    part["yearsAsPrinted"] = date_column(lines).strip(" ,")
                parts.append(part)
        if parts:
            row["parts"] = parts
        if any(misprinted(lines) for _, lines in groups):
            # The outer years of a book with a misprint in it are not known.
            if not parts:
                row["yearsAsPrinted"] = date_column(text).strip(" ,")
        elif years:
            row["from"], row["to"] = min(years), max(years)
        lang, scr = language_of(text)
        if lang:
            row["lang"] = lang
        if scr:
            row["script"] = scr
    return row


def parse(path):
    pages = pages_of(path)
    # The listing starts on the page after the table of abbreviations.
    start = next(i for i, rows in enumerate(pages)
                 if any("KRATICE" in "".join(w[3] for w in ws)
                        for _, ws in rows[:4])) + 1
    parishes, stats = [], {"pages": len(pages), "paired": 0, "unpaired": 0,
                           "unread": []}
    cur = block = entry = None
    last_heading = None          # (page, y) of the heading just read

    def flush():
        """Close the open record-type block, pairing signatures and years."""
        nonlocal block, entry
        if cur and block and block["entries"]:
            entries = block["entries"]
            dated = (sum(1 for e in entries if any(p[1] for p in e["parts"]))
                     + block["strays"])
            ok = dated == len(entries) and not block["listed"]
            for e in entries:
                row = book_of(block, e, ok)
                # A bare «k» heads Zadar's index of deaths; nothing is lost.
                if "k" not in row and block["label"] != ["k"]:
                    cur["uncertain"] = True
                cur["books"].append(row)
            if not ok:
                cur["uncertain"] = True
            stats["paired" if ok else "unpaired"] += len(entries)
        block = entry = None

    def new_block(label):
        nonlocal block, entry
        flush()
        block = {"label": [label] if label else [], "entries": [],
                 "strays": 0, "listed": False}

    for pno in range(start, len(pages)):
        for y, words in pages[pno]:
            if is_heading(words):
                h = heading(words)
                flush()
                # A heading that runs onto a second line is one heading.
                if (last_heading and last_heading[0] == pno
                        and y - last_heading[1] < 16 and not cur["books"]
                        and not cur["cross"] and not h["cross"]):
                    cur["parish"] += ", " + h["name"]
                else:
                    cur = {"parish": h["name"], "books": [],
                           "cross": h["cross"]}
                    if h["note"]:
                        cur["note"] = h["note"]
                    parishes.append(cur)
                last_heading = (pno, y)
                continue
            last_heading = None
            if not cur:
                continue

            label = " ".join(w[3] for w in words if w[0] < SIG_FROM)
            middle = " ".join(w[3] for w in words
                              if SIG_FROM <= w[0] < TEXT_FROM)
            text = " ".join(w[3] for w in words if w[0] >= TEXT_FROM)
            # Remarks under a heading, and a date line that starts in the
            # signature column, are running text, not columns.
            if label and not re.match(
                    r"(?:[RVMKAP]{1,5}[a-z]?\b|PI\b|GS\b|k\b|[Kk]azalo\b|"
                    r"Indeks\b|Anagraf\b|Dnevnik\b|darivanja\b|Krizma|ni\b|"
                    r"Ispovje|šćeni\b)", label):
                text, label, middle = f"{label} {middle} {text}".strip(), "", ""
            sig = None
            if middle:
                # «1814.» is printed once with a full stop after the number.
                number = re.sub(r"^(\d{1,4})\.$", r"\1", middle)
                if (SIG.match(number)
                        or SIGLIST.match(number.replace(" ", ""))):
                    sig = number
                else:
                    text = f"{middle} {text}".strip()

            if label:
                head = label.split()[0]
                opening = (block and block["label"]
                           and block["label"][0].lower() == "kazalo"
                           and not any(w.lower().endswith("k") and w != "Kazalo"
                                       for w in " ".join(block["label"]).split()))
                continues = block and (
                    head in ("k", "ni", "šćeni", "darivanja")
                    or (opening and head.lower() != "kazalo"))
                if continues:
                    block["label"].append(label)
                else:
                    new_block(label)

            if sig:
                if not block:
                    new_block(None)
                listed = bool(SIGLIST.match(sig.replace(" ", "")))
                sigs = sig.replace(" ", "").split(",") if listed else [sig]
                block["listed"] = block["listed"] or listed
                for s in sigs:
                    entry = {"sig": s, "parts": [], "onLabel": bool(label)}
                    block["entries"].append(entry)

            if not text:
                continue
            if not entry:
                if YEAR.search(text):
                    stats["unread"].append((pno + 1, text))
                continue
            m = PART.match(text)
            if m:
                entry["parts"].append((m.group(1), [text[m.end():]]))
                continue
            sofar = " ".join(t for p in entry["parts"] for t in p[1])
            if not entry["parts"]:
                # Its own row, or the next one where the years were set a line
                # low (Briševo, 2219). Running notes are not an entry.
                if sig or YEAR.search(text):
                    entry["parts"].append((None, [text]))
            elif sig:
                entry["parts"][-1][1].append(text)
            elif (TAIL.search(unbracketed(sofar))
                  and sofar.count("(") <= sofar.count(")")):
                # The entry was already complete. A further date belongs to
                # some book, but the page does not say which.
                if years_of(text):
                    block["strays"] += 1
                    entry = {"sig": None, "parts": [(None, [text])]}
            else:
                entry["parts"][-1][1].append(text)
    flush()
    parishes = [p for p in parishes if p["books"]]
    for p in parishes:
        del p["cross"]
        if p.pop("uncertain", False):
            p["uncertain"] = ("the inventory's columns do not settle every "
                              "book's years or record type here; verify "
                              "against it before citing a book")

    # A SIGNATURE NAMES ONE BOOK IN THE FONDS, so two parishes claiming the
    # same number is either the inventory listing a book twice or this parser
    # mis-splitting a page. From the outside those look identical, and citing
    # the wrong one wastes a letter, so both copies are flagged and neither is
    # quietly preferred.
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
                 "question it can answer. A book holding several record types "
                 "lists each under `parts`; its own `from` and `to` are the "
                 "outer years and may span gaps."),
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
    print(f"    blocks unpaired     {stats['unpaired']:,} books")
    for page, line in stats["unread"]:
        print(f"    UNREAD p{page}: {line}")


if __name__ == "__main__":
    main()
