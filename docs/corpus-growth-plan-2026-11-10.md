# Growing the corpus and filling its gaps

Written 2026-11-10 from the repository's own data (the world harvest, `data/*.json`, the published coverage and research files). It measures first and proposes second. Every number below was counted today; where a figure is an estimate it says so. Nothing here changes a data row: a row is still written only on positive evidence (see `absence-is-not-evidence`).

## 1. What the corpus is, in numbers

| Part | Size | The gap |
|---|--:|---|
| FamilySearch books (world harvest) | 3,423,649 volumes on 45,612 places | 134,153 volumes (3.9%) on 10,078 names have no place |
| FamilySearch collections | 3,504 (7.6 billion indexed records) | 113 carry no `filedUnder`. **Correction, 10 Nov: that was a misreading.** 92 of them reach their country through `countries` and already appear. The real gap is 21 with no country: 13 worldwide or Caribbean-wide (IGI, Find a Grave, BillionGraves...) that are true to leave unfiled, and 8 small territories, now filed by `scripts/file-collections-by-title.py` |
| Antenati (Italian state archives) | 5,591 volumes from 6,000 images | The Ministry's feed lists **464,770** records: **1.3% harvested**. **Correction, 10 Nov: it cannot be resumed.** The OAI endpoint now redirects to the ministry's home page and its sites refuse crawlers; see `scripts/harvest-antenati-oai.py` |
| Source catalogue (providers) | 1,811 in 179 countries | 519 (29%) access `unsurveyed`; 780 without a deep link; 1,160 without a Wikidata id; Wikidata names 4,631 more archives with websites we do not list |
| Countries and territories | 237 | 62 with no source at all, 154 with three or fewer, 170 with no placed FamilySearch book, 143 with no atlas place, 225 with no surname register count |
| Surnames | 961,408 | Register counts come from **12 countries** (DK, PL, FR, US, BE, ES, IT, SI, FI, NO, IE, HR); 32,716 have no country; 60% have no recorded variant |
| Given names | 630 families, 5,793 forms | 4,772 forms (82%) are `lead`: plausible, never seen on a record |
| Dated place names | 375 places, 530 names | Against ~10,000 unplaced names, most of them old names (gubernias, comitats) |
| Years | 79% of volumes are 1800-1949 | Before 1750: 8.6%. Before 1650: 2.0% |
| Concentration | Italy 1.43M, US 0.69M, Czechia 0.18M, Portugal 0.12M, Mexico 0.12M | Italy alone is 43% |

## 2. The four gaps and what moves each

### A. Things with no place

Three different problems wear the same name.

1. **Collections with no country.** Measured properly (10 Nov), 21 collections reach no country: eight named a territory in full (Antigua and Barbuda, French Polynesia, British Virgin Islands...) and are now filed under it; 13 stay unfiled because they are worldwide (IGI, Find a Grave, BillionGraves, World Miscellaneous...) or name a place the country list lacks (Bonaire, Sint Eustatius and Saba need a country code the atlas does not have). The 92 others already appear on their country's pages.
2. **The unplaced FamilySearch pile (134,153 volumes).** Wikipedia matching is exhausted (see `unplaced-volumes-have-hit-their-floor`). The pile is a long tail with a fat head: 209 names of 100+ volumes hold 55,522 volumes (41%); 1,119 names of 20-99 hold 45,868 (34%); 3,635 single-volume names hold 3,635. So a reviewed table for the **209 head names** places 41% of the pile. Most are not towns but regions (Тверь, Бессарабия, Тула, Szabolcs, Jász-Nagy-Kun-Szolnok, Pest-Pilis-Solt-Kis-Kun, Borsod). Place them on a **region** (an admin division with a polygon), not a point: the books then appear on the region's page and in its totals, and nobody is told a book is in a town it is not in. `placedOnAnAdminDivision` already exists as a class (305,776 volumes); this extends it by hand-reviewed decisions. Gate each decision against two independent witnesses (the gazetteer and the admin divisions), as the outline-vs-country check should have been.
3. **Research marks with no place (Antenati 196 of 196, films 39 of 56).** Awaiting the decision: file the 32 Antenati registers whose own comune text matches exactly one atlas place, and the films that follow. Files under a place only; no volume claim. US passport and Soundex films stay "no single place", because that is true.

### B. Cataloguing

- **Antenati harvest: blocked, not resumable (10 Nov).** The OAI endpoint the harvester used now redirects to the ministry's home page and the ministry's sites refuse crawlers. Ask the Direzione generale Archivi where the open data lives now. Meanwhile `match-antenati.py` can still be re-run (1,432 of 4,159 volumes so far unmatched to a place).
- **Harvest the uncatalogued archives from Wikidata** (4,631) into the catalogue at the existing `unverified` tier, in the order the gap report gives: Germany 976, Italy 829, UK 364, Switzerland 322, US 310, Spain 268, Belgium 246, Indonesia 157. This is a directory harvest, not hand work, and every row says it is unverified.
- **Survey the 519 `unsurveyed`** by script, writing `free` only on explicit phrases ("accessibles directement", "accès libre") plus a viewer, and sending everything that rests on an absence (`onsite`, `catalogue`, `index`) to a review file with the literal phrases found. Never write a class from a silent homepage.
- **Deep links (780 missing) and Wikidata ids (1,160 missing)**: second-order, but the ids are what gives an archive its address, email and telephone. A script can propose ids; a person confirms.

### C. Breadth across countries

The 237 is mostly small territories; the gap that matters is the large countries with almost nothing: for example Nigeria, Pakistan, Vietnam, Thailand, Uganda, Tanzania, Sudan, Syria, Saudi Arabia, Taiwan, Nepal, Singapore, Trinidad and Tobago, Tunisia. For a country like these, FamilySearch books are the wrong measure. The honest unit is **a starter card**: the national archive, the civil registration authority, the diaspora sources, the language and calendar to expect, and where an official source says no online records exist, that statement with its source. Three steps:

1. Start with the 62 countries that have no source: national archive and civil registry from the Wikidata archives sweep (152 national institutions are already harvested and uncatalogued), written `unverified`.
2. Then the Tier C list in `docs/source-gap-report.md`, which is already ranked.
3. **Era**: the corpus thins sharply before 1750. The levers are the sources that hold older material (parish registers, notarial and land records), found per country from the same directory, with the years each holds stated.

Open aggregators that could add country-wide breadth are worth a feasibility check each (licence, robots, no bot gate, a published bulk or API route): Archives Portal Europe, Europeana, the German Digital Library, Matricula, Delpher, Papers Past. These are candidates I have not tested; nothing should be harvested until each passes the same three checks the Antenati route did.

### D. Names and places

- **Dated place names are the same job as the unplaced pile.** Тверь is the Tver governorate; Szabolcs is a pre-1920 county. Each dated name added to `data/place-names.json` (with the page that dates it) is a name the matcher can use, and a name a researcher needs for a search. Do the 209 head names first and let one table serve both.
- **Surname registers** come from 12 countries. The next ones are the countries whose offices publish counts: the Netherlands (the Meertens letter is written, `docs/letter-meertens.md`), Germany, Austria, Switzerland, Sweden, the UK, Portugal, Czechia, Hungary. Each needs a licence read and a source line, then a loader in `data/frequencies/`. Letters (`/errands/`) are worth more per hour than any script left; the memory note says one reply answered 4,987 Czech places.
- **Given names**: 4,772 `lead` forms need evidence, not more forms. Take the families that appear in the harvested registers (Latin, Italian, Croatian, Hungarian forms) and mark `attested` only where a record shows the form.
- **Surname variants**: the catalogue has 66 families. Grow it only from spellings met in work (the `add` rule), never from similarity.

## 3. Order, by yield per hour

| Wave | Job | Needs | Yield |
|---|---|---|---|
| 1 | File the 113 whole-country collections under their country | nothing | 1.89 billion records visible on country pages |
| 1 | Resume the Antenati harvest, then match | an unattended 5-9 hours here | up to ~460k more Italian records, grouped into volumes |
| 1 | Place the 209 head names as regions | review of ~209 decisions, in country batches | up to 55,522 volumes (41% of the pile) |
| 1 | The Antenati comune-text placement (32 + films) | your yes | 32+ marks get a place |
| 2 | Wikidata archive harvest into the catalogue, Tier B first | nothing | ~4,600 candidate sources, all `unverified` |
| 2 | Survey the 519 unsurveyed, positive evidence only | a review file for you | converts blanks to true classes |
| 3 | Starter cards for the 62 source-less countries | nothing, then a person to confirm | breadth: every country page answers something |
| 3 | Dated names for the head regions | researcher patches, validated | resolves unplaced volumes and improves search |
| 4 | New surname registers; the letters | your signature on each letter | new countries in the surname counts |
| 4 | Given-name evidence | a record per form | `lead` becomes `attested` |

## 4. How we know it worked

Add one page and one gate, so the plan cannot quietly slide backwards.

- A generated **state of the corpus** report (as `source-gap-report` is) with the table in section 1, rebuilt every build and shown at `/corpus/`.
- New **floors** in `data/_floors.json`: placed volumes, collections filed under a place, countries with at least one source, Antenati volumes harvested. A floor goes up only after a verified gain.
- A **ceiling** next to them for the unplaced volumes, which must go down, and a count of `unverified` rows so the catalogue is never mistaken for a survey.
- Every wave ends with the same sentence: what is in the repository, what is published, what is live. Those are three different states.

## 5. What I would not do

- Re-run Wikipedia matching, a gazetteer rebuild, a word-prefix rule or the `q`-blob index. All four were measured and are spent.
- Spoof a browser, or retry past a 403, to reach a source that gates crawlers. Decline it and record it.
- Write a class, a place or a variant from absence.
- Put any person, however named, into a name or place catalogue.
