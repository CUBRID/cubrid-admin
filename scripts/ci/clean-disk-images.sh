#!/usr/bin/env bash
# CI (macOS runner) only: detaches every mounted disk image and stops leftover
# hdiutil / diskimages-helper / dmgbuild processes, which can keep a packaging
# step from ending after its dmg files are written. Never touches anything else.
if [ "${CI:-}" != true ]; then
  echo "clean-disk-images.sh runs only on CI (CI=true): skipped"
  exit 0
fi
hdiutil info 2>/dev/null | sed -n '1,40p'
for dev in $(hdiutil info 2>/dev/null | awk '/^\/dev\/disk[0-9]+[[:space:]]/ {print $1}' | sort -u); do
  echo "detach $dev"
  hdiutil detach -force "$dev" || true
done
for name in dmgbuild hdiutil diskimages-helper; do
  pkill -f "$name" 2>/dev/null && echo "stopped leftover $name" || true
done
exit 0
