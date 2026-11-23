#!/usr/bin/env python3
"""Who to e-mail for each archive: the join of data/provider-emails.json (addresses our family archives wrote to or read off an institution's own page)
and data/provider-contacts.json (what Wikidata states) onto providers.json, as `em` = [[address, state, role], ...] best first.

    python3 scripts/provider_emails.py report              # how many providers can be written to, by state
    python3 scripts/provider_emails.py attach FILE.json    # rewrite a built providers.json with `em` (build.py does the same in memory)

States, best first: answered, delivered, listed, unverified, wikidata (used only where nothing else is known for the provider). A `dead` address is kept in the data so nobody tries it again and is never
attached. Role mailboxes only; nothing about a person goes in (scripts/check-data.py refuses an address that reads as a person)."""
import json
import os
import sys

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORDER = {"answered": 0, "delivered": 1, "listed": 2, "unverified": 3, "wikidata": 4}


def em_by_provider(root=_ROOT):
    em = {}
    try:
        for e in json.load(open(os.path.join(root, "data/provider-emails.json"), encoding="utf-8"))["emails"]:
            if e["state"] == "dead":
                continue
            for pid in e.get("providers", []):
                em.setdefault(pid, []).append([e["email"], e["state"], e.get("role", ""), 1 if e.get("branch") else 0])
    except FileNotFoundError:
        pass
    try:
        wd = json.load(open(os.path.join(root, "data/provider-contacts.json"), encoding="utf-8")).get("contacts", {})
    except FileNotFoundError:
        wd = {}
    for p in json.load(open(os.path.join(root, "data/providers.json"), encoding="utf-8"))["providers"]:
        w = wd.get(p.get("wikidata") or "", {}).get("email")
        if w and p["id"] not in em:   # Wikidata only where nobody has written to, or read, an address for this provider: it is sometimes an old one
            em[p["id"]] = [[w, "wikidata", "", 0]]
    for k, v in em.items():
        v.sort(key=lambda x: (x[3], ORDER[x[1]]))   # a branch's own mailbox never leads; then the best state
        em[k] = [x[:3] for x in v]
    return em


def attach(providers, root=_ROOT, keep=3):
    """providers is the parsed providers.json; returns a copy whose rows carry `em` where there is an address."""
    em = em_by_provider(root)
    return dict(providers, providers=[dict(p, **({"em": em[p["id"]][:keep]} if p["id"] in em else {})) for p in providers["providers"]])


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "report"
    if cmd == "attach":
        f = sys.argv[2]
        d = json.load(open(f, encoding="utf-8"))
        json.dump(attach(d), open(f, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print("attached to", f)
    else:
        em = em_by_provider()
        tally = {}
        for v in em.values():
            tally[v[0][1]] = tally.get(v[0][1], 0) + 1
        print(f"{len(em)} providers can be written to (best address by state): " + ", ".join(f"{n} {k}" for k, n in sorted(tally.items(), key=lambda t: ORDER[t[0]])))
