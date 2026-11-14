"""Bridge to developer A's data engine (engine.answer.answer, owned by Xinran).

The engine computes exact answers from the DXF / IFC / raster data. This module only
converts its result into the shared tool format the agent and the web app use:
items keep their guid (3D highlight); png_bbox / pdf_bbox_pt become `sources` boxes in the
pixel space of the drawing the user is looking at (PDFs are shown rendered at 150 dpi).
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from . import config, drawings, ifc_plan, vision

_POOL = ThreadPoolExecutor(max_workers=4)

PT_TO_PX = drawings.PDF_RENDER_DPI / 72.0
_NICE = {"wc": "WC", "washbasin": "Washbasin", "bathtub": "Bathtub", "shower": "Shower", "door": "Door",
         "window": "Window", "room": "Room", "apartment": "Apartment", "IFCSPACE": "Space", "IFCDOOR": "Door",
         "IFCWINDOW": "Window", "IFCSANITARYTERMINAL": "Sanitary", "IFCWALL": "Wall", "IFCSTAIR": "Stair",
         "IFCCOLUMN": "Column", "IFCBEAM": "Beam", "IFCSLAB": "Slab", "IFCLIGHTFIXTURE": "Light"}


def available() -> bool:
    try:
        import engine.answer  # noqa: F401
    except ImportError:
        return False
    return True


def _label(item: dict, n: int) -> str:
    cat = str(item.get("category") or "item")
    base = _NICE.get(cat, _NICE.get(cat.upper(), cat.title()))
    name = item.get("name") or item.get("number")
    return f"{base} {n}" + (f" ({name})" if name and str(name) != base else "")


def _upload_answer(path: str, question: str) -> dict:
    """User uploads: IFC goes through Xinran's IFC solver directly; plans have no vector data -> vision tools."""
    if not path.lower().endswith(".ifc"):
        return {"value": None, "unit": None, "items": [], "sources": [], "method": "upload:no_vector_data",
                "warnings": ["Uploaded plan has no vector data for the engine; use count_in_drawing or scan_drawing_inventory"]}
    from engine import ifc, ifc_answer

    full = drawings.resolve(path)
    v, unit, items, method, warn = ifc_answer.answer(path, question, ifc.load(str(full)))
    return {"value": v, "unit": unit, "items": items, "sources": [{"file": path}], "method": method,
            "warnings": warn, "model_file": path}


def answer(path: str, question: str) -> dict:
    """Tool: ask the exact data engine. Pass the user's question unchanged."""
    import engine.answer as ea

    ea.DATA = str(config.DATA_DIR)
    early = None
    if "cubicasa5k" in path and config.NVIDIA_API_KEY and config.NEMOTRON_MODEL:
        # the Nemotron second count does not depend on the engine result: run both at the same time
        early = _POOL.submit(nemotron_check, path, question)
    r = _upload_answer(path, question) if path.startswith(config.UPLOAD_PREFIX) else ea.answer(path, question)
    is_pdf = path.lower().endswith(".pdf")
    counters: dict[str, int] = {}
    items, sources = [], []
    for it in r.get("items") or []:
        cat = str(it.get("category") or "item")
        counters[cat] = counters.get(cat, 0) + 1
        label = _label(it, counters[cat])
        item = {k: v for k, v in it.items() if k not in ("png_bbox", "pdf_bbox_pt")}
        item["name"] = label
        item.setdefault("id", it.get("guid") or f"{path}#{cat}-{counters[cat]}")
        items.append(item)
        box = None
        if is_pdf and it.get("pdf_bbox_pt"):
            box = [round(v * PT_TO_PX) for v in it["pdf_bbox_pt"]]
        elif not is_pdf and it.get("png_bbox"):
            box = [round(v) for v in it["png_bbox"]]
        if box:
            x0, y0, x1, y1 = box
            sources.append({"file": path, "page": 1, "bbox": [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)],
                            "label": label})
    if "prior" in str(r.get("method")):
        # cubicasa without a vision result: the engine falls back to typical-plan statistics, not a detection
        out_warn = "Engine has no detection for this raster plan (statistical prior only); use count_in_drawing"
        return {"value": None, "unit": r.get("unit"), "items": [], "sources": [], "method": f"engine:{r.get('method')}",
                "warnings": [out_warn], "engine_prior_value": r.get("value"), "engine_sources": r.get("sources") or []}
    # IFC answers come with GUIDs only; the plan PDF has a sibling SVG that names every element by GUID
    if is_pdf and not sources:
        guid_items = [i for i in items if i.get("guid")]
        boxes = ifc_plan.boxes_for(path, [i["guid"] for i in guid_items])
        for i in guid_items:
            if i["guid"] in boxes:
                sources.append({"file": path, "page": 1, "bbox": boxes[i["guid"]], "label": i["name"]})
        if guid_items and len(boxes) < len(guid_items):
            n = len(guid_items) - len(boxes)
            r.setdefault("warnings", [])
            r["warnings"] = list(r["warnings"]) + [f"{n} of {len(guid_items)} elements are not on this floor plan (shown in 3D only)"]
    # raster plans: the engine's count comes from a vision model, so get an independent second count from Nemotron
    method = str(r.get("method"))
    if method.startswith("cubicasa:vlm") and isinstance(r.get("value"), int):
        r["warnings"] = list(r.get("warnings") or [])
        try:
            verify = early.result(timeout=180) if early else nemotron_check(path, question)
        except Exception as e:  # never fail the answer because the second opinion failed
            verify = {"nemotron_count": None, "model": config.NEMOTRON_MODEL or None, "error": type(e).__name__}
        verify = dict(verify)
        verify["agreement"] = None if verify["nemotron_count"] is None else verify["nemotron_count"] == r["value"]
        r["verified_by"] = verify
        if verify["nemotron_count"] is None:
            r["warnings"].append("Second check (Nemotron) not run")
        elif not verify["agreement"]:
            r["warnings"].append(f"Detector found {r['value']} but Nemotron counted {verify['nemotron_count']}: "
                                 "please check the highlighted boxes")
    model = next((s["file"] for s in r.get("sources") or [] if str(s.get("file", "")).endswith(".ifc")), None)
    out = {
        "value": r.get("value"),
        "unit": r.get("unit"),
        "items": items,
        "sources": sources,
        "method": f"engine:{r.get('method')}",
        "warnings": list(r.get("warnings") or []),
        "engine_sources": r.get("sources") or [],
    }
    if r.get("verified_by"):
        out["verified_by"] = r["verified_by"]
    if model:
        out["model_file"] = model
    return out


def nemotron_check(path: str, question: str) -> dict:
    """Independent Nemotron 3.5 Super VL count on the same drawing (cached by image + prompt + model)."""
    png_bytes = drawings.page_png(path, 1).read_bytes()
    target = f"what this question asks about: {question}"
    second, _ = vision.cached_call("nemotron-count", png_bytes, vision.VERIFY_PROMPT.format(target=target),
                                   config.NEMOTRON_MODEL or "none", lambda: vision._nemotron_count(png_bytes, target))
    return {"nemotron_count": second, "model": config.NEMOTRON_MODEL or None}
