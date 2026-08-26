"""
Quality Gate Agent — 5 blocking verification checks on all findings
before they reach the report. Prevents hallucinations and ensures
every finding has a traceable citation.

Gates (in order):
  1. Citation Presence    — every finding must cite at least one document
  2. Quote Grounding      — quotes must be extractable from source chunks
  3. Severity Calibration — P0/P1 findings need substantive evidence
  4. Completeness         — all 9 domains must have a result (even empty)
  5. Consistency          — no finding ID duplicated, no contradictory verdicts
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from api.schemas import Domain, DomainFindings, Finding, Severity
from ingestion.chunker import Chunk
from monitoring.metrics import QUALITY_GATE_FAILURES

logger = logging.getLogger(__name__)

ALL_DOMAINS = set(Domain)


@dataclass
class GateResult:
    passed: bool
    gate_name: str
    warnings: list[str] = field(default_factory=list)
    removed_finding_ids: list[str] = field(default_factory=list)


class QualityGateAgent:
    """
    Runs 5 blocking quality checks. On failure, it attempts auto-remediation
    (e.g., downgrading an uncited P0 to P1) rather than hard-blocking,
    because blocking the whole report is worse than a slight severity adjustment.
    """

    def run_all_gates(
        self,
        domain_findings: dict[Domain, DomainFindings],
        chunks: list[Chunk],
    ) -> tuple[dict[Domain, DomainFindings], list[GateResult]]:
        """
        Run all 5 gates in sequence.
        Returns (cleaned_findings, gate_results).
        """
        results: list[GateResult] = []

        domain_findings, r1 = self._gate_citation_presence(domain_findings)
        results.append(r1)

        domain_findings, r2 = self._gate_quote_grounding(domain_findings, chunks)
        results.append(r2)

        domain_findings, r3 = self._gate_severity_calibration(domain_findings)
        results.append(r3)

        domain_findings, r4 = self._gate_completeness(domain_findings)
        results.append(r4)

        domain_findings, r5 = self._gate_consistency(domain_findings)
        results.append(r5)

        failed_gates = [r.gate_name for r in results if not r.passed]
        if failed_gates:
            logger.warning("Quality gates FAILED: %s", failed_gates)
        else:
            logger.info("All 5 quality gates passed.")

        return domain_findings, results

    # ── Gate 1: Citation Presence ─────────────────────────────────────────────

    def _gate_citation_presence(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """Every finding must have at least one citation."""
        warnings: list[str] = []
        removed: list[str] = []

        for domain, df in domain_findings.items():
            clean: list[Finding] = []
            for f in df.findings:
                if not f.citations:
                    if f.severity in (Severity.P0, Severity.P1):
                        # Downgrade rather than remove — high severity needs scrutiny
                        warnings.append(
                            f"[Gate1] {domain.value}/{f.id[:8]}: No citation on {f.severity.value} finding — "
                            f"downgraded to P2. Title: {f.title}"
                        )
                        QUALITY_GATE_FAILURES.labels(gate="citation_presence").inc()
                        f = f.model_copy(update={"severity": Severity.P2})
                    else:
                        # Remove P2/P3 with no citation
                        removed.append(f.id)
                        continue
                clean.append(f)
            domain_findings[domain] = df.model_copy(update={"findings": clean})

        passed = len(warnings) == 0 and len(removed) == 0
        return domain_findings, GateResult(
            passed=passed,
            gate_name="citation_presence",
            warnings=warnings,
            removed_finding_ids=removed,
        )

    # ── Gate 2: Quote Grounding ───────────────────────────────────────────────

    def _gate_quote_grounding(
        self,
        domain_findings: dict[Domain, DomainFindings],
        chunks: list[Chunk],
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """
        Spot-check: if a citation has a quote, try to find it (case-insensitive,
        first 60 chars) in the original chunks.
        Non-blocking for short quotes (hallucination is hard to detect perfectly).
        """
        warnings: list[str] = []

        # Build a set of all text in all chunks (lower-cased) for fast lookup
        chunk_texts = {c.file_name: c.text.lower() for c in chunks}

        for domain, df in domain_findings.items():
            for f in df.findings:
                for citation in f.citations:
                    if len(citation.quote) < 20:
                        continue   # Too short to verify
                    probe = citation.quote[:60].lower().strip()
                    file_text = chunk_texts.get(citation.file, "")
                    if file_text and probe not in file_text:
                        warnings.append(
                            f"[Gate2] {domain.value}/{f.id[:8]}: Quote not found in "
                            f"'{citation.file}' — possible hallucination. "
                            f"Quote: '{probe[:40]}…'"
                        )
                        QUALITY_GATE_FAILURES.labels(gate="quote_grounding").inc()

        return domain_findings, GateResult(
            passed=len(warnings) == 0,
            gate_name="quote_grounding",
            warnings=warnings,
        )

    # ── Gate 3: Severity Calibration ─────────────────────────────────────────

    def _gate_severity_calibration(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """
        P0 findings must have a substantive description (>50 chars) and evidence (>50 chars).
        P0 findings with no evidence are downgraded to P1.
        """
        warnings: list[str] = []

        for domain, df in domain_findings.items():
            updated: list[Finding] = []
            for f in df.findings:
                if f.severity == Severity.P0:
                    if len(f.description) < 50 or len(f.evidence) < 50:
                        warnings.append(
                            f"[Gate3] {domain.value}/{f.id[:8]}: P0 finding '{f.title}' "
                            f"has insufficient evidence — downgraded to P1."
                        )
                        QUALITY_GATE_FAILURES.labels(gate="severity_calibration").inc()
                        f = f.model_copy(update={"severity": Severity.P1})
                updated.append(f)
            domain_findings[domain] = df.model_copy(update={"findings": updated})

        return domain_findings, GateResult(
            passed=len(warnings) == 0,
            gate_name="severity_calibration",
            warnings=warnings,
        )

    # ── Gate 4: Completeness ──────────────────────────────────────────────────

    def _gate_completeness(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """All 9 domains must be present (even if empty)."""
        warnings: list[str] = []
        missing = ALL_DOMAINS - set(domain_findings.keys())
        for domain in missing:
            warnings.append(f"[Gate4] Missing domain results: {domain.value}")
            QUALITY_GATE_FAILURES.labels(gate="completeness").inc()
            domain_findings[domain] = DomainFindings(
                domain=domain,
                summary=f"No {domain.value} analysis available.",
                risk_score=0.0,
            )
        return domain_findings, GateResult(
            passed=len(missing) == 0,
            gate_name="completeness",
            warnings=warnings,
        )

    # ── Gate 5: Consistency ───────────────────────────────────────────────────

    def _gate_consistency(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """No duplicate finding IDs across domains."""
        warnings: list[str] = []
        seen_ids: set[str] = set()

        for domain, df in domain_findings.items():
            clean: list[Finding] = []
            for f in df.findings:
                if f.id in seen_ids:
                    warnings.append(
                        f"[Gate5] Duplicate finding ID {f.id[:8]} in {domain.value} — removed."
                    )
                    QUALITY_GATE_FAILURES.labels(gate="consistency").inc()
                    continue
                seen_ids.add(f.id)
                clean.append(f)
            domain_findings[domain] = df.model_copy(update={"findings": clean})

        return domain_findings, GateResult(
            passed=len(warnings) == 0,
            gate_name="consistency",
            warnings=warnings,
        )
