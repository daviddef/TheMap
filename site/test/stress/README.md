Made-up stories run through the story reader against the real gazetteer (not part of `npm test`; the fixture-based `test/story-stress.test.js` is).

    node test/stress/run.mjs            # ~96 stories with expectations; prints the ones that fail
    node test/stress/run.mjs occ        # only stories whose id contains "occ"
    node test/stress/brief.mjs "text"   # what one story is read as
    node test/stress/fuzz.mjs           # 3000 random stories: no crash, no NaN, slowest time
    node test/stress/gather.mjs         # the data stage (places, flags, events) on every story

Needs the built `public/` data (index.json, pi/, g/, given-names.json, shards.json). Stories that still fail are listed in docs/story-reading-gaps-2026-11-09.md.
