# What the published site may weigh

Written 4 November 2026, after two deploys were cancelled at exactly ten minutes.

## The numbers that matter

| | now | limit | what happens at the limit |
|---|---|---|---|
| raw bytes in `site/dist` | 9.04 GiB, 203,823 files | 10 GB (the workflow stops at 9.6 GiB) | the upload step refuses the artifact, after a 75–90 minute build |
| compressed artifact | 2.26 GB | none enforced | Pages takes longer to process it; the `deploy-pages` default of 10 minutes is no longer always enough |
| Pages "1 GB" | — | documented only | `deploy-pages` prints a warning and carries on; dozens of deploys have succeeded above it |

Do not read the 1 GB warning as the problem. The 4 November failures (`2c9cc38`, `c5fd661`) were cancelled by
`deploy-pages` at 10:00 while Pages was still working. Successful deploys of the same 2.26 GB artifact took 3 to
9.6 minutes. The workflow now waits 30 minutes (`timeout: 1800000`).

## Where the bytes are (built, 4 November)

`place/` 4.4 GB across 55,771 pages (half the site), `surname/` 1.7 GB, `p/` (the per-place JSON a map click
fetches) 0.9 GB, `s/` 0.5 GB, `g/` 0.3 GB. No single file is large; the biggest is 22 MB. The weight is many
medium pages, so it grows with the number of places and surnames, not with any one data file.

Per place page about 19 KB is the same on every page (an inline translation table, header, footer, scoped
style), and the "Sources that cover everywhere" and "The sources for <country>" blocks repeat byte for byte
across every place in a region or country. Gzip's 32 KB window cannot see repeats 80 KB apart, so each copy is
paid for in full. These are the first things to move out if the site needs to shrink: load them from a shared
file per country or region instead of printing them into 55,771 pages.

## What may go into the published artifact

- Pages and data the live site actually serves: something a page links to or fetches.
- Generated data that a browser fetches whole must be small enough to fetch whole (the audit already flags a
  place payload over 600 KB).

## What may not

- Anything no page loads: scratch, harvest intermediates, `incoming/`, test fixtures, a second copy of a file
  already served.
- Text that is the same on every page of a kind. Put it in a shared `.js` or `.json` and reference it. (5 October:
  65 KB of identical inline script per place page cost 2.5 GiB.)
- Bulk data a visitor does not need to open a page. Keep it in a Release asset, as `fs-volumes-world.json.gz`
  already is (the build downloads it; the site does not serve it), and publish only the slice a page reads.
- A new page kind that multiplies by places or surnames without first estimating `pages x bytes`. Ten KB on 55,771
  pages is 545 MB raw and about 130 MB compressed.

## The guard

`scripts/size-budget.sh` runs in the deploy workflow just before the "artifact has to fit" gate. It writes the
per-directory table and the largest files to the run summary, and warns once raw size passes 8.5 GiB. The gate
itself (fail at 9.6 GiB) is unchanged. Run it by hand on any built dist: `scripts/size-budget.sh site/dist`.

## Growth, and the runway

Compressed artifact: 143 MB (20 Sep), 736 MB (26 Sep), 2.06 GB (1 Oct), 1.93 GB (10 Oct, after the inline-script
fix), 2.03–2.08 GB (13 Oct to 2 Nov), 2.26 GB (4 Nov). It grows in steps when a page kind is added, not
steadily: about 1.5 MB a day between steps, and +178 MB (about 0.7 GiB raw) in the last step.

That is the runway: 0.56 GiB of raw headroom to the 9.6 GiB gate, so one more step like the last one
trips it. Before that, expect more 10-minute-plus Pages waits as the artifact grows. Shrinking the repeated
sections above would buy back an estimated 1.5–2 GiB raw (not measured by a build).

## Shared sources: one page per country (5 November)

The worldwide and national archive lists were repeated on every place page of a country. They now live once, on
`/country/<cc>/sources/`; each place page keeps a short static line and a plain link to it, so no text depends on
JavaScript. Countries with a place-specific national list (more than 10 non-worldwide providers, e.g. Italy) keep
the nearby list on the place page. Rows keep their `data-src` ids so progress marking still works.

Measured on a full local build of 55,771 place pages: raw 7549 -> 6376 MiB (-1173 MiB, 15.5%); estimated artifact
1.93 -> 1.63 GB. `scripts/check-sources-moved.py BEFORE_DIST AFTER_DIST` fails if any source row on a before-page is
missing from the after-page and its country sources page. Run it when changing these sections.
