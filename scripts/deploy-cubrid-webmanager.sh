#!/usr/bin/env bash
#
# CUBRID Web Manager - initial server deployment (Linux: Debian/Ubuntu, RHEL family)
#
# Order: Node -> nginx -> TLS (self-signed) -> deploy dist zip -> /etc/cubrid-webmanager.env -> systemd API -> nginx
#
#   sudo ./scripts/deploy-cubrid-webmanager.sh
#   sudo CWM_ARTIFACT_ZIP=~/dist.zip CWM_SEED=s CWM_SALT=t CWM_ALLOWED_ORIGINS='https://h:443' ./scripts/deploy-cubrid-webmanager.sh
#

set -euo pipefail

CWM_INSTALL_ROOT="${CWM_INSTALL_ROOT:-/opt/cubrid-webmanager}"
CWM_SSL_DIR="${CWM_SSL_DIR:-/etc/ssl/cubrid-webmanager}"
CWM_ENV_FILE="${CWM_ENV_FILE:-/etc/cubrid-webmanager.env}"
CWM_NODE_MAJOR="${CWM_NODE_MAJOR:-20}"
CWM_API_PORT="${CWM_API_PORT:-8080}"
CWM_NGINX_SSL_PORT="${CWM_NGINX_SSL_PORT:-443}"

die() { echo "Error: $*" >&2; exit 1; }

need_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "Run as root or with sudo."
}

detect_pkg() {
  if command -v apt-get >/dev/null 2>&1; then
    echo debian
  elif command -v dnf >/dev/null 2>&1; then
    echo rhel_dnf
  elif command -v yum >/dev/null 2>&1; then
    echo rhel_yum
  else
    die "No supported package manager found (apt/dnf/yum)."
  fi
}

step_install_node() {
  echo "=== [1] Install Node.js ${CWM_NODE_MAJOR}.x ==="
  if command -v node >/dev/null 2>&1; then
    node -v
    return
  fi
  local pm
  pm=$(detect_pkg)
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
  node -v
}

step_install_nginx() {
  echo "=== [2] Install nginx ==="
  if command -v nginx >/dev/null 2>&1; then
    nginx -v
    return
  fi
  local pm
  pm=$(detect_pkg)
  case "$pm" in
    debian) apt-get install -y nginx ;;
    rhel_dnf) dnf install -y nginx ;;
    rhel_yum) yum install -y nginx ;;
  esac
}

step_tls() {
  echo "=== [3] TLS self-signed certificate (${CWM_SSL_DIR}) ==="
  mkdir -p "$CWM_SSL_DIR"
  local cert key cn
  cert="${CWM_SSL_DIR}/cert.pem"
  key="${CWM_SSL_DIR}/key.pem"
  if [[ -f "$cert" && -f "$key" ]]; then
    echo "Keeping existing certificate files."
    return
  fi
  cn="${CWM_PUBLIC_IP:-localhost}"
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$key" \
    -out "$cert" \
    -days 825 \
    -subj "/CN=${cn}/O=CUBRID Web Manager"
  chmod 640 "$key"
  chmod 644 "$cert"
}

resolve_artifact() {
  local z="${CWM_ARTIFACT_ZIP:-}"
  if [[ -n "$z" && -f "$z" ]]; then
    echo "$z"
    return
  fi
  if [[ -n "${GITHUB_RUN_ID:-}" ]] && command -v gh >/dev/null 2>&1 && [[ -n "${GITHUB_REPOSITORY:-}" ]]; then
    local tmp
    tmp=$(mktemp -d)
    if gh run download "${GITHUB_RUN_ID}" -n cubrid-webmanager-dist -R "${GITHUB_REPOSITORY}" -D "$tmp" 2>/dev/null; then
      shopt -s nullglob
      local found=( "${tmp}"/*.zip )
      shopt -u nullglob
      [[ ${#found[@]} -gt 0 ]] || die "No zip file found in gh download output."
      echo "${found[0]}"
      return
    fi
  fi
  local reply
  read -r -p "Path to dist artifact zip (GitHub Actions cubrid-webmanager-dist): " reply
  [[ -f "$reply" ]] || die "File not found: $reply"
  echo "$reply"
}

step_unpack() {
  echo "=== [4][5] Deploy build output -> ${CWM_INSTALL_ROOT} ==="
  local zip
  zip=$(resolve_artifact)
  mkdir -p "$CWM_INSTALL_ROOT"
  if ! command -v unzip >/dev/null 2>&1; then
    local pm
    pm=$(detect_pkg)
    case "$pm" in
      debian) apt-get install -y unzip ;;
      rhel_dnf) dnf install -y unzip ;;
      rhel_yum) yum install -y unzip ;;
    esac
  fi
  unzip -o -q "$zip" -d "$CWM_INSTALL_ROOT"
  [[ -f "${CWM_INSTALL_ROOT}/dist/apps/api-server/main.js" ]] \
    || die "main.js not found. The zip root must contain dist/."
}

read_env_inputs() {
  echo "=== [6][7][8][9] SEED / SALT / API PORT / ALLOWED_ORIGINS ==="
  local seed salt port origins
  seed="${CWM_SEED:-}"
  salt="${CWM_SALT:-}"
  port="${CWM_API_PORT:-8080}"
  origins="${CWM_ALLOWED_ORIGINS:-}"

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
  if [[ "${CWM_API_PORT_SET:-}" != 1 && -t 0 ]]; then
    read -r -p "API listen port (backend, default ${port}): " r
    [[ -n "$r" ]] && port="$r"
  fi
  if [[ -z "$origins" && -t 0 ]]; then
    read -r -p "ALLOWED_ORIGINS (comma-separated, e.g. https://192.168.1.1:443): " origins
  fi

  [[ -n "$seed" ]] || die "SEED is empty."
  [[ -n "$salt" ]] || die "SALT is empty."

  CWM_SEED="$seed"
  CWM_SALT="$salt"
  CWM_API_PORT="$port"
  CWM_ALLOWED_ORIGINS="$origins"

  if [[ -t 0 ]] && [[ -z "${CWM_NGINX_SSL_PORT_FIXED:-}" ]]; then
    read -r -p "nginx HTTPS port (default ${CWM_NGINX_SSL_PORT}): " rp
    [[ -n "$rp" ]] && CWM_NGINX_SSL_PORT="$rp"
  fi
}

step_write_env() {
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
  echo "Written: $CWM_ENV_FILE"
}

web_root_guess() {
  local base="${CWM_INSTALL_ROOT}/dist/apps/web-manager"
  if [[ -f "${base}/index.html" ]]; then
    echo "$base"
    return
  fi
  local found
  found=$(find "${CWM_INSTALL_ROOT}/dist/apps/web-manager" -name index.html 2>/dev/null | head -1) || true
  if [[ -n "$found" ]]; then
    dirname "$found"
    return
  fi
  echo "$base"
}

step_systemd() {
  echo "=== [10] Backend systemd (cubrid-webmanager-api) ==="
  local svc=/etc/systemd/system/cubrid-webmanager-api.service
  cat >"$svc" <<EOF
[Unit]
Description=CUBRID Web Manager API (Node)
After=network.target

[Service]
Type=simple
WorkingDirectory=${CWM_INSTALL_ROOT}
EnvironmentFile=${CWM_ENV_FILE}
ExecStart=/usr/bin/node ${CWM_INSTALL_ROOT}/dist/apps/api-server/main.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable cubrid-webmanager-api.service
  systemctl restart cubrid-webmanager-api.service
  systemctl --no-pager -l status cubrid-webmanager-api.service || true
}

step_nginx_site() {
  echo "=== [11] nginx (HTTPS + SPA + /api -> backend) ==="
  local web_root
  web_root=$(web_root_guess)
  if [[ ! -f "${web_root}/index.html" ]]; then
    echo "Warning: frontend index.html not found -> ${web_root} (check whether web build is included)."
  fi

  local conf
  if [[ -d /etc/nginx/sites-available ]]; then
    conf=/etc/nginx/sites-available/cubrid-webmanager.conf
    ln -sf "$conf" /etc/nginx/sites-enabled/cubrid-webmanager.conf
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  else
    conf=/etc/nginx/conf.d/cubrid-webmanager.conf
  fi

  cat >"$conf" <<NGX
# CUBRID Web Manager
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

    # The API server serves under /api (its global prefix): pass the path as is.
    location /api/ {
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
  echo "HTTPS: https://<this-server>:${CWM_NGINX_SSL_PORT}/"
  echo "API proxy: /api/ -> backend. Recommended frontend build setting: VITE_API_BASE_URL=https://<host>:${CWM_NGINX_SSL_PORT}/api"
}

main() {
  need_root
  step_install_node
  step_install_nginx
  step_tls
  step_unpack
  read_env_inputs
  step_write_env
  step_systemd
  step_nginx_site
  echo "=== Deployment script completed ==="
}

main "$@"
