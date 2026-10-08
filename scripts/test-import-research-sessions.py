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

if failures:
    print(f"{len(failures)} FAILED")
    for f in failures:
        print("  -", f)
    sys.exit(1)
print(f"ok: pages parser holds ({live} live `pages` fields checked for years)")
