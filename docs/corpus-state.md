# The state of the corpus

Written by `scripts/corpus_state.py` from the data files in the repository. Each gap has a ceiling in `data/_floors.json`; the data check fails if a gap is bigger than its ceiling, so a gap can only be closed, never quietly reopened. A ceiling comes down with `--lower` after a verified gain.

| Measure | Now | Ceiling |
|---|--:|--:|
| Catalogue rows (sources) | 2,634 |  |
| Rows whose access has never been surveyed | 1,296 |  |
| Share of rows never surveyed (tenths of a percent) | 492 | 492 |
| Rows with no Wikidata id | 1,445 |  |
| Rows with no deep link | 1,494 |  |
| Countries | 237 |  |
| Countries with no source at all | 36 | 36 |
| Countries with three sources or fewer | 140 | 140 |
| FamilySearch book names with no place | 6,881 | 6,969 |
| FamilySearch volumes with no place (12 Nov figure) | 37,763 | 39,124 |
| Places with dated names | 375 |  |
| Surname families (hand-built) | 129 |  |
| Given-name families | 1,074 |  |
| Given-name forms | 6,458 |  |
| Given-name forms that are only a lead | 5,011 | 5,011 |
| Given-name families with two forms or fewer | 645 | 645 |
| Countries with a published surname table | 13 |  |

The unplaced-volume figure is the one recorded in `data/fs-volumes-unplaced.json` (12 Nov 2026); the live world file is a release asset this script does not download.
