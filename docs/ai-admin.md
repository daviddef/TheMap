# Ask Claude: admin page, limits and usage counts

The Worker at `ai.recordatlas.org` (code in `workers/ai/`) answers Ask Claude and writes research plans. This note covers the part only
David uses: the admin page, the settings it changes, and what is and is not kept.

## What exists

| Thing | Where | Needs |
|---|---|---|
| The admin page | `https://ai.recordatlas.org/admin` | the page is public but empty and useless without the token; it holds no data and no token |
| `GET /v1/admin/ping` | same Worker | `Authorization: Bearer <token>` |
| `GET /v1/admin/report?days=30` (1 to 400) | same Worker | the token; counts by UTC day, totals, and the effective config |
| `GET /v1/admin/config` | same Worker | the token; every setting, its effective value and where it came from (`saved`, `deployed`, `default`) |
| `PUT /v1/admin/config` | same Worker | the token; a JSON object of the settings to change; `null` forgets a saved value |

**None of it exists until the secret `ADMIN_TOKEN` is set:** every admin path answers a plain 404. With the secret set, a missing or wrong
token gets a bare 401 and no hint. The token is compared in constant time. The admin routes are on the Worker's own address, are answered
before the website-origin check, and send no CORS headers, so no other website can read them.

## Turn it on

1. Choose a long random string (a password manager's generator, 32 characters or more). Keep it there.
2. From `workers/ai`: `npx wrangler@4 secret put ADMIN_TOKEN` and paste it when asked. No redeploy is needed for a secret to take effect.
3. Open https://ai.recordatlas.org/admin and paste the token. The page keeps it in `sessionStorage` (this browser tab only; "Close this
   session" or closing the tab forgets it) and sends it only to that address.

To turn it off again: `npx wrangler@4 secret delete ADMIN_TOKEN`. The page and routes vanish (404).

The Worker code that reads these settings has to be deployed once (`npx wrangler@4 deploy`, see `workers/ai/README.md`). After that, the
settings below change without a redeploy.

## What is kept, and what is not

Counts only. For each UTC day (the last 400 days are kept, older days are deleted as new ones are written):

- per kind (translate, transcribe, document, casefile, plan) and per model: requests, answered, errors, input tokens and output tokens;
- errors from Anthropic by status class (429, 5xx, other 4xx, network);
- refusals by reason (bot check failed, service paused, request too large, a limit was hit).

Not kept, anywhere: pasted text, photographs, facts or candidates sent for a plan, answers, names, places, addresses, six-word identities,
or a count of distinct visitors. Request logging stays off (`observability.enabled` is `false`). The per-address and per-identity
counters that already existed (a dated hash of the address, a hash of an identity's token) are unchanged and still hold only counts.
The statistics and the saved settings live in the same Durable Object class as those counters (names `stats` and `admin`), so no
migration is involved. A keys check in the code means nothing a reader sent can become a stored key.

**Site visits are not counted here.** They are counted at https://recordatlas.goatcounter.com, which has its own login. The admin page
only knows about calls to Ask Claude, and links there.

## Cost on the page is an estimate

The page shows tokens. If you set the two prices (`PRICE_IN_PER_MTOK`, `PRICE_OUT_PER_MTOK`: US dollars per million tokens, from
Anthropic's price list) it also shows an estimate: tokens times today's prices, applied to every day shown, with one price pair for all
models. There are no default prices, so with none set the page shows tokens only. The real figure is in the Anthropic console.

## The limits: 0 means unlimited

All limits are off by default (before 23 Nov 2026 they were on, so that real use could be seen, they were set to the numbers in brackets).
For every one of them a value of **0, empty or missing means unlimited**; a positive number is honoured exactly as before.

| Setting | Meaning | Was |
|---|---|---|
| `ANON_DAILY` | tries a day for a visitor with no six words, per address | 5 |
| `ID_NEW_DAILY` | a new six-word identity's tries on its first day (it then grows by 2 a day of age) | 6 |
| `ID_DAILY` | the most tries a day an identity grows to | 12 |
| `ID_MONTHLY` | an identity's tries a month | 120 |
| `IP_DAILY` | tries a day per address, however many identities it makes | 20 |
| `SITE_DAILY_REQUESTS` | everyone together, per UTC day | 150 |
| `SITE_MONTHLY_REQUESTS` | everyone together, per calendar month | 2500 |
| `SITE_DAILY_TOKENS` | everyone together, tokens per UTC day | 600000 |

If `ID_NEW_DAILY` is 0 an identity has no daily limit at all; if only `ID_DAILY` is 0 it grows by 2 a day of age without a ceiling.
A garbage value (not a number) also reads as unlimited, so check what the page shows after saving.

Still on, and not limits on honest use: the Turnstile bot check (it guards the key), the kill switch (`AI_ENABLED`), the per-answer output
caps (`MAX_OUT_TOKENS`, `PLAN_MAX_TOKENS`, which bound one answer, not use) and the body size limits. The counters keep counting when
nothing is limited, so use is visible. `GET /v1/allowance` still answers: `left: null, of: null, siteOpen: true` when nothing is limited.

Where a setting comes from, in order: the value saved on the admin page, then the value in `wrangler.jsonc`, then the built-in default.
Note that **a saved value stays in force after a redeploy**: to go back to what `wrangler.jsonc` says, forget the saved value
(`PUT /v1/admin/config` with `{"KEY": null}`); the page does not yet have a button for that.

Settings that can be saved: the limits above, `AI_ENABLED`, `MODEL`, `PLAN_MODEL`, `MAX_OUT_TOKENS`, `PLAN_MAX_TOKENS`,
`PRICE_IN_PER_MTOK`, `PRICE_OUT_PER_MTOK`. Nothing else can be written (not the key, not the Turnstile secret, not the origins).
Model names must match `[a-z0-9._-]` and be at most 60 characters. Output caps are at most 16000 tokens (0 means the built-in default:
1200, and 3500 for plans).

## The hard ceiling is at Anthropic

The limits count **requests**, not money: a long answer costs more than a short one, and with the limits off nothing here stops a flood
from people who pass the bot check. The ceiling that cannot be argued with is the **monthly spend limit on the API key at
console.anthropic.com** (Settings, Limits, for the workspace that holds the `record-atlas-ai` key), plus its usage alerts. That lives
outside this Worker and cannot be changed from the admin page. Keep it set. If something looks wrong, switch the service off on the page
(or set `AI_ENABLED` to `0`) and look at the counts.

## What the privacy page should say

These are the facts, for the site half to word:

- Ask Claude sends what the reader pastes or photographs, and for a research plan the facts the story reader understood and the Atlas
  records it matched (never a person's name or photo), to Anthropic to be answered. The Worker keeps none of it and writes no log of it.
- The Worker keeps counts: how many requests a day, to which kind of feature and which model, how many tokens, how many errors and how
  many were turned away and why. Nothing in those counts identifies a person or holds any text.
- A dated hash of the visitor's address (changes every day, cannot be followed across days) and, for people who use a six-word identity,
  a hash of its token, are used to count tries; they hold counts only. When limits are off these counters still tick.
- Visits to the site are counted separately with GoatCounter, which does not use cookies.
- What Anthropic itself keeps is governed by its own API terms; check the current data-retention terms before the page says anything
  about it (see `workers/ai/README.md`, "Before you deploy").

## Tests

`cd site && node --test test/ai.test.js test/ai-plan.test.js test/ai-limits.test.js test/ai-admin.test.js`. Claude and Turnstile are
faked and the Durable Objects are in-memory; nothing touches the network.
