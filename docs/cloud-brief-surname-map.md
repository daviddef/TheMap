# Cloud brief: a dot nine times wider than the country it marks

You are working in **Record Atlas** (`github.com/daviddef/TheMap`). One file is
in scope: `site/src/lib/surname-map.js`, which composes the inline SVG on each
of ~19,779 surname pages showing where a name is attested.

**No network needed.** No fetching, no rendering, no browser. Everything here
is arithmetic you can assert on.

## What is wrong

Defranceski is attested in ten countries spanning **224° of longitude** — the
United States at −90°, Australia at +134°. The code has this rule:

```js
if (maxX - minX > 180) { minX = -180; maxX = 180; }
```

It exists for names that cross the antimeridian. It fires for any genuinely
global spread, so the frame becomes the whole world: **360° across 680px,
1.89 pixels per degree.** At that scale:

| | |
|---|---|
| the six European countries, together | **45 px** |
| Slovenia | **4.7 px** |
| one dot | **10–42 px across** |
| outlines whose projected box is under 1.5px | **dropped** |

So a dot is up to **nine times wider than the country it marks**; the small
European outlines fall under the keep-threshold and vanish; and what a reader
sees is six oversized translucent dots stacked in 45 pixels with nothing
underneath them. The countries are not missing from the data — they are drawn
and then discarded for being too small, while their dots survive at full size.

The file's own comment says *"the dot is drawn as wide as the country is"*.
`rad(n)` sizes it by bearer count in pixels and never learned about the
projection. The comment describes an intention that was never implemented.

## What to fix — and how to prove it

### 1. A dot may never be wider than its country
Cap the radius by the country's own projected size. The outline's box is
already read (note the comment about `[minLat, minLon, maxLat, maxLon]` — it
is NOT x,y pairs, and reading it as such cost a rewrite once). Where a country
has no outline, fall back to a small fixed radius rather than a large one.

Keep the meaning the current code carries and the comments defend: a filled
dot is a state's count, a hollow ring is "attested, not counted", and the dot
is deliberately wide and faint so it reads as "somewhere in here" rather than
"here". Scaling it must not turn it into a pin.

**Assert it:** for every country on a generated map, the dot's diameter is
≤ the country's projected width. Run it across a sample of at least 500 real
surnames, including the pathological ones below, and report the worst ratio
before and after.

### 2. Every attested country keeps at least one outline
A country that is on the map because the name is attested there must be
visible. Today a country under the 1.5px keep-threshold loses every ring.
Keep its largest ring regardless, or draw a minimum-size marker in its place —
your call, but a country must never appear as a dot with no land.

**Assert it:** count countries where `rows` has an entry and the SVG contains
no path for it. That count must be zero.

### 3. Do NOT change the framing rule
The `> 180` behaviour, the choice between a world map and an inset for the
dense cluster, and anything that changes what the map is *about*, are being
decided separately. Leave `minX/maxX/padX/padY` alone. If your fixes make the
framing look worse rather than better, say so in the report — that is useful
evidence for that decision — but do not pre-empt it.

## Names to test with

- **Defranceski** — ten countries, 224° span, the case that found this.
- A single-country name (Slovenia only) — the frame must not regress for the
  common case, which is most of the 19,779 pages.
- A two-country transatlantic name (Ireland + United States).
- **A name attested in the United States alone** — its outline is 74 rings,
  most of them Aleutian islands, and the existing eight-ring cap is there to
  stop a 26 KB picture shipping on thousands of pages. Do not break it.
- Any name attested in France or the Netherlands — their outline boxes run to
  Réunion and Curaçao, which is why framing uses centroids and not boxes.

## What must not happen

1. **Do not let the SVG grow.** These ship inline on ~19,779 pages; a
   kilobyte each is twenty megabytes. Report the median and worst SVG size
   before and after. If your fix costs size, say how much and why it is worth
   it.
2. **No new dependency, no JavaScript on the page.** The whole point of this
   file is that the picture is composed at build time and renders before any
   script runs.
3. **Do not invent geometry.** If a country has no outline in `public/c/`,
   that is a fact to handle, not to fill in.

## Practical notes

- `npm run build` from `site/` is a full build and takes about twenty-four
  minutes. You do not need it: import the module directly and call
  `surnameMap()` with country rows to generate SVGs and measure them. That is
  the fast loop, and it is how the assertions above should run.
- If you add a test, `site/test/*.test.js` runs under `npm test` (node's own
  runner) — that is where a check like this belongs.
- Work on a branch off `main`, push it, do not merge. Report the before/after
  numbers for each assertion and the SVG size.

## What to hand back

The branch, and the four numbers: worst dot-to-country ratio before and after,
countries with a dot and no land before and after, median SVG size before and
after, and worst SVG size before and after. If a fix trades one of those
against another, say which and let the trade be seen.
