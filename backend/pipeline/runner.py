"""
Pipeline Runner — orchestrates the full end-to-end analysis:

  1. Ingest & parse documents
  2. Chunk documents
  3. Run 9 domain agents in parallel (via Orchestrator)
  4. Cross-reference synthesis (SynthesisAgent)
  5. Quality gates (QualityGateAgent)
  6. Build report (ReportAgent)
  7. Store result in Redis + signal completion to Node gateway

Called as a background asyncio task from the FastAPI route.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Callable, Awaitable

import redis.asyncio as aioredis
from openai import AsyncOpenAI

from agents.orchestrator import Orchestrator
from agents.synthesis_agent import SynthesisAgent
from agents.quality_gate_agent import QualityGateAgent
from agents.report_agent import ReportAgent
from api.schemas import (
    AgentProgress,
    AgentStatus,
    AnalyzeRequest,
    AnalysisJob,
    Domain,
    JobStatus,
)
from ingestion.parser import parse_file
from ingestion.chunker import chunk_documents
from monitoring.metrics import (
    PIPELINE_JOBS_TOTAL,
    DOCS_INGESTED,
    INGESTION_ERRORS,
)

logger = logging.getLogger(__name__)

# Redis key prefixes
JOB_KEY = "dd:job:{job_id}"
RESULT_KEY = "dd:result:{job_id}"
PROGRESS_CHANNEL = "dd:progress:{job_id}"

# Job TTL in Redis (24 hours)
JOB_TTL_SECONDS = 86400


class PipelineRunner:
    """
    The main pipeline. Instantiated once per job and run as a background task.
    Communicates job status and agent progress back through Redis pub/sub so
    the Node gateway can relay updates to the React frontend via WebSocket.
    """

    def __init__(
        self,
        redis_url: str,
        openai_api_key: str,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ):
        self.redis_url = redis_url
        self.openai_api_key = openai_api_key
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    async def run(self, request: AnalyzeRequest, job_id: str) -> None:
        """
        Full pipeline execution. Designed to run as an asyncio background task.
        All state is persisted to Redis so the status endpoint can poll it.
        """
        redis = await aioredis.from_url(self.redis_url, decode_responses=True)

        async def update_job(status: JobStatus, **kwargs) -> None:
            """Persist job state to Redis."""
            current_raw = await redis.get(JOB_KEY.format(job_id=job_id))
            current = json.loads(current_raw) if current_raw else {}
            current.update({"status": status.value, "job_id": job_id, **kwargs})
            await redis.setex(
                JOB_KEY.format(job_id=job_id),
                JOB_TTL_SECONDS,
                json.dumps(current),
            )
            # Publish progress event to Node gateway
            await redis.publish(
                PROGRESS_CHANNEL.format(job_id=job_id),
                json.dumps({"type": "job_status", "job_id": job_id, "status": status.value, **kwargs}),
            )

        async def agent_progress_cb(progress: AgentProgress) -> None:
            """Relay per-agent progress to Redis pub/sub."""
            event = {
                "type": "agent_progress",
                "job_id": job_id,
                "domain": progress.domain.value,
                "status": progress.status.value,
                "pct": progress.pct,
                "findings_count": progress.findings_count,
            }
            await redis.publish(
                PROGRESS_CHANNEL.format(job_id=job_id),
                json.dumps(event),
            )

        try:
            # ── Step 1: Ingestion ─────────────────────────────────────────────
            await update_job(JobStatus.INGESTING)
            logger.info("[Pipeline] Ingesting %d files, job=%s", len(request.file_paths), job_id)

            parsed_docs = []
            for file_path in request.file_paths:
                full_path = os.path.join("/app/uploads", file_path.lstrip("/"))
                doc = parse_file(full_path)
                if doc.error:
                    logger.warning("Failed to parse %s: %s", file_path, doc.error)
                    INGESTION_ERRORS.labels(reason="parse_error").inc()
                else:
                    parsed_docs.append(doc)
                    DOCS_INGESTED.labels(file_type=doc.file_type).inc()

            if not parsed_docs:
                raise ValueError("No documents could be parsed from the provided files.")

            chunks = chunk_documents(
                parsed_docs,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
            )
            logger.info("[Pipeline] Produced %d chunks from %d docs", len(chunks), len(parsed_docs))

            # ── Step 2: Domain analysis (parallel) ───────────────────────────
            await update_job(JobStatus.ANALYZING)
            profile = request.model_profile or "standard"
            deal_context = (
                f"Target: {request.target_company}. Acquirer: {request.acquirer}."
                if request.target_company or request.acquirer else ""
            )

            orchestrator = Orchestrator(
                openai_api_key=self.openai_api_key,
                model_profile=profile,
            )
            domain_findings = await orchestrator.run_all_agents(
                chunks=chunks,
                job_id=job_id,
                deal_context=deal_context,
                progress_cb=agent_progress_cb,
            )

            # ── Step 3: Cross-domain synthesis ───────────────────────────────
            await update_job(JobStatus.SYNTHESIZING)
            synthesis_model = Orchestrator.MODEL_PROFILES if hasattr(Orchestrator, "MODEL_PROFILES") else {}
            synth_model = {"economy": "gpt-4o-mini", "standard": "gpt-4o", "premium": "gpt-4o"}.get(profile, "gpt-4o")

            synthesis = SynthesisAgent(
                client=AsyncOpenAI(api_key=self.openai_api_key),
                model=synth_model,
            )
            cross_refs, go_no_go, executive_summary = await synthesis.synthesize(
                domain_findings=domain_findings,
                job_id=job_id,
            )

            # ── Step 4: Quality gates ─────────────────────────────────────────
            await update_job(JobStatus.QUALITY_CHECK)
            qg = QualityGateAgent()
            domain_findings, gate_results = qg.run_all_gates(domain_findings, chunks)
            gate_warnings = [w for r in gate_results for w in r.warnings]

            # ── Step 5: Build report ─────────────────────────────────────────
            await update_job(JobStatus.GENERATING_REPORT)
            report = ReportAgent().build_report(
                job_id=job_id,
                deal_id=request.deal_id,
                domain_findings=domain_findings,
                cross_references=cross_refs,
                go_no_go=go_no_go,
                executive_summary=executive_summary,
                target_company=request.target_company,
                acquirer=request.acquirer,
                gate_warnings=gate_warnings,
            )

            # ── Step 6: Persist result ───────────────────────────────────────
            await redis.setex(
                RESULT_KEY.format(job_id=job_id),
                JOB_TTL_SECONDS,
                json.dumps(report),
            )
            await update_job(
                JobStatus.DONE,
                go_no_go=go_no_go.value,
                total_findings=report["verdict"]["total_findings"],
            )
            PIPELINE_JOBS_TOTAL.labels(status="done").inc()
            logger.info("[Pipeline] Completed job=%s verdict=%s", job_id, go_no_go.value)

        except Exception as exc:
            logger.exception("[Pipeline] Job %s FAILED: %s", job_id, exc)
            await update_job(JobStatus.FAILED, error=str(exc))
            PIPELINE_JOBS_TOTAL.labels(status="failed").inc()
        finally:
            await redis.aclose()
