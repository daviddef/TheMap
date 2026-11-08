# Making the repository private: what it would take (scoping, worklist row 126)

Asked by David on 6 November 2026, due Sunday 8 November. **Scoping only. Nothing has been changed.** Measured on 8 November 2026
from the repository, the GitHub API and the run history; where a figure is from memory it says so.

## The short answer

Making `daviddef/TheMap` private is one click and the site keeps working, **but the build would then run on paid minutes, and this
site's build is long**. That is the whole decision. The other pieces are small.

## What is true today

| Fact | Measured |
|---|---|
| Visibility, size | public, 884 MB on GitHub, 0 forks, 0 stars, **no licence file** |
| Plan | GitHub **Pro** (so Pages from a private repository is allowed) |
| Pages | built by a workflow (`deploy.yml`), custom domain `recordatlas.org`, source `main` |
| Collaborators | `daviddef` and `bcfarley` |
| Actions secrets | one: `TROVE_API_KEY` |
| A deploy | 24 finished runs: **average 108 minutes** (43 to 198) |
| Run volume | 47, 97, 26, 14, 13 workflow runs on 3 to 7 November; of the last 100 deploy runs 39 succeeded, 11 failed, 48 were cancelled (each push cancels the one before) |
| Release asset | `harvest-data` holds `fs-volumes-world.json.gz`; `deploy.yml` downloads it from a public URL |
| History | no key-shaped strings (Anthropic, GitHub, AWS, Cloudflare tokens, private keys) found in the text history outside `.json`/`.gz` files. That is a pattern scan, not a guarantee |

## What stays public whatever you do

Anything under `site/public` and everything the pages ship is public the moment it deploys: the data files (the data is CC0 and
published on `/data/`), the catalogues, the research-sessions file. A private repository hides the **scripts, the harvest inputs, the
history, `data/` files that are not published, the notes and docs and the worklist sources**. It does not hide what the site serves.

## The cost that decides it: Actions minutes

A private repository on Pro gets 3,000 Actions minutes a month (from memory; check Settings, Billing). One full deploy is about 108
minutes, so **about 28 deploys a month**, and cancelled runs also burn minutes until they are cancelled. Recent days had 14 to 97
runs. Beyond the allowance GitHub bills per minute (roughly 0.8 US cents for a Linux minute, from memory: check), which at this rate
is of the order of a dollar a full run. Public repositories have none of this.

## Ways to do it

1. **Private in place, build on GitHub.** One click, no moves, rename-proof. Needs the release-asset download to send a token, and
   a budget for minutes. Simplest; the bill is the risk. Cap spend in Billing first.
2. **Private in place, build on this Mac** (a self-hosted runner, free minutes). The Mac must be on for a deploy, and other sessions
   push from the same machine, so it fits. Needs setup and care that a runner executes workflow code from the repository (safe only
   while the repository is private and only you and `bcfarley` can push).
3. **Private source repo + a new public repo holding only the built site.** The private one builds (minutes as in 1, or locally as
   in 2) and publishes the output to the public one, whose Pages serves `recordatlas.org`. The built site is **844 MB of Pages' 1,024
   MB** so the public repo must be overwritten each time (one orphan commit), not appended to. Most work, most moving parts, and
   nothing is gained over 1 or 2 about what is exposed.
4. **Cloudflare Pages** instead of GitHub Pages. You already have the account. It has a per-deployment file limit that an ~83,000
   page site may exceed on the free plan: **check before choosing.** It also changes DNS and the deploy workflow.

**Recommendation: option 1 with a spending cap, or option 2 if the cap is too low.** Avoid 3 and 4 unless you want to leave GitHub.

## Things that need doing under any option

- `deploy.yml` line 123: fetch the `harvest-data` asset with the workflow token, not an anonymous URL. Many scripts name
  `daviddef/TheMap` only inside a User-Agent string; none of the family archives reference the repository (searched).
- Scripts that clone or push `origin` (`publish-research-sessions.py`, `surname_variants.py publish`, `name` and place tools) keep
  working if the repository is **made private in place or renamed** (GitHub redirects); they break if it is moved to a new address.
- The `e2e` and `linkcheck` workflows poll the live site, not the repository, and are unaffected, but they also cost minutes.
- `bcfarley` keeps access as a collaborator; check that is intended.
- Add a licence file (there is none) for whatever is shared publicly later; the data is CC0 and the code has no stated licence.
- Rollback: switch the repository back to public in Settings. Nothing is lost; anything that was public may already have been
  cloned or cached, so private is not retroactive.

## What to decide

1. Is the aim hiding **scripts and history** (private in place does it), or hiding data the site serves anyway (nothing does)?
2. Can you accept a minutes bill, or do you want option 2?
3. Should a public code repository exist at all (scripts worth sharing)? That is a separate, later job.
