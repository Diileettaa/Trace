"""Cached Gemini image generation for room mood renders."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


class RenderError(ValueError):
    """Base class for expected render failures."""


class RenderModelNotConfigured(RenderError):
    """The image model has not been configured by the operator."""


class RenderInputError(RenderError):
    """The request contains invalid or unsupported image data."""


class RenderGenerationError(RuntimeError):
    """The model did not return a usable PNG image."""


def _decode_image(image_base64: str) -> tuple[bytes, str]:
    value = image_base64.strip()
    mime_type = "image/png"
    if value.startswith("data:"):
        header, separator, value = value.partition(",")
        if not separator or ";base64" not in header:
            raise RenderInputError("image_base64 must be a base64 image data URL or raw base64 PNG")
        mime_type = header[5:].split(";", 1)[0].lower()
    if mime_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise RenderInputError("image_base64 must contain a PNG, JPEG, or WebP image")
    try:
        image_bytes = base64.b64decode(value, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise RenderInputError("image_base64 is not valid base64") from exc
    if not image_bytes:
        raise RenderInputError("image_base64 is empty")
    if len(image_bytes) > 15 * 1024 * 1024:
        raise RenderInputError("image_base64 exceeds the 15 MiB limit")
    return image_bytes, mime_type


def _prompt(room_name: str, products: list[dict[str, Any]], style: str) -> str:
    product_data = json.dumps(products, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return (
        "Create a photorealistic interior mood render from the supplied 3D room screenshot. "
        "Preserve the room's existing geometry, dimensions, openings, fixed building elements, "
        "and exact camera position, angle, and perspective. Change only surface materials, "
        "textures, color treatment, and lighting. Keep every piece of furniture already visible "
        "in the screenshot in its current position. Do not add, remove, or invent furniture, "
        "decor, windows, doors, fixtures, or architectural elements. "
        f"Room name: {room_name}. Style: {style}. "
        f"The only demo products requested for the scene are: {product_data}."
    )


def _image_bytes(response: Any) -> bytes:
    parts = getattr(response, "parts", None)
    if not parts:
        parts = []
        for candidate in getattr(response, "candidates", None) or []:
            content = getattr(candidate, "content", None)
            parts.extend(getattr(content, "parts", None) or [])
    for part in parts:
        inline = getattr(part, "inline_data", None)
        if not inline:
            continue
        mime_type = str(getattr(inline, "mime_type", "image/png") or "image/png").lower()
        if mime_type != "image/png":
            raise RenderGenerationError(f"Gemini returned {mime_type}; an image/png response is required")
        data = getattr(inline, "data", None)
        if isinstance(data, str):
            try:
                data = base64.b64decode(data, validate=True)
            except (ValueError, base64.binascii.Error) as exc:
                raise RenderGenerationError("Gemini returned invalid image data") from exc
        if isinstance(data, bytes) and data:
            return data
    raise RenderGenerationError("Gemini did not return an image. Check that GEMINI_IMAGE_MODEL supports image output.")


def render_mood_image(
    image_base64: str,
    room_name: str,
    products: list[dict[str, Any]],
    style: str,
    *,
    client: Any = None,
    cache_dir: str | Path | None = None,
) -> Path:
    """Generate or return a cached PNG. Supplying ``client`` enables offline tests."""
    model = os.getenv("GEMINI_IMAGE_MODEL", "").strip()
    if not model:
        raise RenderModelNotConfigured("GEMINI_IMAGE_MODEL is not configured; set it to an image generation model name.")
    if not room_name.strip():
        raise RenderInputError("room_name must not be empty")
    if not style.strip():
        raise RenderInputError("style must not be empty")
    if not isinstance(products, list):
        raise RenderInputError("products must be a list")
    image_bytes, mime_type = _decode_image(image_base64)
    request = {"model": model, "room_name": room_name, "products": products, "style": style}
    try:
        canonical = json.dumps(request, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise RenderInputError("products must contain JSON-compatible values") from exc
    digest = hashlib.sha256(image_bytes + b"\0" + canonical).hexdigest()
    root = Path(cache_dir) if cache_dir is not None else Path(os.getenv("CACHE_DIR", "./cache")).resolve() / "renders"
    root.mkdir(parents=True, exist_ok=True)
    output = root / f"{digest}.png"
    if output.is_file():
        return output

    if client is None:
        from google import genai
        from google.genai import types

        client = genai.Client()
    else:
        from google.genai import types

    prompt = _prompt(room_name, products, style)
    try:
        response = client.models.generate_content(
            model=model,
            contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
        )
        png = _image_bytes(response)
    except RenderError:
        raise
    except Exception as exc:
        raise RenderGenerationError(f"Gemini image generation failed: {type(exc).__name__}: {exc}") from exc

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix=f".{digest}.", suffix=".tmp", delete=False) as temp:
            temp.write(png)
            temp_path = Path(temp.name)
        os.replace(temp_path, output)
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
    return output
