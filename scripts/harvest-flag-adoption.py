#!/usr/bin/env python3
"""When was each country's CURRENT flag adopted, according to two sources that are not us?

WHY. The audit found no flag era with a source. The present-day era of every country page
is the easiest to check and the one most readers look at: its start should be the date the
flag was adopted, and two reference sources state that date in plain text.

THE TWO SOURCES, both open and both read as published text:
  - Flags of the World (crwflags.com/fotw/flags/<iso>.html), the page's own «adopted …» line.
  - Wikipedia's «Flag of …» infobox field `Adoption`, read from the wikitext through the API.
The Wikipedia page is found through Wikidata's «flag» statement (P163) for the country, so
no title is guessed.

WHAT THIS DOES NOT DO. It does not decide anything. It records, per country, what each source
says and where, with the sentence it came from, and scripts/build-flag-evidence.py compares
those years with the year our page gives. Nothing is inferred when a source is silent.

    python3 scripts/harvest-flag-adoption.py          # all countries, ~10 minutes, polite
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/flag-adoption.json"
UA = ("RecordAtlasHarvest/1.0 (+https://github.com/daviddef/TheMap; "
      "open-source genealogy index, non-commercial)")
YEAR = re.compile(r"\b(1[0-9]{3}|20[0-2][0-9])\b")


def get(url, tries=2):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                return None
            time.sleep(3)


def sparql(q):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
    with urllib.request.urlopen(req, timeout=240) as r:
        return json.loads(r.read().decode())["results"]["bindings"]


def wiki_titles(ccs):
    vals = " ".join(f'"{c}"' for c in ccs)
    rows = sparql(f"""SELECT ?cc ?title WHERE {{
      VALUES ?cc {{ {vals} }}
      ?c wdt:P297 ?cc ; wdt:P163 ?f .
      ?s schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . }}""")
    out = {}
    for r in rows:
        out.setdefault(r["cc"]["value"], r["title"]["value"])
    return out


def fotw(cc):
    url = f"https://www.crwflags.com/fotw/flags/{cc.lower()}.html"
    raw = get(url)
    if not raw:
        return {"url": url, "found": False}
    text = html.unescape(re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", raw))
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
    lines = [l for l in lines if l]
    hit = []
    for l in lines[:140]:
        if re.search(r"\badopt", l, re.I) and YEAR.search(l):
            hit.append(l[:260])
        if len(hit) >= 4:
            break
    return {"url": url, "found": True, "lines": hit}


def wikipedia(title):
    url = ("https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&redirects=1&page="
           + urllib.parse.quote(title.replace(" ", "_")))
    raw = get(url)
    page = "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
    if not raw:
        return {"url": page, "found": False}
    try:
        wt = json.loads(raw)["parse"]["wikitext"]["*"]
    except Exception:
        return {"url": page, "found": False}
    fields = []
    for m in re.finditer(r"^\|\s*(Adoption\d*|adoption\d*)\s*=\s*(.*)$", wt[:12000], re.M):
        v = re.sub(r"<ref.*?(</ref>|/>)", "", m.group(2), flags=re.S).strip()
        if v:
            fields.append({"field": m.group(1), "value": v[:200]})
    return {"url": page, "found": True, "fields": fields[:4], "title": title}


def main():
    fm = json.load(open("site/public/flag-map.json"))["slug"]
    ccs = sorted(set(fm.values()))
    try:
        old = json.load(open(OUT))
    except Exception:
        old = {}
    got = old.get("countries", {})
    titles = wiki_titles(ccs)
    time.sleep(3)
    todo = [c for c in ccs if c not in got]
    print(f"{len(ccs)} countries, {len(titles)} Wikipedia flag pages found, {len(todo)} to fetch", flush=True)
    for i, cc in enumerate(todo, 1):
        rec = {"fotw": fotw(cc)}
        time.sleep(1.2)
        t = titles.get(cc)
        rec["wikipedia"] = wikipedia(t) if t else {"found": False, "why": "Wikidata names no English Wikipedia flag page"}
        time.sleep(1.2)
        got[cc] = rec
        if i % 20 == 0:
            print(i, cc, flush=True)
            json.dump({"countries": got}, open(OUT, "w"), ensure_ascii=False)
    doc = {
        "note": "What two sources say about when each country's current flag was adopted, with the sentence or field they said it in. Recorded, not judged: scripts/build-flag-evidence.py does the comparing.",
        "sources": "Flags of the World (crwflags.com) page text; English Wikipedia infobox `Adoption` field via the MediaWiki API (CC BY-SA 4.0)",
        "harvested": time.strftime("%Y-%m-%d"),
        "generatedBy": "scripts/harvest-flag-adoption.py",
        "countries": dict(sorted(got.items())),
    }
    json.dump(doc, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("wrote", OUT, len(got))


if __name__ == "__main__":
    main()
