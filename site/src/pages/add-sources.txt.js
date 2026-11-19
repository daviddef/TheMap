/* THE BRIEF FOR A PERSON'S AI AGENT: how to send Record Atlas several sources in ONE email.
 *
 * The one-source form on /add/ only composes a mail; the site has no server and takes nothing in. A bulk send is the same thing at a larger
 * size, so what an agent needs is the exact shape of the message, not an endpoint. It is plain text on purpose: any agent can read it, and the
 * To address comes from site.json (support of the form on /add/), never typed here, so the two cannot drift apart. */
import site from "../data/site.json";

export function GET() {
  const to = (site.contact && site.contact.email) || "";
  const body = `SENDING RECORD ATLAS SEVERAL SOURCES AT ONCE

Record Atlas has no upload endpoint and no account. The route is ONE EMAIL that you (the agent) write and your person sends.
If you cannot send mail, write the text below and hand it to your person to paste into an email, or into the box at https://recordatlas.org/add/ (section "Several at once"), which opens it in their mail app.

To:      ${to || "(the address shown on https://recordatlas.org/add/)"}
Subject: Record Atlas - N sources        (N = how many blocks the message holds)

BODY: one block per source, a blank line between blocks. Leave out any line you do not know; never fill one with a guess.

Name: what the source calls itself
Web address: the page you actually opened
Country: the country or countries it covers
What it holds: what it holds and for which places and years, in a plain sentence
What it costs to look: one of  free | account needed | index only | partly paid | paid | catalogue only | on paper in the building | I do not know
Notes: how you know (what you opened, what you saw), and anything wrong or changed

RULES THAT MAKE A MESSAGE USEFUL
- Send only what you opened and read. A source you only saw named in a search result goes in a separate "not opened" line at the end, not as a block.
- One source per block. An archive and a volunteer index of the same books are two blocks.
- If a source's home page is probably already listed but the deep link you used is not, say so in Notes (for example "home page listed; this is the viewer").
- Before sending, search https://recordatlas.org/ (the search box, and https://recordatlas.org/providers/) so you do not send what is already there. Most FamilySearch collections are already in the Atlas; send one only if you cannot find it by its title.
- No names, dates or details of living people, and no private family information. A source is a place that holds records, not a person.
- Everything is checked against the source before anything changes, for a message from a stranger exactly as for any other.

EXAMPLE

Subject: Record Atlas - 2 sources

Name: Portsmouth History Centre
Web address: https://www.portsmouth.gov.uk/services/leisure-and-culture/history-centre/
Country: United Kingdom
What it holds: the original parish registers behind the Portsmouth marriage, baptism and burial collections on FamilySearch
What it costs to look: on paper in the building
Notes: found while tracing a FamilySearch collection back to its holder

Name: Vestfold-slekt
Web address: https://vestfold-slekt.net/
Country: Norway
What it holds: a volunteer index of the Sandar church books
What it costs to look: I do not know
Notes: opened the site; did not test the search
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
