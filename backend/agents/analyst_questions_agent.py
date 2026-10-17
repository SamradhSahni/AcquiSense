"""
AnalystQuestionsAgent — Auto-generates structured management interview questions
from deal findings.

For every completed deal, this agent:
1. Reads all findings + cross-references
2. Calls gpt-4o to generate specific, evidence-linked interview questions
3. Organizes by domain + severity
4. Tags each question with "what to look for in the answer"

Output is exposed via GET /api/results/{job_id}/questions
"""
from __future__ import annotations

import json
import logging
import uuid

from openai import AsyncOpenAI

from api.schemas import CrossReference, Domain, DomainFindings, Finding, Severity
from monitoring.metrics import AGENT_TOKENS_USED

logger = logging.getLogger(__name__)

_QUESTIONS_SYSTEM_PROMPT = """You are a senior M&A due diligence advisor preparing for a management presentation with the target company's leadership team.

You have been given a set of due diligence findings. Your job is to generate specific, sharp, evidence-based interview questions that an analyst should ask the target management team.

For each finding (especially P0 and P1), generate 1-3 questions that:
1. Are specific and reference actual numbers/issues from the finding (not generic)
2. Can't be easily deflected with a vague answer
3. Have a clear "what to look for in the answer" — what a good vs bad answer looks like

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "id": "q-001",
      "domain": "finance",
      "severity": "P1",
      "linked_finding_ids": ["finding-uuid"],
      "question": "Your accounts show that the top 3 customers represent 78% of revenue. What contractual protections do you have against customer churn, and when do those contracts renew?",
      "rationale": "Revenue concentration risk identified in audited accounts page 14",
      "what_to_look_for": "Look for: long-term contracts (3+ years), low churn history, evidence of customer diversification in progress. Red flags: month-to-month contracts, recent customer loss discussions, no diversification plan."
    }
  ]
}

IMPORTANT:
- Generate questions specifically for P0 and P1 findings (at minimum)
- Include at least 1 question per domain that had findings
- Group by domain in your output
- Questions should be things you would actually say in a room with the CEO/CFO"""


class AnalystQuestionsAgent:
    """
    Generates management due diligence interview questions from findings.
    """

    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model

    async def generate(
        self,
        domain_findings: dict[Domain, DomainFindings],
        cross_refs: list[CrossReference],
        job_id: str,
    ) -> dict:
        """
        Generate a full set of analyst interview questions.
        Returns structured dict ready to be stored and served via API.
        """
        logger.info("[AnalystQuestions] Generating questions for job=%s", job_id)

        # Build findings summary for the prompt
        context = self._build_findings_summary(domain_findings)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _QUESTIONS_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Generate interview questions for these due diligence findings:\n\n{context}"},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
                max_tokens=4000,
            )

            usage = response.usage
            if usage:
                AGENT_TOKENS_USED.labels(
                    agent="analyst_questions", model=self.model, token_type="prompt"
                ).inc(usage.prompt_tokens)
                AGENT_TOKENS_USED.labels(
                    agent="analyst_questions", model=self.model, token_type="completion"
                ).inc(usage.completion_tokens)

            raw = json.loads(response.choices[0].message.content or "{}")
            questions = raw.get("questions", [])

        except Exception as exc:
            logger.error("[AnalystQuestions] LLM failed: %s", exc)
            questions = []

        # Validate and enrich questions
        validated = []
        for i, q in enumerate(questions):
            if not isinstance(q, dict) or not q.get("question"):
                continue
            validated.append({
                "id": q.get("id", f"q-{i+1:03d}"),
                "domain": q.get("domain", "general"),
                "severity": q.get("severity", "P2"),
                "linked_finding_ids": q.get("linked_finding_ids", []),
                "question": str(q.get("question", ""))[:500],
                "rationale": str(q.get("rationale", ""))[:300],
                "what_to_look_for": str(q.get("what_to_look_for", ""))[:500],
            })

        # Group by domain for frontend display
        by_domain: dict[str, list] = {}
        for q in validated:
            domain = q["domain"]
            if domain not in by_domain:
                by_domain[domain] = []
            by_domain[domain].append(q)

        logger.info("[AnalystQuestions] Generated %d questions across %d domains", len(validated), len(by_domain))

        return {
            "job_id": job_id,
            "questions": validated,
            "by_domain": by_domain,
            "total": len(validated),
        }

    def _build_findings_summary(self, domain_findings: dict[Domain, DomainFindings]) -> str:
        """Build a condensed findings context for the prompt."""
        lines = []
        for domain, df in domain_findings.items():
            if not df.findings:
                continue
            lines.append(f"\n=== {domain.value.upper()} (risk_score={df.risk_score}) ===")
            lines.append(f"Summary: {df.summary}")
            for f in df.findings:
                citation_info = ""
                if f.citations:
                    c = f.citations[0]
                    citation_info = f' | Source: {c.file} p.{c.page} | "{c.quote[:100]}"'
                lines.append(
                    f"  [{f.severity.value}] ID:{f.id[:8]} | {f.title}\n"
                    f"    Evidence: {f.evidence[:200]}{citation_info}"
                )
        return "\n".join(lines)
