# Record Atlas "Ask Claude" Worker

Paste a line of a register (or a photo of one) and get a draft reading that leans on the Atlas's own cards first.
Design and why: `docs/reading-the-record-plan.md` section 6b. The Worker runs at `ai.recordatlas.org`; redeploy it (below) after
changing anything in this folder.

## What it does and does not keep

It keeps **counts**: per visitor-address per day, per six-word identity per day and month, for the whole site per day, and, for
David's admin page, usage statistics by UTC day (requests, answers, errors, input and output tokens per kind and per model, and
refusals by reason; the last 400 days). It does not keep pasted text, pictures, plan facts or answers, no name and no address, and
request logging is off. Your Anthropic key is a Worker **secret**: it is never in this folder, never in the browser, and no session
holds it. The admin page, its token and its settings are described in `docs/ai-admin.md`.

| Endpoint | Does |
|---|---|
| `POST /v1/translate` | `{text, cards, context}` to a draft: plain-English line, each word tagged "card" or "model", doubtful words flagged, what the line does not say |
| `POST /v1/transcribe` | `{image:{media_type,data}}` to the lines as written, with `[?]` where unreadable (a photo counts as 3) |
| `POST /v1/document`, `POST /v1/casefile` | a whole photographed document read field by field; the case file that joins two to six readings (each counts as 2) |
| `POST /v1/plan` | `{facts, candidates, question}` to a research plan (Haiku): `{headline, summary, groups:[{key,title,items:[{title,detail,source,ref,url,name,where}]}], cautions}`. `facts` is what the story reader understood (never a name or photo); `candidates` are the Atlas records the browser matched (up to 60), the only things that may be tagged `"atlas"`. The server checks every `ref` against them, attaches the link, name and place from the candidate itself, strips any link the model wrote, drops unknown groups and caps counts and lengths. Costs 1 try |
| `POST /v1/tidy` | `{text}` (up to 8,000 characters) to `{text, changes[], added[]}` (Haiku): "AI ready", the reader's whole story rewritten as short plain sentences, nothing added. **Sends the full text**, so the page asks first. `added` lists any number in the answer that was not in the original. Costs 1 try |
| `POST /v1/post` | `{post, candidates?}` to `{known[], unknown[], questions[], story, reply, links[], living}` (Haiku): a forum post read as a request. `story` is what the post knows, as plain sentences the story reader can draw; `reply` is a draft answer for the group; `links` are the Atlas candidates the reply points at, taken from the candidates sent (the server attaches name, place and link; any address the model wrote is removed). **Sends the full text**. Costs 1 try |
| `GET /v1/allowance` | what an identity has used; `left` and `of` are `null` when nothing is limited, and `siteOpen` is `true` |
| `DELETE /v1/id` | forget an identity's counters |
| `GET /v1/health` | `{ok, v, enabled}` |
| `GET /admin`, `GET /v1/admin/ping`, `GET /v1/admin/report`, `GET`/`PUT /v1/admin/config` | David's admin page and its JSON routes: 404 until the secret `ADMIN_TOKEN` is set, then a bearer token is needed for the data (`docs/ai-admin.md`) |

Every answer call (including a plan) needs a Turnstile token (`X-Turnstile`). The six-word identity is optional (`X-AI-Id` +
`Authorization: Bearer`), derived in the browser with its own labels (`ai-id`, `ai-token`), so this service cannot open anyone's
saved research.

## Limits: none by default, every one configurable

Every limit is **off**: in `wrangler.jsonc` they are all `"0"`, and **0, empty or missing means unlimited**. A positive number is
honoured. They can be set in `wrangler.jsonc` (then redeploy) or from the admin page (no redeploy; a value saved there wins over the
file). The counters keep counting either way, so use is visible; only the refusals are gone.

| Setting | Meaning | Was |
|---|---|---|
| `ANON_DAILY` | tries a day with no six words, per address | 5 |
| `ID_NEW_DAILY`, `ID_DAILY`, `ID_MONTHLY` | a new six-word identity starts at `ID_NEW_DAILY` a day, grows by 2 a day of age up to `ID_DAILY`, and has `ID_MONTHLY` a month | 6, 12, 120 |
| `IP_DAILY` | per address, however many identities it makes | 20 |
| `SITE_DAILY_REQUESTS`, `SITE_MONTHLY_REQUESTS`, `SITE_DAILY_TOKENS` | everyone together | 150, 2500, 600000 |

Not limits on use, and still in force: the Turnstile bot check, the `AI_ENABLED` kill switch, the per-answer output caps
(`MAX_OUT_TOKENS`, `PLAN_MAX_TOKENS`; they bound one answer) and the body size limits. A whole document or a case file counts as 2
tries when a limit is set. Where limits are set, a refusal from the site-wide caps hands the reader's own tries back.

With the limits off, **the hard ceiling is the monthly spend limit you set on the key at Anthropic** (console.anthropic.com), which
lives outside this Worker. Do that first (below). To pause everything at once set `"AI_ENABLED": "0"` and redeploy, or switch it off
on the admin page.

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

Optional, to turn on the admin page (`docs/ai-admin.md`; until this is set `/admin` and the admin routes answer 404):

```bash
npx wrangler@4 secret put ADMIN_TOKEN
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
API keys, delete `record-atlas-ai`. Counters and statistics are tiny and hold no person; they go with the Worker.

## Run the tests

`cd site && node --test test/ai.test.js test/ai-plan.test.js test/ai-limits.test.js test/ai-admin.test.js` (Claude and Turnstile are faked; no network, no account).
