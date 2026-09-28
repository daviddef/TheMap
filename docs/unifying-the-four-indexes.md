# Four indexes of one world: a path to unifying them

Record Atlas has four front doors, and they do not know about each other.

| | what it answers | search | flags shown | links to flags |
|---|---|---|---|---|
| **flags/** | who ruled this ground, and when | "a country, region, crown, or empire" | 210 drawn | — |
| **countries/** | what records exist, per country | **none at all** | none | **0** |
| **places/** | where the records actually are | "Find a place" | none | **0** |
| **surnames/** | who the records are about | "A surname" | none | **0** |

Those are not four subjects. They are four axes of one question a researcher
actually asks: **a name, in a place, under a ruler, held in an archive.**
Somebody chasing a Habsburg ancestor does not know whether the parish ended up
in Austria, Hungary, Croatia or Romania — that is precisely the uncertainty
the flag atlas's hubs already span, and the other three pages cannot see it.

## What is actually wrong

**1. Four search grammars, and one page with no search.** `countries/` has no
search box at all — 139 country pages and no way to type a country's name.

**2. No cross-links whatsoever.** Zero. A country is on all four pages and
none of them mentions the other three.

**3. The flags atlas is the only one with a personality**, which is why David
keeps pointing at it: warm paper, a brick-brass-adriatic palette, drawn flags,
cards with a coloured top edge that means something. The other three inherit a
larger, more utilitarian system.

**4. The strongest visual asset appears on one page of four.** There are 210
drawn flags, already published in `flag-index.json`, already fetched by the
map. `countries/`, `places/` and `surnames/` use none of them.

The palettes have barely met: the flag pages define 12 custom properties
inline, the site defines 66, and exactly **three** are shared — `--brass`,
`--brick`, `--ink`. Everything warm about the flag atlas (`--paper`, `--card`,
`--card-border`, `--hair`, `--adriatic`, `--focus`, `--muted`) exists only in
210 copies inside static HTML.

## The path

### Phase 1 — one palette, shared rather than copied
Lift the flag atlas's warm layer into a single stylesheet that both sides
link. Not a re-skin: the flag atlas is already right, and the job is to make
the rest draw from the same file rather than a second opinion of it. The 210
static pages get a `<link>` instead of their inline copy, so the next change
lands everywhere at once instead of 210 times.

*Risk: low. Those 210 files have been edited twice today already; it is
mechanical and verifiable by diff.*

### Phase 2 — one card, one search
The hub card is the best-designed object in the project — coloured edge, meta
line, name, what-it-holds, and now its archives. Make it a component the Astro
pages use, so a country on `countries/`, a place on `places/` and a surname on
`surnames/` all arrive in the same shape. Give `countries/` the search it does
not have, and settle the four placeholders into one voice.

### Phase 3 — flags everywhere
`flag-index.json` already carries 210 drawn flags and is already fetched by
the map. Put the flag beside every country on `countries/`, in the country
directory on `places/`, and beside each country a surname is attested in. This
is the single strongest visual thread and it costs no new data — only the
wiring.

### Phase 4 — cross-links, in both directions
- a **country** → its flag page, its places, the surnames attested there
- a **flag page** → its country page (partly exists through `eras.json`)
- a **surname** → the flag of every country it is attested in, each linking on
- a **place** → who held that ground in the year being viewed, which
  `WhereToBegin` already computes and does not yet link

### Phase 5 — one way in
A single surface presenting all four as one atlas, so a reader who knows only
a surname, or only a village, or only "somewhere in the Habsburg lands", lands
in the same place and is handed the other three axes.

## Order, and why

Phases 1 and 3 are the cheapest and the most visible — a shared palette and
210 flags that already exist. Phase 2 is the most invasive and should follow,
once the palette it renders in has settled. Phase 4 needs 2 to be worth doing,
because a cross-link into a page that looks like a different site is a worse
answer than no link. Phase 5 is a product decision, not a refactor, and should
wait until the other four have shown what the unified thing looks like.
