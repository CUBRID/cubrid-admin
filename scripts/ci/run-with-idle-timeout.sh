#!/usr/bin/env bash
# Runs a command and fails it when it prints nothing for <idle-seconds>:
# prints the processes still running (so a stuck packaging step shows what it
# waits on), then stops the command's process group.
#   scripts/ci/run-with-idle-timeout.sh <idle-seconds> <command> [args...]
set -u
idle=$1
shift
log=$(mktemp)
set -m # the command gets its own process group
"$@" > >(tee -a "$log") 2>&1 &
pid=$!
while kill -0 "$pid" 2>/dev/null; do
  sleep 15
  last=$(stat -f %m "$log" 2>/dev/null || stat -c %Y "$log")
  if [ $(( $(date +%s) - last )) -ge "$idle" ]; then
    echo "::error::No output for ${idle} s from: $*"
    echo "Processes in its group (pgid $pid):"
    ps -axo pid,ppid,pgid,etime,stat,command | awk -v g="$pid" 'NR == 1 || $3 == g' | cut -c1-250
    echo "Packaging tools still running anywhere:"
    ps -axo pid,ppid,pgid,etime,stat,command | grep -E "hdiutil|diskimages|dmgbuild|python|makensis|fpm|ruby|rpmbuild|xz|zstd|[ /]ar |dpkg|7za|electron-builder|app-builder" | grep -v grep | cut -c1-250
    kill -TERM -- "-$pid" 2>/dev/null
    sleep 10
    kill -KILL -- "-$pid" 2>/dev/null
    exit 1
  fi
done
wait "$pid"
