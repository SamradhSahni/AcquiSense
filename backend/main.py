"""
Due Diligence Agents — Python FastAPI Backend (Phase 1 Skeleton)
Full agent logic added in Phase 2. This skeleton proves the service boots
cleanly inside Docker and exposes all required endpoints + Prometheus metrics.
"""

from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
from starlette.responses import Response

# ─── Prometheus Metrics (defined early so imports always work) ────────────────

PIPELINE_JOBS_TOTAL = Counter(
    "pipeline_jobs_total",
    "Total analysis jobs by status",
    ["status"],
)
AGENT_ANALYSIS_DURATION = Histogram(
    "agent_analysis_duration_seconds",
    "Time taken per domain agent",
    ["domain"],
    buckets=[5, 10, 30, 60, 120, 300, 600],
)
AGENT_TOKENS_USED = Counter(
    "agent_tokens_used_total",
    "OpenAI tokens consumed per agent",
    ["agent", "model", "token_type"],
)
AGENT_FINDINGS_COUNT = Gauge(
    "agent_findings_count",
    "Number of findings per domain per job",
    ["domain", "severity"],
)
QUALITY_GATE_FAILURES = Counter(
    "quality_gate_failures_total",
    "Quality gate failures by gate name",
    ["gate"],
)
ACTIVE_JOBS = Gauge("active_jobs_current", "Jobs currently running")

# ─── App Lifespan ─────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events."""
    print("🚀 Due Diligence Backend starting up…")
    # Phase 2: init MongoDB motor client, Redis pool, load agent prompts
    yield
    print("🛑 Due Diligence Backend shutting down…")


# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Due Diligence Agents API",
    description=(
        "13 AI agents performing forensic M&A due diligence across 9 domains. "
        "Powered by OpenAI GPT-4o."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the React frontend and Node gateway
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # React dev server
        "http://localhost:4000",  # Node API gateway
        os.getenv("CLIENT_ORIGIN", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health & Readiness ───────────────────────────────────────────────────────


@app.get("/health", tags=["Infrastructure"])
async def health() -> dict[str, Any]:
    """Liveness probe — used by Docker health check."""
    return {
        "status": "ok",
        "service": "dd-backend",
        "version": "1.0.0",
        "timestamp": time.time(),
    }


@app.get("/ready", tags=["Infrastructure"])
async def ready() -> dict[str, Any]:
    """Readiness probe — will check DB/Redis in Phase 2."""
    return {
        "status": "ready",
        "checks": {
            "mongodb": "pending_phase2",
            "redis": "pending_phase2",
            "openai": "pending_phase2",
        },
    }


# ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────


@app.get("/metrics", tags=["Infrastructure"])
async def metrics() -> Response:
    """Prometheus scrape endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ─── Analysis Endpoints (stubs — fully implemented in Phase 2) ───────────────


@app.post("/api/analyze", tags=["Analysis"])
async def start_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Start a new due diligence analysis job.
    Phase 2: accepts deal_id + file references, enqueues 9 domain agents.
    """
    PIPELINE_JOBS_TOTAL.labels(status="queued").inc()
    return {
        "message": "Analysis endpoint stub — Phase 2 will wire full agent pipeline",
        "deal_id": payload.get("deal_id"),
        "job_id": "stub-job-id",
        "status": "queued",
    }


@app.get("/api/status/{job_id}", tags=["Analysis"])
async def get_job_status(job_id: str) -> dict[str, Any]:
    """
    Poll analysis job progress per domain.
    Phase 2: returns real agent states from Redis.
    """
    return {
        "job_id": job_id,
        "status": "stub",
        "agents": {
            domain: {"status": "pending", "findings": 0, "pct": 0}
            for domain in [
                "legal", "finance", "commercial", "tech",
                "cyber", "hr", "tax", "regulatory", "esg",
            ]
        },
    }


@app.get("/api/results/{job_id}", tags=["Analysis"])
async def get_results(job_id: str) -> dict[str, Any]:
    """Full findings for a completed job."""
    return {"job_id": job_id, "status": "stub", "findings": []}


@app.get("/api/results/{job_id}/{domain}", tags=["Analysis"])
async def get_domain_results(job_id: str, domain: str) -> dict[str, Any]:
    """Per-domain findings."""
    return {"job_id": job_id, "domain": domain, "findings": []}


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
