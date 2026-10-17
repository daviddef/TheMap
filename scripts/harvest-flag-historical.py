#!/usr/bin/env python3
"""For a historical flag era: is there a «Flag of …» article whose own dates match, and does Flags of the World agree?

WHY. scripts/harvest-flag-adoption.py settled the present-day flag of each country. The
historical eras are about 900 more, each a different polity, and there is no table to read.
What exists is an English Wikipedia article for many of the flags («Flag of the Congo Free
State»), whose infobox carries `Adoption` and `Relinquished`, and which often links the
Flags of the World page for the same flag.

THE TEST IS THE DATES, NOT THE NAME. A title can resemble a polity and be about something
else. So an article counts only when BOTH its adoption year and its relinquished year are
within one year of the era's own start and end. Two dates matching by accident is rare; a
name matching by accident is not.

THE SECOND SOURCE IS THE ARTICLE'S OWN LINK. Wikipedia and Flags of the World are two
publishers, so an era confirmed by both can be attested. The Flags of the World page is the
one the Wikipedia article links to, never one guessed, and it must contain both of the era's
years. Nothing is inferred when either is missing.

Records everything it looked at, matched or not, so a reviewer can see why an era was left
alone.

    python3 scripts/harvest-flag-historical.py
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/flag-historical.json"
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "open-source genealogy index, non-commercial)")
YEAR = re.compile(r"\b(1[0-9]{3}|20[0-2][0-9]|[1-9][0-9]{2})\b")
STOP = {"of", "the", "and", "a", "an", "in", "under", "state", "states", "empire", "kingdom", "republic",
        "republic", "democratic", "people", "peoples", "rule", "era", "colony", "province", "provinces"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(2):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(3)
    return None


def toks(s):
    s = re.sub(r"\(.*?\)", " ", s or "")
    return {t for t in re.findall(r"[a-z]{3,}", s.lower()) if t not in STOP}


def search(polity):
    q = "flag of " + re.sub(r"\(.*?\)", "", polity).split(",")[0].split("/")[0].strip()
    url = ("https://en.wikipedia.org/w/api.php?action=query&list=search&srnamespace=0&srlimit=6&format=json&srsearch="
           + urllib.parse.quote(q))
    raw = get(url)
    time.sleep(1.1)
    if not raw:
        return []
    try:
        return [h["title"] for h in json.loads(raw)["query"]["search"]]
    except Exception:
        return []


def article(title):
    url = ("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page="
           + urllib.parse.quote(title.replace(" ", "_")))
    raw = get(url)
    time.sleep(1.1)
    if not raw:
        return None
    try:
        wt = json.loads(raw)["parse"]["wikitext"]["*"]
    except Exception:
        return None
    head = wt[:14000]
    def field(name):
        m = re.search(r"^\|\s*" + name + r"\d?\s*=\s*(.*)$", head, re.M | re.I)
        if not m:
            return []
        v = re.sub(r"<ref.*?(</ref>|/>)", "", m.group(1), flags=re.S)
        return [int(y) for y in YEAR.findall(v)]
    fotw = sorted({u.rstrip(".,)") for u in re.findall(r"https?://(?:www\.)?crwflags\.com/fotw/flags/[A-Za-z0-9_\-./]+\.html", wt)})
    return {"title": title, "adoption": field("Adoption"), "relinquished": field("Relinquished"), "fotw": fotw[:3]}


KEY = re.compile(r"adopt|introduc|establish|proclaim|decree|law|created|first (?:used|flown)|officially|hoisted", re.I)


def fotw_check(url, y0, y1):
    """Does the page carry both years, and does the start year sit next to a word about adopting?"""
    raw = get(url)
    time.sleep(1.1)
    if not raw:
        return None
    text = html.unescape(re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", raw))
    text = re.sub(r"\s+", " ", text)
    has_to = re.search(rf"\b{y1}\b", text) is not None
    ctx = ""
    for m in re.finditer(rf"\b{y0}\b", text):
        c = text[max(0, m.start() - 110): m.end() + 110]
        if KEY.search(c):
            ctx = c.strip()
            break
    return {"has_from": re.search(rf"\b{y0}\b", text) is not None, "has_to": has_to,
            "from_in_adopting_sentence": bool(ctx), "ctx": ctx[:240]}


def near(ys, y):
    return any(abs(v - y) <= 1 for v in ys)


def main():
    ev = json.load(open("data/flag-evidence.json"))["pages"]
    eras = json.load(open("data/flag-eras.json"))["eras"]
    try:
        have = json.load(open(OUT)).get("eras", {})
    except Exception:
        have = {}
    todo = [e for e in eras if e.get("id") and e["id"] not in ev.get(e["slug"], {})
            and e.get("from") is not None and e.get("to") is not None and not e.get("present")
            and f"{e['slug']}|{e['id']}" not in have]
    print(len(todo), "eras to look at", flush=True)
    cache = {}
    for i, e in enumerate(todo, 1):
        key = f"{e['slug']}|{e['id']}"
        pol = toks(e["polity"])
        rec = {"polity": e["polity"], "from": e["from"], "to": e["to"], "tried": []}
        for t in search(e["polity"]):
            if not t.lower().startswith("flag of"):
                continue
            tt = toks(t)
            if pol and len(pol & tt) / len(pol) < 0.5 and len(pol & tt) / max(1, len(tt)) < 0.5:
                continue
            a = cache.get(t) or article(t)
            cache[t] = a
            if not a:
                continue
            ok = near(a["adoption"], e["from"]) and near(a["relinquished"], e["to"])
            rec["tried"].append({"title": t, "adoption": a["adoption"], "relinquished": a["relinquished"], "dates_match": ok})
            if ok:
                rec["match"] = {"title": t, "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(t.replace(" ", "_")),
                                "adoption": a["adoption"], "relinquished": a["relinquished"]}
                for u in a["fotw"]:
                    c = fotw_check(u, e["from"], e["to"])
                    if c:
                        rec.setdefault("fotw", []).append({"url": u, **c})
                break
        have[key] = rec
        if i % 25 == 0:
            print(i, key, flush=True)
            json.dump({"eras": have}, open(OUT, "w"), ensure_ascii=False)
    doc = {"note": "For each historical era with both dates: the Wikipedia «Flag of …» article whose infobox adoption and relinquished years both fall within a year of the era's, and the Flags of the World pages that article links. Everything looked at is kept, matched or not.",
           "harvested": time.strftime("%Y-%m-%d"), "generatedBy": "scripts/harvest-flag-historical.py", "eras": dict(sorted(have.items()))}
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, indent=1)
    n = sum(1 for v in have.values() if v.get("match"))
    f = sum(1 for v in have.values() if any(x["has_to"] and x["from_in_adopting_sentence"] for x in v.get("fotw", [])))
    print(f"wrote {OUT}: {len(have)} eras, {n} with a Wikipedia article whose dates match, {f} also confirmed by a linked FOTW page")


if __name__ == "__main__":
    main()
