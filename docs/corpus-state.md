# The state of the corpus

Written by `scripts/corpus_state.py` from the data files in the repository. Each gap has a ceiling in `data/_floors.json`; the data check fails if a gap is bigger than its ceiling, so a gap can only be closed, never quietly reopened. A ceiling comes down with `--lower` after a verified gain.

| Measure | Now | Ceiling |
|---|--:|--:|
| Catalogue rows (sources) | 2,615 |  |
| Rows whose access has never been surveyed | 1,277 |  |
| Share of rows never surveyed (tenths of a percent) | 488 | 488 |
| Rows with no Wikidata id | 1,425 |  |
| Rows with no deep link | 1,475 |  |
| Countries | 237 |  |
| Countries with no source at all | 35 | 35 |
| Countries with three sources or fewer | 142 | 142 |
| FamilySearch book names with no place | 7,180 | 7,180 |
| FamilySearch volumes with no place (12 Nov figure) | 45,153 | 45,153 |
| Places with dated names | 375 |  |
| Surname families (hand-built) | 129 |  |
| Given-name families | 1,074 |  |
| Given-name forms | 6,458 |  |
| Given-name forms that are only a lead | 5,011 | 5,011 |
| Given-name families with two forms or fewer | 645 | 645 |
| Countries with a published surname table | 13 |  |

The unplaced-volume figure is the one recorded in `data/fs-volumes-unplaced.json` (12 Nov 2026); the live world file is a release asset this script does not download.
