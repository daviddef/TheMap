#!/bin/bash
# Keeps the long jobs running, and runs the matcher when the harvests finish.
#
# Everything here has been learned the hard way today. The waypoint harvest
# has died twice without anyone noticing. Twelve hours of work sat unpushed
# because a publish loop exited silently. Two harvests were killed with their
# results only in memory. Every "wait until done" loop written this morning
# used `pgrep -f` on a pattern that also matched the waiter's own command
# line, so each one waited on itself forever.
#
# So: waits are on exact PIDs or on the absence of a named process OTHER than
# this script; every job is restartable and every job checkpoints; restarts
# are bounded so a job that cannot start does not spin; and every decision is
# written to a log with a timestamp.
cd "$(dirname "$0")/.." || exit 1
LOG=".supervisor.log"
say() { echo "$(date '+%F %T')  $*" >> "$LOG"; }

# Count matching processes EXCLUDING this supervisor and its children.
alive() {
  pgrep -f "$1" 2>/dev/null | grep -v "^$$\$" | while read -r p; do
    ps -o args= -p "$p" 2>/dev/null | grep -q "supervise.sh" || echo "$p"
  done | grep -c . 
}

MAX_RESTARTS=5
declare -a NAMES=("harvest-fs-waypoints.py")
declare -a CMDS=("python3 scripts/harvest-fs-waypoints.py --resume --pause 0.2 --workers 4")
declare -a TRIES=(0)

say "supervisor started (pid $$)"
matched=0

while true; do
  # 1. Keep the long harvest alive.
  for i in "${!NAMES[@]}"; do
    n="${NAMES[$i]}"
    if [ "$(alive "$n")" = "0" ]; then
      if [ "${TRIES[$i]}" -lt "$MAX_RESTARTS" ]; then
        TRIES[$i]=$(( TRIES[$i] + 1 ))
        say "$n is not running — restart ${TRIES[$i]}/$MAX_RESTARTS"
        nohup nice -n 15 $(echo "${CMDS[$i]}") >> ".${n%.py}.log" 2>&1 &
      else
        say "$n has failed $MAX_RESTARTS times — leaving it down, needs a human"
      fi
    fi
  done

  # 2. When both harvests are done, match once.
  if [ "$matched" = "0" ] \
     && [ "$(alive harvest-exonyms.py)" = "0" ] \
     && [ "$(alive harvest-italy-surnames.py)" = "0" ] \
     && [ "$(alive match-fs-volumes.py)" = "0" ]; then
    if [ -f data/exonyms.json ]; then
      matched=1
      say "both harvests done — running the matcher"
      nice -n 10 python3 scripts/match-fs-volumes.py >> .matcher.log 2>&1
      say "matcher finished, exit $?"
    fi
  fi

  sleep 120
done
