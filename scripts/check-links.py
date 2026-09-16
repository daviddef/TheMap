#!/usr/bin/env python3
"""Re-test every provider link, and be honest about what a failure is.

This site's one claim about itself is that a directory which lies is worse than
no directory. Fifty-nine providers all say «checked 2026-09-16» and nothing in
the world will change that date by itself. Links rot, portals move, and free
things quietly become paid.

THE HARD PART IS NOT FETCHING, IT IS JUDGING, and the first cut of this got it
wrong twice over.

It used urllib, and urllib could not reach the General Register Office — which
answered 200 to curl in the same minute. A checker that reports a live site as
dead because of its own TLS negotiation will be ignored inside a month, and an
ignored checker is worse than none. It shells out to curl now.

And half the archives worth listing sit behind Cloudflare or Incapsula: the
Romanian national archive answers 503 to anything that is not a browser and the
Lithuanian one answers 403, while both are perfectly alive for the human this
map is written for. A challenge is recorded as a challenge.

So there are three kinds of bad news and only two of them are failures:

  dead          404 or 410 — the server is there and says the page is not
  server-error  5xx, twice, with no challenge behind it
  unverified    nothing came back at all. This is EVIDENCE ABOUT THE CHECKER
                as much as about the site, and it is reported separately so
                that a human can tell the difference.

    python3 scripts/check-links.py [--json out.json] [--quiet]
"""
import argparse, json, os, subprocess, sys, time

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

# Honest about what it is. A link checker that disguises itself as Chrome is
# doing the thing this project refused to do when Matricula's robots.txt said no.
UA = ("RecordAtlasLinkCheck/1.0 (+https://github.com/daviddef/TheMap; "
      "weekly link check, one request per source)")

CHALLENGE = ("cloudflare", "incapsula", "_incapsula", "just a moment",
             "attention required", "checking your browser", "verifying your browser",
             "ddos-guard", "security verification", "cf-ray")


def probe(url, timeout=25):
    """curl, because it is the thing that actually works and it is on every
    runner. Follows redirects, prints the final status, and gives us a little
    of the body to look for a challenge in."""
    try:
        r = subprocess.run(
            ["curl", "-sSL", "--max-time", str(timeout), "--compressed",
             "-A", UA, "-w", "\n__STATUS__%{http_code}", url],
            capture_output=True, text=True, timeout=timeout + 10)
    except subprocess.TimeoutExpired:
        return None, "", "timed out"
    out = r.stdout or ""
    status = None
    if "__STATUS__" in out:
        body, _, code = out.rpartition("__STATUS__")
        status = int(code.strip() or 0) or None
        out = body[-4000:]
    if not status:
        return None, "", (r.stderr or "no response").strip()[:120]
    return status, out.lower(), None


def judge(status, body, err):
    if err or status is None:
        return "unverified", err or "no response"
    challenged = any(sig in body for sig in CHALLENGE)
    if 200 <= status < 400:
        return "ok", f"HTTP {status}"
    if status in (401, 403, 429) or (challenged and status >= 400):
        return "challenged", f"HTTP {status}" + (" — bot challenge" if challenged else " — refuses non-browsers")
    if status in (404, 410):
        return "dead", f"HTTP {status}"
    if status >= 500:
        return "server-error", f"HTTP {status}"
    return "odd", f"HTTP {status}"


ORDER = ["dead", "server-error", "odd", "unverified", "challenged", "ok"]
REAL_FAILURES = ("dead", "server-error", "odd")


def collections_check():
    """Are the 3,488 collection links still real?

    NOT BY FETCHING 3,488 URLS. Every one of them is
    familysearch.org/search/collection/<id>, and the id comes from
    FamilySearch's own catalogue — so the question «do these still exist» is
    answered by re-reading the catalogue ONCE and seeing which ids have gone.
    One public request replaces three and a half thousand, against a service
    that has already rate-limited this project for asking too often.
    """
    import urllib.request
    try:
        cols = json.load(open("data/collections.json"))["collections"]
    except FileNotFoundError:
        return None
    req = urllib.request.Request(
        "https://www.familysearch.org/search/orchestration/collectionListData",
        headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            live = {c["collectionId"] for c in json.loads(r.read().decode())["collectionList"]}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    ours = {c["cc"] for c in cols}
    gone = sorted(ours - live)
    return {"ours": len(ours), "live": len(live), "gone": gone,
            "added": len(live - ours)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default="")
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--skip-collections", action="store_true")
    a = ap.parse_args()

    provs = json.load(open("data/providers.json"))["providers"]
    rows = []
    for p in provs:
        verdict, detail = judge(*probe(p["url"]))
        if verdict in ("server-error", "unverified"):        # one retry, politely
            time.sleep(3)
            verdict, detail = judge(*probe(p["url"]))
        rows.append({"id": p["id"], "name": p["name"], "url": p["url"],
                     "verdict": verdict, "detail": detail, "checked": p["checked"]})
        if not a.quiet:
            print(f"  {verdict:13} {p['id']:18} {detail}")
        time.sleep(1)                                        # one a second, no more

    rows.sort(key=lambda r: ORDER.index(r["verdict"]))
    counts = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    print("\n" + " · ".join(f"{v}: {n}" for v, n in sorted(counts.items())))

    if a.json:
        json.dump({"checked": time.strftime("%Y-%m-%d"), "counts": counts, "rows": rows},
                  open(a.json, "w"), ensure_ascii=False, indent=1)

    col = None if a.skip_collections else collections_check()
    if col and not col.get("error"):
        print(f"\ncollections: {col['ours']} held, {len(col['gone'])} no longer in the "
              f"FamilySearch catalogue, {col['added']} in the catalogue we do not hold")
        for cc in col["gone"][:12]:
            title = next((c["title"] for c in json.load(open("data/collections.json"))["collections"]
                          if c["cc"] == cc), cc)
            print(f"  GONE  {cc}  {title[:64]}")
    elif col:
        print(f"\ncollections: could not check — {col['error']}")

    broken = [r for r in rows if r["verdict"] in REAL_FAILURES]
    unver = [r for r in rows if r["verdict"] == "unverified"]

    if col and col.get("gone"):
        print(f"\n{len(col['gone'])} collection(s) have left the catalogue and their links "
              f"on this map are now dead. Re-run scripts/harvest-familysearch.py.")
    if broken:
        print(f"\nBROKEN — the server answered and the page is not there ({len(broken)}):")
        for r in broken:
            print(f"  - {r['name']} — {r['url']} — {r['detail']}")
    if unver:
        print(f"\nCOULD NOT VERIFY ({len(unver)}) — nothing came back. This may be the "
              f"checker's own network rather than the site; check by hand before changing "
              f"anything:")
        for r in unver:
            print(f"  - {r['name']} — {r['url']} — {r['detail']}")

    # If nothing at all could be reached, the network is the story, not the sites.
    if len(unver) > len(rows) * 0.5:
        print("\nMore than half of everything was unreachable. That is this checker's "
              "network, not fifty archives going down at once. Nothing is being reported.")
        sys.exit(0)
    if not broken and not unver:
        print("every source answered")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
