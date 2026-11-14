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


def _is_upload_path(path: str) -> bool:
    clean = path.replace("\\", "/").strip()
    return (
        clean.startswith("uploads/")
        or clean.startswith("upload/")
        or clean.startswith("cache/uploads/")
        or clean.startswith(config.UPLOAD_PREFIX)
    )


def _upload_answer(path: str, question: str) -> dict:
    """User uploads: DXF/IFC go through the engine solvers; raster/PDF plans go to vision tools."""
    clean_p = path.lower()
    if clean_p.endswith(".ifc"):
        from engine import ifc, ifc_answer

        full = drawings.resolve(path)
        v, unit, items, method, warn = ifc_answer.answer(path, question, ifc.load(str(full)))
        return {
            "value": v,
            "unit": unit,
            "items": items,
            "sources": [{"file": path}],
            "method": method,
            "warnings": warn,
            "model_file": path,
        }
    if clean_p.endswith((".dxf", ".dwg")):
        from engine import questions, swiss

        full = drawings.resolve(path)
        f = swiss.parse(str(full))
        q = questions.parse_swiss(question)
        it, items, value, unit, warn = q["intent"], [], None, "count", []
        rooms = f.get("rooms", [])
        if it in ("doors", "windows"):
            items = [{"category": it[:-1], "name": f"{it[:-1]} {i+1}", "bbox_m": d.get("bbox")} for i, d in enumerate(f.get(it, []))]
            value = len(items)
        elif it in ("wc", "washbasin", "bathtub", "shower"):
            items = [{"category": it, "name": f"{it} {i+1}", "bbox_m": x.get("bbox")} for i, x in enumerate(f.get("fixtures", [])) if x.get("kind") == it]
            value = len(items)
        elif it == "apartments":
            letters = sorted({u["letter"] for u in f.get("units", []) if u.get("letter")})
            items = [{"category": "apartment", "name": f"Unit {u.get('letter')}", "label": u.get("label"), "bbox_m": u.get("bbox")} for u in f.get("units", []) if u.get("letter")]
            value = len(letters)
        elif it == "label_count":
            sel = [r for r in rooms if r.get("name") == q.get("label")]
            items = [{"category": "room", "number": r.get("number"), "name": r.get("name"), "area_m2": r.get("area"), "bbox_m": r.get("bbox")} for r in sel if r.get("bbox")]
            value = len(sel)
        elif it in ("room_area", "apt_area", "indoor_area", "label_area"):
            unit = "m2"
            if it == "room_area":
                sel = [r for r in rooms if r.get("number") == q.get("room") or str(r.get("number", "")).endswith(q.get("room", ""))]
            elif it == "apt_area":
                sel = [r for r in rooms if r.get("unit") == q.get("apt") and not r.get("outdoor") and not r.get("shaft_void")]
            elif it == "indoor_area":
                sel = [r for r in rooms if not r.get("outdoor") and not r.get("shaft_void")]
            else:
                sel = [r for r in rooms if r.get("name") == q.get("label")]
            miss = [r for r in sel if r.get("area") is None]
            if miss:
                warn.append(f"{len(miss)} rooms had no outline")
            value = round(sum(r["area"] for r in sel if r.get("area") is not None), 2)
            items = [{"category": "room", "number": r.get("number"), "name": r.get("name"), "area_m2": r.get("area"), "bbox_m": r.get("bbox")} for r in sel if r.get("bbox")]
        else:
            warn.append("question not recognised")
        return {
            "value": value,
            "unit": unit,
            "items": items,
            "sources": [{"file": path, "role": "computed from DXF layers"}],
            "method": f"swiss_dxf:{it}",
            "warnings": warn,
        }

    return {"value": None, "unit": None, "items": [], "sources": [], "method": "upload:no_vector_data",
            "warnings": ["Uploaded plan has no vector data for the engine; use count_in_drawing or scan_drawing_inventory"]}


# Where an engine answer comes from (Xinran's full eval, docs/04 section 2): geometry (DXF/IFC, exact),
# detector (YOLO on raster plans), prior (most common value, only where it beats vision: kitchens),
# vision (a vision LLM read the plan; rooms), needs_vision (engine has nothing: agent calls count_in_drawing).
SOURCE_LABEL = {"geometry": "exact from geometry", "detector": "trained detector (YOLO)", "prior": "statistical prior",
                "vision": "vision LLM", "needs_vision": "no engine answer"}


def route(method: str) -> str:
    m = str(method or "")
    if m.startswith(("swiss_dxf:", "ifc:", "ifc_")):
        return "geometry"
    if m.startswith("cubicasa:vlm[yolo"):
        return "detector"
    if m.startswith(("cubicasa:prior:kitchen", "cubicasa:vlm+prior:")):
        return "prior"
    if m.startswith("cubicasa:vlm["):
        return "vision"
    return "needs_vision"


def _cubicasa_fast(path: str, question: str) -> dict | None:
    """Fixture/door/window counts straight from the YOLO detector, and kitchens from the prior.
    engine.cubicasa.answer() asks the vision LLM first even when the detector will overrule it; skipping that call
    here gives the same answer at zero tokens and ~1 s instead of ~20 s."""
    import engine.answer as ea
    from engine import cubicasa

    c = cubicasa.category(question)
    if c is None:
        return None
    if c in cubicasa.PRIOR_PREFERRED:
        return {"value": cubicasa.CATS[c][2], "unit": "count", "items": [], "sources": [{"file": path}],
                "method": f"cubicasa:prior:{c}",
                "warnings": ["answered the most common value (more reliable than the vision model here)"]}
    if c not in cubicasa.DETECTOR_CATS:
        return None
    png = str((config.DATA_DIR / path).resolve())
    try:
        boxes = cubicasa.detector_boxes(png, c)
        w, h = ea._png_size(png)
    except Exception:
        return None
    if boxes is None:
        return None
    items = [{"category": c, "box_norm1000": b,
              "png_bbox": [round(b[0] * w / 1000), round(b[1] * h / 1000), round(b[2] * w / 1000), round(b[3] * h / 1000)]}
             for b in boxes]
    return {"value": len(boxes), "unit": "count", "items": items, "sources": [{"file": path}],
            "method": f"cubicasa:vlm[yolo-cubicasa]:{c}", "warnings": []}


def answer(path: str, question: str) -> dict:
    """Tool: ask the exact data engine. Pass the user's question unchanged."""
    import time

    import engine.answer as ea

    ea.DATA = str(config.DATA_DIR)
    early = None
    if "cubicasa5k" in path and config.NVIDIA_API_KEY and config.NEMOTRON_MODEL:
        from engine import cubicasa

        if cubicasa.category(question) not in (None, *cubicasa.PRIOR_PREFERRED):
            # the Nemotron second count does not depend on the engine result: run both at the same time
            early = _POOL.submit(nemotron_check, path, question)
    t0 = time.perf_counter()
    r = None
    if _is_upload_path(path):
        r = _upload_answer(path, question)
    elif "cubicasa5k" in path:
        r = _cubicasa_fast(path, question)
    if r is None:
        r = ea.answer(path, question)
    engine_ms = round((time.perf_counter() - t0) * 1000, 1)
    source = route(r.get("method"))
    out = _convert(path, question, r, source, early)
    out["source"] = source
    out["source_label"] = SOURCE_LABEL[source]
    out["engine_ms"] = engine_ms
    out["evidence_count"] = len(out.get("items") or [])
    return out


def _convert(path: str, question: str, r: dict, source: str, early=None) -> dict:
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
    if source == "needs_vision" and "prior" in str(r.get("method")):
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
    # Nemotron is only a consistency badge (docs/04 section 3): it never replaces the engine's value. When the two
    # disagree the detector is right 3-8x more often. Geometry answers are exact, so no second check (no cost).
    if source in ("detector", "vision") and isinstance(r.get("value"), int) \
            and config.NVIDIA_API_KEY and config.NEMOTRON_MODEL:
        r["warnings"] = list(r.get("warnings") or [])
        try:
            verify = dict(early.result(timeout=180) if early else nemotron_check(path, question))
        except Exception as e:  # never fail the answer because the second opinion failed
            verify = {"nemotron_count": None, "model": config.NEMOTRON_MODEL or None, "error": type(e).__name__}
        verify["agreement"] = None if verify["nemotron_count"] is None else verify["nemotron_count"] == r["value"]
        r["verified_by"] = verify
        if verify["agreement"] is False:
            r["warnings"].append(f"Methods disagree: engine found {r['value']}, Nemotron counted "
                                 f"{verify['nemotron_count']}; answer keeps the engine value, check the boxes")
    r["badge"] = badge(source, r.get("verified_by"))
    model = next((s["file"] for s in r.get("sources") or [] if str(s.get("file", "")).endswith(".ifc")), None)
    if not model and r.get("model_file"):
        model = r.get("model_file")
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
    if r.get("badge"):
        out["badge"] = r["badge"]
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


def badge(source: str, verify: dict | None) -> dict | None:
    """Consistency badge for the UI: green = two independent methods agree, yellow = they disagree, grey = exact."""
    if source == "geometry":
        return {"color": "grey", "text": "exact from geometry"}
    if not verify or verify.get("nemotron_count") is None:
        return None
    if verify.get("agreement"):
        return {"color": "green", "text": "2 independent methods agree"}
    return {"color": "yellow", "text": "methods disagree - check boxes", "other_count": verify["nemotron_count"]}
