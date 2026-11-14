"""User-uploaded drawings (T-28): PDF, PNG, JPG, DXF or IFC, stored by content hash under CACHE_DIR/uploads.

The returned path ('uploads/<sha256>.<ext>') works everywhere a dataset path works: /drawing, /file, /ask.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from . import config

ALLOWED = {".pdf", ".png", ".jpg", ".jpeg", ".dxf", ".ifc"}


class UploadError(ValueError):
    pass


def _verify_content(ext: str, data: bytes) -> bool:
    if ext == ".pdf":
        return data.lstrip()[:16].startswith(b"%PDF")
    if ext == ".png":
        return data.startswith(b"\x89PNG")
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".ifc":
        return b"ISO-10303-21" in data[:128]
    if ext == ".dxf":
        return (
            b"SECTION" in data[:1024]
            or b"ENTITIES" in data[:1024]
            or b"HEADER" in data[:1024]
            or data.strip().startswith(b"0")
        )
    return False


def save(filename: str, data: bytes) -> dict:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise UploadError(f"unsupported file type '{ext or '?'}': use PDF, PNG, JPG, DXF or IFC")
    if not data:
        raise UploadError("empty file")
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise UploadError(f"file too large ({len(data) // (1024 * 1024)} MB > 50 MB)")
    if not _verify_content(ext, data):
        raise UploadError(f"file content does not look like {ext[1:].upper()}")
    ext = ".jpg" if ext == ".jpeg" else ext
    sha = hashlib.sha256(data).hexdigest()
    root = config.CACHE_DIR / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    out = root / f"{sha}{ext}"
    if not out.exists():
        out.write_bytes(data)
    path = f"{config.UPLOAD_PREFIX}{out.name}"

    # Persist metadata manifest for catalog and project cards
    manifest_file = root / "manifest.json"
    manifest: dict[str, dict] = {}
    if manifest_file.is_file():
        try:
            import json

            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}
    manifest[out.name] = {
        "filename": Path(filename).name,
        "path": path,
        "size_bytes": len(data),
    }
    try:
        import json

        manifest_file.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    from . import drawings

    pages = 1
    if ext == ".pdf":
        import pymupdf as fitz

        try:
            with fitz.open(out) as doc:
                pages = doc.page_count
        except Exception as e:
            raise UploadError(f"corrupted PDF file: {e}")
    return {"path": path, "kind": drawings.kind(path), "pages": pages, "name": Path(filename).name, "bytes": len(data)}
