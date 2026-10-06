# Bringing Flag History and Record Atlas together

David asked for two things, 27 September 2026:

1. On Record Atlas — Flag History arrives as a separate menu, **and** flag/era
   results appear in the search-as-you-type results, so a reader gets the map
   and, beneath it, results for countries and hubs.
2. On Flag History — each flag page shows the **records for the periods in its
   timeline**, clearly marked inside the page.

This is the plan. The prototype is `site/public/eras.json` (built by
`scripts/build-eras.py`) and the era block in the map's result panel.

---

## What each side actually has

Verified against both live sites, not assumed.

| | Record Atlas | Flag History |
|---|---|---|
| Pages | 46,149 | 210 |
| Era/jurisdiction data | 41 regions, **230 eras**, with `polity` and `filedUnder` | **1,471 era cards** across 210 countries |
| Grain | sub-national — Istria, Galicia, East Prussia, Congress Poland | country, plus named sub-regions on 59 of 210 pages |
| Machine-readable | `regions.json`, `index.json`, `providers.json` — all fetchable | **none.** Every page is self-contained HTML; the flags are inline hand-authored SVG |
| Countries covered | 237 in the index; **33** touched by a region | 197 modern + 13 vanished |

Two numbers govern the whole design. Flag History has **1,471 eras against our
230** — it is six times broader. And our 230 are sub-national where theirs are
mostly national, so they are not competing datasets; they answer different
questions about the same ground.

---

## The decision that changes everything: do not ingest their data

The obvious build is to scrape 210 HTML pages at our build time and turn 1,471
era cards into our own JSON. I am not doing that, for three reasons.

**It would be a fourth copy of a rule that has already bitten this project
three times.** `build.py` carries a comment about its *third* copy of the
surname-page rule and the 14,384 pages a drift between two copies once cost.
Their era fields are free text — `card-dates` is a display string like
`"1949 – 1990"` or `"990 – present"`, with no structured end year — so we would
be parsing a date out of prose and re-parsing it on every build. A wording
change on their side breaks us silently, in a direction that produces wrong
dates rather than no dates.

**The flags cannot be embedded anyway.** They are inline SVGs the Flag History
session authored itself, under no declared licence. Record Atlas ships seven
licences and `check-data.py` fails the build when a source is used without one.
Embedding art with no licence would either break the gate or, worse, quietly
pass it. Their own recommendation was to link rather than embed, and that is
right.

**We already own the better half of the answer.** For "who governed this ground
in this year", `regions.json` *is* the authority — 230 researched eras with
`filedUnder`, which is the thing no one else publishes. We do not need their
data to put eras in our search results. We need it as a *destination*.

So: **each side keeps its own data and publishes one contract. Nothing is
scraped in either direction.**

```
Record Atlas                                        Flag History
────────────                                        ────────────
regions.json  ──► era results in the panel
                  each era links out ─────────────► <country>-flags.html#era-<year>

eras.json  ◄────────── fetched client-side ───────  "Records for this period"
(we publish)                                         block inside each era card
```

---

## Part 1 — eras in the Record Atlas search results

### What the reader gets

Typing `Gračišće` today lights countries and lists places. It will also list
**who held that ground**, from our own region data:

```
Gračišće — Croatia
  ON THE MAP        1 place · 47 volumes · Državni arhiv u Pazinu
  WHO HELD IT       1200–1374  Aquileia · Gorizia        no registers exist
                    1374–1805  Habsburg — County of Pazin  DAPA · FamilySearch
                    1805–1815  Napoleonic — Illyrian Prov. DAPA · FamilySearch
                    …                                     ↗ see the flags
```

The `filedUnder` column is the payload. Knowing Gračišće was Italian in 1930 is
trivia until it tells you to open FamilySearch's Pola and Trieste collection
rather than its Croatian one — and that sentence is already in `regions.json`'s
own note.

### Why join on our region and not their country

A flag timeline for a modern country is a statement about a border that mostly
did not exist for the period it covers. A reader on Gračišće is standing on
ground that was Aquileian, Venetian, Habsburg, Napoleonic, Austrian, Italian,
Yugoslav and Croatian; only the last is answered by a page called
`croatia-flags.html`. So the chain is:

1. **our region + era** — the true grain, 33 countries, 230 eras;
2. **their sub-national region** — 59 of their pages have named regions, and
   they include `Istria`, `Dalmatia`, `Croatian Military Frontier` and Poland's
   `Austrian zone (Galicia)` by those names;
3. **their country page** — for the other 151, and for the 204 countries where
   we have no region at all.

Step 2 needs a per-`(region, era)` anchor they do not have yet. It is a real
request to make of them, not a blocker: the chain degrades to step 3 without it.

### Matching an era to an anchor

Their anchors are `#era-<startyear>`, keyed on the year a **flag** changed. Our
`from` is the year a **filing system** changed. These are not the same event and
will often disagree — Istria's 1805 and 1815 are both Napoleonic and the parish
books continue unbroken across both. So: **nearest preceding or equal**, never
exact match, and where they differ neither side is wrong. Negative years take a
`bce` suffix (`#era-322bce`) because an HTML id cannot start with a digit; our
earliest era is 1200 CE, so we never exercise that half.

### The menu

`/jurisdictions/` already exists and lists the 41 regions. It becomes the menu
entry — extended, not replaced, with the flag link per era. A second top-level
nav item for someone else's site would be a worse answer than deepening the
page we already have.

---

## Part 2 — records inside each flag page

We publish `/TheMap/eras.json`. Their page fetches it and renders a block in
each era card. They never scrape us; we never scrape them.

One row per `(country, era)` we can speak to:

```json
{
  "cc": "HR",
  "from": 1374, "to": 1805,
  "region": "istria-central",
  "polity": "Habsburg — County of Pazin",
  "filedUnder": ["dapa", "familysearch"],
  "places": 34, "volumes": 1207, "collections": 3,
  "map": "https://recordatlas.org/?at=gracisce&year=1374",
  "note": "The books stayed with the parish and were gathered to Pazin…"
}
```

Plus a country-level fallback row for the 204 countries with no region, so a
flag page for Paraguay still gets *something* — whose national archive, what the
atlas holds — rather than a blank.

### The honesty constraint, which is the hard part

**Ninety per cent of this atlas is `unsurveyed`.** 19,416 of 21,473 places are
correctly placed ground nobody has walked; only 1,727 of 15,780 carry a record
kind. If their era card says "Records for this period" over our numbers, it will
imply holdings we do not have for most of the world.

So the feed carries the denominator, not just the numerator — `places`,
`surveyed`, `unsurveyed` — and the contract asks them to render the shape
"*34 places on this ground, 6 surveyed*", never "34 places of records". A
cross-link that oversells is worse than none: this project's whole value is that
a row can be trusted.

### Licence, which they inherit the moment they render it

Our data is seven licences, not one: ODbL for OpenStreetMap-derived geometry,
CC0, CC BY for GeoNames/Statbel/Istat, OGL for the National Records of Scotland,
and FamilySearch catalogue metadata that is **not open at all**. `eras.json`
therefore carries a `licences` block naming each holder and what attribution it
requires, and volume titles — which are FamilySearch's writing, not ours — are
excluded from the feed entirely. Our own `check-built.py` already fails the build
when a page uses a CC BY source without crediting it; whatever they render
acquires the same duty on their pages.

---

## What I am not deciding

- **Whether they publish a JSON export.** They offered to raise it with David.
  Part 2 does not need it, and Part 1 is better without it.
- **Whether their flag SVGs get a licence.** Their artwork, their call. Until
  then we link and do not embed.
- **Per-`(region, era)` anchors on their side.** Worth asking for; the design
  works without them.

## Order of work

1. `scripts/build-eras.py` → `site/public/eras.json`, with the licence block and
   the surveyed/unsurveyed denominators. **Ships on its own** and is useful
   before anything consumes it.
2. Era results in the map panel, from `regions.json`, with the outbound link.
3. `/jurisdictions/` extended into the menu entry.
4. Tell Flag History the feed is live and hand them the contract.
