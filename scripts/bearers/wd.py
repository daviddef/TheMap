import json, os, time, urllib.parse, urllib.request, hashlib
UA = "RecordAtlasBot/1.0 (https://recordatlas.org; name-page bearers, contact via site)"
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache"); os.makedirs(CACHE, exist_ok=True)
def sparql(q, tries=3):
    k = os.path.join(CACHE, hashlib.sha1(q.encode()).hexdigest() + ".json")
    if os.path.exists(k): return json.load(open(k))
    for i in range(tries):
        try:
            req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": q, "format": "json"}), headers={"User-Agent": UA, "Accept": "application/sparql-results+json"})
            r = json.load(urllib.request.urlopen(req, timeout=70))["results"]["bindings"]
            json.dump(r, open(k, "w")); time.sleep(1.2); return r
        except Exception as e:
            err = e; time.sleep(5 * (i + 1))
    raise RuntimeError(str(err))
def v(row, k): return row.get(k, {}).get("value")
