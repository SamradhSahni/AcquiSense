#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AcquiSense — Podman Deployment & Startup Script (Linux & macOS)
# ─────────────────────────────────────────────────────────────────────────────
set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}==========================================================${NC}"
echo -e "${CYAN}       AcquiSense — Podman Platform Orchestrator          ${NC}"
echo -e "${CYAN}==========================================================${NC}"

# 1. Check if podman command is installed
if ! command -v podman &> /dev/null; then
    echo -e "${RED}[ERROR] Podman is not installed on this system.${NC}"
    echo -e "${YELLOW}\nInstallation instructions:${NC}"
    echo -e "  • Ubuntu/Debian:  sudo apt-get update && sudo apt-get install -y podman podman-compose"
    echo -e "  • RHEL/Fedora/CentOS: sudo dnf install -y podman podman-compose"
    echo -e "  • macOS (Homebrew): brew install podman && podman machine init && podman machine start"
    echo -e "  • Arch Linux:     sudo pacman -S podman podman-compose"
    exit 1
fi

echo -e "${GREEN}[OK] Podman detected: $(podman --version)${NC}"

# 2. Check if Podman machine is needed (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${CYAN}Checking macOS Podman machine...${NC}"
    if ! podman machine list | grep -q "Currently running"; then
        echo -e "${YELLOW}Starting Podman virtual machine...${NC}"
        podman machine start || (podman machine init && podman machine start)
    fi
fi

# 3. Detect compose command
COMPOSE_CMD=""
if podman compose version &> /dev/null; then
    COMPOSE_CMD="podman compose"
elif command -v podman-compose &> /dev/null; then
    COMPOSE_CMD="podman-compose"
else
    echo -e "${YELLOW}[INFO] podman-compose not found; attempting 'podman compose'...${NC}"
    COMPOSE_CMD="podman compose"
fi

echo -e "${CYAN}Using Compose command: ${COMPOSE_CMD}${NC}"

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# 4. Launch containers
echo -e "${CYAN}Launching AcquiSense microservices with podman-compose.yml...${NC}"
$COMPOSE_CMD -f podman-compose.yml up -d --build

echo -e "\n${GREEN}==========================================================${NC}"
echo -e "${GREEN}       AcquiSense Microservices Started via Podman!       ${NC}"
echo -e "${GREEN}==========================================================${NC}"
echo -e "  Web Dashboard:      http://localhost:5173"
echo -e "  Node.js API:        http://localhost:4100"
echo -e "  Python AI Engine:   http://localhost:8100/docs"
echo -e "  Grafana Telemetry:  http://localhost:3200 (admin / grafanapassword)"
echo -e "  Prometheus Metrics: http://localhost:9190"
echo -e "  MongoDB Port:       localhost:27117"
echo -e "  Redis Port:         localhost:6479"
echo -e "${GREEN}==========================================================${NC}\n"

