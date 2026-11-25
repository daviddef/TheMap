Made-up stories run through the story reader against the real gazetteer (not part of `npm test`; the fixture-based `test/story-stress.test.js` is).

    node test/stress/run.mjs            # corpus.mjs + corpus-adversarial.mjs + corpus-posts.mjs (about 385 stories, 150 of them one famous city each, with expectations; `gap:` lists a known hole and says so the day it passes); prints the ones that fail
    node test/stress/run.mjs occ        # only stories whose id contains "occ"
    node test/stress/brief.mjs "text"   # what one story is read as
    node test/stress/invariants.mjs    # THE CONSISTENCY CHECK (public/js/story-check.js) over every corpus story and the fuzz stories: nothing lost, nothing invented, consistent.
                                       #   Prints how many readings it doubts, per code, and each one. `v` adds the quiet notes, `corpus|life|fuzz` picks a set, `json` is for scripts.
                                       #   It asserts nothing: it is the measuring stick. The page runs the same check on every reading and, when unsure, offers Tidy with AI.
    node test/stress/make-check-fixtures.mjs   # rewrites test/fixtures/story-check/*.json (real readings, no built data needed by test/story-check.test.js)
    node test/stress/fuzz.mjs           # 3000 random stories: no crash, no NaN, slowest time
    node test/stress/metamorphic.mjs    # the same story in NFD, with tabs, NBSP, zero-width marks, CRLF, curly quotes: must read the same
    node test/stress/gather.mjs         # the data stage (places, flags, events) on every story

Needs the built `public/` data (index.json, pi/, g/, given-names.json, shards.json). Stories that still fail are listed in docs/story-reading-gaps-2026-11-09.md.
