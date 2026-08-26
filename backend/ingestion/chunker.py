"""
Document chunker — splits ParsedDocuments into overlapping token windows
that fit comfortably within LLM context limits, preserving citation metadata.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ingestion.parser import ParsedDocument, ParsedPage

# Approximate tokens per word (GPT tokenizer average)
_TOKENS_PER_WORD = 1.3


@dataclass
class Chunk:
    """A text window ready to be fed to an agent."""
    chunk_id: str          # "{file_name}::{page}::{idx}"
    file_name: str
    page: int
    section: str
    text: str
    token_estimate: int


def estimate_tokens(text: str) -> int:
    """Fast token estimate without a real tokenizer."""
    return int(len(text.split()) * _TOKENS_PER_WORD)


def chunk_document(
    doc: ParsedDocument,
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[Chunk]:
    """
    Chunk a ParsedDocument into overlapping windows.

    Strategy:
    - If a page fits in chunk_size, keep it whole (preserves citation accuracy).
    - If a page is larger, split by sentence boundaries with overlap.
    """
    chunks: list[Chunk] = []

    for page in doc.pages:
        page_tokens = estimate_tokens(page.text)

        if page_tokens <= chunk_size:
            # Page fits as a single chunk
            chunks.append(_make_chunk(doc.file_name, page, page.text, 0))
        else:
            # Split into overlapping sentence windows
            sentences = _split_sentences(page.text)
            window: list[str] = []
            window_tokens = 0
            idx = 0

            for sentence in sentences:
                sent_tokens = estimate_tokens(sentence)

                if window_tokens + sent_tokens > chunk_size and window:
                    # Emit current window
                    chunks.append(_make_chunk(doc.file_name, page, " ".join(window), idx))
                    idx += 1

                    # Keep overlap: drop sentences from the front until we're under overlap limit
                    while window and window_tokens > overlap:
                        removed = window.pop(0)
                        window_tokens -= estimate_tokens(removed)

                window.append(sentence)
                window_tokens += sent_tokens

            if window:
                chunks.append(_make_chunk(doc.file_name, page, " ".join(window), idx))

    return chunks


def chunk_documents(
    docs: list[ParsedDocument],
    chunk_size: int = 1000,
    overlap: int = 200,
) -> list[Chunk]:
    """Chunk a list of documents."""
    all_chunks: list[Chunk] = []
    for doc in docs:
        if doc.error:
            continue
        all_chunks.extend(chunk_document(doc, chunk_size, overlap))
    return all_chunks


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_chunk(file_name: str, page: ParsedPage, text: str, idx: int) -> Chunk:
    return Chunk(
        chunk_id=f"{file_name}::{page.page}::{idx}",
        file_name=file_name,
        page=page.page,
        section=page.section,
        text=text.strip(),
        token_estimate=estimate_tokens(text),
    )


def _split_sentences(text: str) -> list[str]:
    """Simple sentence splitter — good enough for legal/financial docs."""
    # Split on period/question/exclamation followed by whitespace + capital letter
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"])", text)
    return [p.strip() for p in parts if p.strip()]
