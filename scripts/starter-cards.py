#!/usr/bin/env python3
"""STARTER CARDS FOR COUNTRIES THAT HAVE NO SOURCE AT ALL.

Click a place in Niger or Tajikistan and the Atlas has nothing to point at. data/world-archives.json (Wikidata's national archives and libraries) and
data/archives-wikidata.json (every archive Wikidata knows) do know an institution for some of them. This turns the best one per source-less country into a
providers.json row, ONLY where a page was actually opened today and said so:

  - the page answers 200, robots.txt does not forbid this crawler, and it is not a bot gate / parked domain / error page;
  - its <title> (the evidence) is written into the row's triageNote.

The row is `unsurveyed` and triage `unverified`: it says WHERE the institution is, never what it holds or what it costs. A country where nothing opens goes to
data/_starter-gaps.json with what was tried; a silent or dead page is NOT a finding about the institution and is never written as one.

    python3 scripts/starter-cards.py            # dry run: say what would be added
    python3 scripts/starter-cards.py --write    # add the rows to data/providers.json, record the rest in data/_starter-gaps.json
"""
import collections, datetime, json, os, re, sys, time, urllib.request, urllib.robotparser, urllib.parse, ssl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
UA = "RecordAtlasBot/1.0 (+https://recordatlas.org; a genealogy atlas checking whether it may read this source)"
TODAY = datetime.date.today().isoformat()
BLOCK = re.compile(r"verifying your browser|just a moment|attention required|access denied|captcha|are you a robot|this domain (?:is|may be) for sale|domain parked|buy this domain|403 forbidden|account suspended|index of /|default web site|it works!", re.I)


def load(p):
    return json.load(open(p, encoding="utf-8"))


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", re.sub(r"[̀-ͯ]", "", __import__("unicodedata").normalize("NFKD", s.lower()))).strip("-")
    return s[:60]


def fetch(url):
    """(status, title, why) — one polite GET after reading robots.txt."""
    u = urllib.parse.urlparse(url)
    ctx = ssl.create_default_context()
    try:
        rp = urllib.robotparser.RobotFileParser()
        req = urllib.request.Request(f"{u.scheme}://{u.netloc}/robots.txt", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
            body = r.read(200000).decode("utf-8", "replace")
        rp.parse(body.splitlines())
        if not rp.can_fetch(UA, url) or not rp.can_fetch("RecordAtlasBot", url):
            return None, "", "robots.txt does not allow this crawler"
    except Exception:
        pass   # no robots.txt (or none we could read) is not a prohibition
    time.sleep(1.0)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            raw = r.read(300000).decode("utf-8", "replace")
            status = r.status
            final = r.geturl()
    except Exception as e:
        return None, "", f"did not open: {type(e).__name__}"
    m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.S | re.I)
    title = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""
    if status != 200:
        return None, title, f"HTTP {status}"
    if BLOCK.search(title) or BLOCK.search(raw[:4000]):
        return None, title, "a bot gate, parked or error page"
    if len(raw) < 400:
        return None, title, "almost empty page"
    # The page must be the institution, not a redirect to something else or a hijacked domain: same site as listed, the title names an archive or a library
    # (in any of the languages these countries write), and nothing in the title or the head of the page is spam.
    def dom(h):
        h = h.lower().split(":")[0]
        return ".".join(h.split(".")[-2:]) if not re.search(r"\.(?:co|com|gov|org|ac|edu)\.\w\w$", h) else ".".join(h.split(".")[-3:])
    if dom(urllib.parse.urlparse(final).netloc) != dom(u.netloc):
        return None, title, f"the page moved to another site ({urllib.parse.urlparse(final).netloc})"
    if re.search(r"\b(?:slot|casino|gacor|togel|judi|poker|betting|porn|viagra|escort)\b", title + " " + raw[:6000], re.I):
        return None, title, "the domain now carries spam"
    if not re.search(r"archiv|arhiv|arquiv|arkiv|librar|biblio|библиот|архив|records|مكتبة|أرشيف|دار", title, re.I):
        return None, title, "the page title does not name an archive or a library"
    return final, title[:160], ""


def main():
    write = "--write" in sys.argv
    pr = load("data/providers.json")
    prov = pr["providers"]
    co = load("data/countries.json")["countries"]
    by = collections.Counter(cc for p in prov for cc in p.get("countries", []) if cc != "*")
    have = {p["id"] for p in prov}
    have_urls = {re.sub(r"^https?://(www\.)?", "", (p.get("url") or "")).rstrip("/").lower() for p in prov}
    none = [cc for cc in co if by[cc] == 0]
    cand = collections.defaultdict(list)
    for a in load("data/world-archives.json")["archives"]:
        if a.get("url") and a["cc"] in none:
            cand[a["cc"]].append(dict(q=a["wikidata"], name=a["name"], url=a["url"], kind=a.get("kind") or "national-archive", src="world-archives.json", at=None))
    for a in load("data/archives-wikidata.json")["archives"]:
        cc = a.get("cc")
        if cc in none and a.get("sites") and re.search(r"archiv|arquiv|arkiv|library|biblio|bibliot|records|record office", a["n"], re.I):
            kind = "national-library" if re.search(r"librar|biblio", a["n"], re.I) else "national-archive" if re.search(r"national|state|central|republic", a["n"], re.I) else "regional-archive"
            cand[cc].append(dict(q=a["q"], name=a["n"], url=a["sites"][0], kind=kind, src="archives-wikidata.json", at=(a.get("y"), a.get("x"))))
    rank = {"national-archive": 0, "regional-archive": 1, "national-library": 2}
    added, gaps = [], {}
    for cc in none:
        tried = []
        seen = set()
        for c in sorted(cand.get(cc, []), key=lambda c: (rank.get(c["kind"], 3), c["name"])):
            if c["url"] in seen or re.sub(r"^https?://(www\.)?", "", c["url"]).rstrip("/").lower() in have_urls:
                continue
            seen.add(c["url"])
            final, title, why = fetch(c["url"])
            if not final:
                tried.append(f"{c['name']} ({c['url']}): {why}")
                continue
            if not final.startswith("https://"):
                # The build refuses a provider whose url is not https, and a
                # card that stops every deploy is worse than no card.
                tried.append(f"{c['name']} ({final}): answers on http only")
                continue
            pid = slug(c["name"] + "-" + cc)
            if pid in have:
                pid += "-2"
            row = {"id": pid, "name": c["name"], "url": final, "kind": c["kind"], "access": "unsurveyed", "countries": [cc],
                   "what": f"{c['name']}, the institution Wikidata lists for {co[cc]['name']}. Its website opened on {TODAY} and its page title reads «{title}». Nothing is claimed here about what it holds, what it charges or whether it answers letters.",
                   "deepLink": None, "checked": TODAY, "at": ({"lat": c["at"][0], "lon": c["at"][1], "place": co[cc]["name"]} if c["at"] and c["at"][0] else None),
                   "wikidata": c["q"], "triage": "unverified",
                   "triageNote": f"Starter card for a country with no source (scripts/starter-cards.py, {TODAY}): listed in {c['src']}; the front page answered 200, robots.txt allowed it, and it was not a gate. Access class, holdings and contact still need a person."}
            added.append(row)
            have.add(pid)
            print(f"+ {cc} {c['name']} -> {final}  [{title}]")
            break
        else:
            gaps[cc] = {"name": co[cc]["name"], "tried": tried or ["no institution with a website in world-archives.json or archives-wikidata.json"], "when": TODAY}
            print(f"- {cc} {co[cc]['name']}: {tried[:2] or 'nothing listed'}")
    print(f"\n{len(added)} cards, {len(gaps)} countries still with none")
    if write:
        prov.extend(added)
        json.dump(pr, open("data/providers.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        open("data/providers.json", "a").write("\n")
        json.dump({"note": "Countries with no source at all that scripts/starter-cards.py could not give a card, with what was tried. A gap somebody can see is worth more than one they cannot; a page that did not open is not a finding about the institution.", "countries": gaps}, open("data/_starter-gaps.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        open("data/_starter-gaps.json", "a").write("\n")


if __name__ == "__main__":
    main()
