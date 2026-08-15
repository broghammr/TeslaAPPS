#!/usr/bin/env bash
# Installiert die Tesla HomeKit Bridge als systemd-Dienst.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UNIT_SRC="${ROOT}/tesla-bridge.service"
UNIT_DST="/etc/systemd/system/tesla-bridge.service"
VENV="${ROOT}/venv"
CONFIG="/boot/firmware/config.txt"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen (sudo)." >&2
  exit 1
fi

if [[ ! -x "${VENV}/bin/python3" ]]; then
  python3 -m venv --system-site-packages "${VENV}"
fi
"${VENV}/bin/pip" install -r "${ROOT}/requirements.txt"

if [[ -f "${CONFIG}" ]] && grep -q '^dtparam=audio=on' "${CONFIG}"; then
  sed -i 's/^dtparam=audio=on/dtparam=audio=off/' "${CONFIG}"
  echo "PWM: dtparam=audio=off gesetzt. Ein Reboot ist nötig, damit GPIO 12/13 WS2812 ansteuern."
fi

install -m 644 "${UNIT_SRC}" "${UNIT_DST}"
systemctl daemon-reload
systemctl enable tesla-bridge.service
systemctl restart tesla-bridge.service
systemctl --no-pager --full status tesla-bridge.service || true
