#!/usr/bin/env python3
"""summarise.py CLONE [family ...]: out/<family>.raw.json -> CLONE/data/name-bearers.json (merge, keyed by family).
Published rule for the examples (it is on the page): the earliest bearer recorded in at least three Wikipedia editions, then
for each century from the 15th the bearer recorded in the most editions, at most six, in order of birth."""
import collections, datetime, json, os, sys
from wd import sparql, v
HERE = os.path.dirname(os.path.abspath(__file__))
clone = sys.argv[1]; fams = sys.argv[2:] or [f[:-9] for f in sorted(os.listdir(HERE + "/out")) if f.endswith(".raw.json")]
M = json.load(open(HERE + "/map.json")); today = datetime.date.today().isoformat()
path = clone + "/data/name-bearers.json"
try: out = json.load(open(path, encoding="utf-8"))
except Exception: out = {"note": "", "names": {}}
out["note"] = ("Who carried a given name, from Wikidata (CC0). Only people with a death date, or born in 1880 or earlier. Facts only: a name, "
               "the years, the occupation and the state, and a link to the Wikidata item. No text about a person and nobody living.")
out["source"] = "Wikidata"; out["licence"] = "CC0 1.0"
import unicodedata, re
def fold(x):
    x = unicodedata.normalize("NFKD", str(x).lower())
    return re.sub(r"[^\w]+", " ", "".join(c for c in x if not unicodedata.combining(c))).strip()
def cent(y): return (y - 1) // 100 + 1 if y is not None and y > 0 else None
for fid in fams:
    raw = json.load(open(f"{HERE}/out/{fid}.raw.json")); m = M[fid]
    ctot = collections.Counter(); [ctot.update({c: n}) for c, n in raw["ctot"] if c is not None]
    states = collections.defaultdict(collections.Counter)
    for c, st, n in raw["agg"]:
        if c is not None and st: states[c][st] += n
    strip = []
    for c in sorted(ctot):
        strip.append({"c": c, "n": ctot[c], "where": [[s, n] for s, n in states[c].most_common(3)]})
    # a century with one or two people carries no pattern; keep the rows, the page shows them quietly
    # an example is shown under the name only if its own Wikidata label carries that name: no regnal names (Leo X under Giovanni),
    # no middle names (a composer under Maria), no label that shows a different form
    cands = [x for x in raw["cands"] if x["born"] is not None and x["links"] >= 3 and fold(m["form"]) in fold(x["label"]).split()]
    pick = []
    early = sorted(cands, key=lambda x: x["born"])
    if early: pick.append(("earliest", early[0]))
    for c in range(15, 22):
        inc = [x for x in cands if cent(x["born"]) == c and x["qid"] not in [p[1]["qid"] for p in pick]]
        if inc: pick.append((f"most editions, century {c}", max(inc, key=lambda x: x["links"])))
    pick = sorted(pick, key=lambda p: p[1]["born"])[:6]
    det = {}
    if pick:
        vals = " ".join("wd:" + p[1]["qid"] for p in pick)
        for x in sparql('''SELECT ?p ?ol ?cl WHERE { VALUES ?p { %s } OPTIONAL { ?p wdt:P106 ?o . ?o rdfs:label ?ol FILTER(lang(?ol)="en") }
              OPTIONAL { ?p wdt:P27 ?co . ?co rdfs:label ?cl FILTER(lang(?cl)="en") } }''' % vals):
            e = det.setdefault(v(x, "p").split("/")[-1], {"o": [], "c": []})
            if v(x, "ol") and v(x, "ol") not in e["o"]: e["o"].append(v(x, "ol"))
            if v(x, "cl") and v(x, "cl") not in e["c"]: e["c"].append(v(x, "cl"))
    ex = [{"qid": p[1]["qid"], "name": p[1]["label"], "born": p[1]["born"], "died": p[1]["died"], "why": p[0],
           "occupation": det.get(p[1]["qid"], {}).get("o", [])[:2], "state": det.get(p[1]["qid"], {}).get("c", [])[:2]} for p in pick]
    out["names"][fid] = {"form": m["form"], "scope": m["scope"], "items": m["items"], "asOf": today, "total": raw["total"],
                         "strip": strip, "occupations": [[a, b] for a, b in raw["occ"][:8]], "examples": ex}
    print(fid, raw["total"], len(strip), len(ex))
json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1); open(path, "a").write("\n")
