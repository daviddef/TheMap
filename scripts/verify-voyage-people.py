#!/usr/bin/env python3
"""Check every voyage's leader, companions and sponsoring ruler against Wikidata (CC0).

The researchers named a leader and a sponsor with Wikidata ids "seen on the page". An id is a
claim: this script fetches each one and records what Wikidata says about the person, so a wrong id
(da Gama was first given as Q7313; it is Q7328) or an impossible one cannot sit in the data:
  - `verified`: the label Wikidata holds, birth and death years, and whether the person was alive
    when the voyage began;
  - for the sponsoring ruler, whether Wikidata carries a `position held` statement whose dates
    cover the year the voyage left (the office and its dates are recorded), else only whether the
    ruler was alive (stated as such, not as a reign).
It never changes a name or an id; it writes `verified` blocks and prints every mismatch. Hand-run.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "voyages.json")
API = "https://www.wikidata.org/w/api.php"
UA = "RecordAtlas/1.0 (https://recordatlas.org; david.defranceski@gmail.com)"


def get(params):
    url = API + "?" + urllib.parse.urlencode(params | {"format": "json", "origin": "*"})
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60))
        except Exception:
            time.sleep(3 * (i + 1))
    return {}


def yr(claim):
    """The year of a statement's value or of a qualifier snak (qualifiers have no `mainsnak`)."""
    try:
        snak = claim.get("mainsnak") or claim
        t = snak["datavalue"]["value"]["time"]
        return int(t[:5].replace("+", "")) if t[0] == "+" else -int(t[1:5])
    except Exception:
        return None


def fetch(ids):
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 40):
        ents = get({"action": "wbgetentities", "ids": "|".join(ids[i:i + 40]), "props": "claims|labels", "languages": "en"}).get("entities", {})
        out.update(ents)
        time.sleep(0.5)
    return out


def info(e, year):
    cl = e.get("claims") or {}
    b = yr(cl["P569"][0]) if cl.get("P569") else None
    d = yr(cl["P570"][0]) if cl.get("P570") else None
    alive = None if b is None else (b <= year and (d is None or year <= d + 1))
    reigns = []
    for s in cl.get("P39", []):
        q = s.get("qualifiers", {})
        a = yr(q["P580"][0]) if q.get("P580") else None
        z = yr(q["P582"][0]) if q.get("P582") else None
        if a is not None and a <= year and (z is None or year <= z):
            off = s["mainsnak"].get("datavalue", {}).get("value", {}).get("id")
            reigns.append({"office": off, "from": a, "to": z})
    return {"label": (e.get("labels") or {}).get("en", {}).get("value"), "born": b, "died": d, "aliveAtStart": alive, "termsCovering": reigns}


def norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


def main():
    doc = json.load(open(P, encoding="utf-8"))
    ids = []
    for v in doc["voyages"]:
        for p in [v["leader"]] + (v.get("others") or []):
            if p.get("q"):
                ids.append(p["q"])
        sp = v.get("sponsor") or {}
        if sp.get("ruler_q"):
            ids.append(sp["ruler_q"])
        if sp.get("ruler_q_also"):
            ids.append(sp["ruler_q_also"])
    ents = fetch(ids)
    bad = []
    for v in doc["voyages"]:
        y = int(v["from"])
        for p in [v["leader"]] + (v.get("others") or []):
            q = p.get("q")
            if not q:
                continue
            i = info(ents.get(q, {}), y)
            p["verified"] = {k: i[k] for k in ("label", "born", "died", "aliveAtStart")} | {"source": "Wikidata"}
            if not i["label"]:
                bad.append((v["id"], p["name"], q, "no such item"))
            elif i["aliveAtStart"] is False:
                bad.append((v["id"], p["name"], q, f"not alive in {y}: {i['born']}-{i['died']}"))
            elif norm(p["name"]).split("de")[-1][:5] not in norm(i["label"]) and norm(i["label"])[:5] not in norm(p["name"]):
                bad.append((v["id"], p["name"], q, f"label is {i['label']!r}"))
        sp = v.get("sponsor") or {}
        for key in ("ruler_q", "ruler_q_also"):
            q = sp.get(key)
            if not q:
                continue
            i = info(ents.get(q, {}), y)
            sp.setdefault("verified", {})[q] = {"label": i["label"], "born": i["born"], "died": i["died"],
                                                 "aliveAtStart": i["aliveAtStart"], "termCoveringStart": bool(i["termsCovering"]),
                                                 "terms": i["termsCovering"], "source": "Wikidata"}
            if not i["label"]:
                bad.append((v["id"], "sponsor ruler", q, "no such item"))
            elif i["aliveAtStart"] is False:
                bad.append((v["id"], sp.get("ruler"), q, f"not alive in {y}: {i['born']}-{i['died']}"))
    json.dump(doc, open(P, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(bad, open("/tmp/flagwork/voyage-people-report.json", "w"), indent=1, ensure_ascii=False)
    print(len(bad), "mismatches")
    for b in bad:
        print("  ", *b)


if __name__ == "__main__":
    main()
