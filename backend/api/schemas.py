"""
Shared Pydantic schemas used across the entire backend.
"""
from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ───────────────────────────────────────────────────────────────────

class Domain(str, Enum):
    LEGAL = "legal"
    FINANCE = "finance"
    COMMERCIAL = "commercial"
    TECH = "tech"
    CYBER = "cyber"
    HR = "hr"
    TAX = "tax"
    REGULATORY = "regulatory"
    ESG = "esg"

ALL_DOMAINS = list(Domain)


class Severity(str, Enum):
    P0 = "P0"   # Critical / deal-breaker
    P1 = "P1"   # High
    P2 = "P2"   # Medium
    P3 = "P3"   # Low / informational


class JobStatus(str, Enum):
    QUEUED = "queued"
    INGESTING = "ingesting"
    ANALYZING = "analyzing"
    SYNTHESIZING = "synthesizing"
    QUALITY_CHECK = "quality_check"
    GENERATING_REPORT = "generating_report"
    DONE = "done"
    FAILED = "failed"


class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class GoNoGo(str, Enum):
    GO = "GO"
    CAUTION = "CAUTION"
    NO_GO = "NO-GO"


# ─── Core Data Models ─────────────────────────────────────────────────────────

class Citation(BaseModel):
    file: str
    page: int
    section: str = ""
    quote: str


class Finding(BaseModel):
    id: str
    domain: Domain
    severity: Severity
    title: str
    description: str
    evidence: str
    citations: list[Citation] = Field(default_factory=list)
    cross_ref_ids: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class CrossReference(BaseModel):
    id: str
    finding1_id: str
    finding2_id: str
    domains: list[Domain]
    connection_type: str       # e.g. "compounding_risk", "same_subject", "conflict"
    narrative: str
    combined_severity: Severity


class DomainFindings(BaseModel):
    domain: Domain
    findings: list[Finding] = Field(default_factory=list)
    summary: str = ""
    risk_score: float = 0.0    # 0.0 – 10.0
    agent_notes: str = ""


class AgentProgress(BaseModel):
    domain: Domain
    status: AgentStatus = AgentStatus.IDLE
    pct: int = 0               # 0-100
    findings_count: int = 0
    error: str | None = None


class AnalysisJob(BaseModel):
    job_id: str
    deal_id: str
    status: JobStatus = JobStatus.QUEUED
    agent_progress: dict[str, AgentProgress] = Field(default_factory=dict)
    go_no_go: GoNoGo | None = None
    error: str | None = None


# ─── API Request / Response models ───────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    deal_id: str
    file_paths: list[str]          # Paths inside /app/uploads/
    target_company: str = ""
    acquirer: str = ""
    model_profile: str = "standard"   # economy | standard | premium


class AnalyzeResponse(BaseModel):
    job_id: str
    deal_id: str
    status: str
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    deal_id: str
    status: JobStatus
    agent_progress: dict[str, AgentProgress]
    go_no_go: GoNoGo | None = None
    error: str | None = None


class ResultsResponse(BaseModel):
    job_id: str
    deal_id: str
    status: JobStatus
    domain_findings: dict[str, DomainFindings] = Field(default_factory=dict)
    cross_references: list[CrossReference] = Field(default_factory=list)
    go_no_go: GoNoGo | None = None
    executive_summary: str = ""
    domain_scores: dict[str, float] = Field(default_factory=dict)
    report_hash: str = ""           # SHA-256 fingerprint for tamper detection


# ─── Copilot Schemas ──────────────────────────────────────────────────────────

class CopilotMessage(BaseModel):
    """A single turn in the conversation history."""
    role: str                      # "user" | "assistant"
    content: str


class CopilotQuery(BaseModel):
    query: str
    job_id: str                    # Which analysis result to search
    conversation_history: list[CopilotMessage] = Field(default_factory=list)
    # Optional: Node.js injects this when Redis has expired (falls back from MongoDB)
    report: dict | None = Field(default=None, exclude=True)


class CopilotCitation(BaseModel):
    """A single citation card shown below an AI response."""
    ref_id: int
    finding_id: str | None = None
    domain: str
    severity: str = "P2"
    title: str
    file: str = ""
    page: int = 0
    quote: str = ""
    type: str = "finding"          # "finding" | "cross_ref" | "document"
    score: float = 0.0             # Retrieval relevance score


class CopilotResponse(BaseModel):
    answer: str
    citations: list[CopilotCitation] = Field(default_factory=list)
    domains_searched: list[str] = Field(default_factory=list)
    confidence: str = "medium"     # "high" | "medium" | "low"
    follow_up_suggestions: list[str] = Field(default_factory=list)
    guardrail_warnings: list[str] = Field(default_factory=list)


# ─── Analyst Questions Schemas ────────────────────────────────────────────────

class AnalystQuestion(BaseModel):
    id: str
    domain: str
    severity: str
    linked_finding_ids: list[str] = Field(default_factory=list)
    question: str
    rationale: str = ""
    what_to_look_for: str = ""


class AnalystQuestionsResponse(BaseModel):
    job_id: str
    questions: list[AnalystQuestion] = Field(default_factory=list)
    by_domain: dict[str, list[AnalystQuestion]] = Field(default_factory=dict)
    total: int = 0
