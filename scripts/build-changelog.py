#!/usr/bin/env python3
"""The changelog, written from the git history rather than by hand.

A hand-kept changelog records what somebody remembered to write down. This
records what actually happened, including the parts nobody would choose to
advertise — every commit here names what broke as well as what shipped, and a
page built from them inherits that whether it likes it or not.
"""
import json, os, re, subprocess

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(_ROOT)

FMT = "%x1e%H%x1f%aI%x1f%s%x1f%b"
out = subprocess.run(["git", "log", f"--pretty=format:{FMT}", "--no-merges"],
                     capture_output=True, text=True).stdout

rows = []
for rec in out.split("\x1e"):
    if not rec.strip():
        continue
    parts = rec.split("\x1f")
    if len(parts) < 3:
        continue
    sha, date, subject = parts[0], parts[1], parts[2]
    body = parts[3] if len(parts) > 3 else ""
    body = re.sub(r"Co-Authored-By:.*", "", body).strip()
    # The first paragraph is the argument; the rest is the detail.
    para = [p.strip() for p in body.split("\n\n") if p.strip()]
    rows.append({"sha": sha[:8], "date": date[:10], "subject": subject,
                 "lead": para[0].replace("\n", " ") if para else "",
                 "paras": len(para)})

json.dump({"note": "Written from git by scripts/build-changelog.py.",
           "commits": rows}, open("site/src/data/changelog.json", "w"),
          ensure_ascii=False, indent=1)
print(f"{len(rows)} commits -> site/src/data/changelog.json")
