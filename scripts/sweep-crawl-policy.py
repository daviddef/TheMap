#!/usr/bin/env python3
"""Which of the free providers will actually let this atlas read them?

WHY THIS EXISTS. Row 76 says the map is two colours because the survey is
unfinished. It is not: 314 of 559 providers are classed `free` and the map
shows `free` on three dots. A place takes its colour from the collections on
it or from a coverage claim that names its own ground, and every one of the
3,504 claims in this atlas is FamilySearch's. So the work is coverage claims.

And then the first five free providers tried, by how many drawn places their
countries hold, came back: NLI behind a Cloudflare challenge, IrishGenealogy
403, Hungaricana 403, Matricula naming ClaudeBot in robots.txt with
`Disallow: /`, and only FIBIS open. Four of five shut. That is either terrible
luck or the shape of the problem, and guessing which is exactly what this
project does not do.

WHAT IT DOES. For each free provider: read robots.txt, and ONLY THEN, if
robots permits it, ask for the provider's own URL. Nothing else is fetched,
nothing is crawled, and a site that says no is recorded as having said no.
The user agent names this atlas and carries a contact URL, because a source
has a right to know who is asking.

A `Disallow: /` aimed at ClaudeBot, GPTBot, CCBot and their like is treated as
refusal. This session is Claude. Reading such a site under a different name
would be spoofing around a gate, which is the one thing this project will not
do — see data/_declined.json, which already holds Matricula for exactly that.

THE RESULT IS A FACT, NOT A PLAN. It says who would serve us, not who should
be harvested; what each one actually holds, and at what granularity, is a
separate question asked one provider at a time.
"""
import json, os, re, sys, time
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

UA = ("RecordAtlasBot/1.0 (+https://recordatlas.org; "
      "a genealogy atlas checking whether it may read this source)")
AI_BOTS = {"claudebot", "gptbot", "ccbot", "google-extended", "anthropic-ai",
           "applebot-extended", "bytespider", "amazonbot", "meta-externalagent",
           "perplexitybot", "omgili", "facebookbot", "diffbot", "cohere-ai"}
TIMEOUT = 20


def get(url):
    """(status, text) — never raises. 0 means nothing answered at all."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept": "*/*", "Accept-Language": "en"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read(200_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read(200_000).decode("utf-8", "replace")
        except Exception:                                    # noqa: BLE001
            body = ""
        return e.code, body
    except Exception as e:                                   # noqa: BLE001
        return 0, str(e)[:200]


def groups(txt):
    """robots.txt as {frozenset(agents): [disallow, ...]}, lowercased.

    A block is one or more User-agent lines followed by its rules, which is
    how the file is actually written and how Matricula names eight AI crawlers
    in one breath before a single `Disallow: /`.
    """
    out, agents, rules, fresh = {}, set(), [], True
    for raw in txt.splitlines():
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


def verdict(p):
    url = (p.get("url") or "").strip()
    if not url.startswith("http"):
        return dict(id=p.get("id"), name=p.get("name"), url=url,
                    policy="no url on the row")
    s = urlsplit(url)
    root = f"{s.scheme}://{s.netloc}"
    rc, rtxt = get(root + "/robots.txt")
    row = dict(id=p.get("id"), name=p.get("name"), url=url,
               countries=p.get("countries") or [], robotsStatus=rc)

    if rc == 0:
        row["policy"] = "nothing answered"
        row["detail"] = rtxt[:120]
        return row
    challenged = ("just a moment" in rtxt.lower()
                  or "challenge-platform" in rtxt.lower())
    if challenged:
        row["policy"] = "bot gate"
        row["detail"] = "a challenge page is served even for robots.txt"
        return row
    if rc in (401, 403):
        row["policy"] = "refused"
        row["detail"] = f"robots.txt itself answers {rc}"
        return row

    g = groups(rtxt) if rc == 200 else {}
    named = sorted({a for ags, rules in g.items() for a in ags
                    if a in AI_BOTS and "/" in rules})
    if named:
        row["policy"] = "robots forbids AI crawlers"
        row["detail"] = "named: " + ", ".join(named[:6])
        return row
    star = next((rules for ags, rules in g.items() if "*" in ags), None)
    if star is not None and "/" in star:
        row["policy"] = "robots forbids everyone"
        return row

    # Only now is it polite to ask for the page itself.
    time.sleep(1)
    hc, htxt = get(url)
    row["pageStatus"] = hc
    low = htxt.lower()
    if "just a moment" in low or "challenge-platform" in low:
        row["policy"] = "bot gate"
        row["detail"] = "robots.txt is open; the page serves a challenge"
    elif hc == 200:
        row["policy"] = "open"
    elif hc == 0:
        row["policy"] = "nothing answered"
        row["detail"] = htxt[:120]
    else:
        row["policy"] = "refused"
        row["detail"] = f"the page answers {hc}"
    return row


def main():
    want = sys.argv[1] if len(sys.argv) > 1 else "free"
    prov = json.load(open("data/providers.json", encoding="utf-8"))["providers"]
    rows = [p for p in prov if (p.get("access") or "") == want]
    print(f"{len(rows)} providers classed «{want}» — reading each one's robots.txt first",
          flush=True)
    out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(verdict, rows), 1):
            out.append(r)
            if i % 25 == 0:
                print(f"  {i}/{len(rows)}", flush=True)
    order = ["open", "bot gate", "robots forbids AI crawlers",
             "robots forbids everyone", "refused", "nothing answered",
             "no url on the row"]
    out.sort(key=lambda r: (order.index(r["policy"]) if r["policy"] in order else 9,
                            r.get("name") or ""))
    doc = {
        "note": ("Whether each provider would serve an identified crawler, read "
                 "from its own robots.txt and — only where robots permitted it — "
                 "one request to its front page. Nothing was crawled. This says "
                 "who would let us read them, not who should be read: what a "
                 "provider holds, and whether it names ground finely enough to "
                 "colour a dot, is a separate question per provider."),
        "userAgent": UA,
        "checked": time.strftime("%Y-%m-%d"),
        "access": want,
        "counts": {k: sum(1 for r in out if r["policy"] == k) for k in order},
        "providers": out,
    }
    path = "data/_crawl-policy.json"
    json.dump(doc, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\n-> {path}")
    for k in order:
        n = doc["counts"][k]
        if n:
            print(f"  {k:<28} {n:>4}")


if __name__ == "__main__":
    main()
