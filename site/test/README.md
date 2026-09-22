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

## Browser — written, not wired

`test/e2e/map.spec.js`. It is NOT part of the deploy: it needs a browser
download and the build already takes forty minutes, so it wants its own
job. Run it by hand against a built site:

    cd site
    npx playwright install chromium
    npm run build            # or point RA_BASE at the live site
    npx playwright test test/e2e --config test/e2e/playwright.config.js

It runs against the BUILT site rather than the dev server, because dev
has bitten this project twice with stale HMR state — once serving a page
with no stylesheet at all, which looked exactly like a CSS bug and was
not.

Every assertion in it is a bug that actually shipped:

index.json requested before the page finishes loading (it used to wait
4,821 ms for fonts it does not need); every place on the map, not just
the loud half; a surname search lighting only the countries it is
attested in, rather than leaving two hundred markers standing across
Africa; the surname page link resolving rather than 404ing; one heading
instead of the reader's own typing followed by the name; land in the
surname map that is not black; and the map still answering at 375px.

Still not covered: the year slider, which is two overlapping range
inputs and wants a keyboard run more than a click test.

Worklist row 37.
