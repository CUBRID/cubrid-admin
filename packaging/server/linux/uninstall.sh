#!/bin/sh
# Removes CUBRID Admin Server installed by install.sh, and only what install.sh
# installed. Settings (/etc/cubrid-admin), data (/var/lib/cubrid-admin), logs
# (/var/log/cubrid-admin) and the cubrid-admin user are kept.
set -e
if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo sh uninstall.sh" >&2
  exit 1
fi
if [ ! -e /opt/cubrid-admin/.installed-by-install-sh ]; then
  echo "CUBRID Admin Server here was not installed with install.sh: remove it with the rpm or deb package." >&2
  exit 1
fi
if [ -d /run/systemd/system ]; then
  systemctl disable --now cubrid-admin.service >/dev/null 2>&1 || :
fi
rm -f /etc/systemd/system/cubrid-admin.service
for file in cubrid-admin cubrid-admin-setup.sh cwm.conf.sample cwm.conf.reference.md .installed-by-install-sh; do
  rm -f "/opt/cubrid-admin/$file"
done
rmdir /opt/cubrid-admin 2>/dev/null || :
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload || :
fi
echo "CUBRID Admin Server removed. Kept: /etc/cubrid-admin, /var/lib/cubrid-admin, /var/log/cubrid-admin and the cubrid-admin user."
