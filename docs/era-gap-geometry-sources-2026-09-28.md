# Openly-licensed geometry for the 287 findable era gaps

A survey, not a drawing exercise. Every URL in `data/ohm/gap-sources.json` was
fetched in this session and confirmed to return HTTP 200, to parse as JSON, to
declare a licence, and to hold real `Polygon`/`MultiPolygon` geometry. No
coordinate was generated, estimated or traced anywhere in this work.

## Headline

**64 of 287 have a usable source. 223 do not.**

The 223 is the finding, not a shortfall. The decisive result of this survey is
negative and it is worth stating plainly:

> The famous polities of world history have no openly-licensed boundary geometry.

Qin, Han, Tang and Song China; Maurya, Gupta and the Delhi Sultanate; Srivijaya
and Majapahit; the Achaemenids, the Seleucids and Safavid Iran; Kievan Rus';
the Aztec Empire; Goryeo and Unified Silla; Aksum; the Himyarites; the Timurids;
the Ottoman Empire at its height. Not one of them has an open polygon. I checked
this exhaustively rather than by sampling — see Method.

## What was found, by licence and quality

| | count |
|---|---|
| **CC0-1.0** | 39 |
| **CC-BY-4.0** | 25 |
| *total found* | **64** |

| `covers` | count | what it means here |
|---|---|---|
| `modern-border-proxy` | 29 | a present-day CC0 national outline standing in for an era whose extent genuinely equals it |
| `approximate` | 35 | a real historical polygon, but from a snapshot year inside the era rather than at the era's own date |
| `exact` | 0 | — |
| `raster-only` | 0 | see *Deliberately left alone* |

**Nothing is recorded as `exact`.** Every historical polygon found is a dated
snapshot that falls somewhere inside a multi-decade or multi-century era, and
every modern outline is a present-day border reused for an earlier period. Both
are useful; neither is exact, and the file says so on every row.

There are 27 distinct source files behind the 65 citations. No source used is
copyleft, non-commercial or share-alike. CC-BY-4.0 requires visible attribution
on any page that draws those 25 eras.

## Pages now solvable end-to-end

**14 pages have every one of their gaps sourced:**

`albania`, `brazil`, `gabon`, `liechtenstein`, `luxembourg`, `macedonia`,
`mozambique`, `nauru`, `portugal`, `romania`, `samoa`, `sao-tome-principe`,
`tonga`, `tunisia`

A further **28 pages are partly solved**. The most useful of these are
`philippines` (6 of 7 gaps sourced) and `afghanistan` (5 of 6) — both are one
era away from complete, and in both cases the missing era is a contested-control
problem rather than a missing-map problem.

## The single most important thing in this report

The dataset that would close almost all of the remaining 223 is
**`github.com/aourednik/historical-basemaps`, and it is licensed GPL-3.0.**

It ships 54 world boundary snapshots from 123000 BCE to 2010 CE as GeoJSON. Of
the 223 not-found eras, **212 have at least one of those snapshot years falling
inside their date range.** I established that from the filenames and the repo's
licence metadata only — I did not read, download or use any of its geometry.

GPL-3.0 is copyleft. Per your rule this is flagged and **not recommended**: it
cannot go into an ad-carrying site without raising a licence question over the
site's own output. I want to be precise about what I am and am not claiming:

- I **am** claiming the date ranges overlap for 212 of 223, and that the licence
  is GPL-3.0.
- I am **not** claiming its polygons actually cover each country's ground, or
  that its boundaries are accurate. I did not look.

So this is a decision for you, not a research dead end. If that licence is ever
acceptable — or if its author would dual-license — the gap survey outcome changes
from 64/287 to something much larger. That is the highest-leverage question here,
and it is a licensing conversation rather than more searching.

## Two problems found in the existing data

Neither is something I changed — I touched only the two files I was asked to.

**1. Five probe points sit outside their own country's outline.** Testing
`era-ground.json`'s representative points against each country's own CC0 modern
outline, five fall in water just off the coast:

| page | point | distance outside its own modern border |
|---|---|---|
| `tonga` | −21.1494, −175.2091 | 1.2 km |
| `philippines` | 15.0798, 121.8627 | 4.3 km |
| `bahamas` | 26.4841, −77.3576 | 8.2 km |
| `haiti` | 18.8065, −72.7241 | 9.8 km (Golfe de la Gonâve) |
| `canada` | 60.3044, −94.4801 | 12.3 km (Hudson Bay) |

A point in water cannot be inside any polity's polygon, in any era. Some of
these pages' gaps are therefore **probe artefacts, not absences of OHM
geometry** — the polygon may well exist and simply not contain the test point.
Nudging these five points onto land and re-running the OHM join is cheap and may
recover eras for free, without any new source. I hit this directly: the Haiti
era "Spanish Hispaniola" looked unmatched by the point test, yet a dedicated
`La Española` polygon exists and is now cited.

**2. Fifteen `year` values in `era-gaps.json` are day-of-month, not year.**
Where a label is a full date the year field took the day: `"17 July 1973"` →
`17`, `"27 April 1978"` → `27`, `"26 Apr 1964"` → `26`, `"1 July 1962"` → `1`,
`"15th century"` → `15`. I preserved these values byte-for-byte in
`gap-sources.json` so the two files still join, and derived real date ranges by
parsing `era-ground.json`'s `label` text instead. The underlying parser that
produced the field is what wants fixing.

## Open, but awkward

- **Seven entries need a ring extracted from a whole-empire MultiPolygon.**
  `Imperio Británico 1921` and `Imperio Francés 1938` each hold one feature
  covering the entire empire. Canada, Ireland, Algeria, Gabon, Mauritania and
  Indochina are each *a ring inside it*, selectable by which ring contains the
  country point. Mechanical, but not a plain file download.
- **`Imperio Mongol 1300` is over-extended at its western edge.** The same
  polygon wrongly covers Slovakia. I used it only for Tajikistan, which sits
  deep inside the real Mongol realm, and the row says to treat the outline as
  rough. It is evidence the file is loose, so do not reuse it near its margins.
- **The Spanish-empire files merge all of Spanish America into one polygon.**
  This is exactly why the Viceroyalty of New Spain, the Captaincy General of
  Guatemala and Spanish Trinidad are all recorded `found: false`. Cutting
  `América Española` down to any one of them means drawing a new border.
- **`Worldmap 1279` contains filler features that impersonate polities.**
  Alongside genuine entries like `Great Zimbabwe` and `Sinhalese kingdom`, it
  carries `Africa`, `unclaimed`, `Antarctica` and bare island outlines
  (`Jamaica`, `Australia`). A name-and-point match will happily return `Africa`
  for six different African eras. I rejected every one of those; anyone
  automating against this file needs the same filter.
- **`Imperio de Carlos V` mixes `LineString` features in with its polygons**, so
  a naive reader will trip over non-areal geometry.
- **Date drift is the norm.** Ottoman Albania is sourced from an 1850 atlas sheet
  for an era beginning in 1479 — 371 years of drift. Portuguese America is
  sourced at 1790 for an era beginning in 1500, when the colony was far smaller.
  Each such row states the snapshot year in `snapshot_year` and the drift in its
  note.
- **Disputed borders, stated rather than hidden.** The Philippines rows note the
  unresolved Sabah claim. The three middle Afghanistan rows note that the
  polygon is the *de jure* border while actual control was fragmented or
  partial — for the 1992 civil-war era and the first Taliban emirate the outline
  overstates control, and the row says so.
- **No projection problems.** Every file is WGS84 lon/lat GeoJSON. This was the
  one anticipated difficulty that did not materialise.

## Method

Rather than 287 fuzzy name searches, I pulled the whole universe of candidate
geometry first and matched against it offline. That makes the negative results
exhaustive rather than anecdotal.

1. **All 66,139 Wikidata `P3896` statements**, paginated out of the Query
   Service. Checked both by direct QID and by label scan.
   *Result: P3896 is almost entirely modern administrative units — US counties,
   German protected areas, Dutch municipalities, electoral districts. Not one of
   the major historical polities carries a geoshape.* Every apparent name match
   was a false friend: Anuradhapura **District**, Sukhothai **Province**,
   Ashanti **Region**, Bukhara **Region** — modern units sharing a historic
   name. None was recorded.
2. **All 200,174 pages of the Commons `Data:` namespace** (93,314 `.map`,
   90,931 `.tab`), crawled and then grepped locally for every distinctive token
   in all 287 era names.
   *Result: exactly 23 files on Commons hold historical polity boundaries.* I
   fetched all 23 and read their licence, feature names and geometry. About ten
   proved usable.
3. **The Commons search API per era name**, as an independent check on step 2.
   It surfaced the same small historical set and nothing new — two independent
   routes converging, which is why I am confident in the negatives.
4. **Point-in-polygon testing.** For each candidate I required both that the
   source's snapshot year fall inside the era's date range *and* that the
   feature actually contain the page's representative point — the same test
   `era-ground.json` already uses for OHM, so results are comparable. This
   produced 77 raw candidates, which I then reviewed one at a time and cut to
   35: rejecting filler features, whole-empire polygons standing in for a single
   colony, and long composite eras that merely happened to swallow an unrelated
   snapshot.
5. **Licence verification at the source.** Natural Earth confirmed public domain
   from its own terms page; `historical-basemaps` confirmed GPL-3.0 from GitHub's
   licence metadata. Every Commons file's licence was read out of the file
   itself, not assumed.
6. **Final pass:** re-fetched all 27 cited URLs *exactly as written in the
   deliverable*, confirming both the raw content and the human-facing wiki page
   return 200 and that polygon geometry is present.

All requests went out with a descriptive User-Agent naming the project and a
contact address, rate-limited to well under 2 requests/second, honouring
`Retry-After`. Nothing was blocked, so there is nothing to record as declined,
and no user-agent was spoofed and no gate worked around.

## Why the 223 are `found: false`

| reason | count | |
|---|---|---|
| `unmapped-state` | 105 | a real, bounded state — simply no open geometry anywhere |
| `composite` | 54 | the era covers several successive or coexisting polities |
| `fragmented` | 42 | explicitly a fragmented landscape with no single sovereign |
| `prestate` | 19 | a pre-state people, mis-sorted into `findable` |
| `absence` | 3 | the era name records the absence of a state |

`unmapped-state` is the honest core: 105 eras where the polity is real,
well-documented and bounded, and the geometry just does not exist openly.

Where a polygon existed that covered the right ground at the right date but was
the **wrong polity**, I recorded `found: false` and said what the tempting wrong
answer was — so the next person does not rediscover it and mistake it for a
find. Thirty rows do this. Examples: Goryeo (the Mongol Empire covers that
ground in 1300, but Goryeo kept its own borders as a vassal); the Seleucids
(Alexander's empire includes Greece and Egypt, which were never Seleucid); the
Armenian kingdom (the Roman Empire touches it only via Trajan's brief 114–117
annexation); the Omani interior Imamate (the British Empire polygon covers the
probe point, but Britain did not hold the interior — that polygon *contradicts*
the era rather than sourcing it).

## Deliberately left alone

- **The 76 `prestate` entries.** Untouched, as instructed. They are absent from
  `gap-sources.json` entirely.
- **19 pre-state entries that are sitting in `findable`.** Aboriginal and Torres
  Strait Islander Australia, the Māori tribal era, Taíno Jamaica and Xaragua,
  Kalinago Dominica / Grenada / Saint Lucia, Lucayan Bahamas, the Senegambian
  Stone Circle Builders, Iron Age Denmark, Nordic Iron Age Scandinavia, the
  Aestii, the Toutswe Tradition, Tiwanaku, the Sao civilization, Bantu Iron Age
  Zambia, Kirikongo-era Burkina Faso, and uninhabited-at-contact Barbados. I did
  **not** invent boundaries for them and did **not** move them between groups. I
  recorded each `found: false` with `reason: "prestate"`, noting they belong with
  the `prestate` group. For the Caribbean island cases a CC0 outline of the
  island itself does exist, and the Barbados row points at it — but that is
  *ground*, not a polity, and it is offered as such rather than smuggled in as a
  border.
- **3 eras whose names record an absence** — "No state at all" (Finland),
  "No documented polities" (Tanzania), "No sovereign Serbian state" (Serbia).
  There is nothing to look for. A silent search result is not a finding, so
  nothing was written beyond the reason.
- **`raster-only`: no rows recorded.** Commons has plenty of public-domain-by-age
  atlas scans, and I could have written 200 rows saying "an old map of this
  probably exists". That would be exactly the optimistic-true you asked me to
  avoid: I cannot verify from a category listing that a given scan depicts a
  given polity's full extent at a given date, and converting a scan into geometry
  means georeferencing and tracing a border — which is drawing, not sourcing.
  What I can point to is the **proven** path: the CC0 `Mitchell Map 1850` files
  on Commons — five of them exist, two are cited here — are themselves
  hand-traced from public-domain Geographicus atlas scans by Commons
  contributors, and each names its source scan in its own `sources` field. That
  is the working recipe for turning a PD raster into CC0 vector; it has already
  produced the Ottoman, Habsburg, Persian and Two Sicilies sheets, and it would
  be a per-page piece of deliberate work rather than a bulk import.
- **Natural Earth: not cited, though it is public domain.** For the 29
  modern-border-proxy rows I used the CC0 Commons `Data:<Country>.map` geoshapes
  instead, because each gives one stable, fetchable per-country URL that I could
  verify individually, whereas Natural Earth ships a single bulk archive of all
  countries. Same public-domain freedom, better provenance per row.
- **The OHM `wikidata` tag join** (3,665 of 4,083 relations). I did not use it:
  these 287 eras are by definition the ground OHM has no polygon for, so there
  is nothing on the OHM side to join to.
- **I did not fix either data problem above**, or touch `era-gaps.json`,
  `era-ground.json` or anything else. Only `data/ohm/gap-sources.json` and this
  report were written.

## File format

One object per era in `data/ohm/gap-sources.json`, in the same order as
`era-gaps.json`'s `findable` array, with `page`/`year`/`name` preserved exactly
so the two join positionally and by key. Found rows carry `source`, `url`,
`licence`, `covers` and `note`; historical rows add `feature` (which named
feature inside the file) and `snapshot_year` (the date the geometry represents),
and `source_wikidata` where the file is declared via `P3896` — named distinctly
because it identifies the *source file's* subject, e.g. the Roman Empire, and
never the era's own polity. Not-found rows carry `reason`, `searched` and `note`.
