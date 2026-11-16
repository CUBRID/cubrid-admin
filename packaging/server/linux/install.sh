#!/bin/sh
# Installs CUBRID Admin Server from this folder as the cubrid-admin systemd
# service, with the same layout as the rpm and deb packages:
#   program /opt/cubrid-admin, settings /etc/cubrid-admin/cwm.conf,
#   data /var/lib/cubrid-admin, logs /var/log/cubrid-admin.
# Run as root. Running it again upgrades the program and keeps settings and data.
# Without installing, the server also runs from this folder: ./cubrid-admin-linux
set -e
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root, for example: sudo sh install.sh" >&2
  exit 1
fi
if { command -v rpm >/dev/null 2>&1 && rpm -q cubrid-admin >/dev/null 2>&1; } ||
   { command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status}' cubrid-admin 2>/dev/null | grep -q 'install ok installed'; }; then
  echo "CUBRID Admin Server is installed from the rpm or deb package: upgrade or remove it with the package instead." >&2
  exit 1
fi
binary=$(ls cubrid-admin-linux* 2>/dev/null | head -n 1)
if [ -z "$binary" ]; then
  echo "cubrid-admin-linux not found next to install.sh" >&2
  exit 1
fi

upgrade=no
[ -x /opt/cubrid-admin/cubrid-admin ] && upgrade=yes

install -d -m 0755 /opt/cubrid-admin
install -m 0755 "$binary" /opt/cubrid-admin/cubrid-admin.new
mv -f /opt/cubrid-admin/cubrid-admin.new /opt/cubrid-admin/cubrid-admin
install -m 0755 cubrid-admin-setup.sh /opt/cubrid-admin/cubrid-admin-setup.sh
install -m 0644 conf/cwm.conf.sample /opt/cubrid-admin/cwm.conf.sample
install -m 0644 conf/cwm.conf.reference.md /opt/cubrid-admin/cwm.conf.reference.md
install -m 0644 cubrid-admin.service /etc/systemd/system/cubrid-admin.service
# Marks this copy as installed by install.sh (uninstall.sh, rpm and deb check it).
touch /opt/cubrid-admin/.installed-by-install-sh

/opt/cubrid-admin/cubrid-admin-setup.sh configure
if [ "$upgrade" = yes ]; then
  if [ -d /run/systemd/system ]; then
    systemctl try-restart cubrid-admin.service || :
  fi
  echo "CUBRID Admin Server upgraded (settings and data kept)."
else
  /opt/cubrid-admin/cubrid-admin-setup.sh first-start
fi
