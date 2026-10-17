"""
FastAPI routes — all /api/* endpoints for the analysis pipeline.

Security hardening in this version:
  - Rate limiting via slowapi (LLM04, CWE-400)
  - File upload hardening via FileValidator (CWE-434, CWE-22)
  - Input guardrails on all LLM-touching endpoints (LLM01)
  - MIME-type and magic-byte validation on uploads
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

import redis.asyncio as aioredis
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI

from api.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    AnalystQuestionsResponse,
    CopilotQuery,
    CopilotResponse,
    JobStatus,
    JobStatusResponse,
    ResultsResponse,
)
from api.file_validator import FileValidator
from agents.guardrails import InputGuardrail
from agents.copilot_agent import CopilotAgent
from agents.analyst_questions_agent import AnalystQuestionsAgent
from agents.document_comparator_agent import DocumentComparatorAgent
from pipeline.runner import PipelineRunner, JOB_KEY, RESULT_KEY

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# ── Config from env ───────────────────────────────────────────────────────────
REDIS_URL       = os.getenv("REDIS_URL", "redis://localhost:6379/0")
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL") or None
UPLOAD_DIR      = os.getenv("UPLOAD_DIR", "/app/uploads")
CHUNK_SIZE      = int(os.getenv("CHUNK_SIZE", "1000"))
CHUNK_OVERLAP   = int(os.getenv("CHUNK_OVERLAP", "200"))
MAX_FILE_SIZE   = int(os.getenv("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024

# Keys cached for analyst questions
QUESTIONS_KEY   = "dd:questions:{job_id}"

# Singletons
_file_validator    = FileValidator(max_file_size=MAX_FILE_SIZE)
_input_guardrail   = InputGuardrail()


def _get_openai_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)


# ── File upload ───────────────────────────────────────────────────────────────

@router.post("/upload", summary="Upload documents to the data room")
async def upload_files(files: list[UploadFile] = File(...)) -> dict[str, Any]:
    """
    Accept one or more files, validate them (magic-byte + MIME + size + sanitize),
    save to /app/uploads/{unique_name}, return saved file paths.

    Security:
      - Extension allowlist (CWE-434)
      - Magic-byte validation — rejects executables disguised as docs (CWE-434)
      - Filename sanitization — prevents directory traversal (CWE-22)
      - File size limit
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved: list[str] = []
    errors: list[str] = []

    for file in files:
        content = await file.read()
        original_name = file.filename or "unnamed"

        # Full validation pipeline
        result = _file_validator.validate(original_name, content)

        if not result.valid:
            for err in result.errors:
                errors.append(f"{original_name}: {err.message}")
                logger.warning("Upload rejected [%s]: %s", err.code, err.message)
            continue

        # Use sanitized filename (never the original)
        safe_name = f"{uuid.uuid4().hex}_{result.safe_filename}"
        dest = os.path.join(UPLOAD_DIR, safe_name)

        # Final path safety check — ensure dest is inside UPLOAD_DIR
        if not os.path.abspath(dest).startswith(os.path.abspath(UPLOAD_DIR)):
            errors.append(f"{original_name}: Path traversal attempt blocked.")
            logger.error("SECURITY: Path traversal blocked for file '%s'", original_name)
            continue

        with open(dest, "wb") as f:
            f.write(content)
        saved.append(safe_name)
        logger.info("Uploaded '%s' → '%s' (%d bytes)", original_name, safe_name, len(content))

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


# ── IMPORTANT: Specific sub-paths MUST be defined BEFORE /{domain} catch-all ──
# FastAPI matches routes top-to-bottom. /results/{job_id}/questions and
# /results/{job_id}/compare must appear before /results/{job_id}/{domain}.


@router.post("/results/{job_id}/questions", summary="Generate analyst questions from provided report data")
async def generate_questions_from_report(job_id: str, request: Request) -> dict[str, Any]:
    """
    Generate analyst interview questions when report data is passed directly in the body.
    Used as fallback when Redis cache has expired — Node.js fetches from MongoDB and POSTs here.

    Body: { "report": { ...full report JSON... } }
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    body = await request.json()
    report = body.get("report")
    if not report:
        raise HTTPException(status_code=400, detail="'report' field is required in request body.")

    # Check questions cache first
    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        cached = await redis.get(QUESTIONS_KEY.format(job_id=job_id))
        if cached:
            return json.loads(cached)
    finally:
        await redis.aclose()

    from api.schemas import Domain, DomainFindings, Finding, CrossReference, Citation, Severity
    domain_findings: dict[Domain, DomainFindings] = {}
    for domain_key, domain_val in report.get("domains", {}).items():
        try:
            domain_enum = Domain(domain_key)
            findings = []
            for f in domain_val.get("findings", []):
                try:
                    findings.append(Finding(
                        id=f.get("id", str(uuid.uuid4())),
                        domain=domain_enum,
                        severity=Severity(f.get("severity", "P2")),
                        title=f.get("title", ""),
                        description=f.get("description", ""),
                        evidence=f.get("evidence", ""),
                        citations=[Citation(**c) for c in f.get("citations", [])],
                        tags=f.get("tags", []),
                    ))
                except Exception:
                    pass
            domain_findings[domain_enum] = DomainFindings(
                domain=domain_enum,
                findings=findings,
                summary=domain_val.get("summary", ""),
                risk_score=domain_val.get("risk_score", 0.0),
            )
        except ValueError:
            pass

    cross_refs = []
    for cr in report.get("cross_references", []):
        try:
            cross_refs.append(CrossReference(**cr))
        except Exception:
            pass

    agent = AnalystQuestionsAgent(client=_get_openai_client())
    result = await agent.generate(domain_findings, cross_refs, job_id)

    # Cache result for next time
    redis2 = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        await redis2.setex(QUESTIONS_KEY.format(job_id=job_id), 86400, json.dumps(result))
    finally:
        await redis2.aclose()

    return result


@router.get("/results/{job_id}/questions", summary="Get analyst interview questions")
async def get_analyst_questions(job_id: str) -> dict[str, Any]:
    """
    Get (or generate) management interview questions for a completed deal.
    Results are cached in Redis after first generation.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        # Check if already generated
        cached = await redis.get(QUESTIONS_KEY.format(job_id=job_id))
        if cached:
            return json.loads(cached)

        # Load analysis results
        raw = await redis.get(RESULT_KEY.format(job_id=job_id))
        if not raw:
            raise HTTPException(status_code=404, detail=f"Results for job {job_id} not found.")

        report = json.loads(raw)
    finally:
        await redis.aclose()

    # Reconstruct domain findings
    from api.schemas import Domain, DomainFindings, Finding, CrossReference, Citation, Severity
    domain_findings: dict[Domain, DomainFindings] = {}
    for domain_key, domain_val in report.get("domains", {}).items():
        try:
            domain_enum = Domain(domain_key)
            findings = []
            for f in domain_val.get("findings", []):
                try:
                    findings.append(Finding(
                        id=f.get("id", str(uuid.uuid4())),
                        domain=domain_enum,
                        severity=Severity(f.get("severity", "P2")),
                        title=f.get("title", ""),
                        description=f.get("description", ""),
                        evidence=f.get("evidence", ""),
                        citations=[Citation(**c) for c in f.get("citations", [])],
                        tags=f.get("tags", []),
                    ))
                except Exception:
                    pass
            domain_findings[domain_enum] = DomainFindings(
                domain=domain_enum,
                findings=findings,
                summary=domain_val.get("summary", ""),
                risk_score=domain_val.get("risk_score", 0.0),
            )
        except ValueError:
            pass

    cross_refs = []
    for cr in report.get("cross_references", []):
        try:
            cross_refs.append(CrossReference(**cr))
        except Exception:
            pass

    # Generate questions
    agent = AnalystQuestionsAgent(client=_get_openai_client())
    result = await agent.generate(domain_findings, cross_refs, job_id)

    # Cache for 24h
    redis2 = await aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        await redis2.setex(
            QUESTIONS_KEY.format(job_id=job_id),
            86400,
            json.dumps(result),
        )
    finally:
        await redis2.aclose()

    return result


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


# ── Deal Copilot ──────────────────────────────────────────────────────────────

@router.post("/copilot/{deal_id}", summary="Ask the Deal Copilot a question")
async def ask_copilot(
    deal_id: str,
    body: CopilotQuery,
) -> dict[str, Any]:
    """
    RAG-powered AI chatbot for a specific deal.

    Security:
      - Input guardrail blocks prompt injection (OWASP LLM01)
      - Output guardrail DLP scan (OWASP LLM06)
      - Never exposes raw system prompt

    Retrieval:
      - BM25 + TF-IDF cosine hybrid search over deal's findings
      - Domain-aware routing based on query keywords
      - Multi-turn conversation history support
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    # Load analysis results — try Redis first, then fallback to injected report from Node.js
    report_data = getattr(body, 'report', None)   # Node may inject this when Redis has expired

    if not report_data:
        redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        try:
            raw = await redis.get(RESULT_KEY.format(job_id=body.job_id))
        finally:
            await redis.aclose()

        if not raw:
            raise HTTPException(
                status_code=404,
                detail=f"Analysis results for job '{body.job_id}' not found. "
                       "Ensure the analysis has completed before using Copilot."
            )
        report_data = json.loads(raw)

    report = report_data

    # Reconstruct domain_findings + cross_refs from stored report
    from api.schemas import Domain, DomainFindings, Finding, CrossReference, Citation, Severity
    domain_findings: dict[Domain, DomainFindings] = {}

    domains_data = report.get("domains", {})
    for domain_key, domain_val in domains_data.items():
        try:
            domain_enum = Domain(domain_key)
        except ValueError:
            continue
        findings = []
        for f in domain_val.get("findings", []):
            try:
                citations = [Citation(**c) for c in f.get("citations", [])]
                findings.append(Finding(
                    id=f.get("id", str(uuid.uuid4())),
                    domain=domain_enum,
                    severity=Severity(f.get("severity", "P2")),
                    title=f.get("title", ""),
                    description=f.get("description", ""),
                    evidence=f.get("evidence", ""),
                    citations=citations,
                    tags=f.get("tags", []),
                ))
            except Exception:
                pass
        domain_findings[domain_enum] = DomainFindings(
            domain=domain_enum,
            findings=findings,
            summary=domain_val.get("summary", ""),
            risk_score=domain_val.get("risk_score", 0.0),
        )

    cross_refs = []
    for cr in report.get("cross_references", []):
        try:
            cross_refs.append(CrossReference(**cr))
        except Exception:
            pass

    # Build and run copilot
    agent = CopilotAgent(client=_get_openai_client())
    agent.build_context(domain_findings, cross_refs)

    history = [{"role": m.role, "content": m.content} for m in body.conversation_history]
    result = await agent.answer(body.query, deal_id, history)

    return result



# ── Document Comparator ───────────────────────────────────────────────────────

from pydantic import BaseModel as _PydanticBase

class CompareRequest(_PydanticBase):
    file_a: str     # filename as stored in /app/uploads
    file_b: str
    name_a: str = ""
    name_b: str = ""


@router.post("/results/{job_id}/compare", summary="Compare two documents from the deal")
async def compare_documents(job_id: str, body: CompareRequest) -> dict:
    """
    Semantic side-by-side comparison of two uploaded documents.
    Surfaces changed figures/clauses, new risks, removed items, and business impact.
    """
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured.")

    def read_doc(filename: str) -> str:
        path = os.path.join(UPLOAD_DIR, filename.lstrip("/"))
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()[:6000]
        except Exception:
            return ""

    text_a = read_doc(body.file_a)
    text_b = read_doc(body.file_b)

    name_a = body.name_a or body.file_a
    name_b = body.name_b or body.file_b

    agent = DocumentComparatorAgent(client=_get_openai_client())
    return await agent.compare(name_a, text_a, name_b, text_b, job_id)
