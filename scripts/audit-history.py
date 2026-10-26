#!/usr/bin/env python3
"""Where does every movement tag on every flag page end up?  python3 scripts/audit-history.py [--list]

A conquest or migration written on a flag page can fall out of the History map at four doors: the tag has no
«Verb: who» form, the verb is not one the extractor knows, the page is not a country the map can anchor, or no year can
be read from it. The Venetian conquest of Dalmatia fell through a fifth, quieter one — it was DRAWN, but as a stub at
the country's label point with no arrow from Venice — so this also counts how each drawn movement was placed.

Every tag is put in exactly one of: drawn (with how it is placed), excluded by design (before 600 CE, or a verb that names
no movement — contact, trade network, cultural diffusion), or MISSING. MISSING must be empty; check-data.py runs this.
"""
import json, os, re, sys, collections

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ERAS = "data/flag-eras.json"

# verbs that describe a relationship or a cause, not people or armies moving; they are excluded on purpose
NOT_A_MOVEMENT = re.compile(r"contact|trade|diffusion|replacement|alliance|attested|burial|formation|fragmentation|weakened|"
                            r"absorbed population|migration corridor|displacement|expansion|granted to|abandoned|collapse|"
                            r"ceremonial|fragmented|raids? on|voyage|lapita|bantu expansion|conflict|orbit|allied|documented|later arrivals|"
                            r"attempted migration|contested|marriage", re.I)


def classify():
    src = open("scripts/derive-era-moves.py", encoding="utf-8").read()
    ns = {}
    exec(re.search(r"VERB\s*=\s*\{.*?\n\}", src, re.S).group(0), ns)
    exec(re.search(r"VERB_X\s*=\s*\{.*?\n\}", src, re.S).group(0), ns)
    exec(re.search(r"PAGE_AT\s*=\s*\{.*?\n\}", src, re.S).group(0), ns)
    VERB, VERB_X, PAGE_AT = ns["VERB"], ns["VERB_X"], ns["PAGE_AT"]
    eras = json.load(open(ERAS, encoding="utf-8"))["eras"]
    em = json.load(open("site/public/era-moves.json", encoding="utf-8"))
    hist = json.load(open("site/public/history.json", encoding="utf-8"))
    slug2cc = json.load(open("site/public/flag-map.json", encoding="utf-8"))["slug"]
    drawn = {(m["p"], m["e"], m["ot"]): m for m in hist["moves"]}
    parsed = {(m["p"], m["e"], m["ot"]) for m in em["moves"]}
    out = collections.defaultdict(list)
    for e in eras:
        for t in e.get("tags") or []:
            if t.get("row") != "migro-row":
                continue
            txt = (t.get("t") or "").strip()
            m = re.match(r"^([^:]{3,40}):\s*(.+)$", txt)
            who = (e["slug"], e.get("id"), txt[:80])
            if not m:
                yrs0 = [int(x) for x in re.findall(r"(?<![\d,])(\d{3,4})(?![\d,])", txt)]
                old_ = re.search(r"BCE|\bBC\b|years ago|\bya\b", txt) or (bool(yrs0) and max(yrs0) < 600)
                out["excluded: before 600 CE" if old_ else
                    "excluded: no verb form (a sentence, not a movement)" if NOT_A_MOVEMENT.search(txt) or not re.search(r"\d", txt)
                    else "MISSING: no verb form"].append(who)
                continue
            v = m.group(1).strip().lower()
            if v not in VERB and v not in VERB_X:
                out["excluded: verb names no movement" if NOT_A_MOVEMENT.search(v) else "MISSING: unknown verb " + v].append(who)
                continue
            if e["slug"] not in slug2cc and e["slug"] not in PAGE_AT:
                out["MISSING: page has no country or seat"].append(who)
                continue
            key = (e["slug"], e.get("id"), re.sub(r"\s+", " ", m.group(2).strip())[:120])
            if key not in parsed:
                bce = re.search(r"BCE|\bBC\b|\bya\b|years ago", txt) or (e.get("from") is None and not re.search(r"\d{3,4}|\d+(st|nd|rd|th) c", txt))
                yrs = [int(x) for x in re.findall(r"(?<![\d,])(\d{3,4})(?![\d,])", txt)]
                early = (bool(yrs) and max(yrs) < 600) or bool(re.search(r"\b[1-6](st|nd|rd|th) c\b|mid-[1-6](st|nd|rd|th)", txt)) or \
                    (e.get("from") is not None and e["from"] < 600 and not yrs)
                out["excluded: before 600 CE" if bce or early else "MISSING: no year could be read"].append(who)
                continue
            h = drawn.get(key)
            if not h:
                out["excluded: before 600 CE"].append(who)
                continue
            out["drawn: arrow between two countries" if h["how"] == "country" else
                "drawn: arrow to a country read from the sentence" if h["how"] == "text" else
                "drawn: arrow from a seat or a people's country" if h["how"] in ("seat", "origin") else
                "drawn: stub (no second end: " + ("lands on named places)" if h.get("pl") else "country label point only)")].append(who)
    return out


def main():
    out = classify()
    total = sum(len(v) for v in out.values())
    print(f"audit: {total} movement tags on the flag pages")
    for k in sorted(out, key=lambda k: (not k.startswith("drawn"), k)):
        print(f"  {len(out[k]):5d}  {k}")
        if "--list" in sys.argv and not k.startswith("drawn"):
            for w in out[k][:40]:
                print("         ", w)
    missing = sum(len(v) for k, v in out.items() if k.startswith("MISSING"))
    return missing


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
