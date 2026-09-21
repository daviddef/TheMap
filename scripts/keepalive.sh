#!/bin/bash
# Makes sure the long-running work is actually running. Invoked by cron, so
# it survives this terminal, this session, and a logout.
#
# Everything here exists because something died quietly today: the publish
# loop stopped and twelve hours of work sat unpushed; the waypoint harvest
# has died twice unnoticed; two harvests were killed with their results only
# in memory. A supervisor that itself has no supervisor is just one more
# thing that can stop.
#
# It is idempotent: if a job is already up it does nothing. The `alive`
# check excludes this script and its own children, because a naive
# `pgrep -f` matches the checker's own command line — the bug that made
# every wait-loop written this morning wait on itself forever.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ROOT="/Users/daviddefranceski/Documents/Claude/Family Projects/Record Atlas"
cd "$ROOT" || exit 1
LOG=".keepalive.log"
say() { echo "$(date '+%F %T')  $*" >> "$LOG"; }

alive() {
  pgrep -f "$1" 2>/dev/null | while read -r p; do
    [ "$p" = "$$" ] && continue
    a=$(ps -o args= -p "$p" 2>/dev/null)
    # Skip this script, and skip SHELL WRAPPERS that merely mention the job.
    # `pgrep -f` matches any command line containing the pattern, so a status
    # command that types the job's name counts as the job running. That is
    # how every wait-loop written this morning came to wait on itself, and
    # here it would be worse than a hang: a dead harvest would look alive and
    # never be restarted, which is the one thing this script exists to do.
    case "$a" in
      *supervise.sh*|*keepalive.sh*) continue ;;
      *zsh\ -c*|*bash\ -c*|*sh\ -c*|*shell-snapshots*) continue ;;
    esac
    echo "$p"
  done | grep -c .
}

started=""

if [ "$(alive 'scripts/supervise.sh')" = "0" ]; then
  nohup scripts/supervise.sh >/dev/null 2>&1 &
  started="$started supervisor"
fi

if [ "$(alive 'scripts/publish-loop.sh')" = "0" ]; then
  nohup scripts/publish-loop.sh 1800 >/dev/null 2>&1 &
  started="$started publish-loop"
fi

# The waypoint harvest is the long one. The supervisor restarts it too, but
# only while the supervisor is up, and this runs when it is not.
if [ "$(alive 'harvest-fs-waypoints.py')" = "0" ] \
   && [ "$(alive 'scripts/supervise.sh')" != "0" ]; then
  : # the supervisor has it
elif [ "$(alive 'harvest-fs-waypoints.py')" = "0" ]; then
  nohup nice -n 15 python3 scripts/harvest-fs-waypoints.py --resume --pause 0.2 --workers 4 \
    >> .harvest-fs-waypoints.log 2>&1 &
  started="$started waypoint-harvest"
fi

[ -n "$started" ] && say "restarted:$started"
# One heartbeat an hour, so silence in this log means the cron itself stopped.
[ "$(date '+%M')" -lt 15 ] && say "heartbeat — all up"
exit 0
