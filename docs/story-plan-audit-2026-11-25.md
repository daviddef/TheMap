# Story reader: is it an actionable plan? Audit of 13 stories, 25 Nov 2026

Question from David: for «Drežnik near Nova Gradiška», where does she start at her desk, who can she write to, which neighbouring towns, magistrates and cemeteries are worth looking at, and is the story really turned into things to *do*?

Method: 13 realistic stories (`site/test/plan/stories.mjs`: the pasted Drežnik story plus Croatian village → Queensland, Friuli → Buenos Aires, Gorenjska → Cleveland, Burgenland → New York, Galicia → Pittsburgh, Bohemian Jewish → Vienna, Cork → Boston, Glasgow → Nova Scotia/Toronto, Silesia → Canada, Liguria → Buenos Aires, Dubrovnik → Ellis Island → Butte, Imotski → Chile, Tučepi → Melbourne) were run through the real reader with the built data (`node test/plan/audit.mjs [id]`, `dumpplan.mjs`). For each stop we measured what the Atlas holds within reach: volumes, archives with a position and a contact, cemeteries, region/era table, mortality events.

## What the old plan did (steps 1–8 in `g.plan`)

Eight steps that are the same for every story: «write down what you hold», «pin down the name», «fix <place> in the year», «find the birth», «marriages and burials», «the arrival side», «people from the same place», «keep what you find».

| Gap | Seen in | Effect |
|---|---|---|
| **Generic.** Steps 1, 2, 7, 8 are the same sentence for every story. | all 13 | Reads as advice, not a plan. |
| **Volumes pasted as one run-on line** («Births 1791-1833 Marriages 1812-1857 Deaths …»), unranked, repeated across steps 4 and 5. | us-ellis, dreznik | Nothing says which book to open first or why. |
| **Wrong anchor.** «Dreznik near Nova Gradiska» became a stop at Drežnik (Lika, 127 km away) and Nova Gradiška as «also named». | dreznik | Every later suggestion was for the wrong place. |
| **Wrong region.** Nova Gradiška fell in the Bosnian ring first, so era tables and archives were the Bosnian state archive's. | dreznik | A Croatian family was sent to Sarajevo. |
| **No «who to write to».** No archive had a name, address or email in the plan, and no letter existed. | all 13 | The single most useful desktop action was missing. |
| **No neighbours.** Neighbouring places, the jurisdiction and the nearest archive were never named. | all 13 | «Look nearby» did not exist. |
| **No ground.** Cemeteries were never listed; the Atlas's OSM/Wikidata cemetery files were unused. | all 13 | «Where could we go» did not exist. |
| **No «what was happening».** Mortality events with polygons were not matched to the place and years. | all 13 | A wartime gap in the registers went unexplained. |
| **Gaps hidden.** When the Atlas lists no volume it said nothing, or «a gap in the Atlas» without a next step. | it-friuli, ie-cork, … | The reader cannot tell «nothing exists» from «we have not got it». |
| **Not honest about cost.** «Open now» was shown for volumes that need an account. | us-ellis | Misleading. |

## Engine problems found (place resolution), not yet fixed

These produce wrong plans because the plan is only as good as the stops. Each is a one-line probe in `stories.mjs`.

- **Bavaria → Bavaria, Italy** (de-silesia; Veneto polygon matched first). **Montevideo → Montevideo, Italy** (ar-arrival). **Butte → Butte County, California** (us-ellis, 3,798 km from NARA). **Lugo, Spain** for a Galician Polish story (pl-galicia). **New Glasgow, Nova Scotia** for Glasgow. Rule: a gazetteer match must be checked against the story's other countries and the route direction before it is taken; if two are plausible the plan should say «we read this as X; if you meant Y, change it».
- Decade wording («born likely 1910s») and «b. 1880 Senj» lose the year or attach it to the wrong stop (corpus known gaps).
- Perth (Australia) is read as Perth (Canada); Frankfurt on its own is not in the gazetteer.

## What was built (public/js/story-todo.js, shown in /read/ under «Your plan»)

Local, deterministic, no AI, no network beyond Atlas files. Sections in the order a person would do them, each item with one-line *why*, a link, and an honest «the Atlas holds nothing for this» where that is the case:

1. **Start at your desk** — the volumes for the place, ranked by cost (free > account > on site), with the years the story needs and the years the volumes stop («the online volumes stop at 1920»).
2. **Write to** — the nearest archive with a stated contact, else the regional or diocesan one, plus a ready letter in the archive's language naming the place and surname, and the registry office of today's municipality.
3. **Look nearby** — neighbouring places from the Atlas (≤ 25 km, same country, nearest first) with what they hold; the jurisdiction of the year (e.g. Military Frontier → Croatia-Slavonia, Kingdom of SHS, Independent State of Croatia) filed under the right archive.
4. **Where it would be on the ground** — cemeteries ≤ 15 km from OSM and Wikidata, de-duplicated, with the source; otherwise «the Atlas lists no cemetery near X».
5. **What was happening** — mortality events whose mapped area contains the place in the years the people were alive, worded as context, never as a claim about the family.
6. **Their moves** — each leg, who made it, and the departure and arrival sources.
7. **Today's four moves** at the top: desk, write, search, go.

Anchor correction: «A near B», when A and B are more than 40 km apart in the gazetteer, plans from B and says so in a note.

## Drežnik / Nova Gradiška, concretely

- Anchor: Nova Gradiška (note: «the story puts Drežnik near Nova Gradiška, 127 km from the Drežnik we hold»).
- Era table: Military Frontier ring → Kingdom of Serbs, Croats and Slovenes, Independent State of Croatia; filed under ARHiNET / the Slavonski Brod archive, not the Bosnian state archive.
- Write to: Državni arhiv u Slavonskom Brodu (51 km), Croatian draft letter naming Nova Gradiška and Mihaljević; the Atlas holds no address or email for it and says so.
- Nearby: Cernik, Rešetari, Staro Petrovo Selo … from the Atlas's own places, with what each holds.
- Ground: the Atlas lists no cemetery near Nova Gradiška (OSM 0, Wikidata 0) and says so. It does **not** invent one.
- Moves: Slovenia → Bosnia and Herz. → North Macedonia for the grandmother.

## Data to gather, in priority order (this is what makes the plan better, not more code)

1. **Contacts for state/regional archives** (email, postal address, opening days). Today only Wikidata-stated contacts are held; most archives show «holds no address». Highest value because it enables the letter. Sources to read: each archive's own «kontakt» page, hand-checked. Never inferred.
2. **Cemeteries**: OSM covers the Alpine countries well and Croatia/Slovenia poorly (Nova Gradiška 0, Drežnik 0 OSM). Gather from the national lists of graveyards (HR: gradska groblja of each town, SI: pokopališča) with an operator contact.
3. **Registry offices (matični uredi / Standesamt / comuni)** with a contact. The plan currently says «the registry office of today's municipality» without a name.
4. **Parish-to-place mapping** for Catholic and Orthodox registers: a place often had its baptisms in another parish. This changes «where to look» more than anything else.
5. **Neighbouring jurisdictions per era** (district courts, magistrates, Bezirk, kotar): a handful of polygons per region would turn «nearby places» into «your district».
6. **Archive-to-place coverage**, i.e. which archive holds which parishes; the closest archive by km is a guess.
7. **Place coverage gaps**: Friuli, Cork and Galicia stops hold 0 volumes; the Atlas should say whom to ask, which today depends on provider data.

## Tests

`site/test/story-todo.test.js` (17 tests): anchor correction, region/era choice, volume ranking and gaps, archive contacts and draft letters, no invented cemetery, mortality only when inside the polygon and years, moves, every item carries a why, neighbours, the compact archive endpoint (contacts only where Wikidata states one), and the pasted Ivan/Lucija story end to end. Full suite: 1,062 pass; the 4 failures (`roots.test.js`, «fix list») fail the same way on the untouched code. Stress corpus: 342 pass, 10 known gaps.
