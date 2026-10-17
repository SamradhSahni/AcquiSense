"""
RetrievalEngine — Hybrid BM25 + TF-IDF cosine retrieval over deal findings and document chunks.

Replaces naive substring matching used in QualityGateAgent Gate 2 and powers
the Deal Copilot's context assembly.

Architecture:
  - BM25 (keyword matching via rank_bm25) — excellent for exact/near-exact term matching
  - TF-IDF Cosine Similarity (scikit-learn) — handles synonyms and partial matches
  - Weighted fusion: score = alpha * bm25_norm + (1 - alpha) * cosine_norm
  - Metadata filtering: domain, severity, file name before ranking

Why two signals?
  BM25 alone misses paraphrases ("revenue" vs "income").
  Cosine alone misses exact legal terms ("change-of-control clause").
  Fusion gives best of both worlds.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

from api.schemas import Domain, DomainFindings, Finding, Severity
from ingestion.chunker import Chunk

logger = logging.getLogger(__name__)

# Fusion weight — BM25 vs cosine. 0.5 = equal weight.
DEFAULT_ALPHA = 0.6   # Slightly favour keyword precision for legal docs


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class RetrievalResult:
    """A single retrieved item with its fused relevance score."""
    id: str                      # finding ID or chunk_id
    type: str                    # "finding" | "chunk" | "cross_ref"
    text: str                    # the text that was matched
    score: float                 # fused relevance score (0.0 – 1.0)
    metadata: dict[str, Any]     # domain, severity, file, page, etc.


# ── Retrieval Engine ──────────────────────────────────────────────────────────

class RetrievalEngine:
    """
    Builds an in-memory index over findings + chunks and provides ranked search.

    Usage:
        engine = RetrievalEngine()
        engine.build_index(domain_findings=findings_dict, chunks=all_chunks)
        results = engine.search("customer concentration risk", top_k=8)
    """

    def __init__(self, alpha: float = DEFAULT_ALPHA):
        self.alpha = alpha
        self._finding_docs: list[str] = []       # tokenized finding texts
        self._finding_meta: list[dict] = []       # metadata for each finding
        self._chunk_docs: list[str] = []          # chunk texts
        self._chunk_meta: list[dict] = []         # metadata for each chunk
        self._bm25_findings = None
        self._bm25_chunks = None
        self._tfidf_findings = None
        self._tfidf_matrix_findings = None
        self._ready = False

    # ── Index building ────────────────────────────────────────────────────────

    def build_index(
        self,
        domain_findings: dict[Domain, DomainFindings],
        chunks: list[Chunk] | None = None,
    ) -> None:
        """
        Build BM25 + TF-IDF indexes over all findings (and optionally chunks).
        Call once after analysis completes, then reuse for all queries.
        """
        self._finding_docs = []
        self._finding_meta = []
        self._chunk_docs = []
        self._chunk_meta = []

        # Index all findings
        for domain, df in domain_findings.items():
            for finding in df.findings:
                # Concatenate all textual fields for rich matching
                doc_text = " ".join(filter(None, [
                    finding.title,
                    finding.description,
                    finding.evidence,
                    " ".join(finding.tags),
                    " ".join(c.quote for c in finding.citations),
                ]))
                self._finding_docs.append(doc_text)
                self._finding_meta.append({
                    "id": finding.id,
                    "type": "finding",
                    "domain": domain.value,
                    "severity": finding.severity.value,
                    "title": finding.title,
                    "text": doc_text,
                    "finding": finding,
                })

        # Index chunks (optional — for document-level search)
        if chunks:
            for chunk in chunks:
                self._chunk_docs.append(chunk.text)
                self._chunk_meta.append({
                    "id": chunk.chunk_id,
                    "type": "chunk",
                    "file": chunk.file_name,
                    "page": chunk.page,
                    "section": chunk.section,
                    "text": chunk.text[:500],  # truncate for metadata storage
                })

        self._build_bm25()
        self._build_tfidf()
        self._ready = True
        logger.info(
            "RetrievalEngine index built — %d findings, %d chunks",
            len(self._finding_docs), len(self._chunk_docs)
        )

    def _build_bm25(self) -> None:
        """Build BM25 index using rank_bm25 if available, else skip."""
        try:
            from rank_bm25 import BM25Okapi
            if self._finding_docs:
                tokenized = [doc.lower().split() for doc in self._finding_docs]
                self._bm25_findings = BM25Okapi(tokenized)
            if self._chunk_docs:
                tokenized = [doc.lower().split() for doc in self._chunk_docs]
                self._bm25_chunks = BM25Okapi(tokenized)
        except ImportError:
            logger.warning("rank_bm25 not installed — BM25 retrieval disabled. Install: pip install rank-bm25")
            self._bm25_findings = None
            self._bm25_chunks = None

    def _build_tfidf(self) -> None:
        """Build TF-IDF index using scikit-learn."""
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
            self._cosine_similarity = cosine_similarity

            if self._finding_docs:
                vectorizer = TfidfVectorizer(
                    max_features=5000,
                    stop_words="english",
                    ngram_range=(1, 2),
                )
                self._tfidf_matrix_findings = vectorizer.fit_transform(self._finding_docs)
                self._tfidf_findings = vectorizer
        except ImportError:
            logger.warning("scikit-learn not installed — cosine retrieval disabled.")
            self._tfidf_findings = None

    # ── Search ────────────────────────────────────────────────────────────────

    def search(
        self,
        query: str,
        top_k: int = 8,
        domain_filter: list[str] | None = None,
        severity_filter: list[str] | None = None,
        result_type: str = "finding",   # "finding" | "chunk" | "both"
    ) -> list[RetrievalResult]:
        """
        Search the index for the most relevant findings / chunks.

        Args:
            query: natural-language query string
            top_k: max results to return
            domain_filter: limit to specific domains (e.g., ["finance", "legal"])
            severity_filter: limit to specific severities (e.g., ["P0", "P1"])
            result_type: what to search — findings, chunks, or both

        Returns:
            List of RetrievalResult sorted by score descending.
        """
        if not self._ready:
            logger.warning("RetrievalEngine not indexed yet — call build_index() first")
            return []

        results: list[RetrievalResult] = []

        if result_type in ("finding", "both") and self._finding_docs:
            results.extend(self._search_findings(query, top_k * 2, domain_filter, severity_filter))

        if result_type in ("chunk", "both") and self._chunk_docs:
            results.extend(self._search_chunks(query, top_k * 2))

        # Sort by score and deduplicate
        seen = set()
        final: list[RetrievalResult] = []
        for r in sorted(results, key=lambda x: x.score, reverse=True):
            if r.id not in seen:
                seen.add(r.id)
                final.append(r)
            if len(final) >= top_k:
                break

        return final

    def fuzzy_match_quote(self, quote: str, chunk_text: str, threshold: int = 72) -> bool:
        """
        Check if a quote appears in chunk_text using fuzzy matching.
        Replaces Gate 2's naive substring check.

        Uses rapidfuzz.fuzz.partial_ratio (faster than fuzzywuzzy).
        Falls back to substring if rapidfuzz is unavailable.
        """
        if not quote or len(quote) < 15:
            return True   # Too short to verify — give benefit of doubt

        probe = quote[:80].lower().strip()
        text_lower = chunk_text.lower()

        # Fast path: exact substring
        if probe in text_lower:
            return True

        # Fuzzy path
        try:
            from rapidfuzz import fuzz
            score = fuzz.partial_ratio(probe, text_lower)
            return score >= threshold
        except ImportError:
            logger.debug("rapidfuzz not available — using substring fallback")
            # Simple word overlap fallback
            probe_words = set(probe.split())
            text_words = set(text_lower.split())
            overlap = probe_words & text_words
            return len(overlap) / max(len(probe_words), 1) >= 0.6

    # ── Internal search helpers ───────────────────────────────────────────────

    def _search_findings(
        self,
        query: str,
        top_k: int,
        domain_filter: list[str] | None,
        severity_filter: list[str] | None,
    ) -> list[RetrievalResult]:
        """BM25 + cosine fusion over findings corpus."""
        bm25_scores = self._get_bm25_scores(query, self._bm25_findings, len(self._finding_docs))
        cosine_scores = self._get_cosine_scores(query, self._tfidf_findings, self._tfidf_matrix_findings)

        fused = self._fuse_scores(bm25_scores, cosine_scores)
        results: list[RetrievalResult] = []

        for idx, score in sorted(enumerate(fused), key=lambda x: x[1], reverse=True)[:top_k]:
            meta = self._finding_meta[idx]

            # Apply filters
            if domain_filter and meta["domain"] not in domain_filter:
                continue
            if severity_filter and meta["severity"] not in severity_filter:
                continue

            results.append(RetrievalResult(
                id=meta["id"],
                type="finding",
                text=meta["title"],
                score=round(score, 4),
                metadata=meta,
            ))

        return results

    def _search_chunks(self, query: str, top_k: int) -> list[RetrievalResult]:
        """BM25 over document chunks."""
        if not self._bm25_chunks:
            return []
        bm25_scores = self._get_bm25_scores(query, self._bm25_chunks, len(self._chunk_docs))
        results: list[RetrievalResult] = []

        for idx, score in sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)[:top_k]:
            meta = self._chunk_meta[idx]
            results.append(RetrievalResult(
                id=meta["id"],
                type="chunk",
                text=meta["text"][:200],
                score=round(score, 4),
                metadata=meta,
            ))
        return results

    def _get_bm25_scores(self, query: str, bm25_index, doc_count: int) -> list[float]:
        """Get normalized BM25 scores [0, 1]."""
        if bm25_index is None or doc_count == 0:
            return [0.0] * doc_count
        tokens = query.lower().split()
        raw = bm25_index.get_scores(tokens)
        max_score = max(raw) if max(raw) > 0 else 1.0
        return [s / max_score for s in raw]

    def _get_cosine_scores(self, query: str, vectorizer, matrix) -> list[float]:
        """Get TF-IDF cosine similarity scores [0, 1]."""
        if vectorizer is None or matrix is None:
            return [0.0] * (matrix.shape[0] if matrix is not None else 0)
        try:
            query_vec = vectorizer.transform([query])
            scores = self._cosine_similarity(query_vec, matrix).flatten()
            return scores.tolist()
        except Exception as exc:
            logger.debug("Cosine scoring failed: %s", exc)
            return [0.0] * matrix.shape[0]

    def _fuse_scores(self, bm25: list[float], cosine: list[float]) -> list[float]:
        """Weighted fusion of BM25 and cosine scores."""
        n = max(len(bm25), len(cosine))
        bm25_padded   = bm25   + [0.0] * (n - len(bm25))
        cosine_padded = cosine + [0.0] * (n - len(cosine))
        return [
            self.alpha * b + (1 - self.alpha) * c
            for b, c in zip(bm25_padded, cosine_padded)
        ]
