# Held back, on evidence this time

`dk.json` is Denmark's surname list — 294,496 names, CC BY 4.0, harvested by
`scripts/harvest-denmark-surnames.py`. The data is right. It is not in
`data/frequencies/` because shipping it **broke the build**, and the way it
broke is worth writing down.

It was held back once already, on the guess that 79 MB of surname shards
might breach GitHub Pages' 1,024 MB. That reasoning was wrong — the deploy
reports 385 MB stored from 2,142 MB of files — so it was shipped, with a
commit message saying there was never a decision to make.

The decision was real and I had it pointed at the wrong resource. Not disk:
**build memory.** Denmark takes the corpus from 668,450 surnames to about
960,000, and `astro build` died with `FATAL ERROR: Ineffective mark-compacts
near heap limit` at `--max-old-space-size=8192`, part-way through the
surname pages.

## Before trying again

The heap ceiling is now 10240, which buys headroom and is not a fix. Two
things to establish first, in this order:

1. **Where the memory actually goes.** `site/src/data/surnames.json` is
   imported whole — 110 MB of JSON becomes a far larger graph of JS
   objects, and every surname page holds it live. Denmark adding 45% more
   names to that graph is the obvious suspect, but it has not been
   measured, and the last two calls on this file were made by guessing.
2. **Whether Denmark should make pages at all.** `earnsPage` in
   `site/src/lib/surname-pages.js` asks for a curated variant, an archive
   attestation, or a spelling variant across three countries. A Danish name
   whose only fact is «Denmark says this exists» is a thin page. If the
   names belong in the corpus but not in the page set, say so in the rule
   rather than discovering it through an out-of-memory crash.

Measure, then ship.
