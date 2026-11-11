#!/bin/sh
# Removes CUBRID Admin Server installed by install.sh. Settings
# (/etc/cubrid-admin), data (/var/lib/cubrid-admin), logs (/var/log/cubrid-admin)
# and the cubrid-admin user are kept.
set -e
if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo sh uninstall.sh" >&2
  exit 1
fi
if [ -d /run/systemd/system ]; then
  systemctl disable --now cubrid-admin.service >/dev/null 2>&1 || :
fi
rm -f /etc/systemd/system/cubrid-admin.service
rm -rf /opt/cubrid-admin
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload || :
fi
echo "CUBRID Admin Server removed. Kept: /etc/cubrid-admin, /var/lib/cubrid-admin, /var/log/cubrid-admin and the cubrid-admin user."
