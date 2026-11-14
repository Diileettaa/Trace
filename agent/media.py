"""Room media storage and retrieval (T-30): JPG, PNG, MP4, MOV, PDF up to 50MB.

Saves files by SHA256 content hash under CACHE_DIR/media/<sha256>.<ext>.
Maintains metadata record {id, space_id, author, role, note, file, kind, created_at}.
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

MAX_MEDIA_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".mp4", ".mov", ".pdf"}

_lock = threading.Lock()


class MediaError(ValueError):
    """Base exception for media errors."""
    pass


class MediaSecurityError(MediaError):
    """Raised when an id or path attempts path traversal or escapes CACHE_DIR/media."""
    pass


class MediaNotFoundError(MediaError):
    """Raised when a requested media file or record is not found."""
    pass


def _media_dir() -> Path:
    return (config.CACHE_DIR / "media").resolve()


def _meta_file() -> Path:
    return (config.CACHE_DIR / "media.json").resolve()


def get_kind(ext: str) -> str:
    ext = ext.lower()
    if ext in (".jpg", ".jpeg", ".png"):
        return "image"
    if ext in (".mp4", ".mov"):
        return "video"
    if ext == ".pdf":
        return "pdf"
    return "other"


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


def _item_status_file() -> Path:
    return (config.CACHE_DIR / "item_status.json").resolve()


def load_item_statuses() -> dict[str, dict]:
    f = _item_status_file()
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (ValueError, OSError):
            pass
    return {}


def _save_item_statuses(statuses: dict[str, dict]) -> None:
    f = _item_status_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(statuses, ensure_ascii=False, indent=2), encoding="utf-8")


VALID_STATUSES = {"Installed", "In Progress", "Issue Reported"}


def update_item_status(
    item_id: str,
    status: str,
    path: str = "",
    space_id: str = "",
    note: str = "",
    author: str = "",
) -> dict:
    if not item_id:
        raise ValueError("item_id is required")
    if status not in VALID_STATUSES:
        raise ValueError(f"invalid status '{status}', must be one of {sorted(VALID_STATUSES)}")

    with _lock:
        statuses = load_item_statuses()
        now_iso = datetime.now(timezone.utc).isoformat()
        rec = {
            "item_id": item_id,
            "status": status,
            "path": path or "",
            "space_id": space_id or "",
            "note": note or "",
            "author": author or "",
            "ts": now_iso,
        }
        statuses[item_id] = rec
        _save_item_statuses(statuses)
    return rec


def save_media(
    filename: str,
    data: bytes,
    space_id: str = "",
    item_id: str = "",
    author: str = "",
    role: str = "",
    note: str = "",
    status: str = "",
) -> dict:
    if not filename or not filename.strip():
        raise MediaError("filename is required")
    if not data:
        raise MediaError("empty file")
    if len(data) > MAX_MEDIA_BYTES:
        raise MediaError(f"file too large ({len(data) // (1024 * 1024)} MB > 50 MB)")

    raw_ext = Path(filename).suffix.lower()
    if raw_ext not in ALLOWED_EXT:
        raise MediaError(f"unsupported media type '{raw_ext or '?'}': use JPG, PNG, MP4, MOV, or PDF")

    ext = ".jpg" if raw_ext == ".jpeg" else raw_ext
    kind = get_kind(ext)
    sha = hashlib.sha256(data).hexdigest()
    file_name = f"{sha}{ext}"

    media_dir = _media_dir()
    media_dir.mkdir(parents=True, exist_ok=True)
    file_path = media_dir / file_name

    # Duplicate file stored once
    if not file_path.exists():
        file_path.write_bytes(data)

    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "id": uuid.uuid4().hex,
        "space_id": space_id or "",
        "item_id": item_id or "",
        "status": status if status in VALID_STATUSES else "",
        "author": author or "",
        "role": role or "",
        "note": note or "",
        "file": file_name,
        "kind": kind,
        "created_at": now_iso,
    }

    with _lock:
        records = load_records()
        records.append(record)
        _save_records(records)

        # If item_id and status provided, also update item_status
        if item_id and status in VALID_STATUSES:
            statuses = load_item_statuses()
            statuses[item_id] = {
                "item_id": item_id,
                "status": status,
                "space_id": space_id or "",
                "note": note or "",
                "author": author or "",
                "ts": now_iso,
            }
            _save_item_statuses(statuses)

    return record


def list_media(space_id: str | None = None) -> list[dict]:
    with _lock:
        records = load_records()

    if space_id is not None and space_id.strip() != "":
        target = space_id.strip()
        records = [r for r in records if r.get("space_id") == target]

    # Newest first. Stable sort on created_at descending with reverse insertion fallback.
    records = list(reversed(records))
    records.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return records


def get_verify_status(path: str = "", ids: list[str] | None = None) -> dict[str, Any]:
    """Retrieve on-site verification status for a list of element IDs."""
    req_ids = [i.strip() for i in ids] if ids else []
    all_media = list_media()
    item_statuses = load_item_statuses()

    from collections import defaultdict
    media_by_item: dict[str, list[dict]] = defaultdict(list)
    for m in all_media:
        mid = m.get("item_id")
        if mid:
            media_by_item[mid].append(m)

    res_ids: dict[str, Any] = {}
    verified_count = 0

    for iid in req_ids:
        if not iid:
            continue
        m_list = media_by_item.get(iid, [])
        has_photos = len(m_list) > 0
        st_rec = item_statuses.get(iid)
        has_status_set = st_rec is not None

        is_verified = has_photos or has_status_set

        latest_obj = None
        if has_photos:
            latest_m = m_list[0]
            latest_obj = {
                "url": f"/collab/media/file?id={latest_m['id']}",
                "ts": latest_m.get("created_at"),
                "author": latest_m.get("author") or "",
            }

        if st_rec:
            status_val = st_rec.get("status") or "In Progress"
            note_val = st_rec.get("note") or None
            author_val = st_rec.get("author") or None
            ts_val = st_rec.get("ts")
        elif has_photos:
            status_val = m_list[0].get("status") or "In Progress"
            note_val = m_list[0].get("note") or None
            author_val = m_list[0].get("author") or None
            ts_val = m_list[0].get("created_at")
        else:
            status_val = "In Progress"
            note_val = None
            author_val = None
            ts_val = None

        if is_verified:
            verified_count += 1

        res_ids[iid] = {
            "verified": is_verified,
            "status": status_val,
            "note": note_val,
            "author": author_val,
            "ts": ts_val,
            "photos": len(m_list),
            "latest": latest_obj,
        }

    return {
        "ids": res_ids,
        "verified": verified_count,
        "total": len(res_ids),
    }


def resolve_file(target: str) -> Path:
    if not target or not target.strip():
        raise MediaNotFoundError("missing media id")

    clean = target.replace("\\", "/").strip()
    root = _media_dir()

    # Look up whether target corresponds to an existing record id or file field
    with _lock:
        records = load_records()

    found_file: str | None = None
    for r in records:
        if r.get("id") == clean:
            found_file = r.get("file")
            break
        if r.get("file") == clean:
            found_file = r.get("file")
            break

    file_to_check = found_file if found_file else clean
    file_to_check = file_to_check.replace("\\", "/").strip()
    if file_to_check.startswith("media/"):
        file_to_check = file_to_check[len("media/"):]

    try:
        full = (root / file_to_check).resolve()
    except (ValueError, RuntimeError):
        raise MediaSecurityError(f"invalid path: {target}")

    # Check path traversal / escaping CACHE_DIR/media
    try:
        rel = full.relative_to(root)
        if rel == Path(".") or str(rel) == ".":
            raise MediaSecurityError(f"path escapes media directory: {target}")
    except ValueError:
        raise MediaSecurityError(f"path escapes media directory: {target}")

    if root not in full.parents:
        raise MediaSecurityError(f"path escapes media directory: {target}")

    if not full.is_file():
        raise MediaNotFoundError(f"media file not found: {target}")

    return full
