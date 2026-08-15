#!/usr/bin/env bash
# Installiert ngrok als systemd-Dienst auf Jacky.
# Öffentliche URL: https://placate-impale-nautical.ngrok-free.dev -> http://localhost:8080
set -euo pipefail

NGROK_BIN="/usr/local/bin/ngrok"
CONFIG_DIR="/etc/ngrok"
CONFIG_FILE="${CONFIG_DIR}/ngrok.yml"
PUBLIC_URL="https://placate-impale-nautical.ngrok-free.dev"
UPSTREAM="8080"
AUTHTOKEN="${NGROK_AUTHTOKEN:-}"

if [[ -z "${AUTHTOKEN}" ]]; then
  echo "NGROK_AUTHTOKEN fehlt." >&2
  echo "Aufruf: sudo NGROK_AUTHTOKEN='<token>' $0" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen (sudo)." >&2
  exit 1
fi

if [[ ! -x "${NGROK_BIN}" ]]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "${tmp}"' EXIT
  echo "Lade ngrok Agent (linux-arm64) ..."
  wget -q -O "${tmp}/ngrok.tgz" \
    "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz"
  tar xzf "${tmp}/ngrok.tgz" -C /usr/local/bin
  chmod 755 "${NGROK_BIN}"
fi

mkdir -p "${CONFIG_DIR}"
umask 077
cat > "${CONFIG_FILE}" <<EOF
version: 3

agent:
  authtoken: ${AUTHTOKEN}
  log_level: info
  update_check: false
  inspect_db_size: -1

endpoints:
  - name: tesla-gpio
    url: ${PUBLIC_URL}
    upstream:
      url: ${UPSTREAM}
EOF
chmod 600 "${CONFIG_FILE}"

# Idempotent: vorhandene Installation ersetzen
if systemctl list-unit-files ngrok.service >/dev/null 2>&1; then
  systemctl stop ngrok.service 2>/dev/null || true
  "${NGROK_BIN}" service uninstall >/dev/null 2>&1 || true
fi

"${NGROK_BIN}" service install --config "${CONFIG_FILE}"
"${NGROK_BIN}" service start
systemctl enable ngrok.service >/dev/null 2>&1 || true

echo "ngrok Dienst ist installiert und gestartet."
echo "Tunnel: ${PUBLIC_URL} -> http://localhost:${UPSTREAM}"
systemctl --no-pager --full status ngrok.service || true
