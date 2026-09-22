# Held back, deliberately

`dk.json` is Denmark's surname list — 294,496 names, CC BY 4.0, harvested by
`scripts/harvest-denmark-surnames.py` and correct. It is not in
`data/frequencies/` yet for one reason: size.

The surname shards under `site/public/s/` are 176 MB for 668,450 surnames,
about 270 bytes each. Denmark would add roughly 79 MB to a site already
being measured against GitHub Pages' 1,024 MB ceiling — and the last thing
this project should do is find that out by breaking the deploy, on the day
it spent fixing six deploys that never ran.

Move it into `data/frequencies/` and run `npm run data`, then read the size
report the deploy workflow prints, before shipping it.
