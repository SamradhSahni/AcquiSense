"""Prometheus metrics — single source of truth for all counters/histograms."""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

# ── Pipeline ──────────────────────────────────────────────────────────────────
PIPELINE_JOBS_TOTAL = Counter(
    "pipeline_jobs_total",
    "Total analysis jobs by status",
    ["status"],
)
ACTIVE_JOBS = Gauge("active_jobs_current", "Jobs currently running")

# ── Agents ────────────────────────────────────────────────────────────────────
AGENT_ANALYSIS_DURATION = Histogram(
    "agent_analysis_duration_seconds",
    "Wall-clock time for each domain agent",
    ["domain"],
    buckets=[5, 10, 30, 60, 120, 300, 600],
)
AGENT_TOKENS_USED = Counter(
    "agent_tokens_used_total",
    "OpenAI tokens consumed",
    ["agent", "model", "token_type"],   # token_type: prompt | completion
)
AGENT_FINDINGS_COUNT = Gauge(
    "agent_findings_count",
    "Live findings per domain per severity",
    ["domain", "severity"],
)

# ── Quality gates ─────────────────────────────────────────────────────────────
QUALITY_GATE_FAILURES = Counter(
    "quality_gate_failures_total",
    "Quality gate failures by gate name",
    ["gate"],
)

# ── Document ingestion ────────────────────────────────────────────────────────
DOCS_INGESTED = Counter(
    "docs_ingested_total",
    "Number of documents successfully ingested",
    ["file_type"],
)
INGESTION_ERRORS = Counter(
    "ingestion_errors_total",
    "Documents that failed ingestion",
    ["reason"],
)
