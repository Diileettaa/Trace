"""Bridge to developer A's data engine (engine.answer.answer, owned by Xinran).

The engine computes exact answers from the DXF / IFC / raster data. This module only
converts its result into the shared tool format the agent and the web app use:
items keep their guid (3D highlight); png_bbox / pdf_bbox_pt become `sources` boxes in the
pixel space of the drawing the user is looking at (PDFs are shown rendered at 150 dpi).
"""
from __future__ import annotations

import os
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from . import config, drawings, ifc_plan, vision

_POOL = ThreadPoolExecutor(max_workers=4)

PT_TO_PX = drawings.PDF_RENDER_DPI / 72.0
_NICE = {"wc": "WC", "washbasin": "Washbasin", "bathtub": "Bathtub", "shower": "Shower", "door": "Door",
         "window": "Window", "room": "Room", "apartment": "Apartment", "IFCSPACE": "Space", "IFCDOOR": "Door",
         "IFCWINDOW": "Window", "IFCSANITARYTERMINAL": "Sanitary", "IFCWALL": "Wall", "IFCSTAIR": "Stair",
         "IFCCOLUMN": "Column", "IFCBEAM": "Beam", "IFCSLAB": "Slab", "IFCLIGHTFIXTURE": "Light"}

ABBREV = {
    "wc": "WC",
    "toilet": "WC",
    "washbasin": "SK",
    "sink": "SK",
    "bathtub": "BT",
    "shower": "SH",
    "door": "DR",
    "ifcdoor": "DR",
    "window": "WN",
    "ifcwindow": "WN",
    "stove": "ST",
    "kitchen": "KT",
    "radiator": "RAD",
    "socket": "SKT",
    "light": "LT",
    "lamp": "LT",
    "ifclightfixture": "LT",
    "room": "RM",
    "space": "SP",
    "ifcspace": "SP",
    "apartment": "APT",
    "stair": "STR",
    "ifcstair": "STR",
    "column": "COL",
    "ifccolumn": "COL",
    "beam": "BM",
    "ifcbeam": "BM",
    "slab": "SLB",
    "ifcslab": "SLB",
    "wall": "WL",
    "ifcwall": "WL",
    "ifcsanitaryterminal": "SAN",
    "ifcflowterminal": "SAN",
    "ifcfurnishingelement": "FURN",
}


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

    # raster scans and PDF sheets: Xinran's engine (vector sheet geometry, schedule QA, tiled full-resolution
    # scan reading with a box per counted item). Falls back to the agent's vision tools only if it has nothing.
    try:
        import engine.answer as ea

        full = drawings.resolve(path)
        r = ea.answer_sheet(str(full), question)
        if r.get("value") is not None or str(r.get("method", "")).startswith(("sheet:", "docqa:", "scan:")):
            r["sources"] = [{"file": path, "page": 1}]
            if r.get("value") is not None:
                return r
    except Exception:
        pass
    return {"value": None, "unit": None, "items": [], "sources": [], "method": "upload:no_vector_data",
            "warnings": ["Uploaded plan has no vector data for the engine; use count_in_drawing or scan_drawing_inventory"]}


# Where an engine answer comes from (Xinran's full eval, docs/04 section 2): geometry (DXF/IFC, exact),
# detector (YOLO on raster plans), prior (most common value, only where it beats vision: kitchens),
# vision (a vision LLM read the plan; rooms), needs_vision (engine has nothing: agent calls count_in_drawing).
SOURCE_LABEL = {"sheet": "measured from the vector drawing", "schedule": "read from the schedule table",
                "scan": "vision model, one box per counted item", "geometry": "exact from geometry", "detector": "trained detector (YOLO)", "prior": "statistical prior",
                "vision": "vision LLM", "needs_vision": "no engine answer"}


def route(method: str, warnings=()) -> str:
    m = str(method or "")
    if m.startswith(("sheet:count_", "sheet:rooms", "sheet:expr", "sheet:lookup")) and "vision" not in m:
        return "sheet"
    if m.startswith(("docqa:", "sheet:schedule")) and "vision" not in m:
        return "schedule"
    if m.startswith(("scan:", "sheet:scanned", "sheet:vision", "docqa:vision")):
        return "scan"
    if m.startswith(("swiss_dxf:", "ifc:", "ifc_")):
        return "geometry"
    if m.startswith(("cubicasa:detector[", "cubicasa:rooms[", "cubicasa:vlm[yolo")):
        return "detector"
    if m.startswith(("cubicasa:prior:kitchen", "cubicasa:vlm+prior:")):
        return "prior"
    if m.startswith("cubicasa:vlm["):
        return "vision"
    if m.startswith("cubicasa:prior:"):
        # the engine picks the prior on purpose where it beats the models (kitchen, bathroom without VLM);
        # "low confidence" means it had nothing better: let the agent try vision
        from engine import cubicasa

        cat = m.rsplit(":", 1)[-1]
        if "prior" in (cubicasa.SOURCE_WITH_VLM.get(cat), cubicasa.SOURCE_NO_VLM.get(cat)):
            return "prior"
        return "needs_vision" if any("low confidence" in str(w) for w in warnings or ()) else "prior"
    return "needs_vision"


def _cubicasa_fast(path: str, question: str) -> dict | None:
    """Categories the engine answers from local models or a prior whatever the vision model says
    (doors/windows/fixtures -> detector, bedrooms -> room detector, kitchens -> prior).
    engine.cubicasa.answer() asks the vision LLM first even then; skipping that call gives the same answer
    at zero tokens and ~1 s instead of ~20 s."""
    import engine.answer as ea
    from engine import cubicasa

    c = cubicasa.category(question)
    if c is None:
        return None
    src = cubicasa.SOURCE_WITH_VLM.get(c)
    if src == "prior":
        return {"value": cubicasa.CATS[c][2], "unit": "count", "items": [], "sources": [{"file": path}],
                "method": f"cubicasa:prior:{c}",
                "warnings": ["answered the most common value (more reliable than the models for this category)"]}
    if src not in ("detector", "rooms"):
        return None
    png = str((config.DATA_DIR / path).resolve())
    try:
        boxes = cubicasa.detector_boxes(png, c) if src == "detector" else cubicasa.room_boxes(png, c)
        if boxes is None:
            return None
        items = cubicasa._items(c, boxes, png, ea._png_size)
    except Exception:
        return None
    method = f"cubicasa:detector[yolo-cubicasa]:{c}" if src == "detector" else f"cubicasa:rooms[yolo-cubicasa-rooms]:{c}"
    return {"value": len(boxes), "unit": "count", "items": items, "sources": [{"file": path}],
            "method": method, "warnings": []}


def answer(path: str, question: str) -> dict:
    """Tool: ask the exact data engine. Pass the user's question unchanged."""
    import time

    import engine.answer as ea

    ea.DATA = str(config.DATA_DIR)
    early = None
    if "cubicasa5k" in path and config.NVIDIA_API_KEY and config.NEMOTRON_MODEL:
        from engine import cubicasa

        c = cubicasa.category(question)
        if c is not None and getattr(cubicasa, "SOURCE_WITH_VLM", {}).get(c) != "prior":
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
    if r.get("value") is None and any(w in question.lower() for w in ("toilet", "wc", "water closet")):
        try:
            from . import plan_rooms

            pr = plan_rooms.get_plan_rooms(path)
            wc_rms = [rm for rm in pr.get("rooms", []) if any(k in (rm.get("name") or "").lower() for k in ("tualett", "wc", "toilet"))]
            if wc_rms:
                r = {
                    "value": len(wc_rms),
                    "unit": "count",
                    "method": "ifc_plan:wc_spaces",
                    "items": [
                        {
                            "category": "toilet",
                            "name": f"Toilet in {rm.get('number') or rm.get('name')}",
                            "guid": f"{rm['space_id']}_wc",
                            "space_id": rm["space_id"],
                            "room_name": rm.get("name"),
                            "room_number": rm.get("number"),
                            "png_bbox": rm.get("bbox_px"),
                        }
                        for rm in sorted(wc_rms, key=lambda x: str(x.get("number") or x.get("space_id")))
                    ],
                    "sources": [{"file": path, "page": 1, "bbox": rm.get("bbox_px")} for rm in wc_rms if rm.get("bbox_px")],
                    "warnings": [],
                }
        except Exception:
            pass
    engine_ms = round((time.perf_counter() - t0) * 1000, 1)
    source = route(r.get("method"), r.get("warnings") or ())
    out = _convert(path, question, r, source, early)
    out["source"] = source
    out["source_label"] = SOURCE_LABEL[source]
    out["engine_ms"] = engine_ms
    out["evidence_count"] = len(out.get("items") or [])
    return out


def _enrich_and_stabilize_items(path: str, raw_items: list[dict], source: str) -> list[dict]:
    if not raw_items:
        return []

    # 1. Match spaces if not already present
    # 1.1 Swiss DXF
    if "swiss" in path.lower() or path.lower().endswith(".dxf"):
        try:
            from engine import swiss
            from shapely.geometry import Point, Polygon

            full = drawings.resolve(path)
            dxf = full if full.suffix.lower() == ".dxf" else full.with_suffix(".dxf")
            if dxf.is_file():
                f_swiss = swiss.parse(str(dxf))
                rooms = [r for r in f_swiss.get("rooms", []) if r.get("poly") and len(r["poly"]) >= 3]
                polys = [(r, Polygon(r["poly"])) for r in rooms]
                for it in raw_items:
                    if it.get("space_id") is None:
                        bb = it.get("bbox_m") or it.get("bbox")
                        if bb:
                            cx = (bb[0] + bb[2]) / 2.0
                            cy = (bb[1] + bb[3]) / 2.0
                            pt = Point(cx, cy)
                            for r, poly in polys:
                                if poly.contains(pt) or poly.distance(pt) < 0.3:
                                    it["space_id"] = r.get("number")
                                    it["room_name"] = r.get("name") or r.get("number")
                                    it["room_number"] = r.get("number") or ""
                                    break
        except Exception:
            pass

    # 1.2 IFC models
    elif path.lower().endswith(".ifc") or "ifc" in path.lower():
        try:
            from . import room_contents

            full = drawings.resolve(path)
            ifc_file = full if full.suffix.lower() == ".ifc" else full.with_suffix(".ifc")
            if not ifc_file.is_file():
                cand = config.DATA_DIR / "data" / "ifc_models" / f"{full.stem.split('_plan-')[0]}.ifc"
                if cand.is_file():
                    ifc_file = cand
            if ifc_file.is_file():
                idx = None
                cf = room_contents._ifc_index_cache_file(ifc_file)
                if cf.is_file():
                    try:
                        import json

                        idx = json.loads(cf.read_text(encoding="utf-8"))
                    except Exception:
                        pass
                if not idx:
                    idx = room_contents._build_ifc_spatial_index(ifc_file)

                space_map = {s["guid"]: s for s in idx.get("spaces", [])}
                guid_to_space = {}
                for s_guid, els in idx.get("elements_by_space", {}).items():
                    for el in els:
                        guid_to_space[el["guid"]] = s_guid
                for it in raw_items:
                    g = it.get("guid")
                    if g and g in guid_to_space and it.get("space_id") is None:
                        sg = guid_to_space[g]
                        it["space_id"] = sg
                        sp = space_map.get(sg, {})
                        it["room_name"] = sp.get("long") or sp.get("name") or sg
                        it["room_number"] = sp.get("name") or ""
        except Exception:
            pass

    # 2. Deterministic sorting for stable IDs
    def _sort_key(it: dict):
        if it.get("guid"):
            return (str(it.get("storey", "")), str(it.get("category", "")), str(it.get("name", "")), str(it["guid"]))
        bb = it.get("bbox_m") or it.get("bbox") or it.get("pdf_bbox_pt")
        if bb:
            return (round(bb[0], 2), round(bb[1], 2), str(it.get("category", "")))
        box = it.get("box_2d") or it.get("png_bbox")
        if box:
            return (round(box[0], 1), round(box[1], 1), str(it.get("category", "")))
        return (0, 0, str(it.get("category", "")))

    sorted_raw = sorted(raw_items, key=_sort_key)

    # 3. Assign stable ID and label
    cat_counters: dict[str, int] = defaultdict(int)
    room_counters: dict[tuple[str, str], int] = defaultdict(int)
    global_counters: dict[str, int] = defaultdict(int)

    enriched = []
    is_det = source in ("detector", "vision") or "cubicasa" in path.lower()

    for it in sorted_raw:
        item = dict(it)
        cat = str(item.get("category") or "item").lower()
        cat_counters[cat] += 1
        n = cat_counters[cat]

        # Stable ID
        if item.get("guid"):
            item_id = item["guid"]
        elif is_det:
            item_id = f"{path}#det-{cat}-{n}"
        else:
            item_id = f"{path}#{cat}-{n}"
        item["id"] = item_id

        # Label: use room number/name (e.g. 208 -> WC-208.1); do NOT use space GUID; fallback to DR-1
        abbr = ABBREV.get(cat, cat.upper()[:3])
        room_ref = item.get("room_number") or ""
        if not room_ref and item.get("space_id"):
            sid_str = str(item["space_id"]).strip()
            # If space_id is not a 22-char IFC GUID, it can be used as a room number (e.g. Swiss "2.04")
            if len(sid_str) < 18:
                room_ref = sid_str

        clean_room = re.sub(r"[^\w\-.]", "", str(room_ref)).strip() if room_ref else ""

        if clean_room and len(clean_room) < 18:
            room_counters[(abbr, clean_room)] += 1
            idx = room_counters[(abbr, clean_room)]
            label = f"{abbr}-{clean_room}.{idx}"
        else:
            global_counters[abbr] += 1
            idx = global_counters[abbr]
            label = f"{abbr}-{idx}"

        item["label"] = label
        item.setdefault("space_id", None)
        item.setdefault("room_name", None)
        item.pop("room_number", None)
        enriched.append(item)

    return enriched


def _convert(path: str, question: str, r: dict, source: str, early=None) -> dict:
    is_pdf = path.lower().endswith(".pdf")
    raw_items = r.get("items") or []
    # Xinran's sheet/scan items: box (PDF points) or box_norm1000 (0-1000 of the image) -> our bbox fields
    if any(("box" in i or "box_norm1000" in i) for i in raw_items):
        img_wh = None
        for i in raw_items:
            if "box_norm1000" in i and "png_bbox" not in i:
                if img_wh is None:
                    try:
                        from PIL import Image
                        img_wh = Image.open(drawings.page_png(path, 1)).size
                    except Exception:
                        img_wh = (1000, 1000)
                x0, y0, x1, y1 = i["box_norm1000"]
                i["png_bbox"] = [x0 * img_wh[0] / 1000, y0 * img_wh[1] / 1000, x1 * img_wh[0] / 1000, y1 * img_wh[1] / 1000]
                i.setdefault("category", "item")
            elif "box" in i and is_pdf and "pdf_bbox_pt" not in i:
                i["pdf_bbox_pt"] = list(i["box"])
                i.setdefault("category", "item")
    enriched_items = _enrich_and_stabilize_items(path, raw_items, source)
    items, sources = [], []
    for n, it in enumerate(enriched_items, 1):
        label = it.get("label") or _label(it, n)
        item = {k: v for k, v in it.items() if k not in ("png_bbox", "pdf_bbox_pt")}
        item["name"] = _label(it, n)  # display name ("Door 1 (D01)"); `label` is the short plan tag ("DR-208.1")
        box = None
        if is_pdf and it.get("pdf_bbox_pt"):
            box = [round(v * PT_TO_PX) for v in it["pdf_bbox_pt"]]
        elif not is_pdf and it.get("png_bbox"):
            box = [round(v) for v in it["png_bbox"]]
        if box:
            x0, y0, x1, y1 = box
            sources.append({"file": path, "page": 1, "bbox": [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)],
                            "label": label})
            item["source_index"] = len(sources) - 1
        else:
            item["source_index"] = None
        items.append(item)
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
                sources.append({"file": path, "page": 1, "bbox": boxes[i["guid"]], "label": i.get("label") or i.get("name")})
                i["source_index"] = len(sources) - 1
            else:
                i["source_index"] = None
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
            # the second opinion must not slow the answer: wait at most NEMOTRON_WAIT_S, then answer without it.
            # The call keeps running in the pool and lands in the vision cache, so the next ask gets the badge.
            fut = early or _POOL.submit(nemotron_check, path, question)
            verify = dict(fut.result(timeout=float(os.getenv("NEMOTRON_WAIT_S", "4"))))
        except Exception as e:  # never fail the answer because the second opinion failed or was slow
            verify = {"nemotron_count": None, "model": config.NEMOTRON_MODEL or None, "error": type(e).__name__,
                      "pending": type(e).__name__ == "TimeoutError"}
        verify["agreement"] = None if verify["nemotron_count"] is None else verify["nemotron_count"] == r["value"]
        r["verified_by"] = verify
        if verify["agreement"] is False:
            r["warnings"].append(f"Methods disagree: engine found {r['value']}, Nemotron counted "
                                 f"{verify['nemotron_count']}; answer keeps the engine value, check the boxes")
    r["badge"] = badge(source, r.get("verified_by"))
    model = next((s["file"] for s in r.get("sources") or [] if str(s.get("file", "")).endswith(".ifc")), None)
    if not model and r.get("model_file"):
        model = r.get("model_file")

    from collections import Counter
    room_obj = None
    space_counts = Counter(it.get("space_id") for it in items if it.get("space_id"))
    if space_counts:
        top_space_id, _ = space_counts.most_common(1)[0]
        top_room_name = next((it.get("room_name") for it in items if it.get("space_id") == top_space_id), None)
        area_m2 = None
        dims_m = None
        try:
            from . import plan_rooms

            pr = plan_rooms.get_plan_rooms(path)
            for rm in pr.get("rooms", []):
                if rm.get("space_id") == top_space_id or rm.get("number") == top_space_id:
                    area_m2 = rm.get("area_m2")
                    dims_m = rm.get("dims_m")
                    break
        except Exception:
            pass
        room_obj = {
            "space_id": top_space_id,
            "room_name": top_room_name,
            "area_m2": area_m2,
            "dims_m": dims_m,
        }

    out = {
        "value": r.get("value"),
        "unit": r.get("unit"),
        "items": items,
        "sources": sources,
        "method": f"engine:{r.get('method')}",
        "warnings": list(r.get("warnings") or []),
        "engine_sources": r.get("sources") or [],
        "room": room_obj,
    }
    if r.get("verified_by"):
        out["verified_by"] = r["verified_by"]
    if r.get("badge"):
        out["badge"] = r["badge"]
    for k in ("interpreted", "canonical_question", "classified"):
        # free-form questions: how engine.nlq read the question (shown as "Interpreted as ..." in the panel)
        if r.get(k):
            out[k] = r[k]
    if r.get("evidence"):
        # area answers: formula + per-room breakdown (+ excluded rooms with reason) so a judge can re-add it
        out["evidence"] = r["evidence"]
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
