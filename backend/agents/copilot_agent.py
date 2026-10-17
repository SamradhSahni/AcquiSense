"""
CopilotAgent — Permission-aware, citation-grounded RAG agent for the Deal Copilot.

Architecture:
  1. InputGuardrail   → validate and sanitize user query
  2. QueryRouter      → classify query → relevant domains
  3. RetrievalEngine  → BM25 + TF-IDF hybrid search over findings corpus
  4. ContextBuilder   → merge, deduplicate, cap tokens
  5. LLM Call (gpt-4o) → grounded in retrieved context + conversation history
  6. ResponseParser   → structured JSON with answer + citations
  7. OutputGuardrail  → DLP, policy, citation consistency check

Supported query intents (from user spec):
  - "Why is this deal high risk?"
  - "Show P0/P1 findings"
  - "Which findings affect valuation?"
  - "Compare Finance and Commercial findings on X"
  - "Are there legal risks connected to cybersecurity findings?"
  - "Summarize what I should ask management"
  - "Which findings have weak evidence?"
  - "Show all findings involving the same customer"
  - "Which risks are dependent on each other?"
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from openai import AsyncOpenAI

from agents.guardrails import InputGuardrail, OutputGuardrail
from agents.retrieval_engine import RetrievalEngine, RetrievalResult
from api.schemas import (
    CrossReference,
    Domain,
    DomainFindings,
    Finding,
    Severity,
)
from monitoring.metrics import AGENT_TOKENS_USED

logger = logging.getLogger(__name__)

# ── Domain routing keyword map ────────────────────────────────────────────────

_DOMAIN_ROUTING: list[tuple[list[str], list[str]]] = [
    # (keywords, domains)
    (["revenue", "ebitda", "margin", "cash", "debt", "profit", "loss",
      "accounting", "audit", "financial", "valuation", "working capital",
      "accounts", "receivable", "payable", "income", "earnings"],
     ["finance", "commercial"]),

    (["ip", "patent", "trademark", "copyright", "source code", "software",
      "license", "open source", "technology", "infrastructure", "saas",
      "api", "technical debt", "architecture"],
     ["tech", "legal"]),

    (["hack", "breach", "vulnerability", "cve", "cyber", "ransomware",
      "malware", "security", "penetration", "phishing", "data leak",
      "gdpr", "iso 27001", "soc 2", "encryption"],
     ["cyber", "tech"]),

    (["pension", "employee", "culture", "hr", "headcount", "salary",
      "retention", "bonus", "contract", "redundancy", "union",
      "key person", "management", "talent"],
     ["hr", "tax"]),

    (["regulatory", "license", "permit", "compliance", "fca", "sec",
      "gdpr", "antitrust", "competition", "sanction", "approval",
      "consent", "filing", "regulation"],
     ["regulatory", "legal", "tax"]),

    (["environment", "carbon", "esg", "sustainability", "climate",
      "emissions", "green", "waste", "environmental", "social",
      "governance", "dei", "diversity"],
     ["esg", "regulatory"]),

    (["tax", "vat", "corporation tax", "transfer pricing", "r&d credit",
      "deferred tax", "tax risk", "hmrc", "irs"],
     ["tax", "finance"]),

    (["customer", "contract", "commercial", "supplier", "vendor",
      "churn", "concentration", "distribution", "pipeline",
      "sales", "go-to-market"],
     ["commercial", "finance", "legal"]),
]

_ALL_DOMAINS = [d.value for d in Domain]

# ── Copilot System Prompt ─────────────────────────────────────────────────────

_COPILOT_SYSTEM_PROMPT = """You are AcquiSense Copilot, an AI assistant embedded inside a professional M&A due diligence platform.

Your role is to answer questions about a specific deal's findings, risks, and documents. You have been given the relevant context extracted from the deal's analysis.

CRITICAL RULES:
1. ONLY answer based on the provided context. Never invent facts, findings, or citations.
2. ALWAYS include citation references [1], [2], etc. in your answer when you reference a finding or document.
3. If the answer is not in the context, say "I don't have enough information from the deal documents to answer that."
4. Be concise but thorough. Analysts are senior professionals — no need to over-explain basics.
5. For risk-related questions, always mention severity (P0/P1/P2/P3) when relevant.
6. When comparing findings across domains, explicitly state which domain each finding comes from.
7. Never make investment recommendations ("you should buy/not buy this deal").

RESPONSE FORMAT (return valid JSON only — no markdown):
{
  "answer": "Your answer with inline citation markers [1][2] where applicable",
  "citations": [
    {
      "ref_id": 1,
      "finding_id": "uuid or null",
      "domain": "finance",
      "severity": "P1",
      "title": "Finding title",
      "file": "document_name.pdf",
      "page": 14,
      "quote": "Relevant excerpt from the document or finding",
      "type": "finding"
    }
  ],
  "domains_searched": ["finance", "commercial"],
  "confidence": "high",
  "follow_up_suggestions": [
    "What are the top risks specifically related to IP?",
    "Which documents support the P1 revenue-recognition finding?"
  ]
}

confidence levels:
- "high": answer is fully grounded in ≥2 citations
- "medium": answer is grounded in 1 citation or partial evidence
- "low": answer is inferred or has no citations — always add disclaimer"""


class CopilotAgent:
    """
    The Deal Copilot RAG agent.

    Usage:
        agent = CopilotAgent(client=openai_client)
        agent.build_context(domain_findings, cross_refs, chunks)
        response = await agent.answer(query, deal_id, conversation_history)
    """

    def __init__(self, client: AsyncOpenAI, model: str = "gpt-4o"):
        self.client = client
        self.model = model
        self.retrieval_engine = RetrievalEngine()
        self.input_guardrail = InputGuardrail()
        self.output_guardrail = OutputGuardrail()
        self._domain_findings: dict[str, DomainFindings] = {}
        self._cross_refs: list[CrossReference] = []
        self._findings_by_id: dict[str, Finding] = {}
        self._indexed = False

    def build_context(
        self,
        domain_findings: dict[Domain, DomainFindings],
        cross_refs: list[CrossReference],
        chunks: list | None = None,
    ) -> None:
        """
        Index the deal's findings corpus for retrieval.
        Call this once when initializing the copilot for a deal.
        """
        self._domain_findings = {d.value: df for d, df in domain_findings.items()}
        self._cross_refs = cross_refs

        # Build a flat finding lookup
        for df in domain_findings.values():
            for finding in df.findings:
                self._findings_by_id[finding.id] = finding

        # Build retrieval index
        self.retrieval_engine.build_index(domain_findings, chunks)
        self._indexed = True
        logger.info(
            "CopilotAgent indexed %d findings across %d domains",
            len(self._findings_by_id), len(domain_findings)
        )

    async def answer(
        self,
        query: str,
        deal_id: str,
        conversation_history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        Main entry point — answer a query about the deal.

        Returns a structured dict matching the CopilotResponse schema.
        Never raises — always returns a valid response object.
        """
        history = conversation_history or []

        # ── Step 1: Input Guardrail ───────────────────────────────────────────
        guard_result = self.input_guardrail.validate(query, conversation_turns=len(history))
        if guard_result.blocked:
            logger.warning("[Copilot] Query blocked by input guardrail: %s", query[:80])
            return self._safe_error_response(guard_result.safe_message)

        clean_query = guard_result.sanitized_input

        # ── Step 2: Query routing ─────────────────────────────────────────────
        domains_to_search = self._route_query(clean_query)
        logger.info("[Copilot][%s] Query routed to domains: %s", deal_id, domains_to_search)

        # ── Step 3: Hybrid retrieval ──────────────────────────────────────────
        retrieved_findings = self.retrieval_engine.search(
            query=clean_query,
            top_k=10,
            domain_filter=domains_to_search if domains_to_search != _ALL_DOMAINS else None,
            result_type="finding",
        )

        # Also retrieve relevant cross-references
        cross_ref_context = self._get_relevant_cross_refs(clean_query, retrieved_findings)

        # ── Step 4: Build context block ───────────────────────────────────────
        context_block, context_citations = self._build_context_block(
            retrieved_findings, cross_ref_context
        )

        if not context_block.strip():
            return self._safe_error_response(
                "I don't have enough information from the deal documents to answer that. "
                "The analysis may not have surfaced findings relevant to your question."
            )

        # ── Step 5: LLM Call ──────────────────────────────────────────────────
        messages = self._build_messages(clean_query, context_block, history)

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.2,
                response_format={"type": "json_object"},
                max_tokens=1500,
            )

            usage = response.usage
            if usage:
                AGENT_TOKENS_USED.labels(
                    agent="copilot", model=self.model, token_type="prompt"
                ).inc(usage.prompt_tokens)
                AGENT_TOKENS_USED.labels(
                    agent="copilot", model=self.model, token_type="completion"
                ).inc(usage.completion_tokens)

            raw_content = response.choices[0].message.content or "{}"
            raw = json.loads(raw_content)

        except json.JSONDecodeError:
            logger.warning("[Copilot] Non-JSON LLM response")
            raw = {"answer": raw_content, "citations": [], "confidence": "low"}
        except Exception as exc:
            logger.error("[Copilot] LLM call failed: %s", exc)
            return self._safe_error_response(
                "An error occurred while processing your question. Please try again."
            )

        # ── Step 6: Merge context citations with LLM-generated ones ──────────
        final_citations = self._merge_citations(
            context_citations,
            raw.get("citations", []),
            retrieved_findings,
        )

        # ── Step 7: Output Guardrail ──────────────────────────────────────────
        answer_text = raw.get("answer", "")
        out_result = self.output_guardrail.validate(
            answer=answer_text,
            citations=final_citations,
            confidence=raw.get("confidence", "medium"),
        )

        # Build follow-up suggestions
        follow_ups = raw.get("follow_up_suggestions", self._default_follow_ups(domains_to_search))

        return {
            "answer": out_result.sanitized_input,
            "citations": final_citations[:8],   # cap at 8 citation cards
            "domains_searched": domains_to_search,
            "confidence": raw.get("confidence", "medium"),
            "follow_up_suggestions": follow_ups[:4],
            "guardrail_warnings": [v.type.value for v in out_result.violations],
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    def _route_query(self, query: str) -> list[str]:
        """Classify query to relevant domains using keyword matching."""
        query_lower = query.lower()
        matched_domains: set[str] = set()

        for keywords, domains in _DOMAIN_ROUTING:
            if any(kw in query_lower for kw in keywords):
                matched_domains.update(domains)

        if not matched_domains:
            return _ALL_DOMAINS   # Broad question — search everything

        return sorted(matched_domains)

    def _get_relevant_cross_refs(
        self,
        query: str,
        retrieved: list[RetrievalResult],
    ) -> list[CrossReference]:
        """Find cross-references that connect any of the retrieved findings."""
        if not self._cross_refs:
            return []

        retrieved_ids = {r.id for r in retrieved}
        relevant = [
            cr for cr in self._cross_refs
            if cr.finding1_id in retrieved_ids or cr.finding2_id in retrieved_ids
        ]
        return relevant[:5]   # cap at 5 cross-refs per response

    def _build_context_block(
        self,
        findings: list[RetrievalResult],
        cross_refs: list[CrossReference],
    ) -> tuple[str, list[dict]]:
        """
        Build a formatted context string + pre-populated citations list
        for the LLM prompt.
        """
        lines = ["=== RELEVANT FINDINGS ===\n"]
        citations: list[dict] = []
        ref_id = 1

        for result in findings[:8]:   # max 8 findings in context
            meta = result.metadata
            finding: Finding = meta.get("finding")
            if not finding:
                continue

            citation_text = ""
            if finding.citations:
                c = finding.citations[0]
                citation_text = f' | Source: {c.file} p.{c.page} | "{c.quote[:80]}..."'
                citations.append({
                    "ref_id": ref_id,
                    "finding_id": finding.id,
                    "domain": meta["domain"],
                    "severity": finding.severity.value,
                    "title": finding.title,
                    "file": c.file,
                    "page": c.page,
                    "quote": c.quote[:200],
                    "type": "finding",
                    "score": result.score,
                })
            else:
                citations.append({
                    "ref_id": ref_id,
                    "finding_id": finding.id,
                    "domain": meta["domain"],
                    "severity": finding.severity.value,
                    "title": finding.title,
                    "file": "",
                    "page": 0,
                    "quote": finding.evidence[:200],
                    "type": "finding",
                    "score": result.score,
                })

            lines.append(
                f"[{ref_id}] [{finding.severity.value}] [{meta['domain'].upper()}] "
                f"{finding.title}\n"
                f"  Description: {finding.description[:300]}\n"
                f"  Evidence: {finding.evidence[:200]}{citation_text}\n"
            )
            ref_id += 1

        if cross_refs:
            lines.append("\n=== CROSS-DOMAIN CONNECTIONS ===\n")
            for cr in cross_refs:
                f1 = self._findings_by_id.get(cr.finding1_id)
                f2 = self._findings_by_id.get(cr.finding2_id)
                if f1 and f2:
                    lines.append(
                        f"[{cr.combined_severity.value}] {cr.connection_type.upper()}: "
                        f"'{f1.title}' ({f1.domain.value}) ↔ '{f2.title}' ({f2.domain.value})\n"
                        f"  Connection: {cr.narrative[:200]}\n"
                    )

        return "\n".join(lines), citations

    def _build_messages(
        self,
        query: str,
        context: str,
        history: list[dict],
    ) -> list[dict[str, str]]:
        """Build the full messages array for the LLM call."""
        messages = [{"role": "system", "content": _COPILOT_SYSTEM_PROMPT}]

        # Add conversation history (last 6 turns max to control token usage)
        for turn in history[-6:]:
            if turn.get("role") in ("user", "assistant"):
                messages.append(turn)

        # Add current query with context
        user_message = (
            f"DEAL CONTEXT (retrieved findings):\n{context}\n\n"
            f"ANALYST QUESTION: {query}"
        )
        messages.append({"role": "user", "content": user_message})
        return messages

    def _merge_citations(
        self,
        context_citations: list[dict],
        llm_citations: list[dict],
        retrieved: list[RetrievalResult],
    ) -> list[dict]:
        """
        Prefer context_citations (pre-populated from retrieval) over LLM-generated ones.
        The LLM's citation JSON is often incomplete; the retrieval engine's is authoritative.
        """
        seen_ids = {c["finding_id"] for c in context_citations if c.get("finding_id")}
        merged = list(context_citations)

        for llm_c in llm_citations:
            fid = llm_c.get("finding_id")
            if fid and fid not in seen_ids and fid in self._findings_by_id:
                finding = self._findings_by_id[fid]
                merged.append({
                    "ref_id": len(merged) + 1,
                    "finding_id": fid,
                    "domain": finding.domain.value,
                    "severity": finding.severity.value,
                    "title": finding.title,
                    "file": finding.citations[0].file if finding.citations else "",
                    "page": finding.citations[0].page if finding.citations else 0,
                    "quote": finding.citations[0].quote[:200] if finding.citations else "",
                    "type": "finding",
                })
                seen_ids.add(fid)

        return merged

    def _default_follow_ups(self, domains: list[str]) -> list[str]:
        """Generate default follow-up suggestions based on searched domains."""
        suggestions = [
            "Which findings could affect the deal valuation?",
            "What are the top P0 and P1 risks in this deal?",
            "Are there cross-domain risks I should be aware of?",
            "What questions should I ask management about these findings?",
        ]
        if "finance" in domains:
            suggestions[0] = "Show me the revenue concentration details and customer breakdown."
        if "cyber" in domains:
            suggestions[0] = "Are there any unresolved cybersecurity incidents or breaches?"
        if "legal" in domains:
            suggestions[1] = "Which contracts contain change-of-control or termination clauses?"
        return suggestions[:4]

    @staticmethod
    def _safe_error_response(message: str) -> dict[str, Any]:
        """Return a safe, structured error response."""
        return {
            "answer": message,
            "citations": [],
            "domains_searched": [],
            "confidence": "low",
            "follow_up_suggestions": [
                "Why is this deal considered high risk?",
                "Show me all P0 and P1 findings.",
                "What are the main cross-domain risks?",
                "What should I ask management in due diligence?",
            ],
            "guardrail_warnings": [],
        }
