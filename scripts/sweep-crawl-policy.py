#!/usr/bin/env python3
"""Which providers will actually let this atlas read them — and by which door.

WHY IT WAS REWRITTEN. The first version of this file answered a narrower
question than its output implied, and was wrong in both directions.

  IT CALLED A REFUSAL «OPEN». It classified on the status code and looked for
  English challenge wording. digi.archives.cz answers HTTP 200 with 118 KB of
  Radware «Verifying your browser before proceeding», and its robots.txt
  answers 200 with a page reading «Přístup zablokován!». Both would have been
  counted as a site that serves us.

  AND IT CALLED A SITE «REFUSED» WHEN ONLY ITS FRONT DOOR WAS SHUT. All 121
  Italian providers read `refused`, Antenati among them — and the whole of
  Antenati is published as open data, CC BY 4.0, through an OAI endpoint on
  another host entirely. The atlas had already harvested 6,000 of its 464,770
  records that way. A 403 on a website says nothing about whether the
  institution publishes its catalogue for machines somewhere else.

So this now does three things rather than one: it reads the policy, it reads
the ANSWER rather than just its status line, and for anything that refuses it
goes looking for the other door.

WHAT A REFUSAL LOOKS LIKE is taken from real ones, not imagined: Cloudflare's
«Attention Required» and «Just a moment», Radware's «Verifying your browser»,
Incapsula, and plain refusals in the languages these archives are written in.
A 200 that says «Přístup zablokován» is a refusal; the status line is only
part of the evidence.

NOTHING HERE WORKS AROUND A GATE. A site that refuses is recorded as refusing.
A provider that names ClaudeBot, GPTBot or their kin in robots.txt is closed to
this session whatever user agent it wore, and the alternate-door search is NOT
run for those: an institution that has named us does not get probed for a side
entrance. It is run only where the refusal is a firewall rather than a policy.

    python3 scripts/sweep-crawl-policy.py [access-class|all] [--doors]
"""
import json, os, re, sys, time
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas checking whether it may read this source)")
AI_BOTS = {"claudebot", "claude-searchbot", "claude-web", "anthropic-ai",
           "gptbot", "oai-searchbot", "chatgpt-user", "ccbot", "google-extended",
           "applebot-extended", "bytespider", "amazonbot", "meta-externalagent",
           "metaai", "meta-webindexer", "perplexitybot", "omgili", "diffbot",
           "cohere-ai", "youbot", "img2dataset"}
TIMEOUT = 25

# TAKEN FROM REAL REFUSALS. Each of these was seen on a page this sweep had
# previously counted as open, or on one whose status code alone would not have
# said enough.
WAF = (
    "attention required", "just a moment", "challenge-platform", "cf-browser-verification",
    "verifying your browser", "radware", "incident id", "incapsula", "_incapsula_",
    "enable javascript and cookies", "ddos protection", "checking your browser",
    "request unsuccessful", "bot detection", "are you a human", "captcha",
    # «WE ARE VERIFYING THAT YOU ARE A HUMAN» IS A DIFFERENT PAGE FROM «ACCESS
    # BLOCKED», and missing it cost a whole country's worth of claim. The Czech
    # list below already had «přístup zablokován»; vademecum.soalitomerice.cz
    # serves «Ověřujeme, že jste člověk» instead, so it was counted open and
    # written up as one of seven Czech portals that answer. A gate that asks
    # whether you are human is the clearest refusal there is — it is asking a
    # question this crawler cannot honestly answer yes to.
    "ověřujeme, že jste člověk", "ověření přístupu",
    "verifying that you are a human", "verifying you are human",
    "wir überprüfen", "nous vérifions", "estamos verificando",
    "stiamo verificando", "controleren of u een mens",
    "one moment, please", "un momento, per favore",
)
# «Access denied», in the languages the archives on this map are written in.
DENIED = (
    "access denied", "access blocked", "you have been blocked", "forbidden",
    "not authorized", "not authorised",
    "přístup zablokován", "přístup odepřen",      # Czech
    "zugriff verweigert", "zugriff gesperrt",                                   # German
    "accès refusé", "accès interdit",                            # French
    "acceso denegado", "acceso restringido",                                    # Spanish
    "accesso negato", "accesso vietato",                                        # Italian
    "acesso negado",                                                            # Portuguese
    "toegang geweigerd",                                                        # Dutch
    "adgang nægtet", "åtkomst nekad", "tilgang nektet",               # Danish/Swedish/Norwegian
    "dostęp zabroniony", "brak dostępu",                              # Polish
    "доступ запрещен",  # Russian
    "hozzáférés megtagadva",                                     # Hungarian
)
# Where an institution's catalogue often lives when its website will not talk.
# Six, not fourteen. Every path here costs a request against a site that has
# already refused one, and politeness is the point: these are the doors that
# have actually turned out to exist — an OAI endpoint, a JSON API, a sitemap —
# rather than every path worth imagining.
DOORS = ("/oai", "/oai-pmh", "/api", "/opendata", "/data", "/sitemap.xml")


def get(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*", "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(300_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(300_000).decode("utf-8", "replace")
        except Exception:                                    # noqa: BLE001
            return e.code, ""
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)[:160]


def refusal_in(body):
    """What in this page says no, or None. The body, not the status line."""
    low = (body or "")[:200_000].lower()
    for w in WAF:
        if w in low:
            return "a bot check: " + w
    for w in DENIED:
        if w in low:
            return "a refusal in its own words: " + w
    return None


def groups(txt):
    """robots.txt as {frozenset(agents): [disallow, ...]}, lowercased."""
    out, agents, rules, fresh = {}, set(), [], True
    for raw in (txt or "").splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        k, v = (x.strip().lower() for x in line.split(":", 1))
        if k == "user-agent":
            if not fresh and agents:
                out[frozenset(agents)] = rules
                agents, rules = set(), []
            agents.add(v)
            fresh = True
        elif k in ("disallow", "allow"):
            fresh = False
            if k == "disallow":
                rules.append(v)
    if agents:
        out[frozenset(agents)] = rules
    return out


def sitemaps_in(txt):
    return re.findall(r"(?im)^\s*sitemap:\s*(\S+)", txt or "")


def other_doors(root, want_doors):
    """Where else this institution might publish, for a site that refuses.

    Only called where the refusal is a FIREWALL. A site that names this
    crawler in robots.txt has said no to us by name, and is not probed for a
    way round.
    """
    found = []
    if not want_doors:
        return found
    for path in DOORS:
        code, body = get(root + path, timeout=15)
        if code != 200 or not body:
            continue
        if refusal_in(body):
            continue
        low = body[:4000].lower()
        if path.endswith("sitemap.xml") and "<urlset" not in low and "<sitemapindex" not in low:
            continue
        if "oai" in path.lower() and "<oai-pmh" not in low and "<identify" not in low:
            continue
        if path in ("/api", "/api/v1", "/rest/v1", "/data", "/opendata", "/open-data"):
            if not (low.lstrip().startswith(("{", "[")) or "application/json" in low
                    or "swagger" in low or "openapi" in low):
                continue
        found.append({"path": path, "bytes": len(body)})
        if len(found) >= 3:
            break
        time.sleep(0.2)
    return found


def verdict(p):
    url = (p.get("url") or "").strip()
    row = {"id": p.get("id"), "name": p.get("name"), "url": url,
           "countries": p.get("countries") or [], "access": p.get("access")}
    if not url.startswith("http"):
        row["policy"] = "no url on the row"
        return row
    s = urlsplit(url)
    root = f"{s.scheme}://{s.netloc}"
    rc, rtxt = get(root + "/robots.txt")
    row["robotsStatus"] = rc

    rtxt_refusal = refusal_in(rtxt) if rc == 200 else None
    if rc == 0:
        row["policy"] = "nothing answered"
        row["detail"] = rtxt[:120]
        return row
    if rtxt_refusal:
        row["policy"] = "bot gate"
        row["detail"] = f"even robots.txt is {rtxt_refusal}"
        row["doors"] = other_doors(root, True)
        return row
    if rc in (401, 403):
        row["policy"] = "refused"
        row["detail"] = f"robots.txt itself answers {rc}"
        row["doors"] = other_doors(root, True)
        return row

    g = groups(rtxt) if rc == 200 else {}
    named = sorted({a for ags, rules in g.items() for a in ags
                    if a in AI_BOTS and "/" in rules})
    if named:
        row["policy"] = "robots forbids AI crawlers"
        row["detail"] = "named: " + ", ".join(named[:8])
        row["namesThisCrawler"] = any(a.startswith("claude") or a == "anthropic-ai"
                                      for a in named)
        return row                      # named us: no side entrance is looked for
    star = next((rules for ags, rules in g.items() if "*" in ags), None)
    if star is not None and "/" in star:
        row["policy"] = "robots forbids everyone"
        return row

    row["sitemaps"] = sitemaps_in(rtxt)[:3]
    time.sleep(0.5)
    hc, htxt = get(url)
    row["pageStatus"] = hc
    said_no = refusal_in(htxt)
    if said_no:
        # THE CASE THE OLD SWEEP GOT WRONG: robots permits, the page answers,
        # and the answer is a refusal.
        row["policy"] = "bot gate"
        row["detail"] = f"robots.txt permits; the page is {said_no}"
        row["doors"] = other_doors(root, True)
    elif hc == 200:
        row["policy"] = "open"
    elif hc == 0:
        row["policy"] = "nothing answered"
        row["detail"] = htxt[:120]
    else:
        row["policy"] = "refused"
        row["detail"] = f"the page answers {hc}"
        row["doors"] = other_doors(root, True)
    return row


def main():
    want = (sys.argv[1] if len(sys.argv) > 1 else "free").lower()
    prov = json.load(open("data/providers.json", encoding="utf-8"))["providers"]
    rows = prov if want == "all" else [p for p in prov if (p.get("access") or "") == want]
    print(f"{len(rows)} providers ({want}) — robots first, then the answer, "
          f"then the other door", flush=True)
    out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(verdict, rows), 1):
            out.append(r)
            if i % 50 == 0:
                print(f"  {i}/{len(rows)}", flush=True)
    order = ["open", "bot gate", "robots forbids AI crawlers",
             "robots forbids everyone", "refused", "nothing answered",
             "no url on the row"]
    out.sort(key=lambda r: (order.index(r["policy"]) if r["policy"] in order else 9,
                            r.get("name") or ""))
    dec = {r.get("id") for r in
           json.load(open("data/_declined.json", encoding="utf-8"))["declined"]}
    for r in out:
        if r.get("id") in dec:
            r["alreadyDeclined"] = True
    doc = {
        "note": ("Whether each provider would serve an identified crawler. Three "
                 "things are read, not one: its robots.txt, the ANSWER its front "
                 "page gives — a 200 carrying «Verifying your browser» or "
                 "«Přístup zablokován» is a refusal — and, where a firewall is "
                 "what refused, whether the institution publishes somewhere else. "
                 "A provider that NAMES this crawler is not probed for a side "
                 "entrance; being told no by name is the end of it."),
        "userAgent": UA,
        "checked": time.strftime("%Y-%m-%d"),
        "access": want,
        "counts": {k: sum(1 for r in out if r["policy"] == k) for k in order},
        "namesThisCrawler": sum(1 for r in out if r.get("namesThisCrawler")),
        "refusedButAnotherDoorAnswers": sum(1 for r in out if r.get("doors")),
        "listedButAlreadyDeclined": sum(1 for r in out if r.get("alreadyDeclined")),
        "providers": out,
    }
    path = "data/_crawl-policy.json"
    json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n-> {path}")
    for k in order:
        if doc["counts"][k]:
            print(f"  {k:<28} {doc['counts'][k]:>4}")
    print(f"\n  names this crawler by name      : {doc['namesThisCrawler']}")
    print(f"  refused, but another door answers: {doc['refusedButAnotherDoorAnswers']}")


if __name__ == "__main__":
    main()
