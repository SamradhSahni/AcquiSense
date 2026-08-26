"""
BaseAgent — abstract foundation for all 13 specialist agents.

Every domain agent inherits this and overrides:
  - DOMAIN: Domain enum value
  - SYSTEM_PROMPT: the agent's specialist persona + instructions
  - analyze(): calls super().run_analysis() with domain-specific prompts

Architecture:
  1. Receives document chunks (already parsed + chunked by the pipeline)
  2. Batches chunks to fit in one LLM call (up to MAX_CHUNK_TOKENS_PER_CALL)
  3. Calls OpenAI with the system prompt + chunk content
  4. Parses JSON findings from the response
  5. Emits progress events via a callback (used by the orchestrator for live updates)
  6. Updates Prometheus metrics
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any, Callable, Awaitable

from openai import AsyncOpenAI

from api.schemas import (
    AgentProgress,
    AgentStatus,
    Citation,
    Domain,
    DomainFindings,
    Finding,
    Severity,
)
from ingestion.chunker import Chunk
from monitoring.metrics import (
    AGENT_ANALYSIS_DURATION,
    AGENT_FINDINGS_COUNT,
    AGENT_TOKENS_USED,
)

logger = logging.getLogger(__name__)

# How many chunks to send in a single LLM call
MAX_CHUNKS_PER_CALL = 8
# Tokens reserved for response JSON
RESPONSE_RESERVE_TOKENS = 2000

ProgressCallback = Callable[[AgentProgress], Awaitable[None]]


class BaseAgent(ABC):
    """Abstract base for all domain specialist agents."""

    DOMAIN: Domain
    MODEL: str = "gpt-4o-mini"   # overridden per agent or by model_profile

    def __init__(self, client: AsyncOpenAI, model: str | None = None):
        self.client = client
        self.model = model or self.MODEL

    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """Each agent defines its own specialist persona."""
        ...

    @property
    def extraction_schema(self) -> str:
        """JSON schema description injected into every user prompt."""
        return """
Return ONLY a valid JSON object with this structure (no markdown, no prose):
{
  "findings": [
    {
      "severity": "P0|P1|P2|P3",
      "title": "Short title (< 80 chars)",
      "description": "Detailed explanation of the risk or issue (2-5 sentences)",
      "evidence": "Why this is a risk — analysis and implication",
      "citations": [
        {
          "file": "exact_filename.pdf",
          "page": 12,
          "section": "Section 4.2 (or empty string if unknown)",
          "quote": "Exact verbatim quote from the document (< 200 chars)"
        }
      ],
      "tags": ["list", "of", "relevant", "topic", "tags"]
    }
  ],
  "summary": "2-3 sentence domain summary",
  "risk_score": 7.5
}
Severity guide: P0=Critical/deal-breaker, P1=High, P2=Medium, P3=Low.
risk_score: 0.0 (no risk) to 10.0 (extreme risk).
If no significant findings, return findings=[] with a brief summary.
"""

    async def analyze(
        self,
        chunks: list[Chunk],
        job_id: str,
        deal_context: str = "",
        progress_cb: ProgressCallback | None = None,
    ) -> DomainFindings:
        """
        Run the full analysis pipeline for this domain.

        1. Batch chunks
        2. Call LLM for each batch
        3. Merge + deduplicate findings
        4. Return DomainFindings
        """
        start = time.monotonic()
        domain_name = self.DOMAIN.value
        logger.info("[%s] Starting analysis — %d chunks, job=%s", domain_name, len(chunks), job_id)

        await self._emit(progress_cb, AgentStatus.RUNNING, 5, 0)

        all_findings: list[Finding] = []
        summary_parts: list[str] = []
        risk_scores: list[float] = []

        batches = self._make_batches(chunks)
        total_batches = max(len(batches), 1)

        for batch_idx, batch in enumerate(batches):
            pct = 10 + int((batch_idx / total_batches) * 80)
            await self._emit(progress_cb, AgentStatus.RUNNING, pct, len(all_findings))

            try:
                result = await self._call_llm(batch, deal_context, job_id)
                batch_findings = self._parse_findings(result, batch)
                all_findings.extend(batch_findings)
                if result.get("summary"):
                    summary_parts.append(result["summary"])
                if isinstance(result.get("risk_score"), (int, float)):
                    risk_scores.append(float(result["risk_score"]))
            except Exception as exc:
                logger.warning("[%s] Batch %d failed: %s", domain_name, batch_idx, exc)

        # Final aggregate
        final_summary = " ".join(summary_parts) or f"No significant {domain_name} findings."
        avg_risk = sum(risk_scores) / len(risk_scores) if risk_scores else 0.0

        await self._emit(progress_cb, AgentStatus.DONE, 100, len(all_findings))

        elapsed = time.monotonic() - start
        AGENT_ANALYSIS_DURATION.labels(domain=domain_name).observe(elapsed)
        for sev in Severity:
            count = sum(1 for f in all_findings if f.severity == sev)
            AGENT_FINDINGS_COUNT.labels(domain=domain_name, severity=sev.value).set(count)

        logger.info(
            "[%s] Done — %d findings, risk=%.1f, elapsed=%.1fs",
            domain_name, len(all_findings), avg_risk, elapsed,
        )

        return DomainFindings(
            domain=self.DOMAIN,
            findings=all_findings,
            summary=final_summary,
            risk_score=round(avg_risk, 2),
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    def _make_batches(self, chunks: list[Chunk]) -> list[list[Chunk]]:
        """Group chunks into batches."""
        batches = []
        for i in range(0, max(len(chunks), 1), MAX_CHUNKS_PER_CALL):
            batches.append(chunks[i: i + MAX_CHUNKS_PER_CALL])
        return batches

    def _build_user_prompt(self, batch: list[Chunk], deal_context: str) -> str:
        """Build the user message for a batch of chunks."""
        context_block = f"\n\nDeal context: {deal_context}" if deal_context else ""
        chunks_text = "\n\n---\n\n".join(
            f"[FILE: {c.file_name} | PAGE: {c.page} | SECTION: {c.section or 'N/A'}]\n{c.text}"
            for c in batch
        )
        return (
            f"{context_block}\n\n"
            f"Analyze the following document excerpts for {self.DOMAIN.value} risks and findings.\n\n"
            f"{chunks_text}\n\n"
            f"{self.extraction_schema}"
        )

    async def _call_llm(
        self,
        batch: list[Chunk],
        deal_context: str,
        job_id: str,
    ) -> dict[str, Any]:
        """Call OpenAI and return parsed JSON."""
        user_prompt = self._build_user_prompt(batch, deal_context)

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,   # Low temp = consistent, factual output
            response_format={"type": "json_object"},
            max_tokens=2000,
        )

        # Track token usage
        usage = response.usage
        if usage:
            AGENT_TOKENS_USED.labels(
                agent=self.DOMAIN.value, model=self.model, token_type="prompt"
            ).inc(usage.prompt_tokens)
            AGENT_TOKENS_USED.labels(
                agent=self.DOMAIN.value, model=self.model, token_type="completion"
            ).inc(usage.completion_tokens)

        content = response.choices[0].message.content or "{}"
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            logger.warning("[%s] Non-JSON LLM response: %s…", self.DOMAIN.value, content[:200])
            return {}

    def _parse_findings(self, raw: dict[str, Any], batch: list[Chunk]) -> list[Finding]:
        """Convert raw LLM JSON into validated Finding objects."""
        findings: list[Finding] = []
        raw_findings = raw.get("findings", [])
        if not isinstance(raw_findings, list):
            return findings

        for item in raw_findings:
            if not isinstance(item, dict):
                continue
            try:
                citations = [
                    Citation(
                        file=c.get("file", batch[0].file_name if batch else ""),
                        page=int(c.get("page", 1)),
                        section=c.get("section", ""),
                        quote=c.get("quote", "")[:500],
                    )
                    for c in item.get("citations", [])
                    if isinstance(c, dict)
                ]
                severity_raw = item.get("severity", "P2").upper()
                try:
                    severity = Severity(severity_raw)
                except ValueError:
                    severity = Severity.P2

                finding = Finding(
                    id=str(uuid.uuid4()),
                    domain=self.DOMAIN,
                    severity=severity,
                    title=str(item.get("title", "Untitled Finding"))[:100],
                    description=str(item.get("description", "")),
                    evidence=str(item.get("evidence", "")),
                    citations=citations,
                    tags=[str(t) for t in item.get("tags", []) if isinstance(t, str)],
                )
                findings.append(finding)
            except Exception as exc:
                logger.debug("Skipping malformed finding: %s", exc)

        return findings

    async def _emit(
        self,
        cb: ProgressCallback | None,
        status: AgentStatus,
        pct: int,
        findings_count: int,
    ) -> None:
        if cb is None:
            return
        progress = AgentProgress(
            domain=self.DOMAIN,
            status=status,
            pct=pct,
            findings_count=findings_count,
        )
        try:
            await cb(progress)
        except Exception:
            pass  # Never crash the agent because of a callback failure
