# Roots & Routes into the Tree Canvas: the migration, one page

Written 18 Nov 2026 (phase 0). Read this before moving anything. It is the inventory and the rules; the phases say what moves when.

**The aim.** The Tree Canvas (`/tree-canvas/`) becomes the one place a person opens a file, looks at their tree, understands what was read, fixes it and keeps their work. Roots & Routes (`/roots/`) is retired only when everything useful in it is better in the canvas, one piece at a time. Nobody is ever left without a working page in between.

## Principles (these decide every row below)

1. **The canvas is the stage.** Everything else is a lens on the canvas's selection (a person, a branch, the whole file), not another place to open a file and start again.
2. **One reader, one model, one file page, one settings place.** The reader is `/roots/js/worker.js` (the `Session`); the model is what it builds; the file page is "Your file"; the settings place is the Settings drawer. A second copy of any of them is a bug.
3. **Move the value, not the controls.** If R&R's control exists only because R&R had no canvas (a tab for the viewer, a second file picker, a header checkbox), it does not move. What it was *for* moves.
4. **`/roots/` stays live and unchanged** until each piece is better in the canvas, and then it links across rather than vanishing. Nothing in phases 0 to 2 changes how `/roots/` behaves; the only change under `/roots/js/` is that the import report's drawing code now lives in a shared module that `/roots/` itself also uses (its output was compared byte for byte with the live page).
5. **Archives are untouched until the last phase.** The eight archive sites vendor the tree-views template and the kit. No phase before the last edits either.
6. **Living people: every surface follows the canvas's living filter, and no surface weakens a default.** Today both pages show a file's living people as the file gives them until the visitor hides them, and both keep everything on the device. A new setting may only be *safer* than what exists, and a setting arriving from another device never replaces a choice made on this one.
7. **Nothing new leaves the device.** The only thing that reaches the server is what the six-word copy already carries, encrypted.

## What was found in the code (corrections to the first-pass sorting)

- The canvas **already has** its own "Fix list" tab (`tcFix`, the "!" marks), "Where next", "Research lines" (the archive's own drawing beside the tree), Compare with an archive, the Path and Bloodline tools and a whole-tree look. These are not "to move": R&R's *Fix list* tab is a second, fuller version of one of them (rows grouped by what the reader has to do, with the Atlas's help). The work in phase 4 is to make the canvas's panel show that fuller list, not to port a tab.
- **The metrics strip is not shared code.** It is computed inside the tree-views template (`scripts/roots/tree-views.template.html`, `renderMetrics()`), so "move it" would have meant a second copy. Phase 1 writes it once as `site/public/roots/js/metrics.js` and a test runs the viewer's own code over the same trees and fails if they ever differ.
- **Export is GEDCOM-only.** A `tree.json` is not made again (the reader keeps no parsed GEDCOM for it) and an archive's tree is already published. "Your file" says so rather than offer a button that cannot work.
- **Orphans is already a top-level R&R tab** (the second shell in #65). Whether the canvas needs its own lens for it is a phase 3 question; Your file already shows the count.
- **The import report is two reports.** A GEDCOM gets the full four-section report; a `tree.json` has no place table or timings, so it gets its own short account. The shared renderer (`report-view.js`) takes a heading level so it sits under "Your file" without changing `/roots/`.
- R&R's saved-files list keeps **five** files in its own database (`roots-recent`); the canvas keeps **three** in `tcRecent`. They are different stores. Phase 1 makes the canvas one list instead of two (opening screen and file page draw the same list); merging with R&R's is left until R&R retires, because `/roots/` must not change.
- The "Keep your work" state from #63 is already the canvas's; it is shown, not rebuilt.

## Inventory

Phase: 0 inventory, 1 Your file, 2 Settings, 3 Tree lenses, 4 Places and the fix list, 5 Retire. Size: S under a day, M a few days, L a week or more. "Dep." is what must exist first.

### The six shell tabs

| R&R piece | Verdict | Where it goes in the canvas | Phase | Size | Dep. |
|---|---|---|---|---|---|
| **Tree canvas** tab | Already the canvas | It *is* the destination | n/a | n/a | n/a |
| **Tree views** tab (the 12 views, metrics strip) | Move the value (see the views table) | Lenses on the canvas's selection; the metrics strip becomes "At a glance" on Your file | 1 and 3 | M + L | metrics.js, a lens frame |
| **Import report** tab | Move | "What was read" on Your file, drawn by the same code | 1 | S | report-view.js |
| **Places to review** tab (1,500+ rows on a real file) | Move, later | The canvas's Fix list panel, as a "Places" group, picked place by place on the selected person's branch first | 4 | L | Fix list parity, decisions store |
| **Fix list** tab | Move, later | The canvas's Fix list tab shows R&R's grouped rows and Atlas help | 4 | L | enrich.js, consistency.js in the canvas |
| **Export** tab | Move | "Export your GEDCOM" on Your file (the four modes, R&R's wording, GEDCOM only) | 1 | S | none |

### The twelve tree views

| View | Verdict | Where it goes | Phase | Size | Dep. |
|---|---|---|---|---|---|
| hourglass | Move the value | A lens: the selected person's ancestors above, descendants below | 3 | M | lens frame |
| fan | Move the value | A lens: the selected person's ancestors as a fan | 3 | M | lens frame |
| close (close family) | Probably there | The canvas's Bloodline menu draws a person's blood relatives; confirm side by side, then retire | 3 | S | none |
| map (whole-tree map) | Already there | The canvas's whole-tree look; retire | 3 | S | none |
| atlasmap | Move | A lens: the selection's birthplaces on the Atlas map | 3 | M | lens frame |
| movements | Move | A lens: the selection's places over time | 3 | M | lens frame |
| kinship | Already there | The canvas's Path tool ("how are X and Y related") does this; retire after a check | 3 | S | none |
| lanes | Already there | The canvas's Countries look and place lanes; retire | 3 | S | none |
| eras | Move | A lens: the selection's lives against the regimes of their time | 3 | M | lens frame |
| timeline | Move | A lens: lifespans of the selection | 3 | M | lens frame |
| surnames | Move | A lens on the whole file; the same surname catalogue as the Atlas | 3 | M | lens frame |
| orphans | Already a tab | Top-level tab in R&R (#65); decide in phase 3 whether the canvas needs a lens | 3 | S | none |

### Everything around the tabs

| R&R piece | Verdict | Where it goes | Phase | Size | Dep. |
|---|---|---|---|---|---|
| Metrics strip (people, orphans, detached families, dead ends, places, and "not drawn yet" when there is one) | Move | "At a glance" on Your file, counts tested against the viewer | 1 | S | none |
| Filters (viewer chips, the living checkbox) | Move the living one only | The Settings drawer's living switch (the canvas already filters by its own selection) | 2 | S | none |
| Hide living people (`#hideliving`) | Move | Settings drawer, one switch, same semantics (`living` command to the reader) | 2 | S | Your file |
| MyHeritage link, Ancestry site (`applyTreeLink`, `links`) | Move | Settings drawer (the canvas already owns the same `links` object); already travels in the six-word copy under `sites` | 2 | S | none |
| Saved files ("kept on this device") | Move | One list on Your file and on the opening screen | 1 | S | none |
| "Remember my decisions on this device" (`ra-fix-decisions-v1`) | Move, later | With the Fix list in phase 4; its own opt-in stays | 4 | M | Fix list |
| Research file export and import | Already on Connection & Backup | Link from Your file ("Keep your work"); no copy | 1 | S | none |
| Offer places back to the Atlas (`contribute.js`) | Move, later | A step on the Places group, opt-in item by item as today | 4 | M | Places group |
| Workbench edits (dates, notes, "may be the same person") | Move, later | The canvas's decisions (confirm / unlink) are the same idea; the overlay and its change log become part of Export | 4 | L | Export parity |
| The "try a big sample" and invented sample | Keep the invented example only | "draw an invented family" on the opening screen | done | n/a | none |
| Theme and look | Move | Settings drawer, "Look" | 2 | S | none |
| Stale-code warning (mixed cached copies) | Retire with `/roots/` | The canvas page stamps its own build | 5 | S | none |
| The R&R shell itself (`/roots/` pages, `viewer.html`, the tab strip) | Retire last | `/roots/` becomes a short page that links to the canvas; the archives' vendored template is updated last | 5 | M | everything above |

## Phase plan

- **Phase 0 (this page).** Inventory, principles, decisions.
- **Phase 1: Your file.** One page over the canvas (menu "Your file", and the opening screen once a file is open): At a glance (the five counts), What was read (the import report), Keeping your work, Files and canvases on this device (one list), Export. Reuses the reader, the report renderer and the Keep state. Works for a file, a link, an archive and the invented example.
- **Phase 2: Settings.** One drawer: the living filter, links to MyHeritage and Ancestry, the Look, and remembering the last files. Persisted on this device; the choices that are not about family data travel in the six-word copy (opaque: three enumerated values, no names). The canvas's own duplicates of these controls go, inside the canvas page only.
- **Phase 3: Tree lenses.** A frame in the canvas that shows a view for the current selection (hourglass, fan, atlas map, movements, eras, timeline, surnames). Views the canvas already does are retired after a side-by-side. `/roots/` keeps working.
- **Phase 4: Places and the fix list.** The canvas's Fix list gains R&R's grouping and Atlas help; places are picked in place; place picks go into Export's "Cleaned" mode.
- **Phase 5: Retire.** `/roots/` redirects to the canvas page; the archives' vendored template and kit are updated, one archive at a time, with the same checks.

## Decisions needed from David

1. **Default for living people.** Today both pages start by showing living people as the file gives them (everything stays on the device). Phase 2 keeps that default and adds a remembered "hide" choice. Do you want the default changed to *hidden*? It is safer, and costs one click for people who want names.
2. **Does a setting follow you to another device?** Phase 2 carries the settings in the six-word copy but a device's own choice is never replaced by another device's (it only fills a setting that device has not made). The alternative, "latest change wins", is simpler to explain and can switch the living filter *off* from another device. Recommend: fill-empty only (as built).
3. **The eye button in the canvas toolbar.** It is the same living setting, kept as a quick switch because it is where people look. Say if you would rather it open Settings instead.
4. **R&R's five saved files versus the canvas's three.** Leave as they are until R&R retires, or merge at phase 4?
5. **Exporting a `tree.json`.** Not possible now. Do you want the canvas to be able to write one (so an archive's tree can be saved), as a phase 3 addition?
6. **Phase 3 order.** Which lenses first? Suggested: hourglass and fan (the most used), then the atlas map.

## How each phase is checked

Tests that run the viewer's own code (not a copy of its rules) wherever a number or rule is shared; a byte-for-byte comparison of anything `/roots/` still draws; the canvas opened in a new browser tab against the invented example family and the larger invented tree (never a real family file), at phone width, light and dark, with storage blocked, and by keyboard.
