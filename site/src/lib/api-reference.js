/* THE API REFERENCE FOR /connect/, AS DATA.
 *
 * One entry per service, one card per endpoint. It is written from the Workers' own code (workers/api, workers/sync, workers/ai) and
 * every response shown for the read API, the MCP server and the two open Ask Claude routes was captured from the live services on
 * 19 Nov 2026 and trimmed only where it says "…". Two things are NOT shown as live and the page says so: saving to Sync (it would
 * register an identity) and the Ask Claude POST routes (they need a bot check that only a browser page can pass, and they cost money).
 * Their request shapes are read from the code, and `checked` on each service says which is which.
 *
 * Plain text in, escaped on render: nothing here is HTML.
 */

const API = "https://api.recordatlas.org";
const SYNC = "https://sync.recordatlas.org";
const AI = "https://ai.recordatlas.org";

/* [name, where, required, what] */
const rows = (...r) => r;

export const SERVICES = [
  /* ------------------------------------------------------------------------------------------------------------------ READ API */
  {
    id: "api-read",
    name: "Read API",
    base: API,
    badge: "read-only · no key · any website may call it",
    lead: "Five questions the Atlas can answer without you downloading a file: what a given name is called in other languages, what an old register word means, what a date in a register says, which archives hold records for a country, and how fresh the data is.",
    facts: [
      ["Address", API + "/v1/…"],
      ["Method", "GET. (POST is only for /mcp, below.)"],
      ["Key", "None. You may send an X-Atlas-Key header to name your app; a key that is sent and wrong is refused with 401, so a typo does not pass silently."],
      ["Browsers", "Open: any website may call it from a browser (Access-Control-Allow-Origin: *)."],
      ["Format", "JSON, UTF-8. Answers are cached for 5 minutes."],
      ["Errors", "A JSON object {\"error\": \"…\"} with the right status: 401 unknown key, 404 no such route (the answer lists the routes that exist), 405 wrong method, 500 server error."],
      ["Honesty", "Every answer names its source file. An empty answer means \"not in the catalogue\", never \"does not exist\"."],
    ],
    checked: "Every example below was run against the live service on 19 Nov 2026.",
    endpoints: [
      {
        method: "GET", path: "/v1/health",
        does: "Is it up, and which tools does it have?",
        curl: `curl -s ${API}/v1/health`,
        response: `{"ok":true,"v":1,"tools":["atlas_given_name","atlas_term","atlas_date","atlas_providers","atlas_context"],"app":null}`,
      },
      {
        method: "GET", path: "/v1/tools",
        does: "The five tools and exactly what each one takes, as JSON Schema. The same list an MCP client sees.",
        curl: `curl -s ${API}/v1/tools | jq '.tools[] | {name, inputs: (.input.properties | keys)}'`,
        response: `{"name":"atlas_given_name","inputs":["name"]}
{"name":"atlas_term","inputs":["record","word"]}
{"name":"atlas_date","inputs":["text"]}
{"name":"atlas_providers","inputs":["access","country","limit","q"]}
{"name":"atlas_context","inputs":[]}`,
      },
      {
        method: "GET", path: "/v1/given-name/{name}",
        does: "Every form of a given name in other languages and in the registers (Ivan, Johann, Giovanni, Zuane and Joannes are one name).",
        params: rows(
          ["name", "in the path", "yes", "A given name as written, in any language. Case, accents and punctuation are ignored. Exact match only: the Atlas never guesses a \"closest\" name."],
        ),
        notes: [
          "If two names answer to what you typed, you get both, with \"ambiguous\": true. Pick the one you mean.",
          "Each form has a status: attested (met on a real record, with a count), lead (the right form in that language, never yet met: search it, never treat it as a finding) or rule (made by grammar, like the Latin cases).",
          "You get up to 8 forms per language here. The complete list is in /given-names.json.",
        ],
        curl: `curl -s ${API}/v1/given-name/Ivan`,
        response: `{
  "asOf": "2026-11-18",
  "source": "/given-names.json",
  "query": "Ivan",
  "ambiguous": false,
  "note": "status: seen = met on a record; lead = the right form …",
  "matches": [
    {
      "id": "giovanni",
      "canonical": "Giovanni",
      "page": "/name/giovanni/",
      "forms": 186,
      "languages": {
        "italian": [ { "form": "Gio", "status": "attested", "seen": 161 }, … ],
        "english": [ { "form": "Giovanni", "status": "lead", "seen": 453 }, … ],
        … 44 languages
      }
    }
  ]
}`,
        errors: rows(
          ["200 with \"matches\": []", "The name is not in the catalogue. The answer also has \"found\": false. That says nobody has added it, not that it is not a name."],
        ),
      },
      {
        method: "GET", path: "/v1/term?q={word}&record={kind}",
        does: "What a word, abbreviation or ending in an old church register means. Latin so far.",
        params: rows(
          ["q", "query string", "yes", "The word as you read it. Other endings, i/j, u/v and signs like 7bris are tolerated."],
          ["record", "query string", "no", "baptism, marriage or burial: narrows the answer to that kind of record."],
        ),
        curl: `curl -s "${API}/v1/term?q=uxoris&record=baptism"`,
        response: `{
  "asOf": "…",
  "source": "data/record-terms.json (bundled)",
  "query": "uxoris",
  "count": 1,
  "terms": [
    {
      "id": "uxor",
      "forms": ["uxor", "uxoris", "uxorem", "consors", …],
      "abbreviations": [],
      "means": "wife; spouse",
      "records": "all",
      "role": "person",
      "note": "Handwriting trap: 'uxoris' is often misread as 'ignoris' …",
      "sources": ["https://www.familysearch.org/en/wiki/Latin_Genealogical_Word_List", …]
    }
  ]
}`,
        errors: rows(
          ["200 with \"count\": 0", "No card matches. The list is short so far; that is not a finding about the word."],
        ),
      },
      {
        method: "GET", path: "/v1/date?text={date as written}",
        does: "Decode a date as a register wrote it (Latin words, Roman numerals, 7bris for September) into day, month and year, showing the working and any warning.",
        params: rows(
          ["text", "query string", "yes", "The date text, up to 300 characters. Encode spaces: use curl -G with --data-urlencode, as below."],
        ),
        curl: `curl -s -G ${API}/v1/date --data-urlencode "text=die 30 7bris 1671"`,
        response: `{
  "source": "public/js/record-reader.js",
  "query": "die 30 7bris 1671",
  "ok": true,
  "day": 30, "month": 9, "monthName": "September", "year": 1671,
  "text": "30 September 1671",
  "working": ["30 is day 30", "7bris is September", "1671 is the year 1671"],
  "warnings": []
}`,
        notes: ["warnings is where it tells you a day cannot exist in that month, or that a year is probably Julian-calendar."],
      },
      {
        method: "GET", path: "/v1/providers?country=&access=&q=&limit=",
        does: "Archives and websites that hold records: what they hold, what it costs to look, when the link was last checked.",
        params: rows(
          ["country", "query string", "no", "Two-letter country code, e.g. HR, IT, ZA."],
          ["access", "query string", "no", "free · account · index · mixed · paid · catalogue · onsite · unsurveyed. The answer's accessLegend says what each means."],
          ["q", "query string", "no", "A word in the provider's name or id."],
          ["limit", "query string", "no", "1 to 50, default 20. total says how many matched; shown says how many you got."],
        ),
        curl: `curl -s "${API}/v1/providers?country=HR&access=free&limit=1"`,
        response: `{
  "source": "/providers.json",
  "total": 6,
  "shown": 1,
  "accessLegend": { "free": "Images, free, no account", "account": "…", … },
  "providers": [
    {
      "id": "anno",
      "name": "ANNO — Austrian Newspapers Online",
      "url": "https://anno.onb.ac.at/",
      "kind": "library",
      "access": "free",
      "countries": ["AT", "HR", "SI", "IT", "CZ", "SK", "HU"],
      "what": "The Austrian National Library's digitised newspaper run. …",
      "checked": "2026-09-22"
    }
  ]
}`,
        notes: ["what is cut to 400 characters here. The full text is in /providers.json."],
      },
      {
        method: "GET", path: "/v1/context",
        does: "How fresh the data is, and the rule for reading eras. Call it first if your tool depends on the data being recent.",
        curl: `curl -s ${API}/v1/context | jq '{generated, version: .contract.version, counts}'`,
        response: `{
  "generated": "2026-11-18",
  "version": "1.13.0",
  "counts": { "regions": 994, "regionEras": 5943, "countries": 211, "countryEras": 1495, "gaps": 52, "overlaps": 36 }
}`,
        notes: ["The full answer also has the rule (an era covers from <= year < to) and the contract's whole change log, so it is long."],
      },
    ],
  },

  /* ------------------------------------------------------------------------------------------------------------------ MCP */
  {
    id: "api-mcp",
    name: "MCP server (for AI assistants)",
    base: API + "/mcp",
    badge: "read-only · no key · POST only",
    lead: "MCP (Model Context Protocol) is the standard way an AI assistant calls tools. This address is a remote MCP server. It has the same five tools as the Read API, and an assistant that is connected to it can use them in the middle of a conversation.",
    setup: [
      "In Claude: Settings → Connectors → Add custom connector → paste " + API + "/mcp. No login.",
      "Any other assistant that speaks MCP over streamable HTTP with JSON replies: point it at the same address.",
    ],
    facts: [
      ["Address", API + "/mcp"],
      ["Method", "POST only. A GET answers 405 \"This server answers POST only.\""],
      ["Body", "One JSON-RPC 2.0 message, or an array of them. Header Content-Type: application/json."],
      ["Reply", "JSON with the same id, holding either result or error. A message with no id is a notification: the reply is 202 with an empty body."],
      ["State", "None. No session id, no streaming, no login. Every POST stands alone."],
      ["Browsers", "Open (CORS *), including the Mcp-Session-Id and MCP-Protocol-Version headers."],
    ],
    checked: "Every example below was run against the live service on 19 Nov 2026.",
    endpoints: [
      {
        method: "POST", path: "/mcp  ·  initialize",
        does: "The handshake. An assistant sends this first. It answers with what the server is and what it is for.",
        curl: `curl -s -X POST ${API}/mcp \\
  -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'`,
        response: `{"jsonrpc":"2.0","id":1,"result":{
  "protocolVersion":"2025-06-18",
  "capabilities":{"tools":{}},
  "serverInfo":{"name":"record-atlas","version":"1"},
  "instructions":"Read-only questions about the Record Atlas: given-name spellings, what a register word means, date decoding, archives that hold records. An empty answer is not a finding."}}`,
        notes: ["The protocolVersion you send is echoed back. After it, a client sends the notification notifications/initialized (no id): the server replies 202 with nothing."],
      },
      {
        method: "POST", path: "/mcp  ·  tools/list",
        does: "Ask what tools there are, with their input schemas.",
        curl: `curl -s -X POST ${API}/mcp -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools | map(.name)'`,
        response: `["atlas_given_name","atlas_term","atlas_date","atlas_providers","atlas_context"]`,
      },
      {
        method: "POST", path: "/mcp  ·  tools/call",
        does: "Run one tool. params.name is the tool, params.arguments its inputs (the table below).",
        curl: `curl -s -X POST ${API}/mcp -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"atlas_date","arguments":{"text":"die 30 7bris 1671"}}}'`,
        response: `{"jsonrpc":"2.0","id":3,"result":{
  "content":[{"type":"text","text":"{\\n \\"ok\\": true,\\n \\"day\\": 30,\\n \\"month\\": 9,\\n \\"year\\": 1671, …}"}],
  "isError":false}}`,
        notes: [
          "The answer is result.content[0].text: a STRING that holds the same JSON the Read API returns for that tool. Parse it a second time.",
          "isError is true when the tool itself reports a problem (for example, no name given).",
        ],
      },
      {
        method: "POST", path: "/mcp  ·  a batch",
        does: "Send an array and get an array back, in the same order. Notifications inside the array get no entry.",
        curl: `curl -s -X POST ${API}/mcp -H 'Content-Type: application/json' \\
  -d '[{"jsonrpc":"2.0","id":1,"method":"ping"},{"jsonrpc":"2.0","id":2,"method":"tools/list"}]'`,
        response: `[{"jsonrpc":"2.0","id":1,"result":{}},{"jsonrpc":"2.0","id":2,"result":{"tools":[ … ]}}]`,
      },
    ],
    tools: rows(
      ["atlas_given_name", "name (string, required)", "Every form of a given name across languages. Same as /v1/given-name/{name}."],
      ["atlas_term", "word (string, required) · record (baptism | marriage | burial)", "What an old register word means. Same as /v1/term."],
      ["atlas_date", "text (string, required)", "Decode a register date. Same as /v1/date."],
      ["atlas_providers", "country · access · q · limit (all optional)", "Archives and websites. Same as /v1/providers."],
      ["atlas_context", "none", "How fresh the data is. Same as /v1/context."],
    ),
    errorsTitle: "What goes wrong, and what you see",
    errors: rows(
      ["-32700", "The body was not JSON.", `{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}  (HTTP 400)`],
      ["-32600", "Valid JSON but not a JSON-RPC 2.0 message (no \"jsonrpc\":\"2.0\" or no method).", `"message":"invalid request"`],
      ["-32601", "A method the server does not have. It has: initialize, ping, tools/list, tools/call.", `"message":"method not found"`],
      ["-32602", "tools/call with a tool name that does not exist.", `"message":"unknown tool: nope"`],
      ["405", "You sent a GET to /mcp.", "This server answers POST only."],
    ),
  },

  /* ------------------------------------------------------------------------------------------------------------------ SYNC */
  {
    id: "api-sync",
    name: "Sync (keep your research)",
    base: SYNC + "/v1",
    badge: "read + write · six words · encrypted",
    lead: "Keeps ONE sealed copy of your research under an id, so a phone and a laptop (or your own script) can share it. The server stores bytes it cannot open: the key that opens them is made from your six words and never leaves your device. There is no account: the id names a folder, and two tokens made from the same six words are the permission.",
    facts: [
      ["Address", SYNC + "/v1/{id}"],
      ["id", "32 hex characters, made from the six words (the step-by-step above shows how)."],
      ["Tokens", "Two, each 43 characters of base64url. The write token (PUT, DELETE) and the read token (GET). Sent as Authorization: Bearer <token>. The server keeps only a hash of each."],
      ["Body", "A sealed box, binary: not JSON. See the box format below. At most 2 MiB."],
      ["Browsers", "A web page may call it only if it is one of the Atlas's own pages. curl, Node, Python and other scripts send no Origin header and work from anywhere."],
      ["Kept", "The newest copy for good, plus one older copy per day for 30 days (versions)."],
      ["Not kept", "Your words, your key, anything readable. A wrong token and an id that does not exist both answer 404, so it will not even say whether an id exists."],
    ],
    checked: "Checked live on 19 Nov 2026: /v1/health, /v1/count, and the 401 and 404 answers below. PUT, GET and DELETE of a real copy are read from the Worker's code, and nothing was saved while writing this page.",
    endpoints: [
      {
        method: "GET", path: "/v1/health",
        does: "Is it up?",
        curl: `curl -s ${SYNC}/v1/health`,
        response: `{"ok":true,"v":1}`,
      },
      {
        method: "GET", path: "/v1/count",
        does: "How many people keep a copy. The only number anybody may read; it never names an id. Cached an hour.",
        curl: `curl -s ${SYNC}/v1/count`,
        response: `{"registrations":2,"at":"2026-11-18T03:17:31.262Z"}`,
      },
      {
        method: "PUT", path: "/v1/{id}",
        does: "Save (or replace) your sealed copy. The first save also registers the id.",
        params: rows(
          ["Authorization", "header", "yes", "Bearer <write token>"],
          ["X-Read-Token", "header", "first save only", "The read token. The server stores its hash so later GETs can be checked."],
          ["Content-Type", "header", "no", "application/octet-stream"],
          ["body", "binary", "yes", "The sealed box (28 bytes to 2 MiB)."],
        ),
        curl: `# box.bin is your research JSON, sealed as described below
curl -s -X PUT ${SYNC}/v1/<id> \\
  -H "Authorization: Bearer <write token>" \\
  -H "X-Read-Token: <read token>" \\
  -H "Content-Type: application/octet-stream" \\
  --data-binary @box.bin`,
        response: `{"ok":true,"saved":"2026-11-19T01:07:19.000Z","day":"2026-11-19","bytes":4128}`,
        errors: rows(
          ["400", "\"not an encrypted pack\" (first byte is not 1, or too short) · \"a first save needs the read token too\""],
          ["401", "\"a token is needed\" (no Authorization header)"],
          ["403", "\"wrong token\" (the write token does not match the one this id was registered with)"],
          ["413", "\"too large\" (over 2 MiB)"],
        ),
        notes: ["Last save wins. There is no merge: if two tools save at once, one overwrites the other. Read first, merge on your side, then save."],
      },
      {
        method: "GET", path: "/v1/{id}",
        does: "Fetch your newest sealed copy. You decrypt it yourself.",
        params: rows(["Authorization", "header", "yes", "Bearer <read token>"]),
        curl: `curl -s -o box.bin -D - ${SYNC}/v1/<id> -H "Authorization: Bearer <read token>"`,
        response: `HTTP 200, Content-Type: application/octet-stream
X-Saved-At: 2026-11-19T01:07:19.000Z
(the raw sealed box)`,
        errors: rows(
          ["401", "{\"error\":\"a token is needed\"}"],
          ["404", "{\"error\":\"not found\"}: nothing saved under that id, OR the token is wrong. They look alike on purpose."],
        ),
      },
      {
        method: "GET", path: "/v1/{id}/versions   ·   /v1/{id}/versions/{YYYY-MM-DD}",
        does: "The first lists the last 30 daily copies. The second fetches one of them (the last copy saved that UTC day), as raw bytes like a normal GET.",
        params: rows(["Authorization", "header", "yes", "Bearer <read token>"]),
        curl: `curl -s ${SYNC}/v1/<id>/versions -H "Authorization: Bearer <read token>"`,
        response: `{"versions":[{"day":"2026-11-19","bytes":4128,"saved":"2026-11-19T01:07:19.000Z"}, …]}`,
      },
      {
        method: "DELETE", path: "/v1/{id}",
        does: "Erase everything stored for this id, in both buckets (the live one and the nightly copy). Cannot be undone.",
        params: rows(["Authorization", "header", "yes", "Bearer <write token>"]),
        curl: `curl -s -X DELETE ${SYNC}/v1/<id> -H "Authorization: Bearer <write token>"`,
        response: `{"ok":true,"deleted":3}`,
        errors: rows(["404", "Not found, or the token is wrong."]),
      },
      {
        method: "GET", path: "/v1/{id}  with no or a wrong token  (checked live)",
        does: "What the two refusals look like, using an id that does not exist.",
        curl: `curl -s -w ' [%{http_code}]\\n' ${SYNC}/v1/00000000000000000000000000000000
curl -s -w ' [%{http_code}]\\n' -H "Authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" ${SYNC}/v1/00000000000000000000000000000000`,
        response: `{"error":"a token is needed"} [401]
{"error":"not found"} [404]`,
      },
    ],
    boxTitle: "The sealed box: what you PUT",
    box: [
      "Byte 0: the number 1 (the format version).",
      "Bytes 1 to 12: a fresh random 12-byte IV (nonce), different for every save.",
      "The rest: the research JSON, encrypted with AES-256-GCM. The id (as text) is the associated data. The last 16 bytes are the GCM tag.",
      "So a box is at least 1 + 12 + 16 + 1 = 30 bytes. The server checks only the size and the first byte; it cannot check that the rest is honest.",
      "What goes inside is the research file shown in door 2 (kind \"record-atlas-research\", version 2). The browser file /js/research-sync.js makes the keys and the box for you.",
    ],
  },

  /* ------------------------------------------------------------------------------------------------------------------ ASK CLAUDE */
  {
    id: "api-ai",
    name: "Ask Claude (reads a pasted line or a photo)",
    base: AI + "/v1",
    badge: "metered · bot check · for the Atlas's own pages",
    lead: "Behind the Ask Claude boxes on the Atlas: paste a line of an old register, or a photo of a document, and get a draft reading that leans on the Atlas's reading cards. It calls Claude for you, so it costs money and is rationed.",
    plain: "You cannot script the POST routes with curl. Every one needs a Cloudflare Turnstile bot-check token that only a real web page can produce, and it only answers pages on the Atlas's own addresses. What curl CAN do is read the meter (below). If you want AI help inside your own tool, use the MCP server above with your own assistant.",
    facts: [
      ["Address", AI + "/v1/{translate | transcribe | document | casefile}"],
      ["Method", "POST with a JSON body (about 80 KB at most; a picture up to about 1.6 MB before encoding)."],
      ["Required header", "X-Turnstile: the bot-check token the page got from Cloudflare. Without it: 403 with reason \"no-token-sent\"."],
      ["Optional headers", "X-AI-Id (32 hex) and Authorization: Bearer <43 chars>: the six-word identity. It earns a bigger daily allowance than an anonymous reader."],
      ["Costs", "Each call uses between 1 and 3 of the reader's daily tries; a photo or a whole document costs more than a line of text."],
      ["Keeps", "Counts only. No pasted text, no picture, no answer, no name. Request logging is off."],
    ],
    checked: "Checked live on 19 Nov 2026: /v1/health, /v1/allowance, and the refusals marked (checked). The POST bodies and answers are read from the Worker's code and prompts. Nothing was sent that would use a try.",
    endpoints: [
      {
        method: "GET", path: "/v1/health",
        does: "Is it on? It can be paused.",
        curl: `curl -s ${AI}/v1/health`,
        response: `{"ok":true,"v":1,"enabled":true}`,
        notes: ["When it is paused, every other route answers 503 \"Ask Claude is paused for now.\""],
      },
      {
        method: "GET", path: "/v1/allowance",
        does: "The meter: how many tries a reader has left today. Open to curl.",
        params: rows(
          ["X-AI-Id + Authorization", "headers", "no", "Send them to see the identity's own meter. Without them you get the address's meter."],
        ),
        curl: `curl -s ${AI}/v1/allowance`,
        response: `{"identity":false,"dayLimit":15,"monthLimit":null,"dayUsed":null,"monthUsed":null}`,
        notes: ["dayLimit is how many tries this reader gets a day; dayUsed is how many are gone (null until you send an identity). The daily limit is the service's setting and changes, so read it from here, not from this page."],
      },
      {
        method: "POST", path: "/v1/translate",
        does: "One line of an old register to a plain-English draft. Uses 1 try.",
        params: rows(
          ["text", "body", "yes", "The line, up to 4,000 characters. One entry at a time."],
          ["cards", "body", "no", "Up to 12 reading cards the page matched: {term, forms, meaning, trap}. The page's own matcher makes them; they are tried before the model's own knowledge."],
          ["context", "body", "no", "{language, period, place, event}, each short."],
        ),
        curl: `# needs a Turnstile token: this works only from the Atlas's own page
curl -s -X POST ${AI}/v1/translate \\
  -H 'Content-Type: application/json' -H 'X-Turnstile: <token from the widget>' \\
  -d '{"text":"die 12 Maii baptizatus est Joannes filius Petri et Mariae","context":{"language":"Latin"}}'`,
        response: `{
  "kind": "translate",
  "result": {
    "draft": "plain-English rendering of the whole line",
    "words": [ { "w": "baptizatus", "gloss": "baptised", "from": "card" | "model", "doubt": false, "why": "" } ],
    "roles": [ { "w": "Joannes", "role": "child" } ],
    "not_said": [ "what the line does NOT tell you, e.g. a baptism date is not a birth date" ],
    "note": "how sure it is overall"
  }
}`,
        notes: [
          "from says whether a word's meaning came from an Atlas card or from the model. Never treat a \"model\" reading as settled.",
          "If the model's answer cannot be read as JSON you get \"result\": {\"unparsed\": true, \"draft\": \"…\"} instead.",
          "It is told never to invent a surname, a parent, a date or a place that the text does not give.",
        ],
        errors: rows(
          ["400", "\"not json\" · \"paste a line to read\""],
          ["403", "\"origin not allowed\" (a browser page on another site) · \"The bot check did not pass\" with a reason (checked: \"no-token-sent\") · \"wrong token\" for an identity"],
          ["413", "\"too large\" · \"that is too long: paste one entry at a time\""],
          ["429", "Allowance used up. The body's limit says which: day, month, site, tokens or sitemonth. Free reads come back at midnight UTC."],
          ["503", "\"Claude could not answer just now.\" with a reason such as anthropic-529. A call that gets no answer costs you nothing."],
        ),
      },
      {
        method: "POST", path: "/v1/transcribe",
        does: "A photo of one line to the line as written, with [?] where it cannot be read. Uses more tries than text (a picture).",
        params: rows(
          ["image", "body", "yes", "{media_type: \"image/jpeg\" | \"image/png\" | \"image/webp\", data: <base64, no prefix>}. The page shrinks the picture first; the limit is about 1.6 MB."],
          ["context", "body", "no", "{language}"],
        ),
        curl: `curl -s -X POST ${AI}/v1/transcribe \\
  -H 'Content-Type: application/json' -H 'X-Turnstile: <token>' \\
  -d '{"image":{"media_type":"image/jpeg","data":"<base64>"},"context":{"language":"Latin"}}'`,
        response: `{ "kind":"transcribe",
  "result": { "lines": [ { "text": "the line as written", "doubtful": ["words it was unsure of"] } ], "note": "one sentence about legibility" } }`,
        notes: ["It copies; it does not translate or explain. An unreadable picture returns no lines and says why in note."],
        errors: rows(["400", "\"send a jpeg, png or webp picture\""], ["413", "\"that picture is too large: it should be shrunk first\""]),
      },
      {
        method: "POST", path: "/v1/document",
        does: "A photo of a whole document (a census sheet, a certificate, a petition) read field by field. Uses more tries than a line; uses a stronger model.",
        params: rows(
          ["image", "body", "yes", "As for transcribe."],
          ["context", "body", "no", "{language, period, place, event, note}, each short."],
        ),
        curl: `curl -s -X POST ${AI}/v1/document -H 'Content-Type: application/json' -H 'X-Turnstile: <token>' \\
  -d '{"image":{"media_type":"image/png","data":"<base64>"},"context":{"period":"1950"}}'`,
        response: `{ "kind":"document",
  "result": { "doc_type", "title_as_printed", "issuer", "date_on_document", "places_named":[…], "what_it_is",
              "persons":[{ "name_as_written", "role", "details":{ "age","born","birthplace","residence","occupation","other" } }],
              "fields":[{ "label","value","doubt" }], "events":[…], "ids":[…], "marks":[…], "not_legible":[…], "legibility" } }`,
        notes: ["It records only what the document states, in the original spelling, and links nothing to any other document."],
      },
      {
        method: "POST", path: "/v1/casefile",
        does: "Two to six documents that were already read (the results of /document) compared together. Uses more than one try.",
        params: rows(
          ["docs", "body", "yes", "2 to 6 of the \"result\" objects from /v1/document, as an array."],
          ["atlas", "body", "no", "Up to 3,000 characters of Atlas facts about the places (who ruled them when)."],
          ["question", "body", "no", "What you want to know, up to 500 characters."],
        ),
        curl: `curl -s -X POST ${AI}/v1/casefile -H 'Content-Type: application/json' -H 'X-Turnstile: <token>' \\
  -d '{"docs":[ {…}, {…} ],"question":"Are these the same family?"}'`,
        response: `{ "kind":"casefile",
  "result": { "headline", "groups":[{ "docs":[2,3], "verdict":"likely|possible|unlikely|not enough", "because":[…], "against":[…] }],
              "profile":[{ "fact","evidence","status":"documented|inferred" }], "timeline":[…], "names_and_places":[…],
              "conflicts":[…], "adds":[…], "next_steps":[…], "cautions":[…] } }`,
        notes: ["Every statement is tied to a document number and marked documented, inferred or context. A verdict is a lead for you to check, not a finding."],
        errors: rows(["400", "\"send two to six documents that were read\""]),
      },
      {
        method: "DELETE", path: "/v1/id",
        does: "Forget an identity's counters. Needs the identity's headers (X-AI-Id and the Bearer token).",
        curl: `curl -s -X DELETE ${AI}/v1/id -H "X-AI-Id: <32 hex>" -H "Authorization: Bearer <token>"`,
        response: `{"ok":true}`,
      },
    ],
  },
];
