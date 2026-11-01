#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AcquiSense — Podman Teardown Script (Linux & macOS)
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "Stopping AcquiSense Podman microservices..."
if podman compose version &> /dev/null; then
    podman compose -f podman-compose.yml down
else
    podman-compose -f podman-compose.yml down || true
fi

echo "[OK] All AcquiSense Podman services stopped."

