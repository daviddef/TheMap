#!/usr/bin/env python3
"""What the eight family archives have already searched, as marks you can import.

WHY THIS EXISTS.

David: «can you look at all our family research sessions and establish what our
current research has done, what pages, books, volumes, etc, and mark all those
sources?»

Six of the eight archives keep a `searched.json` — 1,349 rows of real work,
«the REGISTER walked page by page — all 174» — and Record Atlas knew none of
it. A reader who had personally walked a register saw the same unmarked row as
somebody who had never opened it.

WHAT IT CANNOT DO, SAID FIRST.

PROGRESS IS NOT IN THIS REPOSITORY AND THIS SCRIPT DOES NOT PUT IT THERE.
Marks live in localStorage, in one browser, by design — there are no accounts
and nothing is ever sent to the server. So the output here is an EXPORT FILE
in exactly the shape /my-research/ already imports, and importing merges
rather than replaces. Nothing is written to anybody's browser by a script.

PAGE RANGES ARE PROSE, NOT A FIELD. «all 174» parses. «walked page by page»
does not, and is not guessed at: that row becomes a mark with no range rather
than a mark claiming a range nobody recorded. A mark that overstates what was
searched is worse than no mark, because the whole point of the record is
knowing what still has to be done.

AND A MATCH IS A WAYPOINT, NOT A RESEMBLANCE. A row is tied to an atlas volume
only when its URL carries a FamilySearch waypoint that atlas volume also
carries. Titles are not matched on similarity — «Births 1858-1900» names a
hundred different books — so a row this cannot place is reported in the reject
list rather than attached to a plausible neighbour.

THE TWO SIDES BARELY SHARE AN IDENTIFIER, AND THAT IS THE HEADLINE.
Measured across all 1,349 rows: the family sessions cite FamilySearch by DGS
FILM NUMBER (`/search/film/005481649?i=363`, 79 rows) and by IMAGE ARK
(`3:1:3QS7-899X-1HVP`, 25 rows). The atlas holds WAYPOINTS and image-group
ids. Exactly one row in 1,349 carried a `wc=` waypoint, and the film numbers
overlap the atlas's `film` values ZERO times — the atlas's are image-group
ids of a different series, not DGS numbers. Defranceski's own
data/fs-catalogue.json turned out to hold the same waypoints and no DGS
numbers either, so there is no bridge on disk.

Resolving a DGS number to a waypoint means asking FamilySearch, behind a
login. This project does not go around that, so those rows stay unresolved and
say so.

SO THE WORK IS MARKED AT THE LEVEL IT CAN HONESTLY BE MARKED AT. A row that
names a source this atlas knows becomes a SOURCE mark — «searched, nothing
found» against Antenati for that place — which is a true statement of work
done and the thing a reader most needs to not repeat. A row that also carries
a waypoint additionally becomes a volume mark with its pages. Claiming the
volume level for a row that only supports the source level would be inventing
precision, and the page ranges are the part somebody will act on.

    python3 scripts/import-research-sessions.py [--out FILE]
"""
import argparse
import csv
import glob
import io
import json
import os
import re
import sys
import time
import unicodedata

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)
PROJ = os.path.dirname(_ROOT)

ARCHIVES = ["Blazevic Family", "Booyzen Family", "D'arcy Family",
            "Defranceski Family", "Falco Family", "Lerena Family",
            "Luwinski Family", "Mazza Family"]

SRC_KEYS = ("src", "source")
WHAT_KEYS = ("what", "scope")
GOT_KEYS = ("got", "result", "outcome")
URL_KEYS = ("url", "href")
WHEN_KEYS = ("when",)

# ---------------------------------------------------------------------------
# THE SAME ID THE BROWSER WOULD COMPUTE. A faithful port of canonical() in
# site/src/components/ProgressKit.astro — if these two ever disagree the
# import lands in a tally nothing else reads, which is the exact failure that
# function was written to stop.
# A DGS FILM IS A THING YOU CAN MARK. David: «we can't mark DGS film numbers
# as well?» — and the answer was no only because I had been trying to RESOLVE a
# film to a waypoint so the mark would attach to an atlas volume and colour a
# ring on the map. That is a nice-to-have. The record of work is the point, and
# a mark id is only a string: `film:005497886` keys a tally exactly as well as
# `volume:9RK1-T3F` does, and it is the reader's own research either way.
# 84 rows cite a film this way and every one of them was being discarded.
#
# AND THE URL CARRIES THE IMAGE NUMBER. «/search/film/005481649?i=363» says
# film 005481649, image 363 — 48 of those rows have one, and film 005497894
# alone names 31 separate images. Those become the mark's page ranges, which is
# real page-level progress that was going in the bin.
#
# THE RANGES UNDERSTATE, DELIBERATELY. A cited image is one the researcher
# demonstrably opened; images they read and did not cite leave no trace. So the
# set is what is KNOWN to have been seen, never a claim about what was not —
# and «start again at» pointing into a gap is the safe direction to be wrong in.
# WHICH VOLUME EACH DGS FILM OPENS AT, read off FamilySearch's own film pages
# on 2026-09-29 in David's signed-in browser, one page at a time. The film
# page's title carries the viewer URL and its `wc=` is the waypoint; nothing
# here is derived, guessed, or pattern-matched from a similar film.
#
# READ THE SECOND COLUMN CAREFULLY: this is the volume the film OPENS AT, not
# the whole of what the film holds. DGS 005497886 is 639 images across three
# image groups and its waypoint names only the first — Marriages 1581-1623 —
# while the frames actually read on it were 1777-1784, two centuries later in
# a later segment. That is why a resolved film does NOT become a volume mark:
# it becomes a film mark that KNOWS WHERE IT IS, which is a smaller and true
# claim. Turning it into a volume mark would attribute a reader's pages to a
# book they may never have opened, and nothing downstream would question it.
#
# Four films have no waypoint at all — they sit outside a browsable collection
# — and three resolve to collections this atlas does not hold at volume level
# (Argentine parish books, Illinois naturalisations, US passport applications).
FILM_WAYPOINT = {
    "004571398": "MDBL-JNL", "004640985": "M6TM-QWR", "005481649": "9RK1-HZK",
    "005482657": "9RK1-Y4C", "005494111": "9R2W-PTY", "005494174": "9R24-PYZ",
    "005494763": "9R2Z-FMX", "005497870": "9R2X-HZ8", "005497871": "9R2X-VZ9",
    "005497884": "9R28-2N1", "005497885": "9R2H-RM8", "005497886": "9R28-RMN",
    "005497893": "9R28-3YH", "005497894": "9R2D-927", "005497925": "9R2X-ZNT",
    "005497940": "9R2F-DP6", "005497948": "9R2D-JW1", "005498269": "9R2D-16X",
    "007572652": "3XZQ-RM9",
}

FILM = re.compile(r"/search/film/(\d+)")
IMG = re.compile(r"[?&]i=(\d+)")

WC = re.compile(r"[?&]o?wc=([^&]+)")
ARK = re.compile(r"/ark:/61903/3:1:([0-9A-Z-]+)", re.I)


def canonical(raw):
    raw = str(raw or "")
    kind, _, rest = raw.partition(":")
    if kind != "volume":
        return raw
    m = WC.search(rest)
    if m:
        import urllib.parse
        wp = urllib.parse.unquote(m.group(1))
    elif not re.match(r"^https?:", rest):
        wp = rest
    else:
        return raw
    wp = wp.split(":")[0].strip()
    return "volume:" + wp if wp else raw


def waypoints_in(url):
    """Every waypoint a URL could be naming, best first."""
    out = []
    m = WC.search(url or "")
    if m:
        import urllib.parse
        out.append(urllib.parse.unquote(m.group(1)).split(":")[0].strip())
    for m in ARK.finditer(url or ""):
        out.append(m.group(1).split(":")[0].strip())
    return [w for w in out if w]


# ---------------------------------------------------------------------------
# RANGES, ONLY WHERE THE PROSE STATES ONE.
RANGE_PATS = [
    # «images 1-47», «pages 1 to 47»
    re.compile(r"\b(?:image|page|img|p)s?\.?\s*(\d{1,4})\s*(?:[-–—]|to)\s*(\d{1,4})\b", re.I),
    # «all 174», «all 110 images» — a whole volume walked
    re.compile(r"\ball\s+(?:the\s+)?(\d{1,4})\b(?!,\d)(?:\s*(?:images|pages))?", re.I),
    # «174 images», «110 images walked»
    re.compile(r"(?<![\d,])\b(\d{1,4})\s+(?:images|pages)\b", re.I),
]
WALKED = re.compile(r"\bwalk(?:ed)?\b|\bpage by page\b|\bswept\b|\bin full\b|\bcover to cover\b", re.I)

# FOR A FILM, ONLY AN EXPLICIT IMAGE RANGE COUNTS, and this is not fussiness.
# Using the general reader on a film row produced [[1, 698], [702, 720]] for
# DGS 005497940 — a claim that the whole film had been read — out of prose that
# says «Seventeen openings read» and happens to mention images 698, 715 and
# 716. The whole-book inference is right for a volume row whose sentence says
# the register was walked; on a film row it turns any large number in an
# analytical paragraph into 700 images of false progress, and false progress is
# the one thing this record must never contain: it tells the next person a book
# is finished.
# So: the word «image» must be there, and both ends must look like image
# numbers rather than years. The archives' prose is thick with «1880–1886» and
# «Rođeni 1846-1858», and a year range is not a page range.
IMG_RANGE = re.compile(r"\bimages?\.?\s*(\d{1,4})\s*(?:[-\u2013\u2014]|to)\s*(\d{1,4})\b", re.I)
IMG_ONE = re.compile(r"\bimages?\.?\s*(\d{1,4})\b", re.I)
# A YEAR IS NEVER A PAGE. 1400-2100 covers every year these registers can be
# dated to; a number inside it is refused as a page number wherever it turns up.
# The price is a real image 1406 or 2091 in a very large collection being
# dropped rather than kept — the safe direction, since an omitted range only
# understates the work and a year taken for a page claims 1,000 pages read.
YEARISH = range(1400, 2101)

# PHRASES THAT MEAN «I DID NOT READ THIS», in a field whose job is to say what
# was read. «year headers checked on 70, 76-82, 88, 94» is a researcher looking
# at the date at the top of each page to find the right year, not reading 20
# pages; «sampled», «glanced at» and «looked at» are the same. Any segment
# that says so contributes no range at all — the numbers beside the phrase are
# the pages it was done to.
NOT_READ = re.compile(
    r"\bheaders?\b[^;.]{0,25}\bchecked\b|\bchecked\b[^;.]{0,25}\bheaders?\b"
    r"|\bsampl(?:e|es|ed|ing)\b|\bglanc(?:e|es|ed|ing)\b|\blooked\s+at\b"
    r"|\bskimm(?:ed|ing)\b|\bunread\b|\b(?:not|never)\s+(?:yet\s+)?(?:read|opened)\b",
    re.I)

PAGE_LABEL = r"(?:images?|img|pages?|pp?)\.?"
MONTH = (r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b")
# «images 10-489», «pp. 1 to 174» — a range with its label
LABELLED_RANGE = re.compile(
    PAGE_LABEL + r"\s*(\d{1,4})\s*(?:[-\u2013\u2014]|to)\s*(\d{1,4})\b(?!\s*(?:of\s+)?" + MONTH + ")", re.I)
# «10-194» with nothing in front of it — and not «5-6 October»
BARE_RANGE = re.compile(
    r"(\d{1,4})\s*[-\u2013\u2014]\s*(\d{1,4})\b(?!\s*(?:of\s+)?" + MONTH + ")", re.I)
SINGLE_PAGE = re.compile(r"(?:" + PAGE_LABEL + r"\s*)?(\d{1,4})", re.I)
# a year range lying around in the prose, reported when it is refused
YEAR_RANGE = re.compile(r"\b(1[4-9]\d\d|20\d\d|2100)\s*[-\u2013\u2014]\s*(\d{2,4})\b")


def image_ranges(text):
    """Nothing. Kept as a function so the reasoning stays next to the decision.

    PROSE CANNOT BE MINED FOR THIS AND THE ATTEMPT WAS ACTIVELY WRONG.
    Two narrowing passes were not enough. The row for DGS 005497940 contains,
    in one paragraph and in identical grammar:

        "That is images 1–698 of this film and was not opened"
        "Images 699, 700 and 701 were read"
        "Images 702–720 — June to December 1891 — are ..."

    The first is a statement that a range was NOT searched, and the parser
    recorded all 698 as done — the exact inverse of what the researcher wrote,
    and the worst error this file can make, because a mark saying a book is
    finished stops anybody opening it again. Restricting to the word "image"
    did not help: every one of those says "image".

    A sentence naming an image range can mean I read it, I did not read it, it
    does not exist, or it is where the answer would be. Distinguishing those is
    reading comprehension, not parsing, and a wrong guess here is unrecoverable
    because nothing downstream questions a range.

    So the only page evidence taken from a film row is the image number in its
    URL, which is unambiguous: the reader opened that image. The prose goes
    into the note, intact, for a person to read.
    """
    return []


def split_top(text, seps):
    """Split on `seps` outside brackets, and not inside «2,246».

    The first parser split blindly on commas and semicolons, so the aside in
    «126 (both pages, 1809-1810)» became a free-standing «1809-1810)» and
    «2,246 images» became page 246. What is in brackets belongs to the item it
    follows, and a comma between digits with no space is a thousands mark.
    """
    parts, depth, cur = [], 0, []
    for i, ch in enumerate(text):
        if ch in "(\u00ab[":
            depth += 1
        elif ch in ")\u00bb]" and depth:
            depth -= 1
        elif ch in seps and depth == 0:
            thousands = (ch == "," and i and text[i - 1].isdigit()
                         and text[i + 1:i + 4].isdigit()
                         and not text[i + 4:i + 5].isdigit())
            if not thousands:
                parts.append("".join(cur))
                cur = []
                continue
        cur.append(ch)
    parts.append("".join(cur))
    return parts


def _yearish(*ns):
    return any(n in YEARISH for n in ns)


def parse_pages(text):
    """(ranges, refused) for a `pages` field. ranges is [[a,b], ...] or None.

    «1-47, 60-72» -> [[1,47],[60,72]]. The same grammar ProgressKit.astro's own
    box accepts, because this is the field the skill tells a session to fill
    and a reader typing into the site should be writing the same thing.

    Deliberately strict, because a mark that overstates what was searched is
    worse than a mark with no range. A range is taken only when
      * it LEADS an item — a bare «10-194», or one with its label,
        «images 10-489» / «pages 1 to 174» — and the words after it are the
        reader's own note, so «1-400 (item 2, finished)» is 1-400;
      * neither end is a year (1400-2100) and it is not a date («5-6 October»);
      * the segment (what lies between semicolons) does not say the pages were
        only sampled, glanced at, looked at or had their headers checked.
    A lone page counts only as a bare number («186, 221»): «125 (left, page 12)»
    is one half of an image and is left out rather than rounded up to all of it.
    Numbers inside brackets are the item's description, never separate items.

    `refused` lists (segment, why) for everything this declined that the old
    parser would have taken as pages, so a person can see what was dropped.
    """
    out, refused = [], []
    for seg in split_top(text or "", ";"):
        seg = seg.strip()
        if not seg:
            continue
        found, years = [], []
        for part in split_top(seg, ","):
            part = part.strip()
            if not part:
                continue
            lead = LABELLED_RANGE.match(part) or BARE_RANGE.match(part)
            if lead:
                a, b = int(lead.group(1)), int(lead.group(2))
                if _yearish(a, b):
                    years.append(lead.group(0))
                elif 0 < a <= b <= 9999:
                    found.append([a, b])
                continue
            one = SINGLE_PAGE.fullmatch(part)
            if one:
                n = int(one.group(1))
                if _yearish(n):
                    years.append(part)
                elif 0 < n <= 9999:
                    found.append([n, n])
        # A year range tucked into the prose is not taken either way; say so.
        for ym in YEAR_RANGE.finditer(seg):
            if ym.group(0) not in years:
                years.append(ym.group(0))
        said = NOT_READ.search(seg)
        if said:
            if found:
                refused.append((seg[:140], "not counted as read: \u00ab%s\u00bb" % said.group(0)))
            if years:
                refused.append((seg[:140], "year-like, not a page: " + ", ".join(years)))
            continue
        if years:
            refused.append((seg[:140], "year-like, not a page: " + ", ".join(years)))
        out += found
    return (out or None), refused


def parse_ranges(text):
    """[[a,b], ...] or None. See parse_pages for the rules and the refusals."""
    return parse_pages(text)[0]


def _clause(t, i, j):
    """The sentence or semicolon-clause of `t` holding t[i:j]."""
    start, end = 0, len(t)
    for b in re.finditer(r"[.;]\s|\n", t):
        if b.end() <= i:
            start = b.end()
        elif b.start() >= j:
            end = b.start()
            break
    return t[start:end]


def ranges_from(text):
    """[[a,b], ...] or None. `whole` says the range covers the book.

    The same refusals as parse_pages apply: a year is not a page, and a clause
    that says the pages were sampled or glanced at is not a record of reading
    them. Only the clause holding the match is judged, so one honest sentence
    is not lost to a neighbour's «sampled».
    """
    t = text or ""
    for m in RANGE_PATS[0].finditer(t):
        a, b = int(m.group(1)), int(m.group(2))
        if (0 < a <= b <= 9999 and not _yearish(a, b)
                and not NOT_READ.search(_clause(t, m.start(), m.end()))):
            return [[a, b]], False
    # A COUNT IS ONLY A RANGE WHEN THE ROW ALSO SAYS IT WAS WALKED. «110
    # images» on its own is the size of the book, not the part that was read;
    # «walked page by page — all 174» is both. Requiring the second phrase is
    # what keeps this from turning every volume's page count into a claim of
    # having read it.
    if WALKED.search(t):
        for pat in RANGE_PATS[1:]:
            for m in pat.finditer(t):
                n = int(m.group(1))
                if (0 < n <= 9999 and not _yearish(n)
                        and not NOT_READ.search(_clause(t, m.start(), m.end()))):
                    return [[1, n]], True
    return None, False


def rows_of(path):
    try:
        d = json.load(io.open(path, encoding="utf-8"))
    except Exception:
        return []
    if isinstance(d, list):
        return [r for r in d if isinstance(r, dict)]
    for key in ("searched", "rows", "entries"):
        if isinstance(d.get(key), list):
            return [r for r in d[key] if isinstance(r, dict)]
    return []


# `when` IS FREE TEXT AND SOME OF IT IS NOT A DATE. The archives write «15
# September 2026», «Sept 2026», and also «not yet» and «—». The last two are
# the row saying the work has NOT happened; carried into `since` they would
# date a mark to a string, and «not yet» would sort as though it were a month.
# Only something with a year in it is taken.
YEAR = re.compile(r"\b(19|20)\d{2}\b")

# AND IT IS NORMALISED, BECAUSE max() ON TWO DATE STRINGS IS NOT A DATE
# COMPARISON. The archives write both «9 Sept 2026» and «2026-09-28», and in
# ASCII every human-format date beginning 3-9 sorts above every ISO date
# forever — so `max(a, b)` picked «9 Sept 2026» over «2026-09-28» and a mark
# touched three weeks later kept the older date. source:findmypast shipped
# saying it was last touched on 9 September when Luwinski had worked it on the
# 27th and 28th.
# It is structural rather than a collision: across the archives 1,072 rows are
# human-format and 156 are ISO, and the ISO ones are the two most recently
# onboarded archives — the newer the archive, the more reliably it loses.
# Everything is parsed to ISO here, once, so every later comparison is between
# two dates of the same shape. A string that will not parse yields "" and
# never wins, rather than winning by accident.
MONTHS = {}
for _i, _m in enumerate(["jan", "feb", "mar", "apr", "may", "jun",
                         "jul", "aug", "sep", "oct", "nov", "dec"], 1):
    MONTHS[_m] = _i
MONTHS["sept"] = 9
DMY = re.compile(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})\b")
MY = re.compile(r"\b([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})\b")
ISO = re.compile(r"\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b")


def to_iso(v):
    """«9 Sept 2026» and «2026-09-28» both become «2026-09-28»-shaped, or ""."""
    v = (v or "").strip()
    m = ISO.search(v)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = DMY.search(v)
    if m:
        mo = MONTHS.get(m.group(2)[:4].lower()) or MONTHS.get(m.group(2)[:3].lower())
        if mo:
            return f"{m.group(3)}-{mo:02d}-{int(m.group(1)):02d}"
    m = MY.search(v)
    if m:
        mo = MONTHS.get(m.group(1)[:4].lower()) or MONTHS.get(m.group(1)[:3].lower())
        if mo:
            # A month with no day sorts at its first, which is the earliest it
            # could have been — an unstated day is not licence to claim the
            # 31st and outrank a dated row.
            return f"{m.group(2)}-{mo:02d}-01"
    m = YEAR.search(v)
    return f"{m.group(0)}-01-01" if m else ""


# AND `when` DOES NOT MEAN THE SAME THING IN EVERY ARCHIVE. Falco writes the
# RECORD's year there — «1846» against the Arienzo birth register — not the
# date the search happened. Taken at face value that produced marks claiming
# they were last touched in 1913 and 1924, which is not a stale date, it is a
# nonsense one: `since` exists to say how long ago somebody looked.
# A research date in this project is 2024 or later, and a bare year earlier
# than that is the record talking rather than the researcher. Those are
# dropped rather than guessed at — a mark with no date reads as «no date»,
# which is true, where 1913 reads as a fact and is not.
WORK_FLOOR = "2024-01-01"


def when_of(row):
    """A date somebody actually wrote, or nothing.

    A BARE YEAR IS NOT A WORK DATE. Nobody records an afternoon's searching as
    «2026»; they write «15 Sep 2026» or «2026-09-28». to_iso() falls back to
    the 1st of January so that a year is at least orderable, and for `since`
    that fallback invents a date — «2026-01-01» against a row worked in
    September is the same defect as the 1913 pair, just inside the floor and
    therefore harder to see. Seven rows carry one. They lose their date rather
    than gaining a wrong one.
    """
    raw = first(row, WHEN_KEYS)
    iso = to_iso(raw)
    if not iso or iso < WORK_FLOOR:
        return ""
    # A month has to be named or numbered somewhere in the original.
    if not (re.search(r"\d{4}-\d{2}", raw) or
            re.search(r"[A-Za-z]{3}", raw)):
        return ""
    return iso


# ONE LINE PER ARCHIVE, BECAUSE THAT IS WHAT AN ARCHIVE IS.
# Progress is now kept per family line — searching Senj for Blažević is not
# progress on Kosina — and the eight archives are already exactly that split.
# So the Blažević archive's work lands in a «Blažević» line rather than being
# merged into one undifferentiated pile, which would reintroduce the
# over-claim the lines were added to remove.
# This also fixes a straight mismatch: the exporter wrote v1-shaped marks
# (flat `done`/`state`) while the store and the skill had moved to v2, so an
# import was being quarantined into a single «Imported <date>» line and every
# archive's work was attributed to the same fictional family.
# The archive's OWN family, used when a row does not say which one it is for.
LINE_NAME = {
    "Blazevic Family": "Blažević",
    "Booyzen Family": "Booyzen",
    "D'arcy Family": "D'Arcy",
    "Defranceski Family": "Defranceschi",
    "Falco Family": "Falco",
    "Lerena Family": "Lerena",
    "Luwinski Family": "Luwinski",
    "Mazza Family": "Mazza",
}


def build_family_index():
    """Which tag words genuinely name a family, per archive.

    AN ARCHIVE IS NOT A FAMILY, AND I HAD BEEN TREATING IT AS ONE. Every row in
    the Blažević archive was landing in a «Blažević» line — including the 22
    tagged `kosina` and the 14 tagged `zubrinic`, which are different families
    researched from the same folder. That is exactly the conflation lines were
    added to prevent, reintroduced one level up. David asked the question that
    found it: «what family is each session sending to in the skill?»

    A tag counts as a family only when the ARCHIVE'S OWN SURNAME LIST says so —
    data/archive-surnames.json is harvested from the archives' person records,
    so «kosina» being in the Blažević set is that archive stating it holds
    Kosina people. Tags that are places this atlas knows, or provider ids, are
    excluded: the tag vocabulary is a mix of families, parishes, methods and
    sources, and «Senj» or «Antenati» matching some surname somewhere would
    file a family's work under a town.
    """
    try:
        doc = json.load(io.open("data/archive-surnames.json", encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    for arch, v in (doc.get("archives") or {}).items():
        names = v.get("surnames") or [] if isinstance(v, dict) else (v or [])
        out[squash(arch)] = {squash(n): n.title() for n in names if n}
    return out


def slug_of(fam):
    name = LINE_NAME.get(fam, fam)
    out = []
    for ch in unicodedata.normalize("NFKD", name.lower()):
        if unicodedata.combining(ch):
            continue
        out.append(ch if ch.isalnum() else "-")
    return re.sub(r"-+", "-", "".join(out)).strip("-") or "line"


def first(row, keys):
    for k in keys:
        v = row.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


# WHAT THE ARCHIVE SAID HAPPENED, IN THE VOCABULARY THE MARK UI ALREADY USES.
# The seven states in VolumeMarks.astro were not invented for this import and
# are not extended by it; a word that does not map leaves the row with no
# state rather than being forced into the nearest one.
OUTCOME = {
    "yield": "found", "hit": "found", "found": "found", "correction": "found",
    "done": "searched", "nothing": "searched", "null": "searched",
    "empty": "searched", "nil": "searched", "miss": "searched",
    "not there": "searched",
    "partial": "found", "part": "found", "mixed": "found",
    "blocked": "blocked",
    "pending": "written", "outstanding": "written",
    "planned": "planned", "not-yet": "planned",
}


def state_of(row):
    v = str(row.get("outcome") or row.get("status") or "").strip().lower()
    if v in OUTCOME:
        return OUTCOME[v]
    # «no Falco», «no Blažević» — a surname-shaped miss, which is a search
    # that happened and found nothing.
    if v.startswith("no "):
        return "searched"
    return ""


def host_of(url):
    m = re.match(r"https?://(?:www\.)?([^/]+)", url or "")
    return m.group(1).lower() if m else ""


def build_provider_index():
    """host -> provider row. The atlas's own spine, not a guess at one."""
    doc = json.load(io.open("data/providers.json", encoding="utf-8"))
    provs = doc["providers"] if isinstance(doc, dict) else doc
    idx = {}
    for p in provs:
        h = host_of(p.get("url"))
        if h:
            idx.setdefault(h, p)
    return idx


def squash(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]", "",
                  "".join(c for c in s if not unicodedata.combining(c)))


def build_name_index():
    """A provider by the name an archive writes in prose, EXACTLY.

    TWO ARCHIVES CARRY NO SOURCE URL AT ALL and were producing nothing.
    D'Arcy's `href` is a link into its own site — «/sneyds», «/chatham» — not
    to the record, and Mazza has no link field whatsoever. Both name the
    source in prose instead, in the same shape: «FindMyPast — National Burial
    Index», «Antenati — Scilla, Matrimoni 1899». 906 rows across the archives
    have a named source and no URL.

    So the text before the first dash or comma is matched against provider
    names, and the match must be EXACT once punctuation and accents are
    stripped — never a substring, never a prefix. «Antenati» resolves;
    «Antenati name index» does not, and «Arienzo BIRTH register» names a book
    rather than a provider and resolves to nothing, which is correct. A fuzzy
    rule here would attach one archive's work to whichever provider happened
    to share a word with it, and a wrong attribution is worse than a gap
    because nobody goes looking for it.
    """
    doc = json.load(io.open("data/providers.json", encoding="utf-8"))
    provs = doc["providers"] if isinstance(doc, dict) else doc
    idx = {}
    for p in provs:
        for k in (p["name"], p["id"],
                  re.split(r"\s+[\u2014\u2013-]\s+", p["name"])[0]):
            key = squash(k)
            if key:
                idx.setdefault(key, p)
    return idx


SRC_HEAD = re.compile(r"^(.*?)(?:\s+[\u2014\u2013]\s+|\s+-\s+|,|$)")


def named_provider(text, idx):
    """The provider an archive named in prose, or None."""
    m = SRC_HEAD.match((text or "").strip())
    return idx.get(squash(m.group(1))) if m else None


def idx_places_names():
    """Folded names of every place the atlas holds, so a parish tag is not
    mistaken for a surname."""
    out = set()
    for f in ("site/public/index.json", "site/public/index-quiet.json"):
        try:
            for p in json.load(io.open(f, encoding="utf-8")).get("places", []):
                if p.get("n"):
                    out.add(squash(p["n"]))
        except Exception:
            pass
    return out


def build_collection_index():
    """url -> title, for the few rows that cite a collection outright."""
    doc = json.load(io.open("data/collections.json", encoding="utf-8"))
    rows = doc["collections"] if isinstance(doc, dict) else doc
    return {r["url"].rstrip("/"): r.get("title") or r["url"]
            for r in rows if r.get("url")}


def build_volume_index():
    """waypoint -> {t, place}. Only volumes this atlas actually holds."""
    # THE PLACE'S NAME, NOT ITS ID. The mark's `where` is printed as the
    # heading of a place's block on /my-research/, and keyed by the byPlace
    # slug it read «otocac» — an id is a good key and a poor label, and this
    # one drops the diacritics that make it Otočac.
    label = {}
    for f in ("site/public/index.json", "site/public/index-quiet.json"):
        try:
            for p in json.load(io.open(f, encoding="utf-8")).get("places", []):
                if p.get("i") and p.get("n"):
                    label.setdefault(p["i"], p["n"])
        except Exception:
            pass
    idx = {}
    # GZIP FIRST — THE WORLD FILE HAS BEEN COMPRESSED FOR A WHILE AND THIS
    # NEVER NOTICED. data/fs-volumes-world.json.gz is 45 MB and the plain path
    # named here does not exist, so os.path.exists said no, the loop skipped it
    # in silence, and this indexed only the small local fs-volumes.json:
    # 31,028 volumes out of 2,933,990 waypoints. Every session row citing a
    # waypoint outside that 1% was reported as «no volume could be placed»,
    # which reads like the session's fault and was ours. The Blažević session's
    # 9R26-82S is in the world file and could never be tied.
    #
    # Same failure as the cemeteries and the gazetteer this week: the data
    # moved to .gz and a reader kept asking for the plain name. Nothing throws
    # when that happens, which is exactly why it lasted.
    def _open_vols(stem):
        if os.path.exists(stem + ".gz"):
            import gzip as _gz
            return _gz.open(stem + ".gz", "rt", encoding="utf-8")
        if os.path.exists(stem):
            return io.open(stem, encoding="utf-8")
        return None
    for f, key in (("data/fs-volumes.json", "byPlace"),
                   ("data/fs-volumes-world.json", "byPlace")):
        fh = _open_vols(f)
        if fh is None:
            continue
        with fh:
            d = json.load(fh)
        for place, vols in (d.get(key) or {}).items():
            for v in vols:
                wp = (v.get("waypoint") or v.get("wp") or "").split(":")[0].strip()
                if wp:
                    idx.setdefault(wp, {"t": v.get("t") or "", "place": place,
                                        "label": label.get(place, place)})
    return idx


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="record-atlas-research-import.json")
    ap.add_argument("--rejects", default="")
    args = ap.parse_args()

    vols = build_volume_index()
    provs = build_provider_index()
    names = build_name_index()
    cols = build_collection_index()
    fam_names = build_family_index()
    # Words that are not families even when they collide with a surname.
    not_family = set()
    for p in (json.load(io.open("data/providers.json", encoding="utf-8"))
              ["providers"]):
        not_family.add(squash(p["id"]))
        not_family.add(squash(p["name"]))
    for p in idx_places_names():
        not_family.add(p)
    print(f"{len(vols):,} atlas volumes indexed by waypoint, "
          f"{len(provs):,} provider hosts")

    marks, rejects, lines = {}, [], {}
    page_refusals = []
    seen = matched = ranged = srcmarked = filmed = 0
    per = {}

    for fam in ARCHIVES:
        path = os.path.join(PROJ, fam, "site/src/data/searched.json")
        rows = rows_of(path)
        home = slug_of(fam)
        archive_names = fam_names.get(squash(LINE_NAME.get(fam, fam)), {})
        if rows:
            lines[home] = {"name": LINE_NAME.get(fam, fam), "where": "",
                           "made": time.strftime("%Y-%m-%d")}

        def line_for(row):
            """The family this ROW is about, falling back to the archive."""
            for t in (row.get("tags") or []):
                k = squash(t)
                if not k or k in not_family:
                    continue
                proper = archive_names.get(k)
                if not proper:
                    continue
                sl = slug_of(proper)
                if sl not in lines:
                    lines[sl] = {"name": proper, "where": "",
                                 "made": time.strftime("%Y-%m-%d")}
                return sl
            return home

        hit = 0
        # COUNTED PER ARCHIVE BECAUSE THE TOTAL-ONLY LINE MISLED TWO SESSIONS.
        # This summary used to report volume matches alone, so an archive whose
        # work is all Antenati, Findmypast or a state archive read «0 matched
        # to an atlas volume» and concluded it had produced nothing — while its
        # source marks were sitting in the output, correctly attributed. A
        # number that is true and reads as the opposite of the truth is worse
        # than no number.
        src_hit = 0
        for r in rows:
            seen += 1
            src = first(r, SRC_KEYS)
            url = first(r, URL_KEYS)
            blob = " ".join(filter(None, [src, first(r, WHAT_KEYS), first(r, GOT_KEYS)]))
            when = when_of(r)
            st = state_of(r)
            line = line_for(r)
            wps = [w for w in waypoints_in(url) if w in vols]

            # THE `pages` FIELD IS PARSED FOR EVERY ROW, tied to a volume or
            # not, so the report of what was refused is complete. Only a row
            # that reaches a volume below turns the result into a mark.
            pg_rng, pg_refused = None, []
            if isinstance(r.get("pages"), str) and r["pages"].strip():
                pg_rng, pg_refused = parse_pages(r["pages"])
                for seg, why in pg_refused:
                    page_refusals.append({"archive": fam, "src": src[:100],
                                          "segment": seg, "why": why,
                                          "tiedToVolume": bool(wps)})

            # THE SOURCE MARK FIRST, BECAUSE IT IS THE ONE MOST ROWS SUPPORT.
            # A row naming a source this atlas knows is a true statement that
            # the source was worked, whether or not the volume can be pinned.
            # The URL is the stronger claim, so it is tried first; the
            # prose name only answers for a row that has no usable link.
            p = provs.get(host_of(url))
            # A RELATIVE HREF IS NOT A SOURCE URL. D'Arcy's 422 rows carry an
            # href like «/sneyds» — a link into its own site, not to the
            # record — so testing «has no url» left every one of them out of
            # the prose fallback and the archive produced nothing at all. What
            # matters is whether there is a HOST to match, not whether the
            # field is filled.
            if not p and not host_of(url):
                p = named_provider(src, names)
            if p and st:
                sid = "source:" + p["id"]
                m = marks.setdefault(sid, {"by": {}})
                m["t"] = m.get("t") or p.get("name") or p["id"]
                m["href"] = m.get("href") or p.get("url")
                b = m["by"].setdefault(line, {})
                b["state"] = b.get("state") or st
                if when:
                    b["since"] = max(b.get("since", ""), when)
                if src and not b.get("note"):
                    b["note"] = src[:150]
                srcmarked += 1
                src_hit += 1

            # A ROW THAT NAMES A WHOLE COLLECTION NAMES A REAL THING. Five
            # of 406 research URLs are a FamilySearch collection page rather
            # than an image; that is a coarser mark than a volume and a
            # truer one than a provider, so it is kept at its own level.
            cu = (url or "").rstrip("/")
            if cu in cols:
                cid = "collection:" + cu
                m = marks.setdefault(cid, {"by": {}})
                m["t"] = m.get("t") or cols[cu]
                m["href"] = m.get("href") or cu
                b = m["by"].setdefault(line, {})
                if st and not b.get("state"):
                    b["state"] = st
                if when:
                    b["since"] = max(b.get("since", ""), when)
                if src and not b.get("note"):
                    b["note"] = src[:150]

            # THE FILM MARK, which needs no waypoint and no resolution.
            fm = FILM.search(url or "")
            if fm:
                fid = "film:" + fm.group(1)
                m = marks.setdefault(fid, {"by": {}})
                m["t"] = m.get("t") or ("FamilySearch film " + fm.group(1))
                m["href"] = m.get("href") or (
                    "https://www.familysearch.org/search/film/" + fm.group(1))
                # A RESOLVED FILM KNOWS ITS GROUND. The waypoint gives the
                # volume the film opens at, and through it the place — so the
                # mark can sit under that place on /my-research/ and link to
                # its page, instead of floating in «films not yet tied to a
                # place». The volume it names is recorded as the film's FIRST
                # segment, never as what the reader necessarily read.
                wpf = FILM_WAYPOINT.get(fm.group(1))
                if wpf and wpf in vols:
                    m["waypoint"] = wpf
                    m["where"] = m.get("where") or vols[wpf].get("label") or vols[wpf]["place"]
                    m["place"] = vols[wpf]["place"]
                    m["opensAt"] = vols[wpf].get("t") or ""
                elif wpf:
                    m["waypoint"] = wpf
                b = m["by"].setdefault(line, {})
                if when:
                    b["since"] = max(b.get("since", ""), when)
                if st and not b.get("state"):
                    b["state"] = st
                if src and not b.get("note"):
                    b["note"] = src[:150]
                # THE URL AND THE PROSE EACH KNOW HALF OF IT. The link for
                # this row carries «?i=172» and the sentence beside it says
                # «DGS 005497894, images 172–174» — the URL names where the
                # reader happened to be standing, the prose names what they
                # read. Taking only the first understates by two images every
                # time somebody wrote the range down properly.
                got = []
                im = IMG.search(url or "")
                if im:
                    n = int(im.group(1))
                    got.append([n, n])
                got += image_ranges(blob)
                if got:
                    b["done"] = (b.get("done") or []) + got
                filmed += 1

            if not wps:
                rejects.append({"archive": fam, "src": src[:140], "url": url,
                                "sourceMarked": bool(p and st),
                                "why": ("cites a DGS film number or image ark; the "
                                        "atlas indexes waypoints and the two do not "
                                        "overlap" if url else "row carries no URL")})
                continue
            wp = wps[0]
            mid = canonical("volume:" + wp)
            # THE FIELD THE SKILL ASKS FOR, BEFORE THE PROSE. .claude/skills/
            # record-atlas-feedback/SKILL.md tells every session to write
            # `"pages": "1-47, 60-72"` and `"walked": true`, with careful rules
            # about both — omit `pages` rather than guess it, and set `walked`
            # only if every entry was read. Neither field was ever read here.
            # Sessions followed the instruction and the atlas discarded it:
            # of 75 marks in the last import, 8 carried a range and NONE was
            # marked walked, because the only path in was a regex over the
            # `src` sentence.
            #
            # The prose path stays and stays second — it is what rescued those
            # 8 from sessions written before the skill existed. But a session
            # that states its range in the field provided should not have to
            # also phrase it correctly in a sentence.
            rng = whole = None
            if pg_rng:
                rng = pg_rng
                whole = r.get("walked") is True
            # A `pages` FIELD THAT WAS REFUSED IS NOT AN INVITATION TO GUESS.
            # The row said what it read, in the place it was told to say it;
            # this declined some of it as years or as not-read. Falling back to
            # a regex over the sentences then turned «found out of sequence on
            # images 304–322» into 19 images read — the same overstatement by
            # another road. The prose path is for rows with no `pages` at all.
            if not rng and not pg_refused:
                rng, whole = ranges_from(blob)
                # `walked: true` alongside prose that gave a range but did not
                # say «walked» is still the session's own claim, and it is the
                # claim the skill is strictest about. Honour it.
                if rng and r.get("walked") is True:
                    whole = True
            m = marks.setdefault(mid, {"by": {}})
            m["t"] = m.get("t") or vols[wp]["t"] or src[:90]
            m["where"] = m.get("where") or vols[wp].get("label") or vols[wp]["place"]
            m["href"] = m.get("href") or ("/TheMap/place/" + vols[wp]["place"] + "/")
            b = m["by"].setdefault(line, {})
            if when:
                b["since"] = max(b.get("since", ""), when)
            if st and not b.get("state"):
                b["state"] = st
            # THE NOTE IS THE ARCHIVE'S OWN SENTENCE, not a summary of it. A
            # reader opening this mark in six months needs to know which of
            # their own sessions produced it.
            if src and not b.get("note"):
                b["note"] = src[:150]
            if rng:
                if whole:
                    # READ ENTRY BY ENTRY, so it belongs to every family and
                    # sits above the lines. This is the one place the importer
                    # widens a claim past the archive that made it, and
                    # ranges_from() returns `whole` only when the row itself
                    # says the register was walked.
                    m["walked"] = sorted((m.get("walked") or []) + rng)
                    if not m.get("total"):
                        m["total"] = rng[0][1]
                else:
                    b["done"] = sorted((b.get("done") or []) + rng)
                ranged += 1
            matched += 1
            hit += 1
        per[fam] = (len(rows), hit, src_hit)
        print(f"  {fam:<20} {len(rows):>4} rows \u2192 "
              f"{hit:>4} volume, {src_hit:>4} source")

    # Merge overlapping ranges the way ProgressKit does, so an import is not
    # the one place a reader's ranges come back unmerged.
    def merged(rs):
        out = []
        for a, b in sorted(rs or []):
            if out and a <= out[-1][1] + 1:
                out[-1][1] = max(out[-1][1], b)
            else:
                out.append([a, b])
        return out

    today = time.strftime("%Y-%m-%d")
    for m in marks.values():
        if m.get("walked"):
            m["walked"] = merged(m["walked"])
        for b in m.get("by", {}).values():
            if b.get("done"):
                b["done"] = merged(b["done"])
            else:
                b.pop("done", None)
            b["since"] = b.get("since") or today

    # A LINE WITH NOTHING UNDER IT IS NOISE IN A DROPDOWN. Tag matching finds
    # families the archives genuinely name — Gerkacs, Pekass, Defrančeski —
    # whose rows carried no state this could map, so the line was created and
    # left empty. Exporting it puts a family in the switcher that answers
    # nothing when chosen, and «Defrančeski, 0 marks» sitting next to
    # «Defranceschi, 47» reads as a duplicate rather than as an absence. A
    # family with no recorded work has nothing to import.
    used = set()
    for m in marks.values():
        used.update(m.get("by", {}).keys())
    dropped = [k for k in lines if k not in used]
    for k in dropped:
        del lines[k]
    if dropped:
        print(f"    empty lines dropped       {len(dropped):,}  ({', '.join(sorted(dropped))})")

    doc = {"v": 2, "exported": today, "lines": lines,
           "active": (sorted(lines)[0] if lines else None), "marks": marks}
    json.dump(doc, io.open(args.out, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"\n{args.out}")
    print(f"    rows read                  {seen:,}")
    print(f"    tied to an atlas volume    {matched:,}")
    print(f"    distinct volumes marked    {len(marks):,}")
    # COUNTED WHERE THE RANGES ACTUALLY LIVE. This asked for `m["done"]`, which
    # stopped existing when marks became per-family: a range is written to
    # m["by"][line]["done"], or to m["walked"] when the register was read entry
    # by entry. So the line reported 0 while the file plainly carried ranges —
    # a summary that undercounts its own success, which is how a broken import
    # goes unnoticed for weeks.
    def _has_range(m):
        if m.get("walked"):
            return True
        return any((b or {}).get("done") for b in (m.get("by") or {}).values())
    print(f"    carrying a page range      {sum(1 for m in marks.values() if _has_range(m)):,}")
    nfilm = sum(1 for k in marks if k.startswith("film:"))
    print(f"    film marks                {nfilm:,}  (from {filmed:,} rows)")
    ncol = sum(1 for k in marks if k.startswith("collection:"))
    print(f"    research lines            {len(lines):,}")
    print(f"    collection marks          {ncol:,}")
    nvol = sum(1 for k in marks if k.startswith("volume:"))
    nsrc = sum(1 for k in marks if k.startswith("source:"))
    print(f"    source marks              {nsrc:,}  (from {srcmarked:,} rows)")
    print(f"    volume marks              {nvol:,}")
    print(f"    no volume could be placed {len(rejects):,}")
    # WHAT THE PAGE PARSER REFUSED, shown rather than silently dropped. A year
    # range or a «sampled» list that used to be recorded as pages read is now
    # left out, and the person who wrote it should be able to see that it was.
    nrows = len({(x["archive"], x["src"], x["segment"]) for x in page_refusals})
    print(f"    pages text refused        {nrows:,} segments  "
          f"(year-like numbers or not counted as read)")
    for x in page_refusals[:40]:
        print(f"      {x['archive'].split()[0]:<10} {x['why'][:60]}\n"
              f"        pages: {x['segment'][:110]}")
    if len(page_refusals) > 40:
        print(f"      ... and {len(page_refusals) - 40} more (see --rejects)")

    if args.rejects:
        json.dump({"noVolume": rejects, "pagesRefused": page_refusals},
                  io.open(args.rejects, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"    rejects written to         {args.rejects}")


if __name__ == "__main__":
    main()
