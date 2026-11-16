#!/usr/bin/env bash
# Runs a command and stops it when it prints nothing and uses no CPU for
# <idle-seconds>: prints the processes still running (so a stuck packaging step
# shows what it waits on), then stops the command's process group. A quiet
# command whose processes keep using CPU (rpm compression) is still working and
# is left to run; the step's timeout-minutes is the upper limit. With --done-check <cmd>, a command
# whose work is complete (the check passes) and that has been quiet for 60 s, or
# hit the idle limit, ends successfully after this clean-up; otherwise it fails.
#   scripts/ci/run-with-idle-timeout.sh <idle-seconds> [--done-check <cmd>] <command> [args...]
set -u
idle=$1
shift
done_check=""
if [ "${1:-}" = "--done-check" ]; then
  done_check=$2
  shift 2
fi
here=$(cd "$(dirname "$0")" && pwd)
log=$(mktemp)
set -m # the command gets its own process group
"$@" > >(tee -a "$log") 2>&1 &
pid=$!
finish() {
  echo "Processes in its group (pgid $pid):"
  ps -axo pid,ppid,pgid,etime,stat,command | awk -v g="$pid" 'NR == 1 || $3 == g' | cut -c1-250
  echo "Packaging tools still running anywhere:"
  ps -axo pid,ppid,pgid,etime,stat,command | grep -E "hdiutil|diskimages|dmgbuild|python|makensis|fpm|ruby|rpmbuild|xz|zstd|[ /]ar |dpkg|7za|electron-builder|app-builder" | grep -v grep | cut -c1-250
  [ "$(uname)" = Darwin ] && "$here/clean-disk-images.sh"
  kill -TERM -- "-$pid" 2>/dev/null
  sleep 10
  kill -KILL -- "-$pid" 2>/dev/null
}
# CPU seconds used so far by the command's process group (ps time: [[h:]m:]s.cc).
group_cpu() {
  ps -axo pgid=,time= | awk -v g="$pid" '$1 == g { n = split($2, a, ":"); s = 0; for (i = 1; i <= n; i++) s = s * 60 + a[i]; t += s } END { printf "%d", t }'
}
cpu_prev=$(group_cpu)
busy_at=$(date +%s)
noted_at=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 15
  now=$(date +%s)
  cpu=$(group_cpu)
  if [ $(( cpu - cpu_prev )) -ge 2 ]; then busy_at=$now; fi
  cpu_prev=$cpu
  last=$(stat -f %m "$log" 2>/dev/null || stat -c %Y "$log")
  quiet_out=$(( now - last ))
  if [ "$quiet_out" -ge "$idle" ] && [ "$busy_at" -eq "$now" ] && [ $(( now - noted_at )) -ge "$idle" ]; then
    echo "No output for ${quiet_out} s, but the command is using CPU (${cpu} s so far): still working, waiting."
    ps -axo pid,pgid,etime,stat,time,command | awk -v g="$pid" '$2 == g && $4 ~ /^R/' | cut -c1-200
    noted_at=$now
  fi
  # Quiet = no output and no CPU use.
  if [ "$busy_at" -gt "$last" ]; then quiet=$(( now - busy_at )); else quiet=$quiet_out; fi
  if [ -n "$done_check" ] && [ "$quiet_out" -ge 60 ] && bash -c "$done_check"; then
    echo "::warning::All output is written but the command has not ended (quiet ${quiet} s): cleaning up and continuing."
    finish
    exit 0
  fi
  if [ "$quiet" -ge "$idle" ]; then
    echo "::error::No output and no CPU use for ${idle} s from: $*"
    finish
    if [ -n "$done_check" ] && bash -c "$done_check"; then
      echo "All expected output is there: continuing."
      exit 0
    fi
    exit 1
  fi
done
wait "$pid"
