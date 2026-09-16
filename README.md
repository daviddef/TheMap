# Record Atlas

**Every place your people came from, and who holds the paper.**

A map of where genealogical records actually are — searchable by every name a place has
ever had, coloured by what it costs to look, and able to tell you *whose empire's filing
system* a piece of ground fell under in the year you care about.

→ **[daviddef.github.io/TheMap](https://daviddef.github.io/TheMap/)**

## Why

Genealogy is not short of websites. Cyndi's List has three hundred thousand links. What it
is short of is an answer to the question people actually have: *my great-grandfather was
born in Gallignana in 1863 — where is that record, and can I see it tonight?*

Three things stand between those two questions, and all three are geographic.

1. **The name changed.** Gallignana is Gračišće. Fiume is Rijeka. You cannot search for a
   place whose name you do not know.
2. **The jurisdiction changed.** An 1863 baptism from a Croatian village is in a Croatian
   archive. A 1930 one from the *same village* is filed under **Italy** — because between
   the wars the village was Italian. This is the commonest reason a record that exists
   cannot be found, and nothing looks exactly like a record that does not exist.
3. **"Online" is four different things.** Free images, images behind a free login, an index
   with no images, and a catalogue card for paper nobody has photographed.

## What is in here

```
data/                     the source of truth, hand-editable JSON
  providers.json          who holds records, and what access costs
  regions.json            record regions, their eras, and whose archive each means
  places.json             places and the volumes that cover them
  countries.json          Natural Earth outlines — BUILD TIME ONLY, never served
  country-overrides.json  where the outline is wrong and a human is right

scripts/
  build.py                data/ -> site/public/, split into an index and one file per place
  check-data.py           the build gate; fails the build rather than warning
  geo.py                  which country a coordinate is actually in
  import-defranceski.py   one-shot snapshot import of the Croatian shelf

site/                     Astro, static, deployed to GitHub Pages
```

## The payload split

The one-family archive this grew from serves 1,369 places in a single **2.5 MB** file. That
is fine for one family's ground and impossible for the world. Here:

| | |
|---|---|
| `index.json` | **164 KB** — only what a marker needs to be drawn and found, for 1,239 places |
| `p/<id>.json` | ~1.7 KB each, fetched when somebody actually clicks |

The number that grows with the world is the one that compresses.

## The build gate

`check-data.py` runs before every deploy and **fails** rather than warns. A directory that
lies is worse than no directory, so:

- every source row must carry a `checked` date
- every provider reference must resolve
- an access class that promises images must have something to open
- **a place's coordinates must fall inside the country it claims**

That last rule caught this project filing the Italian comuni of Carnia — Ampezzo, Mione,
Comeglians — as Croatian on its very first import, along with the Prekmurje parishes in
Slovenia. Guessing the country from the importer's context is how that happens; asking the
coordinates is how it stops.

## Running it

```sh
cd site && npm install && npm run dev
```

`npm run build` regenerates the data, runs the gate, and builds the site. Python 3 and
Node 22 are the only requirements.

## Honesty

The shelf is deep for **Croatia, Istria and Carnia** and thin everywhere else. The record
regions cover six pieces of ground, not the planet, and a place outside them says so in its
own panel rather than guessing.

**A grey dot means nobody has surveyed it. It does not mean nothing is there.** Keeping
those two apart is worth more than coverage.

## Contributing

[Add a source, a region's filing history, or report something that has
changed](https://github.com/daviddef/TheMap/issues/new/choose). The rarest and most
valuable contribution is the second one — which empire ruled where is in every history
book; which archive that means is in almost none of them.

## Credits

Built out of [The Defranceschi Archive](https://github.com/daviddef/TheDefranceski), whose
research map, gazetteer and sovereignty tables are the seed of this one. Country outlines
from [Natural Earth](https://www.naturalearthdata.com/), public domain. Maps &copy;
OpenStreetMap contributors.
