#!/usr/bin/env python3
"""Build site/public/history.json for /history/: the movements, ready to draw.

era-moves.json says WHO moved and WHERE TO in the words a flag page used. This adds the
geometry the history map needs: for every movement an origin point and a destination
point, so the page can draw an arrow instead of a dashed stub. Where the other party is a
country the map draws, the points are the two countries' label anchors (as era-moves.json
already had it). Where it is an empire, a caliphate or a named people, data/history-actors.json
gives the seat it ruled from or the country it came from. Where neither fits, the movement
stays a stub and says so: `how` is "country", "seat", "origin" or "stub".

An arrow to a seat means «from there», never a route; the tooltip says which. Directions:
for a movement INTO a country the arrow runs from the other party to it; for one OUT of it
the other party is the destination, and only countries and explicit seats are used for
those, never a nationality (a Syrian refugee leaving Syria does not name where to).
"""
import json, os, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "public", "history.json")
VERSION = 1
MIN_YEAR = 600


def j(p):
    return json.load(open(os.path.join(ROOT, p), encoding="utf-8"))


YEAR = re.compile(r"(?<![\d/])(\d{3,4})(?:\s*[\u2013-]\s*(\d{2,4}))?s?(?!\d|th|st|nd|rd)")


def years_in(text, era_from):
    """The years a movement's OWN WORDS give, if any: «Irish Famine emigration (1845–52)» is 1845 to 1852,
    whatever year the era card it sits on begins. Returns (from, to, open_ended) or None.

    The era card's start was used before, which showed the Waldensians fleeing in 1416 because the
    Italy page's era began then. A year in the words is the page's own statement; the era's
    start is only a place to hang a movement that gave none, and the page says which it was."""
    for mt in YEAR.finditer(text):
        a = int(mt.group(1))
        if not (300 <= a <= 2030):
            continue
        b = mt.group(2)
        if b:
            b = int(b)
            if b < 100:
                b += (a // 100) * 100
            if b < a:
                b = None
        tail = text[mt.end():mt.end() + 3]
        openend = bool(re.match(r"\s*[\u2013-]\s*[),]", tail)) or "from " + mt.group(1) in text
        return a, (int(b) if b else None), openend
    return None


def build():
    em = j("site/public/era-moves.json")
    actors = j("data/history-actors.json")["actors"]
    chapters = j("data/history-chapters.json")["chapters"]
    at = em["at"]
    pats = [(re.compile(a["re"], re.I), a) for a in actors]
    vp = os.path.join(ROOT, "data", "voyages.json")
    voyages = json.load(open(vp, encoding="utf-8"))["voyages"] if os.path.exists(vp) else []
    out, how_n = [], {"country": 0, "seat": 0, "origin": 0, "stub": 0}
    dens = {}
    for m in em["moves"]:
        subj = at.get(m["s"])
        if not subj:
            continue
        t = m["t"] if m.get("t") is not None else (2026 if m.get("present") else m["f"])
        f = m["f"]
        fy = False
        opn = False
        yi = years_in(m["ot"], m["f"]) if m["f"] >= 0 else None
        if yi:
            f, yt, openend = yi
            fy = True
            t = yt if yt else f
            opn = openend and not yt
        a = b = None
        seat = None
        how = "stub"
        if m["o"] and at.get(m["o"]):
            other = at[m["o"]]
            how = "country"
            a, b = (other, subj) if m["d"] == "in" else (subj, other)
        else:
            for rx, ac in pats:
                if not rx.search(m["ot"]):
                    continue
                if "seat" in ac:
                    if ac.get("v") and m["v"] not in ac["v"]:
                        continue
                    if m["d"] != "in" and not ac["seat"].startswith("Auschwitz"):
                        continue
                    other = [ac["lat"], ac["lon"]]
                    seat = ac["seat"]
                    how = "seat"
                    a, b = (other, subj) if m["d"] == "in" else (subj, other)
                    break
                if "cc" in ac and m["d"] == "in" and ac["cc"] != m["s"] and at.get(ac["cc"]):
                    seat = ac["cc"]
                    how = "origin"
                    a, b = at[ac["cc"]], subj
                    break
        if how == "stub":
            a = b = subj
        how_n[how] += 1
        if f < MIN_YEAR:
            continue
        row = {"s": m["s"], "v": m["v"], "d": m["d"], "f": f, "t": t,
               "ot": m["ot"], "how": how, "a": a, "b": b, "e": m["e"], "p": m["p"], "fy": fy}
        if m.get("present") and not fy:
            row["present"] = True
        if opn:
            row["open"] = True
        if seat:
            row["seat"] = seat
        out.append(row)
        dec = (f // 10) * 10
        dens[dec] = dens.get(dec, 0) + 1
    return {
        "contract": {"name": "recordatlas-history", "version": VERSION},
        "note": ("The movements behind /history/, with an origin and destination point for each. "
                 "`how`: country = both ends are countries this atlas draws; seat = the other "
                 "party is an empire or people, drawn from the seat it ruled from; origin = a people "
                 "named by nationality, drawn from that country; stub = no second end, drawn as a "
                 "stub. Built by scripts/build-history.py from era-moves.json and data/history-actors.json."),
        "generated": time.strftime("%Y-%m-%d"),
        "minYear": MIN_YEAR,
        "counts": {"moves": len(out), **how_n, "voyages": len(voyages)},
        "chapters": chapters,
        "density": {str(k): v for k, v in sorted(dens.items())},
        "voyages": voyages,
        "moves": out,
    }


def main():
    d = build()
    s = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8").write(s)
    c = d["counts"]
    print(f"history.json   {len(s)/1024:8.1f} KB   {c['moves']} movements: {c['country']} country-to-country, "
          f"{c['seat']} to a seat, {c['origin']} from a named people's country, {c['stub']} stubs")


if __name__ == "__main__":
    main()
