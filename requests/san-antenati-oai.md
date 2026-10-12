# Draft: to SAN / Ministero della Cultura — the Antenati OAI endpoint is down

**Not sent.** Writing to a third party on David's behalf needs his say-so.

**To:** san@beniculturali.it (and/or the Antenati contact form)
**Subject:** OAI-PMH endpoint for the Antenati open data (pico_m-ANTENATI) not responding

---

Gentili colleghi,

I maintain **Record Atlas** (https://recordatlas.org/), a free, open-source index of
where genealogical records are held. It is not a commercial service and publishes its
own datasets openly.

I harvest the Antenati catalogue through the open data the Ministry publishes under
CC BY 4.0 — the OAI-PMH set `pico_m-ANTENATI` at

    http://www.san.beniculturali.it/oaicat/OAIHandler

**That endpoint has stopped answering, and it may not be only the endpoint.** As of
12 October 2026, from this network:

| host | resolves to | answers |
|---|---|---|
| `san.beniculturali.it` | 2.42.228.36 | no — times out |
| `www.beniculturali.it` | 2.42.229.1 | no — times out |
| `cultura.gov.it` | 2.42.229.1 | no — times out |
| `san.cultura.gov.it` | no DNS record | — |
| `antenati.cultura.gov.it` | an AWS load balancer in eu-south-1 | yes |

Every host on your own network is silent to us, including the Ministry's main site,
while Antenati's AWS-hosted front end answers normally. That pattern reads either as
an outage on that network or as that network declining requests from this range — and
I cannot tell which from the outside, which is partly why I am writing.

I also checked whether the endpoint had simply moved with the migration from
beniculturali.it to cultura.gov.it: `san.cultura.gov.it` has no DNS record. And the
OAI-PMH registry at openarchives.org — discontinued in July 2025, but its October 2025
dump of 7,103 repositories is still published — has never listed SAN, so there is no
alternate base URL recorded anywhere I can find. Both of the Antenati datasets on
dati.gov.it point at the one address above, so there is no file to download instead.

I had harvested 6,000 of the 464,770 records before it became unavailable, at one
request every two seconds.

Could you tell me:

1. Whether the endpoint is temporarily down or has moved;
2. If it has moved, the new address;
3. Whether a bulk file (XML, CSV or a dump) exists that I could take instead, which
   would be far lighter on your servers than 9,000 OAI requests.

I should add that antenati.cultura.gov.it returns 403 to any identified crawler while
its robots.txt permits everything. **I have not worked around that**, which is why I
use the open data endpoint and why I am writing now that it is unavailable.

Italy is the largest gap in this index — some 8,547 places it maps cannot yet say
which archive holds their registers — so I would be glad of any route you can suggest.

Con i migliori saluti,

David Defranceski
Record Atlas — https://recordatlas.org/
