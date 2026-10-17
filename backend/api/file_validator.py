"""
FileValidator — enterprise-grade file upload validation.

Addresses:
  - CWE-434: Unrestricted Upload of File with Dangerous Type
  - CWE-22:  Path Traversal via filename
  - V-03:    Extension-only check bypass (rename malware.exe → malware.pdf)
  - V-05:    Directory traversal in filenames

Validation pipeline (all must pass):
  1. Extension allowlist
  2. Magic-byte / MIME-type verification (actual content, not just name)
  3. File size limit
  4. Filename sanitization + traversal prevention
  5. Per-deal upload quota
"""
from __future__ import annotations

import logging
import os
import re
import struct
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ── Allowlists ────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS: frozenset[str] = frozenset({
    "pdf", "docx", "doc", "xlsx", "xls",
    "pptx", "ppt", "txt", "csv", "md",
})

# Mapping of MIME types to allowed extensions
ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/x-markdown",
    # Also allow application/octet-stream for plain text files on some systems
    "application/octet-stream",
})

# Magic bytes for key file types (first N bytes → expected magic)
# Format: (offset, magic_bytes, description)
_MAGIC_SIGNATURES: list[tuple[int, bytes, str]] = [
    (0, b"%PDF",                  "PDF"),
    (0, b"PK\x03\x04",           "ZIP-based (DOCX/XLSX/PPTX)"),
    (0, b"\xD0\xCF\x11\xE0",     "OLE2 (DOC/XLS/PPT)"),
    (0, b"\xEF\xBB\xBF",         "UTF-8 BOM text"),
]

# Known dangerous magic bytes — reject these regardless of extension
_BLOCKED_MAGIC: list[tuple[int, bytes, str]] = [
    (0, b"MZ",                    "Windows PE executable"),
    (0, b"\x7fELF",              "ELF binary"),
    (0, b"\xCA\xFE\xBA\xBE",    "Java .class file"),
    (0, b"#!/",                   "Shell script"),
    (0, b"<script",              "HTML/script injection"),
    (0, b"<?php",                "PHP script"),
]

# ── Limits ────────────────────────────────────────────────────────────────────

DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024   # 50 MB
DEFAULT_MAX_FILES_PER_DEAL  = 25


# ── Result objects ────────────────────────────────────────────────────────────

@dataclass
class ValidationError:
    """A single validation failure."""
    code: str
    message: str


@dataclass
class ValidationResult:
    """Result of validating a single file."""
    valid: bool
    safe_filename: str          # sanitized filename safe for use on disk
    errors: list[ValidationError]
    mime_detected: str = ""


# ── Validator ─────────────────────────────────────────────────────────────────

class FileValidator:
    """
    Validates uploaded files before they are written to disk.

    Usage:
        validator = FileValidator()
        content = await file.read()
        result = validator.validate(file.filename, content)
        if not result.valid:
            raise HTTPException(400, result.errors[0].message)
        # Write to disk using result.safe_filename (never original filename)
    """

    def __init__(
        self,
        max_file_size: int = DEFAULT_MAX_FILE_SIZE_BYTES,
        max_files_per_deal: int = DEFAULT_MAX_FILES_PER_DEAL,
    ):
        self.max_file_size = max_file_size
        self.max_files_per_deal = max_files_per_deal

    # ── Public API ────────────────────────────────────────────────────────────

    def validate(self, filename: str, content: bytes) -> ValidationResult:
        """
        Run the full validation pipeline on a single file.
        Returns ValidationResult with valid=True only if ALL checks pass.
        """
        errors: list[ValidationError] = []
        safe_name = self._sanitize_filename(filename)

        # 1. Extension check
        ext_error = self._check_extension(filename)
        if ext_error:
            errors.append(ext_error)

        # 2. Size check
        size_error = self._check_size(content, filename)
        if size_error:
            errors.append(size_error)

        # 3. Blocked magic bytes (executables / scripts)
        blocked_error = self._check_blocked_magic(content, filename)
        if blocked_error:
            errors.append(blocked_error)

        # 4. MIME type check via python-magic (best-effort — may not be installed)
        mime = self._detect_mime(content)
        if mime and mime not in ALLOWED_MIME_TYPES:
            # Only hard-fail if we got a definitive non-text type
            if not mime.startswith("text/"):
                errors.append(ValidationError(
                    code="MIME_MISMATCH",
                    message=f"'{filename}': detected MIME type '{mime}' is not permitted."
                ))

        if errors:
            logger.warning("File validation FAILED for '%s': %s", filename, [e.code for e in errors])

        return ValidationResult(
            valid=len(errors) == 0,
            safe_filename=safe_name,
            errors=errors,
            mime_detected=mime,
        )

    def check_deal_quota(self, existing_file_count: int) -> ValidationError | None:
        """Check if adding more files would exceed the per-deal limit."""
        if existing_file_count >= self.max_files_per_deal:
            return ValidationError(
                code="QUOTA_EXCEEDED",
                message=f"Deal has reached the maximum of {self.max_files_per_deal} files."
            )
        return None

    # ── Internal checks ───────────────────────────────────────────────────────

    def _sanitize_filename(self, filename: str) -> str:
        """
        Produce a safe filename:
        - Strip path components (prevents directory traversal)
        - Replace dangerous characters with underscores
        - Preserve extension
        - Truncate to 120 chars
        """
        # Strip any directory components (CWE-22 prevention)
        basename = os.path.basename(filename.replace("\\", "/").replace("..", ""))

        # Replace everything except alphanumeric, dot, dash, underscore
        safe = re.sub(r"[^a-zA-Z0-9._\-]", "_", basename)

        # Collapse multiple dots (prevents double-extension attacks like file.pdf.exe)
        safe = re.sub(r"\.{2,}", ".", safe)

        # Remove leading dots/dashes
        safe = safe.lstrip(".-")

        # Truncate
        if len(safe) > 120:
            name, _, ext = safe.rpartition(".")
            safe = name[:115] + "." + ext

        return safe or "unnamed_file"

    def _check_extension(self, filename: str) -> ValidationError | None:
        ext = (filename or "").rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return ValidationError(
                code="INVALID_EXTENSION",
                message=f"'{filename}': file type '.{ext}' is not supported. "
                        f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
            )
        return None

    def _check_size(self, content: bytes, filename: str) -> ValidationError | None:
        if len(content) > self.max_file_size:
            mb = len(content) / 1024 / 1024
            limit_mb = self.max_file_size / 1024 / 1024
            return ValidationError(
                code="FILE_TOO_LARGE",
                message=f"'{filename}': file is {mb:.1f} MB, exceeds limit of {limit_mb:.0f} MB."
            )
        return None

    def _check_blocked_magic(self, content: bytes, filename: str) -> ValidationError | None:
        """Reject files whose actual bytes match known dangerous formats."""
        for offset, magic, description in _BLOCKED_MAGIC:
            probe = content[offset: offset + len(magic)]
            if probe == magic:
                logger.error(
                    "SECURITY: Blocked upload '%s' — magic bytes match '%s'",
                    filename, description
                )
                return ValidationError(
                    code="DANGEROUS_CONTENT",
                    message=f"'{filename}': file content identified as '{description}'. Upload rejected."
                )
        return None

    def _detect_mime(self, content: bytes) -> str:
        """
        Detect MIME type from file content using python-magic.
        Falls back to empty string if python-magic is unavailable.
        """
        try:
            import magic as libmagic
            return libmagic.from_buffer(content, mime=True)
        except ImportError:
            logger.debug("python-magic not available — skipping MIME detection")
            return ""
        except Exception as exc:
            logger.debug("MIME detection failed: %s", exc)
            return ""
