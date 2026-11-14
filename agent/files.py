"""Project files store (B4): documents, blueprints, contracts, schedules up to 50MB.

Saves files by SHA256 content hash under CACHE_DIR/files/<sha256>.<ext>.
Maintains metadata record {id, title, filename, author, role, tags, size, kind, created_at} in CACHE_DIR/files.json.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import mimetypes
from pathlib import Path
import threading
import uuid

from . import config

MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXT = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".dxf",
    ".ifc",
    ".docx",
    ".xlsx",
    ".csv",
    ".txt",
}

MIME_MAP = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".dxf": "application/dxf",
    ".ifc": "application/x-step",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
}

_lock = threading.Lock()


class FileError(ValueError):
    """Base exception for file storage errors."""
    pass


class FileSecurityError(FileError):
    """Raised when an id or path attempts path traversal or escapes CACHE_DIR/files."""
    pass


class FileItemNotFoundError(FileError):
    """Raised when a requested file or record is not found."""
    pass


# Alias for compatibility with standard naming
FileNotFoundError = FileItemNotFoundError


class FilePermissionError(FileError):
    """Raised when an unauthorized author attempts to delete a file."""
    pass


def _files_dir() -> Path:
    return (config.CACHE_DIR / "files").resolve()


def _meta_file() -> Path:
    return (config.CACHE_DIR / "files.json").resolve()


def get_kind(ext: str) -> str:
    ext = ext.lower()
    if ext in (".jpg", ".jpeg", ".png"):
        return "image"
    if ext == ".pdf":
        return "pdf"
    if ext == ".dxf":
        return "dxf"
    if ext == ".ifc":
        return "ifc"
    if ext in (".docx", ".txt"):
        return "doc"
    if ext in (".xlsx", ".csv"):
        return "sheet"
    return "other"


def parse_tags(tags: list[str] | str | None) -> list[str]:
    if not tags:
        return []
    if isinstance(tags, list):
        out: list[str] = []
        for t in tags:
            out.extend(parse_tags(t))
        return out
    s = tags.strip()
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    # Comma or semicolon separated
    return [t.strip() for t in s.replace(";", ",").split(",") if t.strip()]


def load_records() -> list[dict]:
    f = _meta_file()
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except (ValueError, OSError):
            pass
    return []


def _save_records(records: list[dict]) -> None:
    f = _meta_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")


def save_file(
    filename: str,
    data: bytes,
    author: str = "",
    role: str = "",
    title: str = "",
    tags: list[str] | str | None = None,
) -> dict:
    if not filename or not filename.strip():
        raise FileError("filename is required")
    if not data:
        raise FileError("empty file")
    if len(data) > MAX_FILE_BYTES:
        raise FileError(f"file too large ({len(data) // (1024 * 1024)} MB > 50 MB)")

    raw_ext = Path(filename).suffix.lower()
    if raw_ext not in ALLOWED_EXT:
        raise FileError(f"unsupported file type '{raw_ext or '?'}': use PDF, PNG, JPG, DXF, IFC, DOCX, XLSX, CSV, or TXT")

    ext = ".jpg" if raw_ext == ".jpeg" else raw_ext
    kind = get_kind(ext)
    sha = hashlib.sha256(data).hexdigest()
    stored_name = f"{sha}{ext}"

    files_dir = _files_dir()
    files_dir.mkdir(parents=True, exist_ok=True)
    file_path = files_dir / stored_name

    # Duplicate file stored once
    if not file_path.exists():
        file_path.write_bytes(data)

    parsed_tags = parse_tags(tags)
    orig_name = Path(filename).name
    record = {
        "id": uuid.uuid4().hex,
        "title": title.strip() if title and title.strip() else orig_name,
        "filename": orig_name,
        "file": stored_name,
        "author": author or "",
        "role": role or "",
        "tags": parsed_tags,
        "size": len(data),
        "kind": kind,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    with _lock:
        records = load_records()
        records.append(record)
        _save_records(records)

    return record


def list_files(tag: str | None = None, q: str | None = None) -> list[dict]:
    with _lock:
        records = load_records()

    if tag is not None and tag.strip():
        t = tag.strip().lower()
        records = [
            r for r in records
            if any(t == existing_tag.lower() for existing_tag in r.get("tags", []))
        ]

    if q is not None and q.strip():
        query = q.strip().lower()
        records = [
            r for r in records
            if query in r.get("title", "").lower() or query in r.get("filename", "").lower()
        ]

    # Newest first. Stable sort on created_at descending with reverse insertion fallback.
    records = list(reversed(records))
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records


def resolve_file(target: str) -> tuple[Path, dict | None]:
    if not target or not target.strip():
        raise FileItemNotFoundError("missing file id")

    clean = target.replace("\\", "/").strip()
    root = _files_dir()

    with _lock:
        records = load_records()

    found_record: dict | None = None
    for r in records:
        if r.get("id") == clean:
            found_record = r
            break
        if r.get("file") == clean:
            found_record = r
            break

    file_to_check = found_record.get("file") if found_record else clean
    file_to_check = file_to_check.replace("\\", "/").strip()
    if file_to_check.startswith("files/"):
        file_to_check = file_to_check[len("files/"):]

    try:
        full = (root / file_to_check).resolve()
    except (ValueError, RuntimeError):
        raise FileSecurityError(f"invalid path: {target}")

    # Check path traversal / escaping CACHE_DIR/files
    try:
        rel = full.relative_to(root)
        if rel == Path(".") or str(rel) == ".":
            raise FileSecurityError(f"path escapes files directory: {target}")
    except ValueError:
        raise FileSecurityError(f"path escapes files directory: {target}")

    if root not in full.parents:
        raise FileSecurityError(f"path escapes files directory: {target}")

    if not full.is_file():
        raise FileItemNotFoundError(f"file not found: {target}")

    return full, found_record


def delete_file(id: str, author: str) -> dict:
    with _lock:
        records = load_records()
        target_idx: int | None = None
        for i, r in enumerate(records):
            if r.get("id") == id:
                target_idx = i
                break

        if target_idx is None:
            raise FileItemNotFoundError(f"file not found: {id}")

        record = records[target_idx]
        if record.get("author", "") != author:
            raise FilePermissionError(f"only author '{record.get('author')}' can delete this file")

        deleted = records.pop(target_idx)
        _save_records(records)

        # Cleanup physical file on disk if no other record references it
        target_file = deleted.get("file")
        if target_file and not any(r.get("file") == target_file for r in records):
            p = _files_dir() / target_file
            if p.is_file():
                try:
                    p.unlink()
                except OSError:
                    pass

        return deleted
