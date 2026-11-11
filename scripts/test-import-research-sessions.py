#!/usr/bin/env python3
"""Does the `pages` parser in import-research-sessions.py overstate what was read?

A mark that says a book was searched when it was not stops the next person
opening it, so every case here is a way the parser once did exactly that, taken
verbatim from the Blazevic Family's searched.json:

  YEARS ARE NOT PAGES — «marriages, 1888-1899» became done range 1888-1899,
  «126 (both pages, 1809-1810)» became 1809-1810: two thousand images of a
  register that has under seven hundred.

  «HEADERS CHECKED», «SAMPLED», «GLANCED AT» ARE NOT READING — «year headers
  checked on 70, 76-82, 88, 94, 100, 108-112, 114-122» was recorded as forty
  pages actually read.

  AND WHAT IT STILL MUST TAKE — «1-47, 60-72», «images 10-489», «pages 1 to
  174», and a range that leads an item and is followed by the reader's note.

    python3 scripts/test-import-research-sessions.py
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "irs", os.path.join(HERE, "import-research-sessions.py"))
irs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(irs)

failures = []


def check(name, got, want):
    if got != want:
        failures.append(f"{name}\n    got  {got!r}\n    want {want!r}")


def pages(text):
    return irs.parse_pages(text)


# --- MUST TAKE -------------------------------------------------------------
check("plain list", pages("1-47, 60-72")[0], [[1, 47], [60, 72]])
check("en dash", pages("10–194")[0], [[10, 194]])
check("single pages", pages("186, 221")[0], [[186, 186], [221, 221]])
check("labelled images", pages("images 10-489")[0], [[10, 489]])
check("labelled pages, to", pages("pages 1 to 174")[0], [[1, 174]])
check("range then reader's note",
      pages("1-400 (item 2, finished); 401-450 of item 3")[0],
      [[1, 400], [401, 450]])
# Brinje births: the real entry. The parenthesis is the item's description, so
# «images 195-197, 401-403 and 490-492 are title and end cards» and «5-6
# October» inside it are not ranges, and the year range «1888-1899» is not one
# either. What survives is exactly the stretches written as ranges up front.
BRINJE = ("1-9 (film-roll, target and title cards: checked, no register entries); "
          "10-194, 198-400, 404-489 (births, items 1-3: every entry re-read at "
          "readable zoom, tile by tile, 5-6 October 2026; images 195-197, 401-403 "
          "and 490-492 are item title and end cards); 493-688 (marriages, "
          "1888-1899: every printed page re-read at readable zoom, 5-6 October "
          "2026, to the END OF ITEM card at image 689); 689-690 (end-of-item and "
          "microfilm cards). The first fit-zoom scan of all of these is superseded.")
rng, refused = pages(BRINJE)
check("Brinje: no year range", [r for r in (rng or []) if irs._yearish(*r)], [])
check("Brinje: no date range", [r for r in (rng or []) if r in ([5, 6], [401, 403])], [])
check("Brinje: the real ranges",
      rng, [[1, 9], [10, 194], [198, 400], [404, 489], [493, 688], [689, 690]])
check("Brinje: the year range is reported",
      any("1888-1899" in why for _, why in refused), True)

# --- MUST REFUSE: years ----------------------------------------------------
check("bare year range", pages("1888-1899")[0], None)
check("labelled year range", pages("pages 1888-1899")[0], None)
check("year range inside an aside",
      pages("125 (left, page 12), 126 (both pages, 1809-1810), 138 (right, page 35)")[0],
      None)
check("year as a lone page", pages("1806, 2145")[0], [[2145, 2145]])
check("date, not pages", pages("12-14 March 1889")[0], None)
check("thousands mark, not a comma", pages("4 leaves of 2,246")[0], None)
check("year range reported",
      [why for _, why in pages("126 (both pages, 1809-1810)")[1]],
      ["year-like, not a page: 1809-1810"])

# --- MUST REFUSE: not read -------------------------------------------------
HEADERS = ("81 (left, 1793), 110 (left, 1807), 120 (left, 1811); year headers "
           "checked on 70, 76-82, 88, 94, 100, 108-112, 114-122")
rng, refused = pages(HEADERS)
check("headers checked: nothing taken", rng, None)
check("headers checked: reported",
      any(why.startswith("not counted as read") for _, why in refused), True)
check("sampled", pages("images 256-277 and 296-322 sampled at their first entries only")[0], None)
check("sampled range", pages("256-277, 296-322 sampled")[0], None)
check("glanced at", pages("45 (left page); 46-52, the right page glanced at")[0], None)
check("looked at", pages("100-110 looked at")[0], None)
check("opened and not read", pages("images 75, 76 and 77 opened and NOT read")[0], None)
# One segment's «sampled» must not take the honest segment beside it.
check("other segments survive", pages("1-40; 41-90 sampled")[0], [[1, 40]])

# --- MUST REFUSE: frame ids written as bare suffixes ------------------------
# Defranceski's DAPA scans: «M01069090, 091, 093» is frames, not pages 91, 93.
for text in (
    "M01069090, 091, 093, 095, 098 \u2014 five of the nine frames in the range; "
    "092, 094, 096 and 097 not yet opened",
    "M01069020, 21, 22, 23, 25, 26, 27, 29, 31, 33, 36 \u2014 11 of the 17 frames in the range",
    "M01069143, 144, 145, 146, 147 \u2014 five frames, read as overlapping full-page halves",
    "M01069024, 028, 030, 032, 035",
    "M01069054, 57-61, 64",
    "\u26a0 UPPER PART OF EACH PAGE ONLY \u2014 the crop stopped at 62% of page "
    "height. M01069094, 096, 097, 099, 100 \u2014 nine frames read today",
):
    check("frame list: " + text[:30], pages(text)[0], None)
check("frame list is reported",
      [why[:30] for _, why in pages("M01069143, 144, 145")[1]],
      ["frame ids, not page numbers: 144"[:30]])
check("zero-padded is not a page", pages("092, 094")[0], None)
# A frame id in an item's own brackets does not turn its neighbours into frames,
# and pages written before a frame list are still pages.
check("pages beside a frame in brackets",
      pages("12-14, 20-22 (M01069090 is the index), 30")[0], [[12, 14], [20, 22], [30, 30]])
check("pages before a frame list", pages("79-85, M01069090, 091")[0], [[79, 85]])

# --- what a row can say that the importer once ignored (9 Nov 2026) --------------
# The research date: Falco keeps the record's year in `when` and the day in `searchedOn`.
check("searchedOn is the research date",
      irs.when_of({"when": "1814", "searchedOn": "2026-10-08"}), "2026-10-08")
check("a bare record year is not a research date", irs.when_of({"when": "1814"}), "")
check("`when` alone still works", irs.when_of({"when": "9 Sep 2026"}), "2026-09-09")

# A film number from the link, else from the row's own `film` field, and never from prose.
check("film from the link", irs.film_of({}, "https://www.familysearch.org/search/film/005481649?i=363"), "005481649")
check("film from the field", irs.film_of({"film": "007713373"}, "https://www.familysearch.org/ark:/61903/3:1:X"), "007713373")
check("film field that is prose is ignored", irs.film_of({"film": "DGS 5481649, images 1-4"}, ""), "")
check("no film", irs.film_of({}, ""), "")
check("a short bare film number is zero-padded", irs.film_of({"film": "5481649"}, ""), "005481649")
check("a short film number in a link is zero-padded to match", irs.film_of({}, "https://www.familysearch.org/search/film/5481649"), "005481649")
check("collection written in the film field",
      irs.collection_in_film_field({"film": "collection 1974184 \u2014 Arienzo"}),
      "https://www.familysearch.org/search/collection/1974184")
check("a film number is not a collection", irs.collection_in_film_field({"film": "007713373"}), "")
# An unparseable searchedOn must not hide a good `when`.
check("bad searchedOn falls through to when",
      irs.when_of({"searchedOn": "yesterday", "when": "9 Sep 2026"}), "2026-09-09")

# Names an archive writes for a provider that are not its name, stated on the provider's row.
names = irs.build_name_index()
for text, want in [("DAPA ZM34K-214 \u2014 Gologorica baptisms", "dapa"),
                   ("\u2b50 DAPA ZM34K-214 \u2014 Gologorica DEATHS", "dapa"),
                   ("TNA Discovery \u2014 WO 97", "discovery"),
                   ("The London Gazette, 1859", "the-gazette-uk"),
                   ("Queensland BDM historical index", "qld-bdm"),
                   ("British Newspaper Archive", "british-newspaper-archive"),
                   ("Anglo-Boer War Museum", "war-museum-boer-republics"),
                   ("SOAS Archives \u2014 CWM", "soas-special-collections")]:
    p = irs.named_provider(text, names)
    check("alias: " + text[:30], p and p["id"], want)
# A department of a university is not the university: no alias is given for the head «University of Cape Town», which names several UCT services.
check("a university head is not one of its databases", irs.named_provider("University of Cape Town \u2014 British Concentration Camps of the South African War", names), None)
# ...and a book is still not a provider: the rule is EXACT, never a prefix or a shared word.
check("a book is not a provider", irs.named_provider("Svetvin\u010denat index", names), None)
check("a prefix is not a match", irs.named_provider("DAPA Pula", names), None)

# An Antenati register is named by its ark.
m = irs.ANTENATI_ARK.search("https://antenati.cultura.gov.it/ark:/12657/an_ua14411/")
check("antenati ark", m and m.group(1), "an_ua14411")
check("antenati home page is no register", irs.ANTENATI_ARK.search("https://antenati.cultura.gov.it/"), None)

# --- the whole parser against the live archives -----------------------------
# Nothing a row's `pages` field yields may contain a year, whatever the prose.
live = 0
for fam in irs.ARCHIVES:
    path = os.path.join(irs.PROJ, fam, "site/src/data/searched.json")
    for row in irs.rows_of(path):
        text = row.get("pages")
        if isinstance(text, str) and text.strip():
            live += 1
            for a, b in (pages(text)[0] or []):
                if irs._yearish(a, b):
                    failures.append(f"live {fam}: {text[:80]!r} -> {[a, b]}")

# `book` / `bookPlace` ARE PUBLISHED, SO THEY MUST NOT BE ABLE TO CARRY A PERSON.
book_cases = [
    ("Defunciones 1729-1833", True), ("Montevideo cathedral", True),
    ('Baptism of "Maria"', False), ("Matrimonios Lerena 1826", False),
    ("Libro 16, film 007713376", False), ("x" * 95, False), ("", False),
    ("Maria Lerena \u00d7 Pedro", False),
]
for text, ok in book_cases:
    got = bool(irs.safe_book(text, {"lerena"}))
    if got != ok:
        failures.append(f"safe_book({text[:40]!r}) -> {got}, wanted {ok}")

if failures:
    print(f"{len(failures)} FAILED")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print(f"ok: pages parser holds ({live} live `pages` fields checked for years)")
