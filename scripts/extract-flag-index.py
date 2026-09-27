#!/usr/bin/env python3
"""The 210 countries and 34 hubs, out of the flags index and into data.

The flags landing page renders its cards from a JS array — COUNTRIES — declared
inline, plus hub cards written as markup. That array is the only structured
thing in the whole 245-page corpus, and it carries exactly what a result card
needs: the name, the region, the hub it belongs to, its colour, and the crowns
that ruled it.

David asked for those cards to appear UNDER THE MAP in Record Atlas and to
filter as you type, the way the flags index already does. That needs the data,
not the markup, so this lifts it once.

Same discipline as extract-flag-eras.py: read once, commit the output, and let
check-data.py fail the build when the page and the data disagree.

    python3 scripts/extract-flag-index.py --write
"""
import argparse, html, json, os, re, sys

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

SRC = "site/public/flags/index.html"
OUT = "data/flag-index.json"


def text(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"(?s)<[^>]+>", " ", s))).strip()


def js_array(src, name):
    """Pull `var NAME = [ ... ];` out of a page and JSON-ify it.

    The array is hand-written JavaScript: unquoted keys, single quotes, and a
    trailing comma here and there. It is not JSON and must not be eval'd, so it
    is converted rather than executed — this file comes from our own repository
    and it is still not a thing to run.
    """
    m = re.search(r"(?:var|const|let)\s+" + name + r"\s*=\s*\[", src)
    if not m:
        return None
    i = m.end() - 1
    depth, j = 0, i
    while j < len(src):
        if src[j] == "[":
            depth += 1
        elif src[j] == "]":
            depth -= 1
            if depth == 0:
                break
        j += 1
    raw = src[i:j + 1]
    raw = re.sub(r"//[^\n]*", "", raw)
    raw = re.sub(r"([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1"\2":', raw)
    raw = re.sub(r",(\s*[}\]])", r"\1", raw)
    return json.loads(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    src = open(SRC, encoding="utf-8", errors="replace").read()
    countries = js_array(src, "COUNTRIES")
    if countries is None:
        sys.exit("COUNTRIES array not found in " + SRC)

    # Hubs are markup, not data, so they are read from the cards themselves.
    hubs = []
    for m in re.finditer(
            r'<a class="hub-card"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', src, re.S):
        href, body = m.group(1), m.group(2)
        colour = (re.search(r'background:\s*(#[0-9a-fA-F]{3,8})', body) or [None, None])[1]
        meta = (re.search(r'<span class="meta">(.*?)</span>', body, re.S) or [None, ""])[1]
        name = (re.search(r"<b>(.*?)</b>", body, re.S) or [None, ""])[1]
        spans = re.findall(r"<span[^>]*>(.*?)</span>", body, re.S)
        blurb = text(spans[-1]) if spans else ""
        hubs.append({"name": text(name), "url": "flags/" + href,
                     "meta": text(meta), "what": blurb, "color": colour})

    rows = []
    for c in countries:
        rows.append({
            "name": c.get("name"),
            "url": "flags/" + c.get("url", ""),
            "region": c.get("region"),
            "hub": c.get("hub"),
            "color": c.get("color"),
            "crowns": c.get("crowns") or [],
            "ownPage": bool(c.get("ownPage")),
        })

    print(f"{len(rows)} countries, {len(hubs)} hubs")
    print(f"  with a page of their own : {sum(1 for r in rows if r['ownPage'])}")
    print(f"  distinct regions         : {len({r['region'] for r in rows if r['region']})}")
    print(f"  crowns named in total    : {sum(len(r['crowns']) for r in rows):,}")

    if not a.write:
        print("  (dry run — pass --write)")
        return 0

    json.dump({
        "note": ("The flags landing page's own card data — 210 countries with the "
                 "region, hub, colour and crowns each is filed under, and 34 hubs. "
                 "Lifted from the COUNTRIES array in site/public/flags/index.html "
                 "so the map can show and filter these under its results."),
        "source": "site/public/flags/index.html — this project's own page",
        "licence": "This atlas's own compilation",
        "generatedBy": "scripts/extract-flag-index.py",
        "counts": {"countries": len(rows), "hubs": len(hubs)},
        "countries": rows,
        "hubs": hubs,
    }, open(OUT, "w"), ensure_ascii=False, indent=1)
    print(f"  wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
