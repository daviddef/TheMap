# Record Atlas read API and remote MCP server

Answers questions about the Atlas's published data over plain web requests and over MCP, so other people's apps and AI assistants can
use it. **Status: phase 1 built and tested, not deployed.** It holds no database and no secret: it reads the files the site already
publishes (cached for an hour) and the reading-the-record cards bundled at deploy time. It cannot write anything.

## What it answers

| Request | Tool name (MCP) | Returns |
|---|---|---|
| `GET /v1/given-name/Joannes` | `atlas_given_name` | every spelling of the name across languages, each marked seen, lead or rule; an ambiguous name returns all candidates and `ambiguous: true` |
| `GET /v1/term?q=uxoris&record=baptism` | `atlas_term` | what a register word, abbreviation or ending means, with its sources |
| `GET /v1/date?text=die 30 7bris 1671` | `atlas_date` | the date, the working, and warnings |
| `GET /v1/providers?country=HR` | `atlas_providers` | archives and sites holding records, with access class and last-checked date |
| `GET /v1/context` | `atlas_context` | when the data was built and how to read eras |
| `GET /v1/health`, `GET /v1/tools` | | a liveness check, and the tool list with schemas |

Every answer says which file it came from and when that file was built. An empty answer is "not in the catalogue", never "does not
exist". There is no fuzzy fallback: a name that is not exact comes back as nothing, not as the closest match.

## Using it from Claude or another MCP client

The MCP address is `https://api.recordatlas.org/mcp` (streamable HTTP, JSON replies, no login). In Claude: Settings, Connectors,
Add custom connector, and paste that address. It works as soon as it is deployed.

## Who may use it

- **Anyone, no key:** public data, read only. Cloudflare's rate limit (below) is the guard.
- **An app with a key (optional):** the app sends `X-Atlas-Key`. Keys name the app and, in a later step, get a bigger allowance. David
  makes them: pick a long random string, hash it, and put only the hash in the Worker's secret `APP_KEYS`, as
  `[{"name":"my-app","sha256":"<hex>"}]`. A key that is sent and wrong is refused (401); a missing key is fine.
- **Later (not built):** writes are proposals that only David approves (worklist row 98), and a person's allowance is tied to the
  same six-word identity as research sync (row 128), with no registration.

## Deploy (David, in your own terminal)

The token stays on your side; a session never holds it. Open this folder (`workers/api`) in your checkout.

```bash
read -s "CLOUDFLARE_API_TOKEN?Token: " && export CLOUDFLARE_API_TOKEN && echo
```

```bash
npx wrangler@4 deploy --dry-run
```

```bash
npx wrangler@4 deploy
```

```bash
curl -s https://api.recordatlas.org/v1/health
```

```bash
unset CLOUDFLARE_API_TOKEN
```

The dry run bundles the Worker and lists its settings without changing anything. A warning about `record-reader.js` being a
"CommonJS file in a module package" is expected and harmless: that file is a plain script shared with the website.

**Rate limit (dashboard, no token):** Security, WAF, Rate limiting rules, Create. Hostname equals `api.recordatlas.org`, 120 requests
per minute per IP, block for 10 minutes. (The free plan allows one rule; if the sync Worker's rule is already used, widen it to
match either hostname.)

## Run the tests

```bash
cd "/Volumes/DJ - Crucial - 4TB-SSD/Claude Projects/Family Projects/Record Atlas/site" && node --test test/api.test.js
```

They use small invented files and never touch the network.

## What comes next

Places and eras (`atlas_eras`: who held a place in a year, which provider holds those years), surnames and their variants,
what has been searched, and then the write proposals. The design for all of it is in `docs/atlas-mcp-plan.md`.
