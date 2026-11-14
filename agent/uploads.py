"""User-uploaded drawings (T-28): PDF, PNG, JPG or IFC, stored by content hash under CACHE_DIR/uploads.

The returned path ('upload/<sha256>.<ext>') works everywhere a dataset path works: /drawing, /file, /ask.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from . import config

ALLOWED = {".pdf": b"%PDF", ".png": b"\x89PNG", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff",
           ".ifc": b"ISO-10303-21"}


class UploadError(ValueError):
    pass


def save(filename: str, data: bytes) -> dict:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise UploadError(f"unsupported file type '{ext or '?'}': use PDF, PNG, JPG or IFC")
    if not data:
        raise UploadError("empty file")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise UploadError(f"file too large ({len(data) // (1024 * 1024)} MB > 50 MB)")
    if not data.lstrip()[:16].startswith(ALLOWED[ext]):
        raise UploadError(f"file content does not look like {ext[1:].upper()}")
    ext = ".jpg" if ext == ".jpeg" else ext
    sha = hashlib.sha256(data).hexdigest()
    root = config.CACHE_DIR / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    out = root / f"{sha}{ext}"
    if not out.exists():
        out.write_bytes(data)
    path = f"{config.UPLOAD_PREFIX}{out.name}"
    from . import drawings

    pages = 1
    if ext == ".pdf":
        import pymupdf as fitz

        with fitz.open(out) as doc:
            pages = doc.page_count
    return {"path": path, "kind": drawings.kind(path), "pages": pages, "name": Path(filename).name, "bytes": len(data)}
