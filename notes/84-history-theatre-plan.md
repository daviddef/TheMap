# 84 · The history theatre: bring conquest and migration into the light, and add leaders and explorers

Written 18 Oct 2026 after David asked: the conquest and migration map "isn't visual enough, it's
hidden away", and could there be a "leaders and discoverers" lens (Vasco da Gama, Dias, the real
explorers; the leaders of each nation over time).

## 1. What exists today (measured, not remembered)

| Piece | State |
|---|---|
| `era-moves.json` | 978 movements (713 migration, 189 conquest, 76 occupation), derived from the `migro-row` tags on the flag pages. |
| Drawing | `RecordMap.astro` `drawMoves()`: 1.6 px arcs between country label anchors, tooltips only, Leaflet canvas. Counted by the year a move *began*. |
| Two ends | Only 282 of 978 have a second end the map can draw. 696 have an "other party" that is an empire or a wave of people, drawn as a dashed 6° stub. 667 distinct strings ("Rashidun Caliphate", "Syrian refugees (2011–)", "enslaved Africans"). |
| Where it lives | A row in a ten-item layer dropdown, shut by default, plus one line of text on the start card. Draws nothing until a year range is set. |
| Time | The year control is a range; there is no scrubber, no density, no chapters. |
| Borders | The map shows modern country outlines. `data/ohm/` already holds 20 MB of **OpenHistoricalMap sovereign boundaries (CC0)**: 96% of 1900s eras, 92% of 1800s, 85% of 1700s, 68% of 1500s, about half of 1200–1400, almost nothing before 900. Only the flag pages use it. |
| Leaders | One ruler per era (the first of the era), as a text tag, on 1,464 of 1,486 eras. No dates, no ids, no per-year lookup. |
| Explorers | Effectively none: 6 tags mention an explorer or voyage (Leif Erikson, Lapita voyagers). Nothing to draw a route from. |

## 2. The idea in one line

A **History** mode with its own door in the header: a full-bleed map and a time scrubber, where
countries recolour as the ground changes hands, arrows flow along corridors, voyages sail their
routes with a moving ship, and every country wears a crown card naming who led it that year.
The records map stays; this is the second room.

## 3. Bring it to light (Phase 0 and 1)

1. **A door.** "History" beside "Records" in the masthead. One click lands on a curated opening
   frame (not an empty map): 1914 to 1950 playing, conquest on, the scrubber visible.
2. **A front-page teaser.** A muted 20-second looping strip of the 1450 → 1950 conquests under
   the hero, with a "Watch it" button. The present link ("Or watch the ground change hands") is
   one line of grey text.
3. **Chapters, not a blank scrubber.** About twelve curated tours that each set years, layers and
   a bounding box with three honest sentences: the Mongol conquests (1206–1260), the Age of
   Discovery (1415–1522), the Atlantic slave trade, the Napoleonic wars, the partition of Africa,
   the world wars, decolonisation, the great emigrations (1850–1914), the Cold War, refugee
   movements since 1990. A chapter is a URL, so it can be linked and the family sites can point at one.
4. **A scrubber with a pulse.** Decade ticks, a density sparkline of how many moves began in each
   decade (so quiet centuries read as quiet), play/pause, three speeds, keyboard-operable,
   `prefers-reduced-motion` respected (steps instead of animation).
5. **Make the arrows read.** Flowing dashes with arrowheads and a fading trail; width by scale
   where the source gives a number; one colour per kind (conquest red, occupation amber,
   migration blue) kept from today. Click opens a card with the words the page used, the years,
   the other party, and a link to the flag-page era that says it.
6. **Give the 696 stubs a home.** A small hand-written `data/actors.json` mapping the repeated
   non-country parties to a seat of origin ("Mongol Empire" → Karakorum, "Rashidun Caliphate" →
   Medina, "Ottoman Empire" → Constantinople, "Soviet Union" → Moscow). About 80 actors cover most
   of the 667 strings; the rest stay as stubs. Honest rule kept: an arrow to a seat says "from the
   seat of", never a route.
7. **Let the ground change colour.** Use the cached OHM boundaries so the polity that held a place
   in the chosen year tints the map in its flag colour. Where OHM has nothing (before about 1200,
   and gaps) the map stays modern and says "no boundary data for this year" in the corner. Nothing
   is guessed, same rule as the flag gates.

Estimated effort: Phase 0 (door, teaser, chapters, URL) about 1 day; Phase 1 (arrows, scrubber,
actors, OHM tint) about 3 days. All client-side on static files already published.

## 4. The leaders lens (Phase 2)

**Dataset:** `data/leaders.json`: one row per (polity, person, office, from, to), each with a
Wikidata Q-id and a source. Positive evidence only: a country-year with no row is silent.

- **Source:** Wikidata (CC0). For modern states, the "head of state" (P35) and "head of
  government" (P6) statements with start and end qualifiers; for historic polities, the monarch
  succession of the polity item (`office held by head of state`). The atlas already holds 1,857
  former countries with Wikidata ids in `polities-wikidata.json` and the polity-to-flag-era join
  (`context.json`).
- **Tiers:** A) 1800 to present, all 195 countries, heads of state (largest, cleanest). B)
  monarchs for the 60 or so historic polities that have flag pages (Ottoman, Mughal, Mongol,
  Holy Roman Empire, Habsburg, Russia, Qing and so on) back to about 1000. C) the rest by
  hand, case by case, never inferred.
- **Gates:** the leaders file is checked like the flag evidence: every row has a Q-id, a start,
  dates ordered, no two heads of state overlapping in one polity unless the row says
  "co-rulers", every person on the page that cites one.
- **Lens UI:** a "Crowns" toggle puts a small portrait-free name chip on each visible country
  ("Manuel I · 1495–1521"); the year card lists who led what; a country panel shows the reign
  ribbon along the scrubber so you can see the handovers; click a leader to see the countries
  they led and the moves that happened under them.
- **Pays a second debt:** the family sites asked for a ruler per year (their item 5). Publishing
  `leaders.json` gives `context.json` a `rulers` section in v2.0.0 and fixes the wrong
  "Victor Emmanuel II for an 1888 event" problem.

Effort: Tier A pipeline and gate 2 days, UI 1.5 days; Tier B 2 days of harvest plus a review of
the joins; Tier C open-ended.

## 5. The discoverers lens (Phase 3)

The honest problem is vocabulary. Nobody "discovered" an inhabited land. The layer says **"first
recorded landing by Europeans"**, **"reached"**, **"first circumnavigation"**, and notes the
people already there when they are known. This matches how the atlas already treats "contested"
and "approximate".

**Dataset:** `data/voyages.json`.

```json
{ "id": "da-gama-1497", "leader": {"name": "Vasco da Gama", "q": "Q7313"},
  "sponsor": {"polity": "portugal-flags", "ruler_q": "Q81138"},
  "from": 1497, "to": 1499, "kind": "sea",
  "route": [{"name": "Lisbon", "lat": 38.7, "lon": -9.1, "year": 1497.5}, ...],
  "reached": [{"name": "Calicut", "q": "Q...", "year": 1498, "claim": "first European sea arrival"}],
  "sources": ["..."], "evidence": "attested" }
```

- **Tier A, by hand with sources (about 60 voyages):** Leif Erikson, Zheng He's treasure voyages,
  Marco Polo, Dias (1488), Columbus (4), da Gama (1497–99), Cabot, Cabral, Vespucci, Magellan and
  Elcano, Cartier, Drake, Tasman, Cook (3), Bering, La Pérouse, Lewis and Clark, Humboldt, Mungo
  Park, Livingstone, Burton and Speke, Burke and Wills, Franklin, Nansen, Amundsen, Peary and
  Henson, Shackleton, Hillary and Tenzing. Routes are a handful of dated waypoints chosen along
  water so the polyline does not cross land; the gate rejects any segment crossing a land polygon
  by more than a tolerance.
- **Tier B, from Wikidata (hundreds):** people with occupation *explorer* (Q11900058), with
  nationality and dates, listed in a "Explorers" panel and placed at the polity that sponsored
  them. A list lens, not routes, and clearly marked as list-only.
- **Rendering:** a ship or boot marker travels the route as the scrubber advances; waypoints
  appear as dated dots; "reached" places pulse once. Each voyage ties to the sponsor's flag in
  that year (from `context.json`) and to the sponsor's ruler (from `leaders.json`), which is what
  makes the three lenses one tool: click Vasco da Gama, see Manuel I of Portugal under the
  Portuguese flag of 1497, the Cape route, the arrival at Calicut, and the conquests and
  migrations that followed in the same decades.
- **Gate:** every voyage has a Q-id for its leader, a dated route, at least two sources of
  different publishers (as with flags: a reference source or two independent compiled ones for
  `attested`), and a class for each "reached" claim.

Effort: schema and gate 1 day, 60 voyages with sources 4 to 5 days of research, renderer 2 days.
This is the longest phase and the one where the sourcing is the work.

## 6. How the three lenses meet

| Click on… | Shows |
|---|---|
| a country in a year | its flag, its leader, the polity name, the moves that began that year, the voyages under way |
| an arrow | who, where from, years, the flag-page era that says it, the leader at the time |
| a leader | every country and year they led, with their voyages or wars if the atlas has them |
| a voyage | route, sponsor flag, sponsor leader, what was reached, sources |

## 7. Risks and rules

- **Honesty over spectacle.** Arrows to seats not guessed destinations; OHM tint only where OHM has
  a polygon; voyages only with sources; "no data for this year" stays visible.
- **Performance.** 978 animated arrows would be a smear. Keep the "began in the window" rule, cap
  visible arrows, and draw flow on one canvas with a single requestAnimationFrame loop.
- **Licensing.** Wikidata and OHM are CC0. Flag drawings stay the Atlas's own; no third-party
  portraits (names only).
- **Build capacity.** `RecordMap.astro` is 8,400 lines. Local builds need about 9 GB free; the Mac
  has about 8 GB. Develop in the preview server with the data already built, and let CI do the
  full build.
- **Scope creep.** Tier B and C leaders, and Tier B explorers, are lists first and are never
  allowed to hold the first release back.

## 8. Order of work

1. Phase 0: the door, the teaser, chapters, URL state. Ship alone; it lights up what exists.
2. Phase 1: arrows, scrubber, actors, OHM tint.
3. Phase 2: leaders Tier A, crown chips, `context.json` v2 rulers.
4. Phase 3: voyages Tier A, then Tier B list.
5. Phase 4: leaders Tier B, the "click a leader" view, family-site hooks ("life in context").

## 9. Decisions only David can make

1. **Name and door:** "History" in the masthead, or something else ("Time machine", "Theatre")?
2. **Scope of the first release:** Phases 0 and 1 only, or hold for leaders?
3. **Explorers vocabulary:** "first recorded landing by Europeans" and "reached", as above, or a
   shorter label the atlas would defend?
4. **Whose explorers:** Europeans only, or Zheng He, Polynesian navigators, Ibn Battuta, Arab and
   Indian Ocean mariners from day one (recommended, and it shapes the first sixty).
