# Record Atlas "Ask Claude" Worker

Paste a line of a register (or a photo of one) and get a draft reading that leans on the Atlas's own cards first.
Design and why: `docs/reading-the-record-plan.md` section 6b. **Status: built and tested, not deployed, no page uses it yet.**

## What it does and does not keep

It keeps **counts**: per visitor-address per day, per six-word identity per day and month, and for the whole site per day. It does
not keep pasted text, pictures or answers, and request logging is off. Your Anthropic key is a Worker **secret**: it is never in
this folder, never in the browser, and no session holds it.

| Endpoint | Does |
|---|---|
| `POST /v1/translate` | `{text, cards, context}` to a draft: plain-English line, each word tagged "card" or "model", doubtful words flagged, what the line does not say |
| `POST /v1/transcribe` | `{image:{media_type,data}}` to the lines as written, with `[?]` where unreadable (a photo counts as 3) |
| `GET /v1/allowance` | what an identity has used |
| `DELETE /v1/id` | forget an identity's counters |
| `GET /v1/health` | `{ok, v, enabled}` |

Every answer call needs a Turnstile token (`X-Turnstile`). The six-word identity is optional (`X-AI-Id` + `Authorization: Bearer`),
derived in the browser with its own labels (`ai-id`, `ai-token`), so this service cannot open anyone's saved research.

## Allowances (all editable in `wrangler.jsonc`, then redeploy)

| Who | Allowance |
|---|---|
| No six words | 5 a day per address |
| New six-word identity | 6 a day, plus 2 for every day of age, up to 12 a day and 120 a month |
| One address, whatever it makes | 20 a day |
| Everyone together | 150 requests and 600,000 tokens a day, and **2,500 requests a month** (`SITE_MONTHLY_REQUESTS`: this is the number that bounds the bill) |

A whole document or a case file counts as 2 tries. These numbers were tightened on 8 Nov 2026 (they were 15, 12 to 20, 40, and 400 a
day with no monthly site cap) so that the free tier has a known ceiling. The page shows the reader a meter (`GET /v1/allowance` returns
`left`, `of` and `siteOpen`), and a refusal from the site-wide caps hands the reader's own tries back.

The per-person caps are **soft**: anyone can make new six words. The hard limits are the address cap, the site caps, the bot check
and **the monthly spend limit you set on the key at Anthropic**. Do that first (below). To pause everything at once set
`"AI_ENABLED": "0"` and redeploy.

## Before you deploy: three things in your own accounts

1. **A separate Anthropic key with a monthly spend limit.** console.anthropic.com, API keys, create one named `record-atlas-ai`; then
   Settings, Limits, set the monthly spend limit for that workspace (start at **$20**). Do not reuse any other key.
2. **A Turnstile widget.** Cloudflare dashboard, Turnstile, Add widget: name `record-atlas-ai`, hostname `recordatlas.org`, mode
   *Managed*. Keep two values: the **site key** (public; a session puts it in the page) and the **secret key** (goes in step 4 below).
3. **Check Anthropic's current data-retention terms for the API** and tell me what they say, because the privacy page must say what
   is true. Nothing is published to readers until that sentence is written.

## Deploy it (David, in your own terminal)

The ORDER matters: **deploy first, then add the secrets.** A secret cannot be put on a Worker that does not exist yet (that is the
"Required Worker name missing" error you met).

```bash
cd "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Record Atlas/workers/ai"
```

Put the deploy token in this shell only (nothing is shown; gone when you close the window):

```bash
read -s "CLOUDFLARE_API_TOKEN?Token: " && export CLOUDFLARE_API_TOKEN && echo
```

Dry run (lists the Durable Object and the route; changes nothing):

```bash
npx wrangler@4 deploy --dry-run
```

Deploy (creates the `ai` DNS record and certificate; allow a minute or two). Until the secrets are added it answers every call with
"the bot check did not pass", which is the safe state:

```bash
npx wrangler@4 deploy
```

Now the two secrets, one at a time; each asks you to paste the value and shows nothing:

```bash
npx wrangler@4 secret put TURNSTILE_SECRET
```

```bash
npx wrangler@4 secret put ANTHROPIC_API_KEY
```

Check it answers:

```bash
curl -s https://ai.recordatlas.org/v1/health
```

You should see `{"ok":true,"v":1,"enabled":true}`. Then forget the token in this window:

```bash
unset CLOUDFLARE_API_TOKEN
```

The deploy token needs "Workers Scripts: Edit" and, for the Durable Object and the custom domain, "Workers Routes: Edit" and
"DNS: Edit" on `recordatlas.org` (the same token that deploys the sync Worker works if it has those).

## Dashboard settings (no token)

- **Rate limit rule** on hostname `ai.recordatlas.org`: 30 requests a minute per IP, block 10 minutes (a free plan allows one rule;
  if the sync rule already uses it, widen that rule's hostname match instead).
- **Anthropic usage alerts**: email at 50 and 80 percent of the monthly limit.

## Taking it back

Pause: set `"AI_ENABLED": "0"` and redeploy. Stop for good: `npx wrangler@4 delete` from this folder. Revoke the key: console.anthropic.com,
API keys, delete `record-atlas-ai`. Counters are tiny and hold no person; they go with the Worker.

## Run the tests

`cd site && node --test test/ai.test.js` (Claude and Turnstile are faked; no network, no account).
