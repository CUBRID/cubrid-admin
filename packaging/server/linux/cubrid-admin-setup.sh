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

refuse() {
  echo "CUBRID Admin Server: $1" >&2
  echo "Move it away (or check its contents and fix its owner), then install again." >&2
  exit 1
}

# A folder made before this install by someone else could hold planted
# settings or cwm-vault/secrets.json: use only real folders (not symlinks)
# owned by root or $NAME.
check_owner() {
  [ -L "$1" ] && refuse "$1 is a symbolic link."
  [ -e "$1" ] || return 0
  [ -d "$1" ] || refuse "$1 is not a folder."
  owner=$(stat -c %U "$1")
  if [ "$owner" != root ] && [ "$owner" != "$NAME" ]; then
    refuse "$1 already exists and belongs to $owner, not root or $NAME."
  fi
}

# Makes (mkdir fails if the name appeared meanwhile) or takes over a folder,
# never following a symbolic link, and checks again afterwards.
# usage: own_dir <path> <owner> <group>
own_dir() {
  check_owner "$1"
  if [ ! -e "$1" ]; then
    mkdir -m 0750 "$1"
  fi
  chown -h "$2:$3" "$1"
  [ -L "$1" ] && refuse "$1 was replaced by a symbolic link."
  chmod 0750 "$1"
  check_owner "$1"
}

configure() {
  check_owner "$CONF_DIR"
  check_owner "$DATA_DIR"
  check_owner "$LOG_DIR"
  if ! getent group "$NAME" >/dev/null; then
    groupadd -r "$NAME"
  fi
  if ! getent passwd "$NAME" >/dev/null; then
    nologin=$(command -v nologin || echo /bin/false)
    useradd -r -M -g "$NAME" -d "$DATA_DIR" -s "$nologin" -c "CUBRID Admin Server" "$NAME"
  fi
  own_dir "$CONF_DIR" root "$NAME"
  own_dir "$DATA_DIR" "$NAME" "$NAME"
  own_dir "$LOG_DIR" "$NAME" "$NAME"
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
