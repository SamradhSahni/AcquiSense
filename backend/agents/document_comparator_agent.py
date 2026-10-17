"""
DocumentComparatorAgent — Semantic side-by-side comparison of two deal documents.

Use case: Compare "2024 Audited Accounts" vs "2025 Management Accounts" to surface:
  - Changed financial figures (revenue, EBITDA, debt)
  - New risks that appeared in the later document
  - Items removed (e.g., a contract clause that disappeared)
  - Overall business impact narrative

Exposed via: POST /api/results/{job_id}/compare
"""
from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI
from monitoring.metrics import AGENT_TOKENS_USED

logger = logging.getLogger(__name__)

_COMPARATOR_SYSTEM_PROMPT = """You are a senior M&A analyst comparing two versions of a financial or legal document. You have been given the text of Document A and Document B.

Your job is to identify:
1. CHANGED items — figures, clauses, or facts that differ between A and B
2. NEW items — content in B that does not appear in A (new risks, new clauses, new figures)
3. REMOVED items — content in A that is missing from B (potentially important omissions)
4. BUSINESS IMPACT — what these changes mean for the deal (valuation, risk, deal structure)

Return ONLY valid JSON (no markdown):
{
  "document_a_summary": "2-3 sentence summary of Document A",
  "document_b_summary": "2-3 sentence summary of Document B",
  "changes": [
    {
      "type": "changed|new|removed",
      "category": "financial|legal|operational|risk|other",
      "severity": "high|medium|low",
      "item": "Short description of what changed",
      "detail_a": "How it appears in Document A (or 'N/A' if new)",
      "detail_b": "How it appears in Document B (or 'N/A' if removed)",
      "business_impact": "What this change means for the acquirer"
    }
  ],
  "overall_assessment": "3-4 sentence narrative of the most significant changes and their deal implications",
  "risk_direction": "improving|deteriorating|stable",
  "key_questions": ["Question to ask management about change 1", "..."]
}

Focus on material changes — ignore cosmetic formatting differences."""


class DocumentComparatorAgent:
    """
    Compares two documents (by their parsed text) and returns a structured diff
    with business impact analysis.
    """

    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    async def compare(
        self,
        doc_a_name: str,
        doc_a_text: str,
        doc_b_name: str,
        doc_b_text: str,
        job_id: str,
    ) -> dict[str, Any]:
        """
        Compare two documents and return a structured diff with business impact.

        Args:
            doc_a_name: Human-readable name for Document A (e.g., "Audited Accounts 2024")
            doc_a_text: Extracted text content of Document A (first ~3000 chars used)
            doc_b_name: Human-readable name for Document B (e.g., "Management Accounts 2025")
            doc_b_text: Extracted text content of Document B (first ~3000 chars used)
            job_id: The analysis job ID for token tracking

        Returns structured comparison dict.
        """
        logger.info(
            "[DocumentComparator] Comparing '%s' vs '%s', job=%s",
            doc_a_name, doc_b_name, job_id
        )

        # Truncate to fit in context (leaving room for system prompt + response)
        a_excerpt = doc_a_text[:3500].strip()
        b_excerpt = doc_b_text[:3500].strip()

        user_prompt = (
            f"Compare these two documents and identify all material changes:\n\n"
            f"=== DOCUMENT A: {doc_a_name} ===\n{a_excerpt}\n\n"
            f"=== DOCUMENT B: {doc_b_name} ===\n{b_excerpt}\n\n"
            f"Identify what changed between A and B, what's new in B, what was removed from A, "
            f"and what the business impact is for the acquirer."
        )

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _COMPARATOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
                max_tokens=3000,
            )

            usage = response.usage
            if usage:
                AGENT_TOKENS_USED.labels(
                    agent="document_comparator", model=self.model, token_type="prompt"
                ).inc(usage.prompt_tokens)
                AGENT_TOKENS_USED.labels(
                    agent="document_comparator", model=self.model, token_type="completion"
                ).inc(usage.completion_tokens)

            raw = json.loads(response.choices[0].message.content or "{}")

        except Exception as exc:
            logger.error("[DocumentComparator] LLM failed: %s", exc)
            return self._error_response(doc_a_name, doc_b_name, str(exc))

        # Validate and clean
        changes = []
        for item in raw.get("changes", []):
            if not isinstance(item, dict) or not item.get("item"):
                continue
            changes.append({
                "type":            item.get("type", "changed"),
                "category":        item.get("category", "other"),
                "severity":        item.get("severity", "medium"),
                "item":            str(item.get("item", ""))[:200],
                "detail_a":        str(item.get("detail_a", "N/A"))[:300],
                "detail_b":        str(item.get("detail_b", "N/A"))[:300],
                "business_impact": str(item.get("business_impact", ""))[:400],
            })

        logger.info(
            "[DocumentComparator] Found %d changes, risk_direction=%s",
            len(changes), raw.get("risk_direction", "unknown")
        )

        return {
            "job_id":              job_id,
            "document_a":         doc_a_name,
            "document_b":         doc_b_name,
            "document_a_summary": raw.get("document_a_summary", ""),
            "document_b_summary": raw.get("document_b_summary", ""),
            "changes":            changes,
            "total_changes":      len(changes),
            "changed_count":      sum(1 for c in changes if c["type"] == "changed"),
            "new_count":          sum(1 for c in changes if c["type"] == "new"),
            "removed_count":      sum(1 for c in changes if c["type"] == "removed"),
            "overall_assessment": raw.get("overall_assessment", ""),
            "risk_direction":     raw.get("risk_direction", "stable"),
            "key_questions":      raw.get("key_questions", [])[:5],
        }

    @staticmethod
    def _error_response(doc_a: str, doc_b: str, error: str) -> dict:
        return {
            "job_id":          "",
            "document_a":      doc_a,
            "document_b":      doc_b,
            "document_a_summary": "",
            "document_b_summary": "",
            "changes":         [],
            "total_changes":   0,
            "changed_count":   0,
            "new_count":       0,
            "removed_count":   0,
            "overall_assessment": f"Comparison failed: {error}",
            "risk_direction":  "stable",
            "key_questions":   [],
        }
