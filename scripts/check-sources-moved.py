#!/usr/bin/env python3
"""Fail if moving the shared sources off the place pages lost a source.

    scripts/check-sources-moved.py BEFORE_DIST AFTER_DIST

BEFORE_DIST is a build of the tree before the change, AFTER_DIST a build after
it, from the same data. For every place page in BEFORE, every source row it
printed (its data-src id and its link text) must still be reachable: on the
same place page in AFTER, or on /country/<cc>/sources/ for the page's country.
A place page that moved rows must also link to that sources page, and the
sources page must exist. Exits 1 and names the first losses otherwise.

It reads only the source rows (<li data-src=...>), so a change elsewhere on the
page is not this check's business; run it against two builds of the same data.
See docs/deploy-size.md for why the rows moved."""
import glob, os, re, sys

ROW = re.compile(r'<li[^>]*\bdata-src="([^"]+)"[^>]*>(.*?)</li>', re.S)
TAG = re.compile(r'<[^>]+>')
CC = re.compile(r'href="/country/([a-z]{2,3})/"')


def rows(html):
    out = set()
    for sid, body in ROW.findall(html):
        out.add((sid, re.sub(r'\s+', ' ', TAG.sub(' ', body)).strip()[:80].split(' — ')[0]))
    return {k for k, _ in out}, out


def main(before, after):
    cache, lost, nolink, nopage, checked, moved = {}, [], [], [], 0, 0
    for f in glob.iglob(os.path.join(before, 'place', '*', 'index.html')):
        pid = f.split(os.sep)[-2]
        b = open(f, encoding='utf8', errors='replace').read()
        a_path = os.path.join(after, 'place', pid, 'index.html')
        if not os.path.exists(a_path):
            lost.append((pid, 'the page itself')); continue
        a = open(a_path, encoding='utf8', errors='replace').read()
        want, _ = rows(b)
        have, _ = rows(a)
        gone = want - have
        checked += 1
        if not gone:
            continue
        moved += 1
        cc = (CC.findall(b) or [None])[-1]
        if cc is None:
            lost.append((pid, 'no country link on the old page: ' + sorted(gone)[0])); continue
        if cc not in cache:
            sp = os.path.join(after, 'country', cc, 'sources', 'index.html')
            cache[cc] = rows(open(sp, encoding='utf8', errors='replace').read())[0] if os.path.exists(sp) else None
        if cache[cc] is None:
            nopage.append((pid, cc)); continue
        missing = gone - cache[cc]
        if missing:
            lost.append((pid, sorted(missing)[0]))
        if f'/country/{cc}/sources/' not in a:
            nolink.append((pid, cc))
    print(f'{checked:,} place pages compared, {moved:,} moved rows to /country/<cc>/sources/')
    for name, bad in (('LOST', lost), ('NO LINK', nolink), ('NO SOURCES PAGE', nopage)):
        if bad:
            print(f'{name}: {len(bad)}, first: {bad[:5]}')
    return 1 if (lost or nolink or nopage or checked == 0) else 0


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1], sys.argv[2]))
