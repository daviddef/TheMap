#!/usr/bin/env python3
"""The volumes themselves, worldwide, from FamilySearch's open records API.

THE EARLIER NOTE IN import-fs-catalogue.py WAS WRONG AND THIS CORRECTS IT.
It said volume-level detail "cannot be harvested from here and that is not a
limitation of effort", because FamilySearch's CATALOGUE is behind a security
service that answers anything but a signed-in browser with 404 or a
challenge. That part is still true. But the catalogue is not the only door:

    https://api.familysearch.org/platform/records/collections/<id>/waypoints

answers 200 to an ordinary identified request, with no token and no browser,
and its waypoint tree descends exactly where a researcher needs to go:

    Collection            Spain, La Coruña, Municipal Records, 1648-1951
      City or Municipality  Betanzos
        Parish                Betanzos
          Record Type and Years   Alistamiento militar 1689-1805   <- a BOOK

That last level is the same thing the Defranceski archive holds for Croatia —
"Births (Rođeni) 1798-1858" with a link — and it is what this atlas has been
missing everywhere else. I had recorded the door as shut without trying this
one, which is the same mistake as declaring Scotland's parishes closed when
data.gov.uk had them all along.

POLITENESS. One request a second, single threaded, identified in the
User-Agent, backing off on 429 and 5xx. No browser impersonation: the API
answers us as what we are, so there is nothing to work around. api.family
search.org publishes no robots.txt and sends no rate-limit headers, so the
pace here is chosen to be obviously harmless rather than to be as fast as
permitted.

RESUMABLE, because this is days of work. Every collection finished is
recorded; --resume skips those and carries on. Interrupt it freely.

    python3 scripts/harvest-fs-waypoints.py --probe 10      # measure first
    python3 scripts/harvest-fs-waypoints.py --limit 200 --resume
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "data/fs-waypoints.json"
UA = "RecordAtlas/1.0 (+https://daviddef.github.io/TheMap; volume index)"
API = "https://api.familysearch.org/platform/records"
MAX_DEPTH = 6
# A GUARD, NOT A BUDGET. At 4,000 this silently truncated Croatia, Church
# Books — the browser walk of that same collection found 4,903 volumes, so
# the cap would have cut nine hundred books off the one collection whose
# right answer is known, and the validation would have "passed" by agreeing
# with a truncation. Set where a genuine runaway still stops but no real
# collection reaches.
MAX_NODES_PER_COLLECTION = 60000
# A BUDGET, SO ONE PATHOLOGICAL TREE CANNOT STALL THE RUN. Micronesia,
# Pohnpei, Land Records is a register of land parcels, and its tree branches
# like one: it had already spent 1,323 requests and eighteen minutes while
# 3,455 other collections waited behind it. Across 3,504 collections a few
# of these would decide when the job finishes.
#
# A capped collection is RECORDED as capped rather than quietly truncated,
# so it can be revisited deliberately instead of looking complete.
MAX_CALLS_PER_COLLECTION = 900


def get(url, pause, tries=4):
    for attempt in range(tries):
        req = urllib.request.Request(
            url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                time.sleep(pause)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                # Back off hard. Their server having a bad moment is not a
                # reason to keep asking at the same rate.
                time.sleep(pause * (6 ** (attempt + 1)))
                continue
            return None
        except Exception:
            if attempt < tries - 1:
                time.sleep(pause * 4)
                continue
            return None
    return None


def kids(doc, self_about):
    """Children of this node.

    The payload also lists the node itself and its ancestors, which have
    neither a sortKey nor a titleLabel; the real children carry at least one.
    """
    out = []
    for sd in doc.get("sourceDescriptions", []):
        if sd.get("sortKey") is None and sd.get("titleLabel") is None:
            continue
        about = sd.get("about", "")
        if not about or about == self_about:
            continue
        out.append({
            "t": (sd.get("titles") or [{}])[0].get("value", "").strip(),
            "label": (sd.get("titleLabel") or {}).get("value"),
            "about": about,
        })
    return out


YEARS = re.compile(r"\b(1[0-9]{3}|20[0-2][0-9])\b")


def walk(cid, pause, log, workers=1):
    """Every leaf under one collection, with the path that led to it.

    Returns (leaves, calls) — or (None, calls) when the collection has no
    browsable tree at all. That is not an error and it is not rare: a great
    many collections are INDEX ONLY, searchable by name with no images to
    turn, and their waypoints endpoint answers 404 while the collection
    itself answers 200. Asking the base record first tells us which we have
    for one call instead of finding out by failing, and the answer is worth
    keeping: "can I actually look at the page" is the question this whole
    atlas is organised around.
    """
    base = get(f"{API}/collections/{cid}", pause)
    if base is None:
        return None, 1
    if "waypoints" not in (base.get("links") or {}):
        return "index-only", 1
    root = f"{API}/collections/{cid}/waypoints"
    doc = get(root, pause)
    if doc is None:
        return None, 2
    # SIBLINGS IN PARALLEL, BECAUSE THE WAIT IS THE WHOLE COST. Walking one
    # node at a time, the process spent 72 seconds per collection and almost
    # all of it waiting — 0.6s of deliberate pause plus about a second of
    # round trip, times ~19 calls, and far more for a big tree: Family Group
    # Records alone needed 139. At that pace the 3,489 collections were a
    # four-day job.
    #
    # Branches of a waypoint tree are independent, so a small pool fetches a
    # level's children together. Each worker still pauses, so the aggregate
    # is about five requests a second against an API that answers in nine
    # milliseconds and publishes no rate limit — brisk, and nowhere near
    # enough to trouble anyone. Still no browser impersonation and still one
    # honest User-Agent.
    leaves, calls, capped = [], 2, [None]
    level = [(root, doc, [])]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        while level:
            if len(leaves) >= MAX_NODES_PER_COLLECTION:
                log(f"    capped at {MAX_NODES_PER_COLLECTION} volumes")
                capped[0] = "volumes"
                break
            if calls >= MAX_CALLS_PER_COLLECTION:
                log(f"    capped at {calls} requests with {len(leaves)} volumes "
                    f"— recorded as partial")
                capped[0] = "calls"
                break
            to_fetch = []
            for about, d, path in level:
                for c in kids(d, about):
                    if len(path) + 1 >= MAX_DEPTH:
                        continue
                    # A node whose title names years is a book, not a folder.
                    # Asking the API to confirm would double the traffic for
                    # nothing.
                    ys = [int(y) for y in YEARS.findall(c["t"])]
                    child_path = path + [{"l": c["label"], "t": c["t"]}]
                    if ys:
                        m = re.search(r"/waypoints/([^?]+)", c["about"])
                        leaves.append({
                            "t": c["t"], "path": [p["t"] for p in path],
                            "labels": [p["l"] for p in path],
                            "from": min(ys), "to": max(ys),
                            "wp": m.group(1) if m else "",
                        })
                    else:
                        to_fetch.append((c["about"], child_path))
            if not to_fetch:
                break
            calls += len(to_fetch)
            docs = list(pool.map(lambda t: get(t[0], pause), to_fetch))
            nxt = []
            for (ab, pth), sub in zip(to_fetch, docs):
                if sub is None:
                    continue
                if kids(sub, ab):
                    nxt.append((ab, sub, pth))
                    continue
                # A FETCHED NODE WITH NO CHILDREN IS A BOOK, whatever its
                # title looks like. The year in a title was the only signal
                # used to spot one, which works for "Births 1834-1846" and
                # fails completely for a collection that names its books
                # another way: Micronesia, Pohnpei, Land Records has leaves
                # called "Land parcel files, Kitti" and returned ZERO volumes
                # after 1,323 requests — every book walked to, recognised as
                # nothing, and dropped. The fetch is already paid for, so
                # recording it costs nothing and recovers the whole
                # collection.
                m = re.search(r"/waypoints/([^?]+)", ab)
                leaf = pth[-1] if pth else {"t": "", "l": None}
                leaves.append({
                    "t": leaf["t"], "path": [q["t"] for q in pth[:-1]],
                    "labels": [q["l"] for q in pth[:-1]],
                    "from": None, "to": None, "wp": m.group(1) if m else "",
                })
            level = nxt
    return (leaves, capped[0]), calls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="collections this run")
    ap.add_argument("--probe", type=int, default=0, help="measure N and stop")
    ap.add_argument("--pause", type=float, default=1.0)
    ap.add_argument("--workers", type=int, default=3,
                    help="sibling fetches in flight; each one still pauses")
    ap.add_argument("--cc", default="", help="only this country code")
    a = ap.parse_args()

    cols = json.load(open("data/collections.json"))["collections"]
    todo = []
    for c in cols:
        m = re.search(r"/collection/(\d+)", c.get("url") or "")
        if not m:
            continue
        if a.cc and a.cc not in c["countries"]:
            continue
        todo.append({"id": m.group(1), "title": c["title"],
                     "cc": c["countries"]})

    state = {"source": "FamilySearch records waypoint API, api.familysearch.org",
             "why": ("The catalogue is gated; this open endpoint is not. One "
                     "row per volume — the book, its years, and the waypoint "
                     "that opens its images."),
             "licence": "Catalogue metadata from FamilySearch. Titles are theirs.",
             "harvested": None, "done": [], "indexOnly": [],
             "byCollection": {}}
    if a.resume and os.path.exists(OUT):
        state = json.load(open(OUT))
    state.setdefault("indexOnly", [])
    done = set(state["done"])
    idx_only = [0]
    since_save = [0]

    if a.probe:
        todo = [t for t in todo if t["id"] not in done][:a.probe]
    else:
        todo = [t for t in todo if t["id"] not in done]
        if a.limit:
            todo = todo[:a.limit]

    print(f"{len(todo)} collections this run "
          f"({len(done)} already done)", flush=True)
    t0, vols, calls = time.time(), 0, 0
    for i, c in enumerate(todo, 1):
        got, n = walk(c["id"], a.pause, lambda m: print(m, flush=True), a.workers)
        part = None
        if isinstance(got, tuple):
            got, part = got
        calls += n
        # BEFORE THE BRANCHES BELOW. The first cut put this at the foot of
        # the loop, under two `continue`s — so whenever the 25th collection
        # was index-only or unreachable, and most of them are, the save was
        # skipped. A thirty-hour resumable job that does not actually write
        # is just a thirty-hour job you do twice.
        since_save[0] += 1
        if not a.probe and since_save[0] >= 25:
            since_save[0] = 0
            state["harvested"] = time.strftime("%Y-%m-%d")
            state["done"] = sorted(done)
            json.dump(state, open(OUT, "w"), ensure_ascii=False, indent=1)
        if got is None:
            print(f"  [{i}/{len(todo)}] {c['id']} unreachable — leaving it "
                  f"undone so --resume tries again", flush=True)
            continue
        if i % 25 == 0:
            el = time.time() - t0
            rate = el / i
            print(f"  … {i}/{len(todo)} · {vols:,} volumes · "
                  f"{rate:.0f}s per collection · about "
                  f"{rate*(len(todo)-i)/3600:.1f}h left", flush=True)
        if got == "index-only" or (isinstance(got, str)):
            # Recorded, not skipped silently. A reader asking "why are there
            # no books here" deserves the answer "because there are none to
            # turn", not an absence.
            state["indexOnly"].append(c["id"])
            done.add(c["id"])
            state["done"] = sorted(done)
            idx_only[0] += 1
            continue
        vols += len(got)
        if got:
            state["byCollection"][c["id"]] = {
                "title": c["title"], "cc": c["cc"], "volumes": got}
            if part:
                state.setdefault("partial", {})[c["id"]] = part
        done.add(c["id"])
        state["done"] = sorted(done)
        print(f"  [{i}/{len(todo)}] {c['id']} {len(got):5d} volumes "
              f"({n} calls) — {c['title'][:44]}", flush=True)

    el = time.time() - t0
    if a.probe:
        per = el / max(len(todo), 1)
        total = len([t for t in todo]) and per * 3489 / 3600
        print(f"\nPROBE: {vols} volumes from {len(todo)} collections "
              f"({idx_only[0]} index-only, no images), "
              f"{calls} api calls, {el:.0f}s")
        print(f"  mean {calls/max(len(todo),1):.1f} calls and "
              f"{vols/max(len(todo),1):.0f} volumes per collection")
        print(f"  all 3,489 collections would be roughly "
              f"{per*3489/3600:.1f} hours at this pace")
        return

    state["harvested"] = time.strftime("%Y-%m-%d")
    state["counts"] = {"indexOnly": len(state["indexOnly"]),
                       "collections": len(state["byCollection"]),
                       "volumes": sum(len(v["volumes"])
                                      for v in state["byCollection"].values())}
    json.dump(state, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"\n{state['counts']['volumes']} volumes in "
          f"{state['counts']['collections']} collections -> {OUT}")
    print(f"  {len(done)} of {len(cols)} collections walked. "
          f"Run again with --resume for the rest.")


if __name__ == "__main__":
    main()
