#!/usr/bin/env bash
# Runs a command and stops it when it prints nothing for <idle-seconds>: prints
# the processes still running (so a stuck packaging step shows what it waits on),
# then stops the command's process group. With --done-check <cmd>, a command
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
while kill -0 "$pid" 2>/dev/null; do
  sleep 15
  last=$(stat -f %m "$log" 2>/dev/null || stat -c %Y "$log")
  quiet=$(( $(date +%s) - last ))
  if [ -n "$done_check" ] && [ "$quiet" -ge 60 ] && bash -c "$done_check"; then
    echo "::warning::All output is written but the command has not ended (quiet ${quiet} s): cleaning up and continuing."
    finish
    exit 0
  fi
  if [ "$quiet" -ge "$idle" ]; then
    echo "::error::No output for ${idle} s from: $*"
    finish
    if [ -n "$done_check" ] && bash -c "$done_check"; then
      echo "All expected output is there: continuing."
      exit 0
    fi
    exit 1
  fi
done
wait "$pid"
