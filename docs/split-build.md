# The split build: pages built in slices, published to R2

**Why.** One build rendered every page (about 105 minutes), then shipped a 2.4 GB tree to GitHub Pages as one artifact, and hit its size
ceiling and the runner's disk. About 1.0 GB of that tree is `p/<id>.json` and most of the rest is copied data; the generated pages are
small. The pages themselves render in milliseconds, so the cost is doing it all in one place and one upload.

**What it is.** Astro renders exactly as before. `RA_SHARD=i/n` (`site/src/lib/shard.js`) makes a build produce only the place, surname
and name pages whose slug hashes into slice *i* of *n*; unset, the build is unchanged. Slices build in parallel jobs
(`.github/workflows/deploy-r2.yml`) and `scripts/r2_sync.py` uploads each slice's finished HTML to the R2 bucket `record-atlas-site`,
only where the content hash changed. The Worker in `workers/pages` serves those objects at the same URLs and, for any path the bucket
does not hold, fetches it from `ORIGIN`.

**What is verified.** Slice builds are byte-identical regardless of slicing (204 pages, `0/200` against `0/400`, plus the home page,
About, Flags, Providers, a country page and the sitemap). The Worker returns exactly the bytes the build wrote (42 of 42 sampled
pages). The sitemap is produced by the build from data, identically in every slice, so it needs no separate generator.

**Credentials (once, by David).** Cloudflare dashboard, R2, *Manage API tokens*, create a token with **Object Read & Write** limited to
the bucket `record-atlas-site`. It shows an Access Key ID and a Secret Access Key. Add three repository secrets in GitHub (Settings,
Secrets and variables, Actions): `R2_ACCOUNT_ID` (the account id shown on the R2 page), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
They are never pasted into a chat or a file.

**Cutover (also David's, in this order).**
1. Run the *Build and publish to R2 (sliced)* workflow. It uploads everything and changes nothing public.
2. Check a sample on `https://record-atlas-pages.defranceski.workers.dev` (the pages come from R2, the rest from the live site).
3. Make `recordatlas.org` go through the Worker: in Cloudflare DNS turn the proxy (orange cloud) on for the `recordatlas.org` and
   `www` records, and add the route `recordatlas.org/*` to `workers/pages/wrangler.jsonc`, then `npx wrangler deploy`. Anything not in
   the bucket still reaches GitHub Pages through the Worker's fallthrough.
4. Retire `deploy.yml`'s upload step only after a week of the new path being quiet. Rollback at any time: remove the route.

**Not yet done.** Moving the roughly 3,500 static pages out of the slice builds (each slice rebuilds them, about 90 s), and a smoke test
that fails the workflow when a sampled page is missing from the bucket after the upload.
