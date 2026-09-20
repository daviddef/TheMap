# The volume harvest — what it is, and everything it got wrong first

## The door that was recorded as shut

`scripts/import-fs-catalogue.py` said volume-level detail "cannot be
harvested from here and that is not a limitation of effort", because
FamilySearch's catalogue answers anything but a signed-in browser with a 404
or a challenge. That is true **of the catalogue**. It is not true of the
records API:

    https://api.familysearch.org/platform/records/collections/<id>/waypoints

200 to an ordinary identified request. No token, no browser. Its tree
descends to the individual book:

    Collection              Spain, La Coruña, Municipal Records, 1648-1951
      City or Municipality    Betanzos
        Parish                  Betanzos
          Record Type and Years   Alistamiento militar 1689-1805

One door was tried and the whole wall was written off. Same mistake as
declaring Scotland's parishes closed when data.gov.uk had them.

## The three scripts

| | |
|---|---|
| `harvest-fs-waypoints.py` | walks the tree, resumable, 8 workers |
| `match-fs-volumes.py` | joins books to places, including across borders |
| `test-cross-border.py` | the thesis, as a regression test |

## Croatia proved the method

The browser walk found 4,903 volumes across 1,094 places. The API found
5,392, and 1,072 of the places are the same ones — 22 browser-only, 10
API-only. Agreement, not coincidence.

## Everything that was wrong, in order

Each of these shipped and had to be found. They are listed because the
pattern matters more than the individual bugs: **every one of them failed
silently and looked like success.**

1. **The save sat below two `continue`s.** With most collections index-only,
   the periodic save was skipped. A thirty-hour resumable job that never
   wrote anything.
2. **The volume cap was 4,000 against Croatia's known 4,903** — the
   validation would have passed by agreeing with its own truncation.
3. **Waypoint ids differ between the two walks**, so deduping on them never
   matched and every Croatian book shipped twice. Otočac showed eight books
   where it holds four. Title and years identify a book; the id does not.
4. **A length test meant to exclude "Sv."** also excluded Pag, Krk and Rab.
5. **A place indexed under a name that is not its own could outrank the
   place whose name it is.** Zadar, with 82 books, came third behind two
   villages that merely carry its former names.
6. **`placeIds` were resolved through `/places/reps/{id}`** — a different
   numbering that returns an unrelated place with HTTP 200. "Italy, Pola and
   Trieste" came back as Monomie, New South Wales. Implausible resolutions
   fell from 2,318 to 2 once corrected.
7. **A title disagreeing with its places was treated as an error** and the
   places discarded — deleting the exact signal this atlas exists to show.
8. **A book was only recognised by a year in its title.** Micronesia Land
   Records made 1,323 requests and returned zero volumes.
9. **Fifty-one collections had no country**, so their books could never be
   placed. The name-to-ISO lookup was hand-written.
10. **The same countries were stamped into the waypoint file** and went
    stale when the lookup was fixed.
11. **Seventeen promoted places were written to a file nothing read.**
12. **The request budget was checked between levels and spent inside them**,
    so one level of a thousand siblings blew through it.

## The cross-border rule, which took four attempts

At least **two levels** of a waypoint path must resolve abroad, and then the
**deepest** of them names the place.

* Corroboration may come from the gazetteer's 45,985 names; the destination
  must be a real place.
* A level labelled province, state, region, county, diocese or deanery
  **votes on which country and never wins which town**. "Pola" is an
  alternate name of Polla in Campania, and four books from Materada near
  Umag went there before this rule.
* Count **levels**, not votes: "Bale" alone matched two countries and so
  counted as two witnesses, reaching Basel.

Working: Verteneglio → Brtonigla, Buie → Buje, Isola d'Istria → Izola,
Pirano → Piran. Refused: a lone Davor, Bale, Čabar, Borojevići, Topolo.

## Pacing, and my own churn

I restarted this harvest six times in one afternoon and gave four different
estimates (29h, 70h, 12.4h, 131h), each measured on an unrepresentative
stretch. Some of the slowness I kept measuring was the restarts themselves.

The bottleneck was throughput, not tree size: 3 workers against a 1.3s API
is 1.67 requests a second, and no budget makes that finish. Eight workers is
about five a second.

**The lesson is not "tune harder". It is that a multi-hour job should be
measured on a representative sample BEFORE it starts.**

## Politeness, unchanged throughout

One honest User-Agent, no browser impersonation, hard backoff on 429 and
5xx. The standing rule holds: where a gate exists, record it rather than
climb it. That is why Antenati goes through the Ministry's open data and not
its portal.
