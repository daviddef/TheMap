#!/usr/bin/env python3
"""Harvest, per mapped name, the aggregate facts and a few exemplars from Wikidata (CC0).
Included: a person with a death date, or born in 1880 or earlier (nobody born then is alive). No living person.
    harvest.py [family ...]   -> out/<family>.json"""
import collections, datetime, json, os, sys
from wd import sparql, v
HERE = os.path.dirname(os.path.abspath(__file__)); os.makedirs(HERE + "/out", exist_ok=True)
M = json.load(open(HERE + "/map.json"))
BASE = '''?p wdt:P735 wd:%s . ?p wdt:P21 wd:SEXQ .
  OPTIONAL { ?p wdt:P569 ?b } OPTIONAL { ?p wdt:P570 ?d }
  FILTER(BOUND(?d) || (BOUND(?b) && YEAR(?b) <= 1880))
  FILTER NOT EXISTS { ?p wdt:P31 ?nothuman FILTER(?nothuman != wd:Q5) } ?p wdt:P31 wd:Q5 .'''
import re
def yr(x):
    d = v(x, 'b') if False else x
    m = re.match(r'^(-?\d{1,6})-', d or '')
    return int(m.group(1)) if m else None
def cent(y): return (y - 1) // 100 + 1 if y > 0 else None
def run(fid):
    m = M[fid]; SEX = 'Q6581072' if m['scope'].startswith('women') else 'Q6581097'
    B = BASE.replace('SEXQ', SEX); ctot = collections.Counter(); agg = collections.Counter(); occ = collections.Counter(); total = 0; cands = {}
    for q in m["items"]:
        # aggregate by century of birth (death where birth is missing) and state; people with two states count in both
        r = sparql('''SELECT ?cent ?cl (COUNT(DISTINCT ?p) AS ?c) WHERE { %s
          BIND(COALESCE(?b, ?d) AS ?x) BIND(FLOOR((YEAR(?x)-1)/100)+1 AS ?cent)
          OPTIONAL { ?p wdt:P27 ?co . ?co rdfs:label ?cl FILTER(lang(?cl)="en") } } GROUP BY ?cent ?cl''' % (B % q))
        for x in r:
            c = int(float(v(x, "cent"))) if v(x, "cent") else None
            agg[(c, v(x, "cl") or "")] += int(v(x, "c"))
        ct = sparql('''SELECT ?cent (COUNT(DISTINCT ?p) AS ?c) WHERE { %s BIND(COALESCE(?b, ?d) AS ?x) BIND(FLOOR((YEAR(?x)-1)/100)+1 AS ?cent) } GROUP BY ?cent''' % (B % q))
        for x in ct: ctot[int(float(v(x, "cent"))) if v(x, "cent") else None] += int(v(x, "c"))
        t = sparql('SELECT (COUNT(DISTINCT ?p) AS ?c) WHERE { %s }' % (B % q))
        total += int(v(t[0], "c"))
        o = sparql('''SELECT ?ol (COUNT(DISTINCT ?p) AS ?c) WHERE { %s ?p wdt:P106 ?oc . ?oc rdfs:label ?ol FILTER(lang(?ol)="en") }
          GROUP BY ?ol ORDER BY DESC(?c) LIMIT 40''' % (B % q))
        for x in o: occ[v(x, "ol")] += int(v(x, "c"))
        pe = sparql('''SELECT ?p ?pl ?b ?d ?sl WHERE { %s ?p wikibase:sitelinks ?sl . ?p rdfs:label ?pl FILTER(lang(?pl)="en") }
          ORDER BY DESC(?sl) LIMIT 400''' % (B % q))
        for x in pe:
            qid = v(x, "p").split("/")[-1]
            cands[qid] = {"qid": qid, "label": v(x, "pl"), "born": yr(v(x, "b")),
                          "died": yr(v(x, "d")), "links": int(v(x, "sl"))}
        ee = sparql('''SELECT ?p ?pl ?b ?d ?sl WHERE { %s ?p wikibase:sitelinks ?sl FILTER(?sl >= 3) ?p rdfs:label ?pl FILTER(lang(?pl)="en") FILTER(BOUND(?b))}
          ORDER BY ?b LIMIT 12''' % (B % q))
        for x in ee:
            qid = v(x, "p").split("/")[-1]
            cands.setdefault(qid, {"qid": qid, "label": v(x, "pl"), "born": yr(v(x, "b")),
                          "died": yr(v(x, "d")), "links": int(v(x, "sl"))})
    json.dump({"ctot": [[k, n] for k, n in ctot.items()], "agg": [[k[0], k[1], n] for k, n in agg.items()], "occ": occ.most_common(40), "total": total, "cands": list(cands.values())}, open(f"{HERE}/out/{fid}.raw.json", "w"))
    print(fid, "total", total, "cands", len(cands), flush=True)
for f in (sys.argv[1:] or M): 
    try: run(f)
    except Exception as e: print(f, "FAILED", e, flush=True)
