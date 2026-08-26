"""
Report Agent — assembles all findings into a structured JSON report
that the Node.js server and React frontend consume.

Output:
  - Full JSON report (stored in Redis / returned via API)
  - Per-domain summaries
  - Go/No-Go verdict with rationale
  - Domain risk scores
  - Cross-reference list
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

from api.schemas import (
    CrossReference,
    Domain,
    DomainFindings,
    GoNoGo,
    Severity,
)

logger = logging.getLogger(__name__)


class ReportAgent:
    """Assembles the final structured report dict from all processed data."""

    def build_report(
        self,
        job_id: str,
        deal_id: str,
        domain_findings: dict[Domain, DomainFindings],
        cross_references: list[CrossReference],
        go_no_go: GoNoGo,
        executive_summary: str,
        target_company: str = "",
        acquirer: str = "",
        gate_warnings: list[str] | None = None,
    ) -> dict:
        """
        Build and return the full report as a Python dict (JSON-serializable).
        """
        logger.info("[Report] Building report for job=%s", job_id)

        all_findings = [
            f
            for df in domain_findings.values()
            for f in df.findings
        ]

        # Severity distribution
        severity_counts = {sev.value: 0 for sev in Severity}
        for f in all_findings:
            severity_counts[f.severity.value] += 1

        # Domain scores
        domain_scores = {
            d.value: df.risk_score
            for d, df in domain_findings.items()
        }

        # Serialise domain findings
        domains_payload = {}
        for domain, df in domain_findings.items():
            domains_payload[domain.value] = {
                "summary": df.summary,
                "risk_score": df.risk_score,
                "findings_count": len(df.findings),
                "findings": [_serialise_finding(f) for f in df.findings],
            }

        # Serialise cross-references
        cross_refs_payload = [_serialise_xref(xr) for xr in cross_references]

        report = {
            "meta": {
                "job_id": job_id,
                "deal_id": deal_id,
                "target_company": target_company,
                "acquirer": acquirer,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "version": "1.0.0",
            },
            "verdict": {
                "go_no_go": go_no_go.value,
                "executive_summary": executive_summary,
                "severity_distribution": severity_counts,
                "total_findings": len(all_findings),
                "total_cross_references": len(cross_references),
                "highest_severity": _highest_severity(all_findings),
            },
            "domain_scores": domain_scores,
            "domains": domains_payload,
            "cross_references": cross_refs_payload,
            "quality_gate_warnings": gate_warnings or [],
        }

        logger.info(
            "[Report] Built — %d findings, %d xrefs, verdict=%s",
            len(all_findings), len(cross_references), go_no_go.value,
        )

        return report


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialise_finding(f) -> dict:
    return {
        "id": f.id,
        "domain": f.domain.value,
        "severity": f.severity.value,
        "title": f.title,
        "description": f.description,
        "evidence": f.evidence,
        "citations": [
            {
                "file": c.file,
                "page": c.page,
                "section": c.section,
                "quote": c.quote,
            }
            for c in f.citations
        ],
        "cross_ref_ids": f.cross_ref_ids,
        "tags": f.tags,
    }


def _serialise_xref(xr: CrossReference) -> dict:
    return {
        "id": xr.id,
        "finding1_id": xr.finding1_id,
        "finding2_id": xr.finding2_id,
        "domains": [d.value for d in xr.domains],
        "connection_type": xr.connection_type,
        "narrative": xr.narrative,
        "combined_severity": xr.combined_severity.value,
    }


def _highest_severity(findings: list) -> str:
    if any(f.severity == Severity.P0 for f in findings):
        return "P0"
    if any(f.severity == Severity.P1 for f in findings):
        return "P1"
    if any(f.severity == Severity.P2 for f in findings):
        return "P2"
    if findings:
        return "P3"
    return "NONE"
