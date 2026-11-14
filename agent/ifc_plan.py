"""2D boxes for IFC elements on the floor plans rendered from the model.

The dataset's `<model>_<level>.pdf` plans come with a matching `.svg` drawn from the same IFC
(IfcOpenShell). Every element in the SVG is a <g data-guid="..."> group, and the SVG page is the
PDF page (same size in mm), so an element's outline gives its box on the PDF exactly.
Boxes are returned in pixels of the PDF page rendered at drawings.PDF_RENDER_DPI.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from . import drawings

_G = re.compile(r'<g\b[^>]*\bdata-guid="([^"]+)"[^>]*>(.*?)</g>', re.S)
_NUM = re.compile(r"-?\d+(?:\.\d+)?(?:[eE]-?\d+)?")
_VIEWBOX = re.compile(r'viewBox="([-\d.\s]+)"')


_TOK = re.compile(r"[MLHVAZmlhvaz]|-?\d+(?:\.\d+)?(?:[eE]-?\d+)?")


def _points(d: str):
    """End points of an absolute SVG path (M, L, H, V, A, Z), enough for a bounding box."""
    cmd, nums, x, y = None, [], 0.0, 0.0
    for t in _TOK.findall(d) + ["Z"]:
        if t.isalpha():
            cmd, nums = t.upper(), []
            continue
        nums.append(float(t))
        if cmd in ("M", "L") and len(nums) == 2:
            x, y = nums
            nums = []
            yield x, y
        elif cmd == "H" and len(nums) == 1:
            x, nums = nums[0], []
            yield x, y
        elif cmd == "V" and len(nums) == 1:
            y, nums = nums[0], []
            yield x, y
        elif cmd == "A" and len(nums) == 7:
            x, y = nums[5], nums[6]
            nums = []
            yield x, y


@lru_cache(maxsize=16)
def _boxes(svg_path: str) -> dict[str, list[float]]:
    text = Path(svg_path).read_text(encoding="utf-8", errors="ignore")
    vb = _VIEWBOX.search(text[:2000])
    if not vb:
        return {}
    vx, vy, _, _ = (float(v) for v in vb.group(1).split())
    px_per_mm = drawings.PDF_RENDER_DPI / 25.4
    out: dict[str, list[float]] = {}
    for guid, body in _G.findall(text):
        xs, ys = [], []
        for d in re.findall(r'\sd="([^"]+)"', body):
            for x, y in _points(d):
                xs.append(x)
                ys.append(y)
        if not xs:
            continue
        box = [min(xs), min(ys), max(xs), max(ys)]
        prev = out.get(guid)
        if prev:
            box = [min(prev[0], box[0]), min(prev[1], box[1]), max(prev[2], box[2]), max(prev[3], box[3])]
        out[guid] = box
    return {g: [round((b[0] - vx) * px_per_mm), round((b[1] - vy) * px_per_mm),
                round((b[2] - vx) * px_per_mm), round((b[3] - vy) * px_per_mm)] for g, b in out.items()}


def boxes_for(pdf_path: str, guids: list[str]) -> dict[str, list[int]]:
    """Pixel boxes on the rendered PDF for the given IFC GUIDs (only those drawn on this plan)."""
    try:
        svg = drawings.resolve(str(Path(pdf_path).with_suffix(".svg")))
    except drawings.DrawingError:
        return {}
    b = _boxes(str(svg))
    return {g: b[g] for g in guids if g in b}
