#!/usr/bin/env bash
#
# Runtime-only setup when dist already exists on server:
# - Install Node/nginx (only if missing)
# - Generate TLS PEM files (/etc/ssl/cubrid-webmanager)
# - Write /etc/cubrid-webmanager.env
# - Register/restart systemd service
# - Configure/restart nginx
#
# Prerequisites:
#   /opt/cubrid-webmanager/dist/apps/api-server/main.js
#   /opt/cubrid-webmanager/dist/apps/web-manager/index.html
#
# Usage:
#   sudo ./scripts/setup-runtime-from-dist.sh
#
# Non-interactive example:
#   sudo CWM_SEED=seed CWM_SALT=salt \
#     CWM_ALLOWED_ORIGINS='https://192.168.3.120' \
#     CWM_PUBLIC_HOST=192.168.3.120 \
#     ./scripts/setup-runtime-from-dist.sh

set -euo pipefail

CWM_INSTALL_ROOT="${CWM_INSTALL_ROOT:-/opt/cubrid-webmanager}"
CWM_ENV_FILE="${CWM_ENV_FILE:-/etc/cubrid-webmanager.env}"
CWM_SSL_DIR="${CWM_SSL_DIR:-/etc/ssl/cubrid-webmanager}"
CWM_NODE_MAJOR="${CWM_NODE_MAJOR:-20}"
CWM_API_PORT="${CWM_API_PORT:-8080}"
CWM_NGINX_SSL_PORT="${CWM_NGINX_SSL_PORT:-443}"
CWM_SERVICE_USER="${CWM_SERVICE_USER:-cubrid}"
CWM_SERVICE_GROUP="${CWM_SERVICE_GROUP:-cubrid}"
CWM_PUBLIC_HOST="${CWM_PUBLIC_HOST:-localhost}"

die() { echo "Error: $*" >&2; exit 1; }

need_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root or with sudo."
}

detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "debian"
  elif command -v dnf >/dev/null 2>&1; then
    echo "rhel_dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "rhel_yum"
  else
    die "No supported package manager found (apt/dnf/yum)."
  fi
}

detect_primary_ip() {
  local ip=""
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i=="src"){print $(i+1); exit}}}')"
  fi
  echo "$ip"
}

install_node_if_missing() {
  echo "=== Check/install Node ==="
  if command -v node >/dev/null 2>&1; then
    node -v
    return
  fi
  local pm
  pm="$(detect_pkg)"
  case "$pm" in
    debian)
      apt-get update -y
      apt-get install -y ca-certificates curl gnupg
      mkdir -p /etc/apt/keyrings
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${CWM_NODE_MAJOR}.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list
      apt-get update -y
      apt-get install -y nodejs
      ;;
    rhel_dnf)
      curl -fsSL "https://rpm.nodesource.com/setup_${CWM_NODE_MAJOR}.x" | bash -
      dnf install -y nodejs
      ;;
    rhel_yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${CWM_NODE_MAJOR}.x" | bash -
      yum install -y nodejs
      ;;
  esac
}

install_nginx_if_missing() {
  echo "=== Check/install nginx ==="
  if command -v nginx >/dev/null 2>&1; then
    nginx -v
    return
  fi
  local pm
  pm="$(detect_pkg)"
  case "$pm" in
    debian) apt-get install -y nginx ;;
    rhel_dnf) dnf install -y nginx ;;
    rhel_yum) yum install -y nginx ;;
  esac
}

validate_dist() {
  echo "=== Validate dist ==="
  [[ -f "${CWM_INSTALL_ROOT}/dist/apps/api-server/main.js" ]] \
    || die "api-server main.js not found: ${CWM_INSTALL_ROOT}/dist/apps/api-server/main.js"
  [[ -f "${CWM_INSTALL_ROOT}/dist/apps/web-manager/index.html" ]] \
    || echo "Warning: web-manager index.html not found (${CWM_INSTALL_ROOT}/dist/apps/web-manager/index.html)"
}

read_inputs() {
  local seed="${CWM_SEED:-}"
  local salt="${CWM_SALT:-}"
  local origins="${CWM_ALLOWED_ORIGINS:-}"

  if [[ -z "$seed" ]]; then
    if [[ -t 0 ]]; then
      read -r -s -p "SEED: " seed
      echo
    else
      die "Set CWM_SEED for non-interactive execution."
    fi
  fi

  if [[ -z "$salt" ]]; then
    if [[ -t 0 ]]; then
      read -r -s -p "SALT: " salt
      echo
    else
      die "Set CWM_SALT for non-interactive execution."
    fi
  fi

  if [[ -z "$origins" && -t 0 ]]; then
    local guessed_ip default_origin
    guessed_ip="$(detect_primary_ip)"
    if [[ -n "$guessed_ip" ]]; then
      default_origin="https://${guessed_ip}"
      read -r -p "ALLOWED_ORIGINS (default ${default_origin}): " origins
      [[ -z "$origins" ]] && origins="$default_origin"
    else
      read -r -p "ALLOWED_ORIGINS (comma-separated, e.g. https://192.168.3.120): " origins
    fi
  fi

  if [[ -z "$origins" ]]; then
    local auto_ip
    auto_ip="$(detect_primary_ip)"
    if [[ -n "$auto_ip" ]]; then
      origins="https://${auto_ip}"
      echo "ALLOWED_ORIGINS not provided -> auto-set to: ${origins}"
    else
      die "Failed to auto-detect ALLOWED_ORIGINS. Set CWM_ALLOWED_ORIGINS explicitly."
    fi
  fi

  CWM_SEED="$seed"
  CWM_SALT="$salt"
  CWM_ALLOWED_ORIGINS="$origins"
}

setup_tls() {
  echo "=== Prepare TLS PEM files ==="
  local cert key
  cert="${CWM_SSL_DIR}/cert.pem"
  key="${CWM_SSL_DIR}/key.pem"
  mkdir -p "$CWM_SSL_DIR"

  if [[ ! -f "$cert" || ! -f "$key" ]]; then
    echo "Certificates not found. Generating self-signed PEM files."
    openssl req -x509 -nodes -newkey rsa:2048 \
      -keyout "$key" \
      -out "$cert" \
      -days 825 \
      -subj "/CN=${CWM_PUBLIC_HOST}/O=CUBRID Web Manager"
  fi

  chown "${CWM_SERVICE_USER}:${CWM_SERVICE_GROUP}" "$cert" "$key"
  chmod 644 "$cert"
  chmod 600 "$key"
  if command -v restorecon >/dev/null 2>&1; then
    restorecon -Rv "$CWM_SSL_DIR" >/dev/null 2>&1 || true
  fi
}

write_env_file() {
  echo "=== Write env file (${CWM_ENV_FILE}) ==="
  umask 077
  cat >"$CWM_ENV_FILE" <<EOF
ENVIRONMENT=production
SEED=${CWM_SEED}
SALT=${CWM_SALT}
PORT=${CWM_API_PORT}
ALLOWED_ORIGINS=${CWM_ALLOWED_ORIGINS}
SSL_CERT_PATH=${CWM_SSL_DIR}/cert.pem
SSL_KEY_PATH=${CWM_SSL_DIR}/key.pem
EOF
  chmod 600 "$CWM_ENV_FILE"
}

install_runtime_deps_if_needed() {
  echo "=== Check api-server build ==="
  local app_dir="${CWM_INSTALL_ROOT}/dist/apps/api-server"
  # main.js bundles every dependency: there is nothing to install.
  [[ -f "${app_dir}/main.js" ]] || die "${app_dir}/main.js not found. Upload the built dist first."
  echo "api-server main.js present (dependencies are bundled in it)"
}

setup_systemd() {
  echo "=== Register systemd service ==="
  local svc="/etc/systemd/system/cubrid-webmanager-api.service"
  local node_path
  node_path="$(command -v node || true)"
  [[ -n "$node_path" ]] || die "Could not resolve node executable path."

  cat >"$svc" <<EOF
[Unit]
Description=CUBRID Web Manager API
After=network.target

[Service]
Type=simple
User=${CWM_SERVICE_USER}
Group=${CWM_SERVICE_GROUP}
WorkingDirectory=${CWM_INSTALL_ROOT}
EnvironmentFile=${CWM_ENV_FILE}
ExecStart=${node_path} ${CWM_INSTALL_ROOT}/dist/apps/api-server/main.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable cubrid-webmanager-api.service
  systemctl restart cubrid-webmanager-api.service
}

setup_nginx() {
  echo "=== Configure nginx ==="
  local web_root="${CWM_INSTALL_ROOT}/dist/apps/web-manager"
  local conf

  if [[ -d /etc/nginx/sites-available ]]; then
    conf="/etc/nginx/sites-available/cubrid-webmanager.conf"
    ln -sf "$conf" /etc/nginx/sites-enabled/cubrid-webmanager.conf
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  else
    conf="/etc/nginx/conf.d/cubrid-webmanager.conf"
  fi

  cat >"$conf" <<NGX
server {
    listen ${CWM_NGINX_SSL_PORT} ssl;
    server_name _;

    ssl_certificate     ${CWM_SSL_DIR}/cert.pem;
    ssl_certificate_key ${CWM_SSL_DIR}/key.pem;

    root ${web_root};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        rewrite ^/api/(.*) /\$1 break;
        proxy_pass https://127.0.0.1:${CWM_API_PORT};
        proxy_ssl_verify off;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGX

  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

show_status() {
  echo
  echo "=== Status check ==="
  systemctl --no-pager -l status cubrid-webmanager-api.service || true
  systemctl --no-pager -l status nginx || true
  echo
  echo "Access URL: https://${CWM_PUBLIC_HOST}:${CWM_NGINX_SSL_PORT}/"
}

main() {
  need_root
  install_node_if_missing
  install_nginx_if_missing
  validate_dist
  read_inputs
  setup_tls
  write_env_file
  install_runtime_deps_if_needed
  setup_systemd
  setup_nginx
  show_status
}

main "$@"
