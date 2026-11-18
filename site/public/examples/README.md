# Example files for the Tree Canvas

Two formats: **GEDCOM** is the industry standard, which almost every genealogy program can export. **tree.json** is our own format, made up for Record Atlas and read by nothing else; its contract (every field the reader takes) is at https://recordatlas.org/tree-canvas/publish/#format .

These two files are public on purpose. They are here so anyone can try the Tree Canvas at
https://recordatlas.org/tree-canvas/ and test opening a file from a link, for example:

    https://recordatlas.org/examples/example-family.ged
    https://recordatlas.org/examples/example-family.tree.json
    https://raw.githubusercontent.com/daviddef/TheMap/main/site/public/examples/example-family.ged

**Every person in them is invented.** Any likeness to a real person is chance. The towns and
cities are real only so that the Record Atlas can place them: nobody here lived in them, and
there is no street, house or living person anywhere in either file. Nothing in them was copied
from a family archive or from anyone's tree.

| file | what it is |
|---|---|
| `example-family.ged` | the family as GEDCOM 5.5.1: 11 people, four generations of two invented lines (Marlowe and Ostrowski), all with a death year |
| `example-family.tree.json` | the same family as a `tree.json`, made from the GEDCOM with the family-tree-page skill's `gedcom_to_tree.py`, so it follows the data contract, plus a `places` list (name, latitude, longitude, country) and a `meta.note` saying it is invented |

How the second was made: the GEDCOM above, a small place map of the ten towns (names written as the town alone, as
Roots & Routes writes them, with each town's coordinates and country in the file's `places` list), and `gedcom_to_tree.py family.ged --out tree.json --place-map place_map.json
--living omit`; then `meta.note` and `places` were added. Both open through the same reader the
Tree Canvas uses for any file (`scripts/test-tree-json.mjs` and `site/test/examples.test.js`
check that they do).

There is a third, smaller invented file next to the page: `/tree-canvas/example-tree.json`
(the Kovač family), which shows the extra fields a researcher's own site can add (page links,
corrections marks, routes).
