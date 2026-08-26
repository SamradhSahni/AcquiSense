"""
Due Diligence Agents — Python FastAPI Backend
Full implementation with all 13 agents, ingestion pipeline, and Prometheus metrics.
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

from api.routes import router
from monitoring.metrics import (
    PIPELINE_JOBS_TOTAL,
    AGENT_ANALYSIS_DURATION,
    AGENT_TOKENS_USED,
    AGENT_FINDINGS_COUNT,
    QUALITY_GATE_FAILURES,
    ACTIVE_JOBS,
    DOCS_INGESTED,
    INGESTION_ERRORS,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Due Diligence Backend starting — all 13 agents ready")
    upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
    os.makedirs(upload_dir, exist_ok=True)
    yield
    logger.info("🛑 Due Diligence Backend shutting down")


app = FastAPI(
    title="Due Diligence Agents API",
    description=(
        "13 AI agents performing forensic M&A due diligence across 9 domains. "
        "Powered by OpenAI GPT-4o / GPT-4o-mini."
    ),
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:4000",
        os.getenv("CLIENT_ORIGIN", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all API routes
app.include_router(router)


@app.get("/health", tags=["Infrastructure"])
async def health():
    return {
        "status": "ok",
        "service": "dd-backend",
        "version": "2.0.0",
        "agents": 13,
        "timestamp": time.time(),
    }


@app.get("/ready", tags=["Infrastructure"])
async def ready():
    return {"status": "ready", "agents_loaded": 13}


@app.get("/metrics", tags=["Infrastructure"])
async def metrics() -> Response:
    """Prometheus scrape endpoint."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
