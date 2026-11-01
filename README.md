# AcquiSense — AI-Powered M&A Due Diligence Platform

> 13 AI agents. 9 domains. 1 Go/No-Go verdict.

AcquiSense orchestrates a fleet of parallel AI agents to perform forensic due diligence across every dimension of an M&A deal — delivering a cited, evidence-backed investment committee report in minutes instead of weeks.

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running)
- An [OpenAI API Key](https://platform.openai.com/api-keys)

### 1. Clone & configure

```bash
git clone https://github.com/SamradhSahni/AcquiSense.git
cd AcquiSense
cp .env.example .env
# Edit .env and set OPENAI_API_KEY=sk-...
```

### 2. Start the full stack

```bash
docker compose up -d
```

### 3. Open the dashboard

| Service | URL |
|---|---|
| **React Dashboard** | **http://localhost:5173** |
| Grafana Observability | http://localhost:3200 |
| Python API (Swagger) | http://localhost:8100/docs |
| Node API | http://localhost:4100/health |
| Prometheus | http://localhost:9190 |

**Grafana login:** `admin` / `grafanapassword`

---

## 📖 How It Works

```
Upload Data Room → 13 Agents (parallel) → Synthesis → Quality Gates → Go/No-Go
```

1. **Upload** — drag & drop PDFs, DOCX, XLSX from your virtual data room
2. **Parallel Analysis** — 9 specialist agents run simultaneously via GPT-4o
3. **Cross-Domain Synthesis** — compound risks are identified across domains
4. **Quality Gates** — 5 automated checks verify every finding has citations
5. **IC-Ready Report** — Go/No-Go verdict with executive summary and risk scores

---

## 🤖 AI Agents

| Domain | Agent | What It Finds |
|---|---|---|
| ⚖️ Legal | `legal_agent.py` | Contracts, IP, litigation exposure |
| 💰 Finance | `finance_agent.py` | Revenue quality, EBITDA, liabilities |
| 📊 Commercial | `commercial_agent.py` | Market position, customers, GTM |
| 💻 Technology | `tech_agent.py` | Architecture, tech debt, scalability |
| 🔒 Cybersecurity | `cyber_agent.py` | Breaches, GDPR, security posture |
| 👥 HR | `hr_agent.py` | Key-person risk, culture, comp |
| 📋 Tax | `tax_agent.py` | Liabilities, international structure |
| 🏛️ Regulatory | `regulatory_agent.py` | Licenses, antitrust |
| 🌱 ESG | `esg_agent.py` | Environmental, governance |
| 🔗 Synthesis | `synthesis_agent.py` | Cross-domain compound risks |
| 🔍 Quality | `quality_agent.py` | Citation verification, coverage |
| 📝 Report | `report_builder_agent.py` | IC-ready PDF report |
| 🎯 Orchestrator | `orchestrator_agent.py` | Coordinates all agents |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│  React Dashboard (Vite)        :5173                │
│  - Live agent status grid                           │
│  - Risk heatmap (Domain × Severity)                 │
│  - D3 cross-reference graph                         │
│  - FindingsTable with citations                     │
│  - Go/No-Go verdict card                            │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket + REST
┌────────────────────▼────────────────────────────────┐
│  Node.js API Gateway (Express)  :4100               │
│  - File uploads → shared volume                     │
│  - MongoDB state management                         │
│  - Redis pub/sub → Socket.IO relay                  │
│  - Prometheus /metrics                              │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + Redis pub/sub
┌────────────────────▼────────────────────────────────┐
│  Python FastAPI (AI Engine)     :8100               │
│  - 13 AI agents (GPT-4o/mini)                       │
│  - PDF/DOCX/XLSX parsing                            │
│  - Parallel async execution                         │
│  - Publishes progress to Redis                      │
└─────────────────────────────────────────────────────┘
```

**Infrastructure:** MongoDB · Redis · Prometheus · Grafana (all Dockerized)

---

## 🛠️ Common Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f                 # all services
docker compose logs -f backend         # Python AI agents
docker compose logs -f server          # Node.js gateway
docker compose logs -f client          # React Vite

# Rebuild after code changes
docker compose up -d --build

# Restart backend after .env changes
docker compose restart backend

# Check container health
docker ps --filter "name=dd_"
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
OPENAI_API_KEY=sk-your-openai-key-here

# Optional overrides (defaults shown)
MONGO_ROOT_USER=ddadmin
MONGO_ROOT_PASS=ddpassword
MONGO_DB=diligence
REDIS_PASS=redispassword
GRAFANA_USER=admin
GRAFANA_PASS=grafanapassword
```

---

## 📊 Grafana Dashboards

Four dashboards auto-provision on first start at **http://localhost:3200**:

| Dashboard | What It Shows |
|---|---|
| **System Health** | CPU, RAM, MongoDB, Redis, WebSocket connections |
| **Agent Performance** | Per-agent duration, token usage, error rates |
| **Deal Pipeline** | Job throughput, status distribution over time |
| **Risk Overview** | Finding severity distribution, quality gate pass rates |

---

## 📁 Project Structure

```
AcquiSense/
├── backend/              # Python FastAPI — AI engine (13 specialist agents + mobile copilot SSE)
│   ├── agents/           # Specialist & orchestration agents
│   ├── api/              # Routes, schemas, mobile_copilot.py
│   ├── main.py           # FastAPI app entry
│   └── requirements.txt
├── server/               # Node.js Express — API gateway & synchronization
│   └── src/
│       ├── routes/       # deals, uploads, jobs, mobileSyncRoutes, mobileAuthRoutes
│       ├── models/       # MongoDB schemas (Deal, Finding, User, MobileDevice)
│       ├── workers/      # fcmPushWorker (Redis Stream deduplication)
│       └── app.js
├── client/               # React + Vite — Web dashboard
│   ├── src/components/   # AgentGrid, RiskHeatmap, FindingsTable, GoNoGo
│   └── src/pages/        # Dashboard, DealView, Reports, ActionCenter
├── mobile/               # React Native / Expo SDK 52 — Zero-Trust Android Client
│   ├── app/              # Expo Router routes (biometrics, tabs, deals, dossier)
│   ├── src/db/           # SQLCipher AES-256 + FTS5 Porter BM25 engine & coalescing outbox
│   ├── src/services/     # Lazy Keystore bootstrap, token refresh mutex, multipart uploader
│   ├── src/components/   # SkiaForceGraph, PocketCopilot, CitationsBottomSheet
│   └── src/hooks/        # useResumableCopilot (SSE with 401 recovery & voice mic)
├── grafana/              # Grafana dashboards + provisioning
├── prometheus/           # Prometheus scrape config
├── infra/podman/         # Quadlet unit systemd configurations
├── scripts/              # Podman & Docker cross-platform startup automation
└── podman-compose.yml    # Rootless Podman compose deployment
```

---

## 📱 AcquiSense Android Mobile App (v3.0 Zero-Trust)

AcquiSense Mobile brings institutional-grade M&A diligence into the hands of Private Equity partners and corporate development leads on Android.

### 🛡️ Enterprise Zero-Trust Architecture
1. **Hardware Keystore & SQLCipher AES-256**: All offline target findings, deal metrics, and FTS5 full-text search indexes are encrypted at rest with 256-bit keys provisioned via `Android Keystore` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Lazy singleton bootstrap prevents background crash on locked FCM wake.
2. **Coalescing Atomic Outbox**: Sequential offline edits (verdicts, conditions, workflow status) are coalesced locally preserving `baseVersion` and flushed atomically via MongoDB compare-and-swap (`__v == baseVersion`), preventing self-inflicted OCC conflicts.
3. **Decoupled Resumable Pocket Copilot**: SSE stream decoupled from the LLM generator via Redis Streams (`XREAD`). Seamlessly recovers interrupted connections via `Last-Event-ID` and single-flight 401 refresh mutex.
4. **Hold-to-Talk Voice Queries**: Instant Whisper-1 transcription primed with institutional M&A terms (EBITDA, QoE, P0, indemnification caps).
5. **Forensic PDF Watermarking**: Real-time server-side `pdf-lib` stream burns analyst email, IP address, and UTC timestamp diagonally across confidential target contracts.
6. **Remote MNPI Kill-Switch**: High-priority silent FCM push and 403 wipe interceptor cryptographically shreds local SQLCipher database and keystore keys on lost or revoked devices.

### 🏃 Running the Mobile App

```bash
cd mobile
npm install
npx expo start
# Press 'a' to open on Android Emulator or scan QR code via Expo Go / Development Build
```

---

## 🔬 Model Profiles

| Profile | Agents | Best For |
|---|---|---|
| Economy | GPT-4o-mini (all) | Quick screening, low cost |
| Standard ⭐ | GPT-4o-mini + GPT-4o synthesis | Recommended for most deals |
| Premium | GPT-4o (all) | IC-ready deep analysis |

---

## 👤 Author

**Samradh Sahni** — [github.com/SamradhSahni](https://github.com/SamradhSahni)

Built with: Python · FastAPI · Node.js · React · MongoDB · Redis · Docker · Grafana · OpenAI