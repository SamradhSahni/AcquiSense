# ─────────────────────────────────────────────────────────────────────────────
#  Due Diligence Agents Platform — Makefile
#  Usage: make <target>   (requires GNU make — use Git Bash or WSL on Windows)
# ─────────────────────────────────────────────────────────────────────────────

.PHONY: help setup up down logs ps clean build pull restart \
        shell-backend shell-server shell-client shell-mongo \
        test-backend test-server

# Default target
help:
	@echo ""
	@echo "  Due Diligence Agents Platform"
	@echo "  ──────────────────────────────────────────────────────────"
	@echo "  make setup          Copy .env.example → .env (first time)"
	@echo "  make up             Start all containers (docker compose up)"
	@echo "  make down           Stop all containers"
	@echo "  make restart        Restart all containers"
	@echo "  make logs           Tail all container logs"
	@echo "  make ps             List running containers"
	@echo "  make build          Rebuild all custom images"
	@echo "  make pull           Pull latest base images"
	@echo "  make clean          Remove containers + volumes (DESTRUCTIVE)"
	@echo ""
	@echo "  Shells:"
	@echo "  make shell-backend  Open shell in Python container"
	@echo "  make shell-server   Open shell in Node container"
	@echo "  make shell-mongo    Open mongosh in MongoDB container"
	@echo ""
	@echo "  Tests:"
	@echo "  make test-backend   Run Python tests (pytest)"
	@echo "  make test-server    Run Node tests (jest)"
	@echo ""
	@echo "  Service URLs:"
	@echo "  React Dashboard:  http://localhost:3000"
	@echo "  Node API:         http://localhost:4000"
	@echo "  Python Backend:   http://localhost:8000"
	@echo "  Grafana:          http://localhost:3001  (admin / grafanapassword)"
	@echo "  Prometheus:       http://localhost:9090"
	@echo ""

# ── Setup ─────────────────────────────────────────────────────────────────────

setup:
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ .env created from .env.example — add your OPENAI_API_KEY!"; \
	else \
		echo "⚠️  .env already exists — not overwriting"; \
	fi

# ── Docker Compose operations ─────────────────────────────────────────────────

up:
	docker compose up -d --build

down:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

build:
	docker compose build --no-cache

pull:
	docker compose pull mongodb redis prometheus grafana

# ── Destructive cleanup ───────────────────────────────────────────────────────

clean:
	@echo "⚠️  This will delete ALL containers and volumes (including MongoDB data)!"
	@read -p "Type 'yes' to confirm: " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		docker compose down -v --remove-orphans; \
		echo "✅ Cleaned up"; \
	else \
		echo "Aborted"; \
	fi

# ── Container shells ──────────────────────────────────────────────────────────

shell-backend:
	docker exec -it dd_backend bash

shell-server:
	docker exec -it dd_server sh

shell-client:
	docker exec -it dd_client sh

shell-mongo:
	docker exec -it dd_mongodb mongosh -u ddadmin -p ddpassword --authenticationDatabase admin diligence

# ── Tests ─────────────────────────────────────────────────────────────────────

test-backend:
	docker exec -it dd_backend pytest tests/ -v --tb=short

test-server:
	docker exec -it dd_server npm test
