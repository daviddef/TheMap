# Keeping the harvest running

**Status: the controls are active now. One of them needs a setting only David
can flip if it is to survive a reboot.**

## What is running, and what restarts what

| job | what it does | restarted by |
|---|---|---|
| `scripts/harvest-fs-waypoints.py` | walks FamilySearch collection by collection | the supervisor |
| `scripts/supervise.sh` | restarts the harvest (5 attempts, then says it needs a human); runs the matcher once both harvests finish | the keepalive |
| `scripts/publish-loop.sh` | commits and pushes `data/` every 30 minutes | the keepalive |
| `scripts/keepalive.sh` | restarts any of the above that has stopped; idempotent | launchd, once enabled |

Every one of these exists because something stopped quietly. The publish loop
died and twelve hours of work sat unpushed. The waypoint harvest has died
twice unnoticed. Two harvests were killed with their results held only in
memory. A supervisor with no supervisor is one more thing that can stop.

## They survive this session. They do not survive a reboot.

`supervise.sh` and `publish-loop.sh` are started with `nohup`, so closing the
terminal or ending the Claude session does not stop them. A restart of the
machine does.

## To make them survive a reboot — the one thing David has to do

`~/Library/LaunchAgents/org.recordatlas.keepalive.plist` is written and
valid. It is currently **unloaded**, because macOS refuses it:

    shell-init: error retrieving current directory: getcwd: cannot access
                parent directories: Operation not permitted
    /bin/bash: .../scripts/keepalive.sh: Operation not permitted

That is macOS privacy protection (TCC). A launchd agent cannot read anything
under `~/Documents` unless the program it runs — here `/bin/bash` — has Full
Disk Access. `crontab` is refused for the same reason.

Two ways to fix it, and the second is better:

1. **System Settings → Privacy & Security → Full Disk Access**, add
   `/bin/bash`. Then:
   `launchctl load ~/Library/LaunchAgents/org.recordatlas.keepalive.plist`
   Granting bash full disk access is a broad permission. It is your call, and
   it is why this was not done for you.

2. **Move the project out of `~/Documents`** — anywhere not protected by TCC,
   for example `~/RecordAtlas`. Then no special permission is needed at all.
   Update the two absolute paths in the plist and in `scripts/keepalive.sh`.

## Checking on it

    tail .keepalive.log        # one heartbeat an hour; silence means the agent stopped
    tail .supervisor.log       # restarts, and when the matcher ran
    tail .publish-loop.log     # what was committed, and any failed push

## The one file the build cannot rebuild

`data/fs-volumes-world.json.gz` — 2,545,054 FamilySearch volumes matched to
15,411 of the places this atlas holds. `scripts/match-fs-volumes.py` makes it
from `data/fs-waypoints.json`, and that input is **740 MB and is not in the
repository**. So no fresh clone and no CI runner can reproduce this file. It has
to be carried from the machine that ran the harvest.

It used to be carried in git. Sixteen committed versions cost **431 MB of a
686 MB `.git`**: gzip does not delta-compress, so each version paid full price,
while a plain-JSON sibling compressed 177 MB down to 9. It is a release asset
now:

    https://github.com/daviddef/TheMap/releases/tag/harvest-data

**After a harvest re-runs, upload it or the deploy keeps building the old one:**

```bash
gh release upload harvest-data data/fs-volumes-world.json.gz --clobber
```

The deploy downloads it before `npm run build` and checks it holds more than
20,000 volumes, so a truncated download fails rather than passes.

### Why `build.py` now refuses to build without it

It used to skip silently — `if world:` — and publish a complete-looking atlas
with two and a half million volumes quietly absent. That was survivable while
the file was always present in the checkout. The moment it moved out of git it
stopped being survivable: a failed download would have produced a smaller atlas
and a **green build**, which is the one pairing this project cannot afford.

So a missing file is now a hard failure. If you are working on something
unrelated and genuinely do not need the volumes:

```bash
RA_ALLOW_NO_WORLD=1 npm run build
```

which warns, in words, exactly what is missing. CI never sets it.
