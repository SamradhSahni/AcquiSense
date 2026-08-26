"""
FastAPI routes — all /api/* endpoints for the analysis pipeline.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from api.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    JobStatus,
    JobStatusResponse,
    ResultsResponse,
)
from pipeline.runner import PipelineRunner, JOB_KEY, RESULT_KEY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# ── Config from env ───────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/app/uploads")
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))

ALLOWED_EXTENSIONS = {"pdf", "docx", "doc", "xlsx", "xls", "pptx", "txt", "csv", "md"}
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024


# ── File upload ───────────────────────────────────────────────────────────────

@router.post("/upload", summary="Upload documents to the data room")
async def upload_files(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    """
    Accept one or more files, save them to /app/uploads/{unique_name},
    return the saved file paths for use in /api/analyze.
    """
    saved: list[str] = []
    errors: list[str] = []

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    for file in files:
        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            errors.append(f"{file.filename}: unsupported type .{ext}")
            continue

        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            errors.append(f"{file.filename}: exceeds size limit")
            continue

        safe_name = f"{uuid.uuid4().hex}_{file.filename}"
        dest = os.path.join(UPLOAD_DIR, safe_name)
        with open(dest, "wb") as f:
            f.write(content)
        saved.append(safe_name)

    return {"saved": saved, "errors": errors, "count": len(saved)}


# ── Analysis pipeline ─────────────────────────────────────────────────────────

@router.post("/analyze", response_model=AnalyzeResponse, summary="Start a new DD analysis")
async def start_analysis(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
) -> AnalyzeResponse:
    """
    Kick off a full due diligence analysis job.
    Returns immediately with a job_id — poll /api/status/{job_id} for progress.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    if not request.file_paths:
        raise HTTPException(status_code=400, detail="No file_paths provided.")

    job_id = str(uuid.uuid4())

    # Persist initial job state to Redis
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis.setex(
        JOB_KEY.format(job_id=job_id),
        86400,
        json.dumps({
            "job_id": job_id,
            "deal_id": request.deal_id,
            "status": JobStatus.QUEUED.value,
            "agent_progress": {},
        }),
    )
    await redis.aclose()

    # Launch pipeline as a background task
    runner = PipelineRunner(
        redis_url=REDIS_URL,
        openai_api_key=OPENAI_API_KEY,
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    background_tasks.add_task(runner.run, request, job_id)

    logger.info("Queued job %s for deal %s", job_id, request.deal_id)

    return AnalyzeResponse(
        job_id=job_id,
        deal_id=request.deal_id,
        status=JobStatus.QUEUED.value,
        message="Analysis job queued. Poll /api/status/{job_id} for progress.",
    )


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status/{job_id}", summary="Poll analysis job progress")
async def get_job_status(job_id: str) -> dict[str, Any]:
    """Returns current job status and per-agent progress."""
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        raw = await redis.get(JOB_KEY.format(job_id=job_id))
    finally:
        await redis.aclose()

    if not raw:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    return json.loads(raw)


# ── Results ───────────────────────────────────────────────────────────────────

@router.get("/results/{job_id}", summary="Get full analysis results")
async def get_results(job_id: str) -> dict[str, Any]:
    """Returns the full structured report once the job is DONE."""
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        raw = await redis.get(RESULT_KEY.format(job_id=job_id))
        if not raw:
            # Check if job exists at all
            job_raw = await redis.get(JOB_KEY.format(job_id=job_id))
            if job_raw:
                job = json.loads(job_raw)
                raise HTTPException(
                    status_code=202,
                    detail=f"Job is still {job.get('status', 'running')}. Try again later.",
                )
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")
    finally:
        await redis.aclose()

    return json.loads(raw)


@router.get("/results/{job_id}/{domain}", summary="Get single-domain findings")
async def get_domain_results(job_id: str, domain: str) -> dict[str, Any]:
    """Returns findings for a specific domain only."""
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        raw = await redis.get(RESULT_KEY.format(job_id=job_id))
    finally:
        await redis.aclose()

    if not raw:
        raise HTTPException(status_code=404, detail=f"Results for job {job_id} not found.")

    report = json.loads(raw)
    domain_data = report.get("domains", {}).get(domain)
    if domain_data is None:
        raise HTTPException(status_code=404, detail=f"Domain '{domain}' not found in results.")

    return {"job_id": job_id, "domain": domain, **domain_data}
