"""
Guardrails — Input and Output validation for all LLM pathways.

Addresses:
  - OWASP LLM01: Prompt Injection (Input Guardrail)
  - OWASP LLM06: Sensitive Information Disclosure (Output DLP)
  - OWASP LLM02: Insecure Output Handling (Output Guardrail)
  - OWASP LLM08: Excessive Agency (combined guardrails)
  - V-01, V-02, V-15

Architecture:
  Every LLM-touching route calls InputGuardrail.validate() BEFORE the LLM call.
  Every LLM response goes through OutputGuardrail.validate() BEFORE returning to client.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


# ── Enums ─────────────────────────────────────────────────────────────────────

class GuardrailAction(str, Enum):
    ALLOW   = "allow"
    WARN    = "warn"       # Log + continue with sanitized input
    BLOCK   = "block"      # Reject entirely — never reach LLM
    TRUNCATE = "truncate"  # Input too long — trim and continue


class GuardrailViolationType(str, Enum):
    PROMPT_INJECTION    = "prompt_injection"
    EXCESSIVE_LENGTH    = "excessive_length"
    BLOCKED_TOPIC       = "blocked_topic"
    PII_IN_OUTPUT       = "pii_in_output"
    POLICY_VIOLATION    = "policy_violation"
    CITATION_MISMATCH   = "citation_mismatch"
    HALLUCINATION_RISK  = "hallucination_risk"
    CODE_INJECTION      = "code_injection"


# ── Result objects ────────────────────────────────────────────────────────────

@dataclass
class GuardrailViolation:
    type: GuardrailViolationType
    description: str
    pattern_matched: str = ""


@dataclass
class GuardrailResult:
    action: GuardrailAction
    sanitized_input: str        # Use this instead of the original when WARN/TRUNCATE
    violations: list[GuardrailViolation] = field(default_factory=list)
    safe_message: str = ""      # User-facing rejection message when BLOCK

    @property
    def blocked(self) -> bool:
        return self.action == GuardrailAction.BLOCK


# ── Input Guardrail ───────────────────────────────────────────────────────────

# Prompt injection patterns — all case-insensitive
_INJECTION_PATTERNS: list[tuple[str, str]] = [
    # Classic instruction override
    (r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?", "instruction_override"),
    (r"disregard\s+(all\s+)?(previous|prior)\s+instructions?",    "instruction_override"),
    (r"forget\s+(everything|that)\s+(you\s+)?(know|were told)",   "instruction_override"),

    # Identity replacement
    (r"you\s+are\s+now\s+(a\s+|an\s+)?",                         "identity_replacement"),
    (r"act\s+as\s+(if\s+you\s+are|a\s+|an\s+)",                  "identity_replacement"),
    (r"pretend\s+(you\s+are|to\s+be)\s+",                         "identity_replacement"),
    (r"roleplay\s+as\s+",                                          "identity_replacement"),

    # System prompt extraction
    (r"(reveal|show|print|output|repeat)\s+(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    (r"what\s+(are\s+your|is\s+your)\s+instructions?",            "prompt_extraction"),
    (r"what\s+(were\s+you|have\s+you\s+been)\s+told",             "prompt_extraction"),

    # Delimiter / smuggling attacks
    (r"\\n\\n#+\s*(instructions?|system|prompt)",                  "prompt_smuggling"),
    (r"---+\s*(instructions?|system)",                             "prompt_smuggling"),
    (r"\[INST\]",                                                  "token_smuggling"),
    (r"<\|im_start\|>",                                            "token_smuggling"),

    # Code execution
    (r"```\s*(python|bash|sh|javascript|js|powershell|cmd)",       "code_injection"),
    (r"(exec|eval|os\.system|subprocess)",                         "code_injection"),

    # HTML/script injection
    (r"<\s*script[\s>]",                                           "script_injection"),
    (r"javascript\s*:",                                             "script_injection"),
    (r"on(load|click|error|mouse)\s*=",                            "script_injection"),

    # Jailbreak attempts
    (r"DAN\s+mode",                                                "jailbreak"),
    (r"developer\s+mode",                                          "jailbreak"),
    (r"jailbreak",                                                  "jailbreak"),
    (r"no\s+restrictions?",                                         "jailbreak"),
]

_BLOCKED_TOPICS: list[tuple[str, str]] = [
    (r"\b(bomb|explosive|detonat)",         "weapons"),
    (r"\b(malware|ransomware|rootkit|exploit\s+code)", "malware"),
    (r"\b(nuclear\s+weapon|bioweapon)",     "wmd"),
]

MAX_QUERY_LENGTH          = 600    # characters
MAX_CONVERSATION_TURNS    = 20     # prevent context window exhaustion
SAFE_REJECTION_MESSAGE    = (
    "I can only answer questions about this M&A deal's findings, "
    "documents, and risk analysis. Please rephrase your question."
)


class InputGuardrail:
    """
    Validates all user inputs before they reach any LLM.

    Usage:
        result = InputGuardrail().validate(user_query)
        if result.blocked:
            return {"error": result.safe_message}
        # use result.sanitized_input going forward
    """

    def __init__(
        self,
        max_length: int = MAX_QUERY_LENGTH,
        max_turns: int = MAX_CONVERSATION_TURNS,
    ):
        self.max_length = max_length
        self.max_turns = max_turns
        # Pre-compile patterns for performance
        self._compiled_injection = [
            (re.compile(p, re.IGNORECASE | re.DOTALL), label)
            for p, label in _INJECTION_PATTERNS
        ]
        self._compiled_topics = [
            (re.compile(p, re.IGNORECASE), label)
            for p, label in _BLOCKED_TOPICS
        ]

    def validate(self, query: str, conversation_turns: int = 0) -> GuardrailResult:
        """
        Full input validation pipeline.

        Returns GuardrailResult — always use result.sanitized_input, never raw query.
        """
        violations: list[GuardrailViolation] = []
        sanitized = query

        # 1. Length check
        if len(query) > self.max_length:
            sanitized = query[:self.max_length]
            violations.append(GuardrailViolation(
                type=GuardrailViolationType.EXCESSIVE_LENGTH,
                description=f"Query truncated from {len(query)} to {self.max_length} chars."
            ))
            logger.info("Guardrail: query truncated from %d chars", len(query))
            # Don't block — just truncate

        # 2. Conversation turn limit
        if conversation_turns >= self.max_turns:
            return GuardrailResult(
                action=GuardrailAction.BLOCK,
                sanitized_input="",
                violations=[GuardrailViolation(
                    type=GuardrailViolationType.EXCESSIVE_LENGTH,
                    description=f"Conversation limit of {self.max_turns} turns reached."
                )],
                safe_message="This conversation has reached its limit. Please start a new Copilot session."
            )

        # 3. Prompt injection patterns
        for pattern, label in self._compiled_injection:
            match = pattern.search(sanitized)
            if match:
                logger.warning(
                    "SECURITY [InputGuardrail]: Prompt injection attempt — pattern '%s' matched: '%s'",
                    label, match.group()[:80]
                )
                return GuardrailResult(
                    action=GuardrailAction.BLOCK,
                    sanitized_input="",
                    violations=[GuardrailViolation(
                        type=GuardrailViolationType.PROMPT_INJECTION,
                        description=f"Prompt injection pattern detected: {label}",
                        pattern_matched=label,
                    )],
                    safe_message=SAFE_REJECTION_MESSAGE,
                )

        # 4. Blocked topics
        for pattern, label in self._compiled_topics:
            if pattern.search(sanitized):
                logger.warning("SECURITY [InputGuardrail]: Blocked topic '%s'", label)
                return GuardrailResult(
                    action=GuardrailAction.BLOCK,
                    sanitized_input="",
                    violations=[GuardrailViolation(
                        type=GuardrailViolationType.BLOCKED_TOPIC,
                        description=f"Query contains blocked topic: {label}",
                        pattern_matched=label,
                    )],
                    safe_message=SAFE_REJECTION_MESSAGE,
                )

        # All checks passed
        action = GuardrailAction.WARN if violations else GuardrailAction.ALLOW
        return GuardrailResult(
            action=action,
            sanitized_input=sanitized,
            violations=violations,
        )


# ── Output Guardrail ──────────────────────────────────────────────────────────

# PII patterns for DLP scan
_PII_PATTERNS: list[tuple[str, str]] = [
    (r"\b\d{3}-\d{2}-\d{4}\b",               "SSN"),
    (r"\b4[0-9]{12}(?:[0-9]{3})?\b",          "Visa card number"),
    (r"\b5[1-5][0-9]{14}\b",                  "Mastercard number"),
    (r"\b3[47][0-9]{13}\b",                   "Amex card number"),
    (r"\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]{0,3})?\b", "IBAN"),
    (r"\b[0-9]{8,17}\b(?=.*\bIBAN\b)",        "Account number"),
    (r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "Email address"),
]

# Policy violations — AI should not make investment recommendations
_POLICY_PATTERNS: list[tuple[str, str]] = [
    (r"you\s+should\s+(buy|acquire|invest)",     "investment_recommendation"),
    (r"this\s+is\s+a\s+(good|great|bad)\s+deal", "deal_recommendation"),
    (r"(recommend|advise)\s+(buying|selling|acquiring)", "investment_advice"),
    (r"guaranteed\s+(return|profit|gain)",        "financial_guarantee"),
]

OUTPUT_DISCLAIMER = (
    "\n\n⚠️ *Note: This analysis is AI-generated and should be reviewed by "
    "qualified legal and financial advisors before making investment decisions.*"
)
MAX_RESPONSE_LENGTH = 8000   # characters


class OutputGuardrail:
    """
    Post-processes LLM responses before returning to client.

    Checks:
    1. DLP — scan for PII patterns
    2. Policy — no investment recommendations
    3. Citation consistency — [N] markers must have corresponding citations
    4. Length cap
    5. Confidence disclaimer injection for low-confidence answers
    """

    def __init__(self):
        self._compiled_pii = [
            (re.compile(p, re.IGNORECASE), label)
            for p, label in _PII_PATTERNS
        ]
        self._compiled_policy = [
            (re.compile(p, re.IGNORECASE), label)
            for p, label in _POLICY_PATTERNS
        ]

    def validate(
        self,
        answer: str,
        citations: list[dict],
        confidence: str = "high",
    ) -> GuardrailResult:
        """
        Validate and sanitize an LLM response.

        Returns GuardrailResult with sanitized_input = cleaned answer.
        Note: This never BLOCKs — it cleans or warns.
        """
        violations: list[GuardrailViolation] = []
        sanitized = answer

        # 1. DLP — PII detection
        for pattern, label in self._compiled_pii:
            match = pattern.search(sanitized)
            if match:
                logger.warning("SECURITY [OutputGuardrail]: PII detected in response — %s", label)
                # Redact the match
                sanitized = pattern.sub(f"[REDACTED {label}]", sanitized)
                violations.append(GuardrailViolation(
                    type=GuardrailViolationType.PII_IN_OUTPUT,
                    description=f"PII pattern '{label}' detected and redacted from response.",
                    pattern_matched=label,
                ))

        # 2. Policy violations
        for pattern, label in self._compiled_policy:
            if pattern.search(sanitized):
                logger.warning("SECURITY [OutputGuardrail]: Policy violation — %s", label)
                violations.append(GuardrailViolation(
                    type=GuardrailViolationType.POLICY_VIOLATION,
                    description=f"Response contains prohibited content: {label}",
                    pattern_matched=label,
                ))
                # Append disclaimer instead of blocking — the user still gets a response
                if OUTPUT_DISCLAIMER not in sanitized:
                    sanitized += OUTPUT_DISCLAIMER

        # 3. Citation consistency — verify [N] markers have corresponding citations
        citation_refs = set(re.findall(r"\[(\d+)\]", sanitized))
        citation_ids = {str(c.get("ref_id", "")) for c in citations}
        orphaned = citation_refs - citation_ids
        if orphaned:
            violations.append(GuardrailViolation(
                type=GuardrailViolationType.CITATION_MISMATCH,
                description=f"Response references citation IDs {orphaned} that have no matching citation object.",
            ))

        # 4. Confidence disclaimer
        if confidence == "low" and not citations:
            sanitized += (
                "\n\n⚠️ *Low confidence: This answer could not be fully grounded in "
                "the deal documents. Please verify with primary sources.*"
            )
            violations.append(GuardrailViolation(
                type=GuardrailViolationType.HALLUCINATION_RISK,
                description="Low confidence + no citations — disclaimer injected.",
            ))

        # 5. Length cap
        if len(sanitized) > MAX_RESPONSE_LENGTH:
            sanitized = sanitized[:MAX_RESPONSE_LENGTH] + "\n\n*[Response truncated]*"

        action = GuardrailAction.WARN if violations else GuardrailAction.ALLOW
        if violations:
            logger.info(
                "OutputGuardrail: %d violation(s) — %s",
                len(violations), [v.type.value for v in violations]
            )

        return GuardrailResult(
            action=action,
            sanitized_input=sanitized,
            violations=violations,
        )
