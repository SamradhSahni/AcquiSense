"""
Document parser — converts uploaded files into structured text with
page-level citations preserved.

Supports: PDF, DOCX, XLSX, PPTX, TXT, CSV, MD
"""
from __future__ import annotations

import os
import csv
import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ParsedPage:
    """A single page / sheet extracted from a document."""
    file_name: str
    page: int
    text: str
    section: str = ""


@dataclass
class ParsedDocument:
    """All pages extracted from one file."""
    file_name: str
    file_type: str
    pages: list[ParsedPage] = field(default_factory=list)
    error: str | None = None

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.text for p in self.pages)

    @property
    def page_count(self) -> int:
        return len(self.pages)


def parse_file(file_path: str) -> ParsedDocument:
    """
    Parse any supported file into a ParsedDocument.
    Falls back gracefully if optional libraries aren't installed.
    """
    path = Path(file_path)
    ext = path.suffix.lower().lstrip(".")
    file_name = path.name

    if not path.exists():
        return ParsedDocument(file_name=file_name, file_type=ext, error="File not found")

    try:
        if ext == "pdf":
            return _parse_pdf(file_path, file_name)
        elif ext in ("docx", "doc"):
            return _parse_docx(file_path, file_name)
        elif ext in ("xlsx", "xls"):
            return _parse_xlsx(file_path, file_name)
        elif ext == "pptx":
            return _parse_pptx(file_path, file_name)
        elif ext == "csv":
            return _parse_csv(file_path, file_name)
        elif ext in ("txt", "md", "rst"):
            return _parse_text(file_path, file_name, ext)
        else:
            return _parse_fallback(file_path, file_name, ext)
    except Exception as exc:
        logger.exception("Failed to parse %s: %s", file_name, exc)
        return ParsedDocument(file_name=file_name, file_type=ext, error=str(exc))


# ── Per-format parsers ────────────────────────────────────────────────────────

def _parse_pdf(file_path: str, file_name: str) -> ParsedDocument:
    try:
        import fitz  # pymupdf
        doc = fitz.open(file_path)
        pages = []
        for i, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append(ParsedPage(file_name=file_name, page=i, text=text))
        doc.close()
        return ParsedDocument(file_name=file_name, file_type="pdf", pages=pages)
    except ImportError:
        # Fallback: markitdown
        return _parse_fallback(file_path, file_name, "pdf")


def _parse_docx(file_path: str, file_name: str) -> ParsedDocument:
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        text = result.text_content or ""
        # Split into logical "pages" by double-newlines (no real page numbers in docx)
        chunks = [c.strip() for c in text.split("\n\n\n") if c.strip()]
        pages = [
            ParsedPage(file_name=file_name, page=i + 1, text=chunk)
            for i, chunk in enumerate(chunks)
        ]
        return ParsedDocument(file_name=file_name, file_type="docx", pages=pages or [
            ParsedPage(file_name=file_name, page=1, text=text)
        ])
    except Exception:
        return _parse_fallback(file_path, file_name, "docx")


def _parse_xlsx(file_path: str, file_name: str) -> ParsedDocument:
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        text = result.text_content or ""
        pages = [ParsedPage(file_name=file_name, page=1, text=text)]
        return ParsedDocument(file_name=file_name, file_type="xlsx", pages=pages)
    except Exception:
        return _parse_fallback(file_path, file_name, "xlsx")


def _parse_pptx(file_path: str, file_name: str) -> ParsedDocument:
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        text = result.text_content or ""
        # Each slide is a "page"
        slides = [s.strip() for s in text.split("---") if s.strip()]
        pages = [
            ParsedPage(file_name=file_name, page=i + 1, text=slide, section=f"Slide {i+1}")
            for i, slide in enumerate(slides)
        ] or [ParsedPage(file_name=file_name, page=1, text=text)]
        return ParsedDocument(file_name=file_name, file_type="pptx", pages=pages)
    except Exception:
        return _parse_fallback(file_path, file_name, "pptx")


def _parse_csv(file_path: str, file_name: str) -> ParsedDocument:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f)
            rows = list(reader)
        if not rows:
            return ParsedDocument(file_name=file_name, file_type="csv", pages=[])
        header = rows[0]
        # Convert to readable text
        lines = ["\t".join(header)]
        for row in rows[1:]:
            lines.append("\t".join(row))
        text = "\n".join(lines)
        pages = [ParsedPage(file_name=file_name, page=1, text=text, section="CSV Data")]
        return ParsedDocument(file_name=file_name, file_type="csv", pages=pages)
    except Exception as exc:
        return ParsedDocument(file_name=file_name, file_type="csv", error=str(exc))


def _parse_text(file_path: str, file_name: str, ext: str) -> ParsedDocument:
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        pages = [ParsedPage(file_name=file_name, page=1, text=text)]
        return ParsedDocument(file_name=file_name, file_type=ext, pages=pages)
    except Exception as exc:
        return ParsedDocument(file_name=file_name, file_type=ext, error=str(exc))


def _parse_fallback(file_path: str, file_name: str, ext: str) -> ParsedDocument:
    """Last resort: try to read as UTF-8 text."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read(500_000)  # cap at 500KB of text
        pages = [ParsedPage(file_name=file_name, page=1, text=text)]
        return ParsedDocument(file_name=file_name, file_type=ext, pages=pages)
    except Exception as exc:
        return ParsedDocument(file_name=file_name, file_type=ext, error=str(exc))
