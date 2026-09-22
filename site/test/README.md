# Tests

Two layers, and only the first exists.

## Unit — `npm run test`

Node's own runner. No dependency to install, nothing to keep up to date,
runs in CI in under a minute. Wired into `npm run check`, so it gates the
build alongside `check-data.py`.

What it covers is not an even spread — it is the places bugs have
actually been:

- **`surname-pages`** — the rule for which names get a page. It has
  drifted twice: between the page and the sitemap (17,961 pages live,
  3,577 listed), and deliberately into `build.py`, which mirrors it in
  Python so the map can link without 404ing. The Denmark clause is
  pinned: *three countries with no count must not earn a page*.
- **`surname-map`** — geometry, where every bug has been invisible to a
  build. `public/c` stores `[minLat, minLon, maxLat, maxLon]` and was
  read as x,y pairs; France's box runs −61° to +51° longitude because
  Réunion is France; clamping the viewBox squashed Belgium; 0.25° of
  padding put the reader inside a single Spanish town. None of those
  threw.
- **`data-shape`** — the loaders that read from disk because importing
  them killed the build, and the invariants a page relies on without
  saying so: that the atlas is *both* halves of the split index, that
  every place has a position on the earth, that a Belgian commune is in
  Belgium, and that nothing in the context file is presented as our own
  finding.

## Browser — not written

This is the half that matters most and it does not exist yet.

Every client bug this month was found by a person looking at the page: a
black continent in dark mode, dots drawn and wiped a millisecond later,
the map flying to the Atlantic on a surname search, two headings for one
name, two hundred country markers left standing after a search that
matched none of them. Not one of those would have been caught by
anything above.

What it needs: Playwright over the built site — search a place, search a
surname, click a dot, set a year, open full screen at a phone viewport,
and assert the panel says what it should. It wants its own CI job rather
than a slot in a build that already takes forty minutes, because it
needs a browser download.

Worklist row 37.
