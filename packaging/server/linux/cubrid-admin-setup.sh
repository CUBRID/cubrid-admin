#!/bin/sh
# CUBRID Admin Server: sets up what the server needs outside /opt/cubrid-admin.
# Run by the rpm and deb install scripts and by install.sh. Safe to run again:
# it never replaces /etc/cubrid-admin/cwm.conf and never touches the data.
#
#   cubrid-admin-setup.sh configure   the cubrid-admin user, the folders, cwm.conf (when missing)
#   cubrid-admin-setup.sh first-start enable the service for the next boot and say how to start it
#
# Settings: /etc/cubrid-admin/cwm.conf
# Data (cwm-vault/secrets.json, storage, ssl): /var/lib/cubrid-admin
# Logs: /var/log/cubrid-admin
set -e

NAME=cubrid-admin
PROGRAM_DIR=/opt/cubrid-admin
CONF_DIR=/etc/cubrid-admin
DATA_DIR=/var/lib/cubrid-admin
LOG_DIR=/var/log/cubrid-admin

systemd_running() {
  [ -d /run/systemd/system ]
}

configure() {
  if ! getent group "$NAME" >/dev/null; then
    groupadd -r "$NAME"
  fi
  if ! getent passwd "$NAME" >/dev/null; then
    nologin=$(command -v nologin || echo /bin/false)
    useradd -r -M -g "$NAME" -d "$DATA_DIR" -s "$nologin" -c "CUBRID Admin Server" "$NAME"
  fi
  install -d -m 0750 -o root -g "$NAME" "$CONF_DIR"
  install -d -m 0750 -o "$NAME" -g "$NAME" "$DATA_DIR" "$LOG_DIR"
  if [ ! -e "$CONF_DIR/cwm.conf" ]; then
    install -m 0640 -o root -g "$NAME" "$PROGRAM_DIR/cwm.conf.sample" "$CONF_DIR/cwm.conf"
  fi
  if systemd_running; then
    systemctl daemon-reload || :
  fi
}

first_start() {
  if systemd_running; then
    systemctl enable "$NAME.service" >/dev/null 2>&1 || :
  fi
  # Not started now: PORT (8080 by default) may be in use.
  echo "CUBRID Admin Server: set PORT in $CONF_DIR/cwm.conf, then run: systemctl start $NAME"
}

case "$1" in
  configure) configure ;;
  first-start) first_start ;;
  *)
    echo "usage: $0 configure | first-start" >&2
    exit 2
    ;;
esac
