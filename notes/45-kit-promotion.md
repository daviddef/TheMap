# 45 · The kit promotion, and why it is being struck rather than done

**Decision: do not promote RecordMap into TheArchiveKit. Struck, with reasons.**

## What was promised

The original plan, approved on day one, said: the layer-switching and URL-state
code lives only in the Defranceski site as a 1,220-line bolt-on that reaches into
the kit's `Atlas.astro` from outside — re-tagging panel DOM with a
MutationObserver and switching filters by *synthetically clicking the kit's own
buttons*, because "this session does not own the kit". Promote it properly so all
the archives share one copy and it cannot drift.

That was the right call **at the time**, when Record Atlas was going to be the
family Atlas pointed at the world.

## What actually happened

`RecordMap.astro` is now 968 lines against the kit Atlas's 331, and **33 of its
references are to concepts no family archive has**: surname shards, FamilySearch
collection attachment ranked by administrative reach, jurisdiction eras with a
year control, a worldwide gazetteer fetched three letters at a time, country-name
lookup, `filedUnder` for ground that changed hands.

A family archive has none of those and never will. It has people, graves, and a
parish shelf for one surname.

**Promoting this would hand seven archives a component they cannot use**, and the
sharing argument — one copy cannot drift — only holds for code that does the same
job in both places. These two now do different jobs. Sharing them would not
prevent drift; it would institutionalise it, as a component with two modes and
one of them dead in six of the seven sites.

## What the real debt is, and whose

The debt the plan actually identified has not gone away, and it is **not in this
repository**:

> `Defranceski Family/site/src/components/AtlasTimelineTint.astro` — 1,220 lines
> that drive a shared component by simulating user clicks on its buttons and
> polling `setInterval` for it to become ready.

That is worth fixing, in the archive that owns it, by giving the kit's
`Atlas.astro` a real internal API for layers and filters instead of buttons to be
clicked from outside. Every archive pins the kit by commit SHA and the nine sites
already sit on four different ones, so it can be done without touching a live
family site until each chooses to bump.

It is a job for the Defranceski session, not for Record Atlas, and pretending
otherwise is how it stayed on this list for seven rounds.

## What was taken from the kit, and honestly

Record Atlas took the *ideas* and left the code: the panel-beside-map layout,
filter pills, the find box, URL-as-state, and the principle that every view is a
link. The house stylesheet came across verbatim. None of that needed a shared
dependency, and not having one is why this map could grow a year control and a
surname index without asking seven other archives for permission.

*Struck 16 September 2026, after seven deferrals, having finally worked out that
each deferral was a correct instinct rather than a delay.*
