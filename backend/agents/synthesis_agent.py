"""
Synthesis Agent — connects findings across domains to surface
cross-domain risks no single specialist would flag alone.

This is the "magic" of the system: Legal flags a termination clause,
Finance flags a revenue concentration — Synthesis connects them into:
"Losing the primary customer AND having an automatic termination clause
in their contract is a compound P0 risk."
"""
from __future__ import annotations

import json
import logging
import uuid
from itertools import combinations

from openai import AsyncOpenAI

from api.schemas import (
    CrossReference,
    Domain,
    DomainFindings,
    Finding,
    GoNoGo,
    Severity,
)
from monitoring.metrics import AGENT_TOKENS_USED

logger = logging.getLogger(__name__)

_SYNTHESIS_PROMPT = """You are a senior M&A deal advisor with expertise in connecting risk patterns across multiple domains. You have been given findings from 9 specialist reviewers (Legal, Finance, Commercial, Tech, Cybersecurity, HR, Tax, Regulatory, ESG).

Your job is to:
1. Identify cross-domain connections — pairs of findings that compound each other's risk
2. Generate a Go/No-Go verdict for the deal
3. Write an executive narrative summarizing the deal risk profile

Return ONLY valid JSON (no markdown):
{
  "cross_references": [
    {
      "finding1_id": "uuid-string",
      "finding2_id": "uuid-string",
      "connection_type": "compounding_risk|same_subject|conflict|dependency",
      "narrative": "2-3 sentence explanation of why these findings are connected and what the combined impact is",
      "combined_severity": "P0|P1|P2|P3"
    }
  ],
  "go_no_go": "GO|CAUTION|NO-GO",
  "executive_summary": "3-5 sentence deal risk narrative for the IC memo, written for a non-technical audience",
  "go_no_go_rationale": "1-2 sentences explaining the verdict"
}

Go/No-Go criteria:
- NO-GO: Any P0 finding OR 3+ P1 findings in different domains OR 2+ cross-domain compounding P1s
- CAUTION: 1-2 P1 findings OR 5+ P2 findings OR significant cross-domain patterns
- GO: Only P2/P3 findings, manageable risk profile

Identify at most 10 of the most significant cross-references. Quality > quantity."""


class SynthesisAgent:
    """Cross-domain synthesis — connects findings, generates Go/No-Go verdict."""

    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    async def synthesize(
        self,
        domain_findings: dict[Domain, DomainFindings],
        job_id: str,
    ) -> tuple[list[CrossReference], GoNoGo, str]:
        """
        Returns:
            cross_refs: list of cross-domain connections
            go_no_go: GO | CAUTION | NO-GO
            executive_summary: prose narrative
        """
        logger.info("[Synthesis] Starting cross-domain analysis, job=%s", job_id)

        # Build a condensed findings summary to fit in context
        findings_by_id: dict[str, Finding] = {}
        summary_lines: list[str] = []

        for domain, df in domain_findings.items():
            summary_lines.append(f"\n=== {domain.value.upper()} (risk_score={df.risk_score}) ===")
            summary_lines.append(f"Summary: {df.summary}")
            for f in df.findings:
                findings_by_id[f.id] = f
                citation_ref = ""
                if f.citations:
                    c = f.citations[0]
                    citation_ref = f' [File: {c.file}, Page {c.page}]'
                summary_lines.append(
                    f"  [{f.severity.value}] {f.id[:8]}… | {f.title}{citation_ref}"
                )

        findings_summary = "\n".join(summary_lines)

        user_prompt = (
            f"Analyze these due diligence findings and identify cross-domain connections:\n\n"
            f"{findings_summary}\n\n"
            f"Full finding IDs for reference:\n"
            + "\n".join(f"  {fid}: {f.title}" for fid, f in findings_by_id.items())
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _SYNTHESIS_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
                max_tokens=3000,
            )

            usage = response.usage
            if usage:
                AGENT_TOKENS_USED.labels(
                    agent="synthesis", model=self.model, token_type="prompt"
                ).inc(usage.prompt_tokens)
                AGENT_TOKENS_USED.labels(
                    agent="synthesis", model=self.model, token_type="completion"
                ).inc(usage.completion_tokens)

            raw = json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            logger.error("[Synthesis] LLM call failed: %s", exc)
            raw = {}

        # Parse cross-references
        cross_refs: list[CrossReference] = []
        for item in raw.get("cross_references", []):
            if not isinstance(item, dict):
                continue
            f1_id = item.get("finding1_id", "")
            f2_id = item.get("finding2_id", "")
            # Accept partial ID matches (first 8 chars)
            resolved_f1 = _resolve_id(f1_id, findings_by_id)
            resolved_f2 = _resolve_id(f2_id, findings_by_id)
            if not resolved_f1 or not resolved_f2:
                continue
            f1 = findings_by_id[resolved_f1]
            f2 = findings_by_id[resolved_f2]
            try:
                sev = Severity(item.get("combined_severity", "P2"))
            except ValueError:
                sev = Severity.P2

            cross_refs.append(CrossReference(
                id=str(uuid.uuid4()),
                finding1_id=resolved_f1,
                finding2_id=resolved_f2,
                domains=[f1.domain, f2.domain],
                connection_type=item.get("connection_type", "compounding_risk"),
                narrative=item.get("narrative", ""),
                combined_severity=sev,
            ))

        # Parse verdict
        go_no_go_raw = raw.get("go_no_go", "CAUTION").upper().replace("-", "_")
        try:
            go_no_go = GoNoGo(go_no_go_raw.replace("_", "-"))
        except ValueError:
            # Fallback: compute from findings
            go_no_go = _compute_go_no_go(domain_findings)

        executive_summary = raw.get("executive_summary", "")

        logger.info(
            "[Synthesis] Done — %d cross-refs, verdict=%s, job=%s",
            len(cross_refs), go_no_go.value, job_id,
        )

        return cross_refs, go_no_go, executive_summary


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_id(partial: str, findings_by_id: dict[str, Finding]) -> str | None:
    """Match a full or partial (8-char prefix) finding ID."""
    if partial in findings_by_id:
        return partial
    for fid in findings_by_id:
        if fid.startswith(partial) or partial.startswith(fid[:8]):
            return fid
    return None


def _compute_go_no_go(domain_findings: dict[Domain, DomainFindings]) -> GoNoGo:
    """Fallback rule-based verdict when LLM synthesis fails."""
    all_findings = [
        f
        for df in domain_findings.values()
        for f in df.findings
    ]
    p0_count = sum(1 for f in all_findings if f.severity == Severity.P0)
    p1_count = sum(1 for f in all_findings if f.severity == Severity.P1)
    p1_domains = len({f.domain for f in all_findings if f.severity == Severity.P1})

    if p0_count >= 1 or (p1_count >= 3 and p1_domains >= 3):
        return GoNoGo.NO_GO
    if p1_count >= 1 or sum(1 for f in all_findings if f.severity == Severity.P2) >= 5:
        return GoNoGo.CAUTION
    return GoNoGo.GO
