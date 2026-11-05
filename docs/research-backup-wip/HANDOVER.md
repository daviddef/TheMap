# Research backup, sharing and sync: where this stands (6 Nov 2026)

David's three asks: (1) share everything researched, or one name, with others; (2) save work and a profile for online use, so others can research too; (3) persist the fix-it list. Decisions made: passphrase sync with **no account** on Cloudflare (Worker + R2, no database); other people's apps may use a read API and an MCP server; only David approves proposals; git stays the source of truth.

## What is finished and tested, but NOT yet in the site

Everything here is in this folder and has been exercised against a scratch copy of the site files, not in a browser.

| File | What it is | Tested |
|---|---|---|
| `research-file.js` | the research file: a complete dated backup, share packs (one line or everything, notes optional, never the decisions), links, status/nudge, restore from a raw browser-storage copy | 13 tests in `research-backup.test.js`, all pass |
| `decisions.js` | the fix list's ticks and "left as is", kept on this device only if the visitor asks, hashed, never a name, date or place; save/load file | same file |
| `shared.astro` | `/shared/`: opens a pack read-only (`#pack=` link or a file), shows it as "reported by the sender, not checked", merges it as its own family line | not run yet: look at it in a dev server |
| `apply.py` | one script that copies these in and patches `progress-kit.js`, `line-switcher.js`, `LineSwitcher.astro`, `my-research.astro`, the tree viewer (`roots/js/app.js`, `index.astro`, `roots.css`, `build.js`, `test/roots.test.js`), and adds the worklist rows. Idempotent; stops on any patch that does not match exactly once | dry-run twice on a copy: clean, syntax checked |
| `worklist-rows.json` | the ten worklist rows (items 1-3, the accounts decision, sync, community layer, API + MCP, proposals, Cloudflare setup, thin common names) | applied by `apply.py` |

## To finish (Sunday)

1. Fresh clone or `git pull --rebase --autostash origin main` in the work clone (the path is in the session scratchpad; any clone works). Check `site/test/roots.test.js`: another session added `js/remember.js` there; `apply.py` expects that text.
2. `python3 docs/research-backup-wip/apply.py .` (do not run while a build is running).
3. `cd site && npm test` (expect the old 68 + 13 new).
4. `npx astro dev --port 43xx` and look: `/my-research/` (status line, Back up, Import, Share with the preview and Copy a link), `/shared/#pack=...` (make a pack on My research and open its link), `/roots/` Fix list (tick, "Leave as is", switch on "Remember my decisions", reload the same file: "N earlier decisions re-applied"). Browser pane: `resize_window` then reset to desktop.
5. Add a `whats-new.json` line (kind `new`, headline at most 120 characters, href `/my-research/`).
6. `python3 scripts/check-data.py` ("data is sound"), the full `cd site && npm run build` ("built output is sound"). If `/shared/` fails the built-output gate, see `check-built.py`.
7. Commit by file name, `git pull --rebase --autostash origin main`, push. Say "pushed", not "live": deploy takes 1.5-3 h.

## Also to do (not started)

- **Old-address marks.** David's marks made before 6 Oct 2026 are probably stranded under `https://daviddef.github.io` (the old address now redirects). `my-research` already imports `save-browser-storage.js` output; David has not yet run it. A backup was taken on 5 Nov in `backups/research-2026-11-05/` (searched.json of all eight archives, the Atlas published copies, a git bundle of Defranceski Family). The Defranceski Family repo was 37 commits ahead of GitHub on 5 Nov and was not pushed by me; ask David.
- **Save to a folder** (File System Access API, overwriting one dated file) was left out of item 2. The share sheet is in.
- **Sync service** (worklist row): Worker + R2 on `sync.recordatlas.org`, passphrase-derived id and key, 30-day versions, nightly second copy. Waits on David's Cloudflare account and token (he holds the token; never enter it), where recordatlas.org's DNS lives, and whether a card on file is acceptable. Privacy page needs a paragraph.
- **API and MCP**: read API on `api.recordatlas.org`, remote MCP on `mcp.recordatlas.org`, writes as proposals checked by the `check-data.py` rules and approved by David. See the worklist rows for the design.
- **Thin common names**: David has one form in 14 languages; 267 of 630 given-name families have three forms or fewer. Biblical and saints' names first, thinnest first.
