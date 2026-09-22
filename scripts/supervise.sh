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

# A JOB THAT HAS FINISHED IS NOT A JOB THAT KEEPS CRASHING.
# The waypoint harvest walked its last collection and started exiting in
# seconds, so this loop restarted it five times, declared it failed and
# wrote «needs a human» every two minutes for hours — while the truth was
# that 3,503 of 3,504 collections were done and 4,254,303 volumes were on
# disk. A supervisor that cannot tell «finished» from «died» turns success
# into an alarm, and an alarm that repeats every two minutes is one nobody
# reads.
#
# The harvest says so itself on its last line, so that is what is checked.
# The one collection left is unreachable at FamilySearch's end, and
# --resume tries it again every time at no cost.
finished() {
  tail -3 ".${1%.py}.log" 2>/dev/null |
    grep -qE "of [0-9]+ collections walked|nothing left to walk"
}

MAX_RESTARTS=5
declare -a NAMES=("harvest-fs-waypoints.py")
declare -a CMDS=("python3 scripts/harvest-fs-waypoints.py --resume --pause 0.2 --workers 4")
declare -a TRIES=(0)

say "supervisor started (pid $$)"

while true; do
  # 1. Keep the long harvest alive.
  for i in "${!NAMES[@]}"; do
    n="${NAMES[$i]}"
    if [ "$(alive "$n")" = "0" ]; then
      if finished "$n"; then
        if [ "${TRIES[$i]}" != "done" ]; then
          say "$n has finished its queue — not restarting"
          TRIES[$i]="done"
        fi
      elif [ "${TRIES[$i]}" -lt "$MAX_RESTARTS" ]; then
        TRIES[$i]=$(( TRIES[$i] + 1 ))
        say "$n is not running — restart ${TRIES[$i]}/$MAX_RESTARTS"
        nohup nice -n 15 $(echo "${CMDS[$i]}") >> ".${n%.py}.log" 2>&1 &
      else
        say "$n has failed $MAX_RESTARTS times — leaving it down, needs a human"
      fi
    fi
  done

  # 2. Match whenever the exonyms are newer than the last match.
  #    This used to run exactly once, which was wrong: the exonym harvest
  #    gets re-run whenever its rules improve — the filing groups, then the
  #    full name list, then city districts — and each run frees books that
  #    only a re-match actually places. A stamp file makes it idempotent, so
  #    a harvest that changes nothing does not trigger anything.
  if [ -f data/exonyms.json ] \
     && [ "$(alive harvest-exonyms.py)" = "0" ] \
     && [ "$(alive harvest-italy-surnames.py)" = "0" ] \
     && [ "$(alive match-fs-volumes.py)" = "0" ]; then
    if [ ! -f .matched-stamp ] || [ data/exonyms.json -nt .matched-stamp ]; then
      say "exonyms are newer than the last match — running the matcher"
      nice -n 10 python3 scripts/match-fs-volumes.py >> .matcher.log 2>&1
      rc=$?
      touch .matched-stamp
      say "matcher finished, exit $rc"
    fi
  fi

  sleep 120
done
