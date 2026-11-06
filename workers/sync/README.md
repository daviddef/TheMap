# Record Atlas sync Worker

Stores one encrypted copy of a reader's research, and cannot read it. Passphrase in, no account, no database.
Design and why: worklist rows 94 and 99, and `site/public/js/research-sync.js`. **Status: built and tested, not deployed.**

## What the server holds

| Key (bucket `record-atlas-sync`) | Holds | Expires |
|---|---|---|
| `meta/<id>` | a creation date and a hash of each of two tokens | never |
| `latest/<id>` | the newest encrypted copy (bytes the server cannot open) | never |
| `v/<id>/<YYYY-MM-DD>` | the last copy saved that day | 30 days, by the lifecycle rule David set on the prefix `v/` |

`<id>` is a 32-character code the browser derives from the passphrase. Nothing here names a person, a surname, a place or a
volume. A nightly job copies recent changes to `record-atlas-sync-copy` (same Cloudflare account: it guards against a mistake, not
against losing the account). "Delete everything I have stored" removes a reader's keys from both buckets.

## Deploy it (David, in your own terminal)

The deploy token stays on your side. A session prepares these commands and never holds the token. Run them one at a time.

Open the `workers/sync` folder of your Record Atlas checkout once this has been pulled to it (it is on `origin/main` after the push; if the main folder is busy with other sessions' edits, use a fresh `git clone https://github.com/daviddef/TheMap` and `cd TheMap/workers/sync`):

```bash
cd "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Record Atlas/workers/sync"
```

Put the token in this shell only (paste it, press Return; nothing is shown, and it is gone when you close the window):

```bash
read -s "CLOUDFLARE_API_TOKEN?Token: " && export CLOUDFLARE_API_TOKEN && echo
```

Check Cloudflare accepts it, and sees the right account:

```bash
npx wrangler@4 whoami
```

Dry run: it lists what would be deployed and the two R2 bindings (`SYNC`, `COPY`) without changing anything:

```bash
npx wrangler@4 deploy --dry-run
```

Deploy (this also creates the `sync` DNS record and its certificate; allow a minute or two):

```bash
npx wrangler@4 deploy
```

Check it answers:

```bash
curl -s https://sync.recordatlas.org/v1/health
```

You should see `{"ok":true,"v":1}`. If you see a certificate error, wait two minutes and try again.

Forget the token in this window:

```bash
unset CLOUDFLARE_API_TOKEN
```

## Two dashboard settings (no token needed)

1. **Rate limit.** Cloudflare dashboard → `recordatlas.org` → Security → WAF → Rate limiting rules → Create. Match: hostname equals
   `sync.recordatlas.org`. Rate: 60 requests per minute per IP. Action: block for 10 minutes. (The free plan allows one rule.)
2. **Copy bucket rule.** R2 → `record-atlas-sync-copy` → Settings → Object lifecycle rules → add the same rule as the first bucket:
   prefix `v/`, delete 30 days after upload. Without it, copies of old versions never expire.

## Taking it back

Stop it without deleting stored copies: dashboard → Workers & Pages → `record-atlas-sync` → Settings → disable the route.
Remove it: `npx wrangler@4 delete` (from this folder, with the token set). Stored copies stay in the buckets until the lifecycle rules expire them,
and your own `latest/` keys stay until deleted by hand or by their owner.

## Run the tests

```bash
cd "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Record Atlas/site" && node --test test/sync.test.js
```

They use an in-memory stand-in for R2 and never touch the network or your account.

## Counts: how many readers, how many active

The nightly job also writes `stats/summary.json` (totals only: identities, new and active in the last 7 and 30 days, bytes). Nothing in it names an id.

- **Public:** `GET https://sync.recordatlas.org/v1/count` returns `{"registrations": N, "at": "..."}`, cached an hour. The Connection & Backup page shows "N people keep a copy online" once N reaches 10 (`site/public/js/sync-count.js`).
- **Owner only:** `GET /v1/stats` returns the full totals, live, when the header `X-Stats-Key` matches the Worker secret `STATS_KEY`. With no secret set the route does not exist. Set it once, in your own terminal (you choose the value; keep it in your password manager):

```bash
npx wrangler@4 secret put STATS_KEY
```

Read it:

```bash
read -s "K?Stats key: " && curl -s -H "X-Stats-Key: $K" https://sync.recordatlas.org/v1/stats; echo
```

Both need the Worker redeployed (`npx wrangler@4 deploy`). Until then `/v1/count` answers 404 and the page shows nothing.
