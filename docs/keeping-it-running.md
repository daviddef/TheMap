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
