"""Find drawings inside DATA_DIR and turn any page into a PNG the browser can show.

Every bbox the system returns is in the pixel space of the PNG produced here,
so the frontend can draw boxes directly on top of the image.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

from . import config

IMAGE_EXT = {".png", ".jpg", ".jpeg"}
PDF_EXT = {".pdf"}
PDF_RENDER_DPI = 150


class DrawingError(ValueError):
    pass


def resolve(path: str) -> Path:
    """Map a dataset path like 'data/cubicasa5k/x.png' (or an uploaded 'upload/<sha>.pdf') to a real file,
    refusing anything outside DATA_DIR / the upload folder."""
    if path.startswith(config.UPLOAD_PREFIX):
        root = (config.CACHE_DIR / "uploads").resolve()
        full = (root / path[len(config.UPLOAD_PREFIX):]).resolve()
        if root not in full.parents:
            raise DrawingError(f"path outside uploads: {path}")
        if not full.is_file():
            raise DrawingError(f"upload not found: {path}")
        return full
    full = (config.DATA_DIR / path).resolve()
    if config.DATA_DIR not in full.parents:
        raise DrawingError(f"path outside dataset: {path}")
    if not full.is_file():
        raise DrawingError(f"drawing not found: {path}")
    return full


def kind(path: str) -> str:
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in PDF_EXT:
        return "pdf"
    if ext == ".ifc":
        return "ifc"
    if ext in {".dxf", ".dwg"}:
        return "cad"
    if ext == ".svg":
        return "svg"
    return "other"


def page_png(path: str, page: int = 1) -> Path:
    """Return a PNG of the given page (1-based). Images are returned as-is; PDFs are rendered and cached."""
    full = resolve(path)
    k = kind(path)
    if k == "image" and full.suffix.lower() == ".png":
        return full
    config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{full}:{page}:{PDF_RENDER_DPI}".encode()).hexdigest()[:16]
    out = config.CACHE_DIR / f"{key}.png"
    if out.exists():
        return out
    import pymupdf as fitz

    if k == "image":  # jpg -> png so every drawing is served the same way
        pix = fitz.Pixmap(str(full))
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        pix.save(out)
        return out
    if k == "pdf":
        with fitz.open(full) as doc:
            if not 1 <= page <= doc.page_count:
                raise DrawingError(f"page {page} out of range (1..{doc.page_count})")
            pix = doc[page - 1].get_pixmap(dpi=PDF_RENDER_DPI)
            pix.save(out)
        return out
    raise DrawingError(f"cannot render {k} file as an image: {path}")


def image_size(png: Path) -> tuple[int, int]:
    import pymupdf as fitz

    pix = fitz.Pixmap(str(png))
    return pix.width, pix.height
