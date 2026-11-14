"""Counting objects on raster drawings (PNG/JPG scans, rendered PDF pages).

Gemini finds every instance and returns a box for each one, so the answer can be checked on the drawing.
Nemotron 3.5 Super VL counts the same thing independently; if the two disagree, the answer carries a warning.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any, Callable

from . import config, drawings


def _cache_path(kind: str, png_bytes: bytes, prompt: str, model: str):
    key = hashlib.sha256(png_bytes + b"\0" + prompt.encode() + b"\0" + model.encode()).hexdigest()
    return config.CACHE_DIR / "vision" / f"{kind}-{key[:32]}.json"


def cached_call(kind: str, png_bytes: bytes, prompt: str, model: str, fn: Callable[[], Any]) -> tuple[Any, bool]:
    """Disk cache for model calls, keyed by image content + prompt + model.

    Protects the Gemini quota and the Nemotron free tier (50 calls/day): the same image and
    question never hit the API twice. None results (model not configured / unparsable) are not cached.
    Returns (result, was_cached).
    """
    f = _cache_path(kind, png_bytes, prompt, model)
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))["result"], True
        except (ValueError, KeyError):
            pass
    result = fn()
    if result is not None:
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps({"kind": kind, "model": model, "result": result}, ensure_ascii=False), encoding="utf-8")
    return result, False

DETECT_PROMPT = """You are reading an architectural drawing (floor plan, section or sheet).
Find EVERY instance of: {target}.
Rules:
- Return one entry per physical instance, even if several look identical.
- Only include instances that are actually drawn; do not guess hidden ones.
- If there are none, return an empty list.
Return JSON: a list of objects {{"box_2d": [ymin, xmin, ymax, xmax], "label": short text}},
with coordinates normalised to 0-1000."""

VERIFY_PROMPT = """This is an architectural drawing. Count how many of the following are drawn on it: {target}.
Count each physical instance once. Reply with JSON only: {{"count": <integer>, "notes": "<one short sentence>"}}"""


def _gemini_detect(png_bytes: bytes, target: str) -> list[dict]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=png_bytes, mime_type="image/png"),
            DETECT_PROMPT.format(target=target),
        ],
        config=types.GenerateContentConfig(
            temperature=config.TEMPERATURE,
            response_mime_type="application/json",
        ),
    )
    data = json.loads(resp.text or "[]")
    return data if isinstance(data, list) else []


def _nemotron_count(png_bytes: bytes, target: str) -> int | None:
    """Independent second count. Returns None if Nemotron is not configured or the reply cannot be parsed."""
    if not (config.NVIDIA_API_KEY and config.NEMOTRON_MODEL):
        return None
    from openai import OpenAI

    client = OpenAI(base_url=config.NEMOTRON_BASE_URL, api_key=config.NVIDIA_API_KEY, max_retries=3)
    b64 = base64.b64encode(png_bytes).decode()
    resp = client.chat.completions.create(
        model=config.NEMOTRON_MODEL,
        temperature=0,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    {"type": "text", "text": VERIFY_PROMPT.format(target=target)},
                ],
            }
        ],
    )
    msg = resp.choices[0].message
    # reasoning models (Nemotron on Verda) may put the JSON after their reasoning; look at both fields
    text = (msg.content or "") + "\n" + (getattr(msg, "reasoning_content", None) or "")
    m = re.search(r'"count"\s*:\s*(\d+)', msg.content or "") or re.search(r'"count"\s*:\s*(\d+)', text)
    return int(m.group(1)) if m else None


def count_in_drawing(path: str, target: str, page: int = 1) -> dict:
    """Tool: count objects on a raster drawing. Returns the shared tool-result format."""
    png = drawings.page_png(path, page)
    w, h = drawings.image_size(png)
    png_bytes = png.read_bytes()

    detections, cached_g = cached_call("gemini-detect", png_bytes, DETECT_PROMPT.format(target=target),
                                       config.GEMINI_MODEL, lambda: _gemini_detect(png_bytes, target))
    items, sources = [], []
    for i, d in enumerate(detections, start=1):
        box = d.get("box_2d")
        if not (isinstance(box, list) and len(box) == 4):
            continue
        ymin, xmin, ymax, xmax = box
        bbox = [round(xmin / 1000 * w), round(ymin / 1000 * h), round(xmax / 1000 * w), round(ymax / 1000 * h)]
        label = f"{target} {i}"
        items.append({"id": f"{path}#{page}#{i}", "category": target, "name": label, "detector_label": d.get("label")})
        sources.append({"file": path, "page": page, "bbox": bbox, "label": label})

    warnings = []
    second, cached_n = cached_call("nemotron-count", png_bytes, VERIFY_PROMPT.format(target=target),
                                   config.NEMOTRON_MODEL or "none", lambda: _nemotron_count(png_bytes, target))
    if second is None:
        warnings.append("Second check (Nemotron) not run")
    elif second != len(items):
        warnings.append(
            f"Gemini found {len(items)} but Nemotron counted {second}: please check the highlighted boxes"
        )

    return {
        "value": len(items),
        "unit": "count",
        "items": items,
        "sources": sources,
        "method": "Gemini box detection on the drawing image; Nemotron 3.5 Super VL independent count",
        "warnings": warnings,
        "image_size": [w, h],
        "verified_by": {"nemotron_count": second, "agreement": None if second is None else second == len(items),
                        "model": config.NEMOTRON_MODEL or None},
        "cached": bool(cached_g and (second is None or cached_n)),
    }


INVENTORY_PROMPT = """You are reading an architectural floor plan.
Find EVERY drawn instance of these building elements: {cats}.
Rules:
- One entry per physical instance. Only what is actually drawn.
- "category" must be exactly one of the listed words.
Return JSON: a list of objects {{"category": <word>, "box_2d": [ymin, xmin, ymax, xmax]}},
coordinates normalised to 0-1000."""

INVENTORY_CATEGORIES = ["toilet", "sink", "shower", "bathtub", "sauna", "door", "window", "stair", "kitchen"]
_LABELS = {"toilet": "WC", "sink": "Sink", "shower": "Shower", "bathtub": "Bathtub", "sauna": "Sauna",
           "door": "Door", "window": "Window", "stair": "Stair", "kitchen": "Kitchen"}


def _gemini_inventory(png_bytes: bytes, prompt: str) -> list[dict]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=[types.Part.from_bytes(data=png_bytes, mime_type="image/png"), prompt],
        config=types.GenerateContentConfig(temperature=config.TEMPERATURE, response_mime_type="application/json"),
    )
    data = json.loads(resp.text or "[]")
    return data if isinstance(data, list) else []


def scan_drawing_inventory(path: str, page: int = 1) -> dict:
    """Tool (architect module 1): find all element categories on a drawing in one pass and number them
    per category (WC 1, WC 2, Door 1 ...). Same result format as every other tool; `value` = total count,
    `by_category` = count per category."""
    png = drawings.page_png(path, page)
    w, h = drawings.image_size(png)
    png_bytes = png.read_bytes()
    prompt = INVENTORY_PROMPT.format(cats=", ".join(INVENTORY_CATEGORIES))
    if not config.GEMINI_API_KEY:
        from . import tools

        r = tools._mock("inventory")
        r["warnings"].append("Gemini key not set")
        return r
    detections, cached = cached_call("gemini-inventory", png_bytes, prompt, config.GEMINI_MODEL,
                                     lambda: _gemini_inventory(png_bytes, prompt))
    counters: dict[str, int] = {}
    items, sources = [], []
    for d in detections:
        cat, box = d.get("category"), d.get("box_2d")
        if cat not in _LABELS or not (isinstance(box, list) and len(box) == 4):
            continue
        counters[cat] = counters.get(cat, 0) + 1
        label = f"{_LABELS[cat]} {counters[cat]}"
        ymin, xmin, ymax, xmax = box
        bbox = [round(xmin / 1000 * w), round(ymin / 1000 * h), round(xmax / 1000 * w), round(ymax / 1000 * h)]
        items.append({"id": f"{path}#{page}#{cat}-{counters[cat]}", "category": cat, "name": label})
        sources.append({"file": path, "page": page, "bbox": bbox, "label": label})
    return {
        "value": len(items),
        "unit": "count",
        "items": items,
        "sources": sources,
        "by_category": counters,
        "method": "Gemini single-pass multi-category box detection; numbered per category in detection order",
        "warnings": [] if items else ["No elements detected on this drawing"],
        "image_size": [w, h],
        "cached": cached,
    }
