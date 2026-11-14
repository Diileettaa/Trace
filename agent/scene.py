"""Shared 3D scene state for furniture placements and annotations.

Persists scenes per model in CACHE_DIR/scene.json:
{"version": n, "updated_at": "...", "placements": [PlacedProduct + ...], "history": [...]}
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import threading
import uuid

from . import config

ALLOWED_MOUNTS = {"floor", "ceiling", "wall"}
MAX_PLACEMENTS_PER_MODEL = 500

_lock = threading.Lock()


class SceneError(ValueError):
    """Base exception for scene operations."""
    pass


class SceneValidationError(SceneError):
    """Raised on invalid parameters or validation failures."""
    pass


class SceneNotFoundError(SceneError):
    """Raised when a requested model scene or placement is not found."""
    pass


def _scene_file() -> Path:
    return (config.CACHE_DIR / "scene.json").resolve()


def validate_model(model: str) -> str:
    if not model or not model.strip():
        raise SceneValidationError("model parameter is required")
    m = model.strip()
    if ".." in m:
        raise SceneValidationError(f"model path cannot contain '..': {model}")
    return m


def load_all_scenes() -> dict[str, dict]:
    f = _scene_file()
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                return data
        except (ValueError, OSError):
            pass
    return {}


def _save_all_scenes(data: dict[str, dict]) -> None:
    f = _scene_file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_model_scene(all_scenes: dict[str, dict], model: str) -> dict:
    if model not in all_scenes:
        all_scenes[model] = {
            "model": model,
            "version": 0,
            "updated_at": None,
            "placements": [],
            "history": [],
        }
    scene = all_scenes[model]
    scene.setdefault("version", 0)
    scene.setdefault("placements", [])
    scene.setdefault("history", [])
    return scene


def get_scene(model: str, since_version: int | None = None) -> dict:
    model = validate_model(model)
    with _lock:
        all_scenes = load_all_scenes()
        scene = get_model_scene(all_scenes, model)
        current_version = scene.get("version", 0)

        if since_version is not None and since_version >= current_version:
            return {"changed": False, "version": current_version}

        result = {
            "model": model,
            "version": current_version,
            "updated_at": scene.get("updated_at"),
            "placements": list(scene.get("placements", [])),
        }
        if since_version is not None:
            result["changed"] = True
        return result


def save_placement(model: str, data: dict) -> tuple[dict, int]:
    model = validate_model(model)

    # Validate mount
    mount = data.get("mount", "floor")
    if mount not in ALLOWED_MOUNTS:
        raise SceneValidationError(f"invalid mount '{mount}': must be one of {sorted(ALLOWED_MOUNTS)}")

    # Validate dimensions (> 0)
    for dim in ("width_mm", "depth_mm", "height_mm"):
        val = data.get(dim)
        if val is None:
            raise SceneValidationError(f"{dim} is required")
        try:
            val_f = float(val)
        except (ValueError, TypeError):
            raise SceneValidationError(f"{dim} must be a number")
        if val_f <= 0:
            raise SceneValidationError(f"{dim} must be positive, got {val_f}")

    # Validate position
    pos = data.get("position", [0.0, 0.0, 0.0])
    if not isinstance(pos, (list, tuple)) or len(pos) != 3:
        raise SceneValidationError("position must be [x, y, z]")
    try:
        clean_pos = [float(p) for p in pos]
    except (ValueError, TypeError):
        raise SceneValidationError("position elements must be numbers")

    instance_id = str(data.get("instanceId") or uuid.uuid4().hex).strip()
    if not instance_id:
        instance_id = uuid.uuid4().hex

    now_iso = datetime.now(timezone.utc).isoformat()

    with _lock:
        all_scenes = load_all_scenes()
        scene = get_model_scene(all_scenes, model)
        placements: list[dict] = scene["placements"]

        # Check if updating existing placement
        target_idx: int | None = None
        for i, p in enumerate(placements):
            if p.get("instanceId") == instance_id:
                target_idx = i
                break

        if target_idx is None:
            # Check maximum placements limit
            if len(placements) >= MAX_PLACEMENTS_PER_MODEL:
                raise SceneValidationError(f"maximum {MAX_PLACEMENTS_PER_MODEL} placements per model reached")
            action = "add"
            created_at = data.get("created_at") or now_iso
        else:
            action = "update"
            created_at = placements[target_idx].get("created_at", now_iso)

        placement_record = {
            "instanceId": instance_id,
            "catalogId": str(data.get("catalogId", "")),
            "name": str(data.get("name", "Product")),
            "width_mm": float(data["width_mm"]),
            "depth_mm": float(data["depth_mm"]),
            "height_mm": float(data["height_mm"]),
            "price_eur": float(data.get("price_eur", 0.0)),
            "material": str(data.get("material", "")),
            "color_hex": str(data.get("color_hex", "#ffffff")),
            "mount": mount,
            "rotationDeg": float(data.get("rotationDeg", 0.0)),
            "author": str(data.get("author", "")),
            "role": str(data.get("role", "")),
            "space_id": data.get("space_id"),
            "position": clean_pos,
            "created_at": created_at,
            "updated_at": now_iso,
        }

        if target_idx is None:
            placements.append(placement_record)
        else:
            placements[target_idx] = placement_record

        scene["version"] += 1
        scene["updated_at"] = now_iso

        history_entry = {
            "version": scene["version"],
            "action": action,
            "instanceId": instance_id,
            "name": placement_record["name"],
            "author": placement_record["author"],
            "at": now_iso,
        }
        scene.setdefault("history", []).append(history_entry)

        _save_all_scenes(all_scenes)
        return placement_record, scene["version"]


def delete_placement(model: str, instance_id: str, author: str = "") -> tuple[dict, int]:
    model = validate_model(model)
    if not instance_id or not instance_id.strip():
        raise SceneValidationError("instanceId is required")
    target_id = instance_id.strip()

    now_iso = datetime.now(timezone.utc).isoformat()

    with _lock:
        all_scenes = load_all_scenes()
        scene = get_model_scene(all_scenes, model)
        placements: list[dict] = scene["placements"]

        target_idx: int | None = None
        for i, p in enumerate(placements):
            if p.get("instanceId") == target_id:
                target_idx = i
                break

        if target_idx is None:
            raise SceneNotFoundError(f"placement '{target_id}' not found in model '{model}'")

        deleted = placements.pop(target_idx)
        scene["version"] += 1
        scene["updated_at"] = now_iso

        history_entry = {
            "version": scene["version"],
            "action": "delete",
            "instanceId": target_id,
            "name": deleted.get("name", "Product"),
            "author": author or deleted.get("author", ""),
            "at": now_iso,
        }
        scene.setdefault("history", []).append(history_entry)

        _save_all_scenes(all_scenes)
        return deleted, scene["version"]


def get_history(model: str, limit: int = 50) -> list[dict]:
    model = validate_model(model)
    limit = max(1, min(limit, 500))
    with _lock:
        all_scenes = load_all_scenes()
        scene = get_model_scene(all_scenes, model)
        history: list[dict] = scene.get("history", [])
        # Return recent changes, newest first
        return list(reversed(history))[:limit]
