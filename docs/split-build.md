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

**Cutover (David's clicks, in this order).** Steps 1-2 are done (10 Nov: two full runs, 206,012 files identical to production
apart from about 260 data-derived files; 608 sampled URLs on the Worker hash-match the manifests; status codes, 404s and
redirects match the live site; the Worker refuses `//host/x` paths and stops an origin loop with a 508).
1. Run the *Build and publish to R2 (sliced)* workflow. It uploads everything and changes nothing public.
2. Check a sample on `https://record-atlas-pages.defranceski.workers.dev` (the pages come from R2, the rest from the live site).
3. In Cloudflare, SSL/TLS, set the encryption mode to **Full (strict)** (Flexible loops against GitHub Pages).
4. In Cloudflare DNS turn the proxy (orange cloud) on for the `recordatlas.org` and `www` records. Nothing changes for visitors yet:
   the proxy alone just passes requests to GitHub.
5. In `workers/pages/wrangler.jsonc` uncomment the `routes` block, then `cd workers/pages && npx wrangler deploy`. From that moment
   the Worker answers `recordatlas.org/*` and `www.recordatlas.org/*`; anything not in the bucket still reaches GitHub Pages through
   the Worker's fallthrough (the Worker's own subrequest to the same zone goes to the origin, not back to the Worker, and a header
   guard answers 508 if it ever did).
6. Check: `curl -sI https://recordatlas.org/place/senj/` shows `x-served-from: r2`; `curl -sI https://recordatlas.org/nope/` shows
   404 and `x-served-from: origin` (that one proves there is no loop). Re-run the 600-URL sample against the real domain.
7. **Rollback at any time:** comment the `routes` block out and `npx wrangler deploy` again (or delete the route in Cloudflare,
   Workers, record-atlas-pages, Settings, Domains and Routes). Requests go straight to GitHub Pages again within seconds.
8. Retire `deploy.yml`'s upload step only after a week of the new path being quiet.

**Not yet done.** Moving the roughly 3,500 static pages out of the slice builds (each slice rebuilds them, about 90 s), and a smoke test
that fails the workflow when a sampled page is missing from the bucket after the upload.
