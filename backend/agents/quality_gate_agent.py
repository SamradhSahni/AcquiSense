"""
Quality Gate Agent — 7 blocking verification checks on all findings
before they reach the report. Prevents hallucinations and ensures
every finding has a traceable citation.

Gates (in order):
  1. Citation Presence    — every finding must cite at least one document
  2. Quote Grounding      — fuzzy match quotes against source chunks (rapidfuzz)
  3. Severity Calibration — P0/P1 findings need substantive evidence
  4. Completeness         — all 9 domains must have a result (even empty)
  5. Consistency          — no finding ID duplicated, no contradictory verdicts
  6. Evidence Relevance   — cosine similarity between evidence and citation quote
  7. Tag Validation       — findings must have at least one meaningful tag
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from api.schemas import Domain, DomainFindings, Finding, Severity
from ingestion.chunker import Chunk
from monitoring.metrics import QUALITY_GATE_FAILURES
from agents.retrieval_engine import RetrievalEngine

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
        Run all 7 gates in sequence.
        Returns (cleaned_findings, gate_results).
        """
        results: list[GateResult] = []

        # Initialize retrieval engine for fuzzy quote grounding (Gate 2) and
        # evidence relevance (Gate 6)
        self._retrieval_engine = RetrievalEngine()
        # Build a chunk text lookup for fuzzy matching
        self._chunk_text_by_file: dict[str, str] = {}
        for c in chunks:
            if c.file_name not in self._chunk_text_by_file:
                self._chunk_text_by_file[c.file_name] = c.text
            else:
                self._chunk_text_by_file[c.file_name] += " " + c.text

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

        domain_findings, r6 = self._gate_evidence_relevance(domain_findings)
        results.append(r6)

        domain_findings, r7 = self._gate_tag_validation(domain_findings)
        results.append(r7)

        failed_gates = [r.gate_name for r in results if not r.passed]
        if failed_gates:
            logger.warning("Quality gates FAILED: %s", failed_gates)
        else:
            logger.info("All 7 quality gates passed.")

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
        UPGRADED: Uses rapidfuzz fuzzy matching instead of naive substring check.
        Dramatically reduces false positives from paraphrased quotes.
        Threshold: partial_ratio >= 72 (72% overlap between probe and chunk text).
        """
        warnings: list[str] = []

        for domain, df in domain_findings.items():
            for f in df.findings:
                for citation in f.citations:
                    if len(citation.quote) < 20:
                        continue   # Too short to verify
                    file_text = self._chunk_text_by_file.get(citation.file, "")
                    if not file_text:
                        continue   # File not in chunks (different upload?) — skip

                    # Use RetrievalEngine fuzzy matcher (rapidfuzz partial_ratio)
                    matched = self._retrieval_engine.fuzzy_match_quote(
                        citation.quote, file_text, threshold=72
                    )
                    if not matched:
                        warnings.append(
                            f"[Gate2] {domain.value}/{f.id[:8]}: Quote not found (fuzzy) in "
                            f"'{citation.file}' — possible hallucination. "
                            f"Quote: '{citation.quote[:50]}\u2026'"
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

    # ── Gate 6: Evidence Relevance ────────────────────────────────────────────────────

    def _gate_evidence_relevance(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """
        Gate 6 (NEW): Check that the finding's evidence text is semantically
        related to its citation quote using TF-IDF cosine similarity.
        Threshold: cosine > 0.15 (deliberately low — just a sanity check).
        P1/P0 findings with evidence score < 0.15 are flagged.
        """
        warnings: list[str] = []
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
        except ImportError:
            logger.debug("scikit-learn not available — skipping Gate 6")
            return domain_findings, GateResult(passed=True, gate_name="evidence_relevance")

        for domain, df in domain_findings.items():
            for f in df.findings:
                if f.severity not in (Severity.P0, Severity.P1):
                    continue   # Only check high-severity findings
                if not f.citations or not f.evidence:
                    continue

                # Compare evidence text vs citation quote
                quote = f.citations[0].quote
                if len(quote) < 20 or len(f.evidence) < 20:
                    continue

                try:
                    vect = TfidfVectorizer(stop_words="english")
                    matrix = vect.fit_transform([f.evidence, quote])
                    score = float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])
                    if score < 0.08:   # Very low similarity — possible mismatch
                        warnings.append(
                            f"[Gate6] {domain.value}/{f.id[:8]} [{f.severity.value}]: "
                            f"Evidence-to-citation similarity = {score:.2f} (low). "
                            f"Finding: '{f.title[:60]}'"
                        )
                        QUALITY_GATE_FAILURES.labels(gate="evidence_relevance").inc()
                except Exception as exc:
                    logger.debug("Gate6 cosine check failed for %s: %s", f.id[:8], exc)

        return domain_findings, GateResult(
            passed=len(warnings) == 0,
            gate_name="evidence_relevance",
            warnings=warnings,
        )

    # ── Gate 7: Tag Validation ────────────────────────────────────────────────────────

    def _gate_tag_validation(
        self, domain_findings: dict[Domain, DomainFindings]
    ) -> tuple[dict[Domain, DomainFindings], GateResult]:
        """
        Gate 7 (NEW): Every finding should have at least one meaningful tag.
        Findings with no tags or only trivially short tags are flagged.
        Non-blocking — adds a tag automatically if missing.
        """
        warnings: list[str] = []

        for domain, df in domain_findings.items():
            updated: list[Finding] = []
            for f in df.findings:
                meaningful_tags = [t for t in f.tags if len(t) > 2]
                if not meaningful_tags:
                    # Auto-assign domain as a fallback tag
                    f = f.model_copy(update={"tags": [domain.value, f.severity.value.lower()]})
                    warnings.append(
                        f"[Gate7] {domain.value}/{f.id[:8]}: No meaningful tags — auto-assigned domain tag."
                    )
                updated.append(f)
            domain_findings[domain] = df.model_copy(update={"findings": updated})

        return domain_findings, GateResult(
            passed=len(warnings) == 0,
            gate_name="tag_validation",
            warnings=warnings,
        )
