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
├── backend/              # Python FastAPI — AI engine
│   ├── agents/           # 13 specialist + orchestration agents
│   ├── utils/            # File parsing, schema, pipeline
│   ├── main.py           # FastAPI app entry
│   └── requirements.txt
├── server/               # Node.js Express — API gateway
│   └── src/
│       ├── routes/       # deals, uploads, jobs, reports
│       ├── models/       # MongoDB schemas
│       ├── services/     # Python bridge, Redis subscriber
│       └── app.js
├── client/               # React + Vite — dashboard
│   └── src/
│       ├── components/   # AgentGrid, RiskHeatmap, FindingsTable, GoNoGo, CrossRefGraph
│       ├── pages/        # LandingPage, Dashboard, NewDeal, DealView, Reports
│       └── services/     # api.js (Axios), socket.js (Socket.IO)
├── grafana/              # Grafana dashboards + provisioning
├── prometheus/           # Prometheus scrape config
├── infra/mongo/          # MongoDB init script
└── docker-compose.yml    # Full stack orchestration
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