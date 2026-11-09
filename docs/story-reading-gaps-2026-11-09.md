# What the story reader still gets wrong (9 November 2026)

David asked for extensive testing of stories: made up, odd, with gaps, with and without dates, trades, locations and names. This is what that found, what was fixed, and what is left. The stories and their expectations are in `site/test/stress/corpus.mjs` (96, run against the real gazetteer by `node site/test/stress/run.mjs`) and the fixture version that runs in `npm test` is `site/test/story-stress.test.js` (40 tests). A fuzz run of 3,000 random stories (`site/test/stress/fuzz.mjs`) found no crash, no `NaN`/`undefined` in a name, and a slowest story of 19 ms. The data stage (`gather`) ran on all 96 without failing.

Result: 53 of 96 passed on the first run, 85 of 85 now pass, and 11 are kept as known gaps below.

## Fixed

| What went wrong | Example | Now |
|---|---|---|
| An ordinary word taken for a place | "died young" gave Young County; "a coal miner" gave Miner County; "three boys" gave Three Rivers; "born in March" gave South March | trades, months, counting words and kinds of ground ("mill", "river", "hill") are never places; in a story written with capitals a place word written small needs a place word before it |
| A surname taken for a place | "Johan Berlin", "Abraham Lincoln", "George Washington Smith" gave Berlin, Lincoln, Washington | a capitalised word straight after a given name is a surname |
| "Not" and "never" ignored | "not born in Cork, he was born in Galway"; "never went to America" | a place the story says nobody went to is not a stop |
| A parent was called "From" | "My father was from Cork. My mother was from Naples." named both parents From and lost Naples | words that are not names are refused as names |
| "My father Marco was born in Florence" | the name after the relation was ignored and Florence dropped as a given name | read as "my father was Marco" |
| "He married Anna Horvat in Karlovac" | no wife, and no person at all | the wife is read, with an unnamed person for the story |
| The same grandparent told twice was two people | "My grandfather was born in Cork. My grandfather died in Boston." lost Boston; 300 mentions made 300 grandfathers | one grandfather unless a different name is given |
| A list lost its second town | "Cork, Dublin, Liverpool and Boston" dropped Dublin | the qualifier rule ("Paris, Texas") no longer applies to items of a list |
| A birthplace told last | "He died in Boston. He had been born in Cork." | the journey starts at the birthplace |
| `'45`, a link in a pasted story, HTML tags | "left in '45" had no year; "https://…/cork" was a place | read as 1945; links and tags are removed |
| A long story froze the page | 200 sentences took 2.5 s (the country scan was quadratic) | 61 ms |
| Trades were thrown away | "stonemason" appeared nowhere | kept as told, shown as a "work:" chip; never looked up |

| A town in a state the index does not hold | "Dublin, Ohio" read as Dublin (Ireland) plus a stop Ohio | the gazetteer is asked for the town in the state's own country (`gazWants`/`gazMerge`, one rule for the page and the harness) |
| Told backwards, or told twice | "Before that he lived in Cork" and "returned to Cork" were wrong | order of telling kept; a place told twice is two stops |
| "He" after a newly named person; "my mother told me he ..." | the mother was given the man's places | a pronoun goes to the last person it can be (a mother is never "he"); what a parent tells is about the man |
| Misspelt places (Brisban, Melborne), inflected ones (Senju), a region (Friuli) | not matched, or the region matched to a town | still not used, on purpose: offered as "did you mean" (tap to change the word in the box; a note in My story); a word inside several names is a partial, not a place |
| Number of children, occupations of two people | not read / one list | counts and per-person trades are read, as told |
| Places past the first six the index lacks | looked up at most six | ten |

## Left (known gaps, in the corpus with the reason)

- **Names of a place in another year.** "Salisbury, Rhodesia" cannot choose among the Salisburys; the country that no longer exists is no hint. Fiume and Danzig are found only as the index lists them. The dated names are in `data/place-names.json` in the Atlas repo; the story reader does not read them yet.
- **Places with no preposition** ("Cork, Lyon, Paris") find only what the index holds; the gazetteer lookup needs in/at/from/near/to/en/nach/aus/von/iz/nel/nella.
- **The reader sees the index, not the whole gazetteer.** Lyon, Kraków, Bilbao, Tbilisi and Tobruk are not in the 55,771-place index; they are found only through the gazetteer lookup above.
- **Detail clauses belong to "the story",** not to a named person.

## The person, as told (added the same day)

David asked what happens to "loved ice cream, had dark hair, was a world class runner, married twice, the second wife divorced him and took his money, he went to jail, met his third wife in a snow storm, love at first sight", and whether a cause of death is read. Before: all of it was dropped without a word, and a single person's death was read only as a year and a place. Now `readLife` (in `story-engine.js`) reads the story clause by clause and keeps each clause that says something under a plain heading, in the story's own words:

How they looked · What they loved · What they were like · Love and marriage · The family around them · Hard times · What they gave up · What they wanted · The weather and the world around them · Work · Marriages (a count: "married twice" + "his third wife" is three) · How they died (cause, year, age, and the clause itself).

Rules: nothing is looked up, nothing is turned into a date or a place, and every line is marked "as told". "Where such things usually leave a record" names kinds of record (a death entry, one marriage record for each marriage, court and prison registers, military records) and is a list of places to look, not findings. It shows in the map drawer ("The person, as told") and the My story report, and as chips while typing ("died of tuberculosis, 1921", "married 3 times", "heard 12 things about them, kept as told").

Tested on 26 stories (`node site/test/stress/life-run.mjs`, 26 pass) and 4 fixture tests in `story-stress.test.js`.

Still not done with it:
- The weather and the world around them are kept, but not yet matched to the Atlas's events by year ("snow storm" has no year; "the flood of 1966" has one but the Atlas holds no flood list). A cause of "Spanish flu" or "cholera" is not yet linked to the mass-mortality events the Atlas holds.
- Each detail belongs to "the story", not to one person on the tree when several are told about. Three marriages do not yet put three unnamed spouses on the tree.
- Clauses are matched by words, so an unusual way of putting a thing is missed (a hair colour told as "she was a redhead" is caught; "he was built like a barn door" is not). Missing a detail is safe; the words are kept whole when they are caught.
- Causes of death outside the list (about fifty) are kept in the clause quoted under "How they died", but not named in the "Cause" line.
