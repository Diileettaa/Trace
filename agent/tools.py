"""The tools Gemini can call, and how each call is dispatched.

Tools from the data engine (developer A, package `engine.tools`) are used when they exist;
until then each returns the mock in mock/<tool>.json, marked with a warning so it can never
be mistaken for a real answer.
"""
from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Any, Callable

from . import collab, engine_adapter, vision

MOCK_DIR = Path(__file__).resolve().parent.parent / "mock"

CATEGORIES = ["toilet", "sink", "shower", "bathtub", "sauna", "door", "window", "light",
              "room", "balcony", "stair", "apartment", "kitchen", "bedroom", "other"]

_S = {"type": "string"}
_I = {"type": "integer"}


def _decl(name: str, description: str, props: dict, required: list[str]) -> dict:
    return {"name": name, "description": description,
            "parameters": {"type": "object", "properties": props, "required": required}}


ENGINE_DECL = _decl(
    "answer_from_engine",
    "Exact answer from the team's data engine for DXF and IFC models (including uploaded files), and drawings under "
    "swiss_dwellings, ifc_models, ifc_bench and cubicasa5k (counts of WC/washbasin/bathtub/shower/doors/windows/rooms/apartments, "
    "room and apartment areas, IFC spaces/doors/windows/walls/stairs/columns/beams/sanitary/lights, areas, lengths, volumes). "
    "Pass the user's question unchanged. Use this FIRST; it returns evidence boxes and IFC GUIDs.",
    {"path": _S, "question": _S}, ["path", "question"])

DECLARATIONS = [
    _decl("list_spaces", "List rooms/spaces in an IFC model, optionally filtered by storey or by a name fragment "
          "(e.g. 'WC', 'KPH', 'Bad'). Use first to find which rooms a question means.",
          {"path": _S, "storey": _S, "name_contains": _S}, ["path"]),
    _decl("count_elements", "Count building elements of one category in an IFC model, optionally within a storey or space.",
          {"path": _S, "category": {"type": "string", "enum": CATEGORIES}, "storey": _S, "space_id": _S},
          ["path", "category"]),
    _decl("elements_in_space", "List every element inside one space of an IFC model.",
          {"path": _S, "space_id": _S}, ["path", "space_id"]),
    _decl("space_area", "Net floor area of one space in an IFC model, in m2.",
          {"path": _S, "space_id": _S}, ["path", "space_id"]),
    _decl("locate_elements", "Where elements of a category are (storey, space, coordinates, drawing tag).",
          {"path": _S, "category": {"type": "string", "enum": CATEGORIES}, "storey": _S, "space_id": _S},
          ["path", "category"]),
    _decl("element_status", "Construction status (new / existing / demolish) if the model records it.",
          {"path": _S, "category": _S, "space_id": _S}, ["path"]),
    _decl("search_drawings", "Search the text written on a PDF/vector drawing (room names, tags, schedules).",
          {"path": _S, "text": _S}, ["path", "text"]),
    _decl("scan_drawing_inventory", "List and number EVERY element on a raster drawing in one pass "
          "(WC 1, WC 2, Door 1 ...). Use for 'what is on this plan' / 'list everything' questions on image drawings.",
          {"path": _S, "page": _I}, ["path"]),
    _decl("room_status", "Construction status (built / missing_wall / pending) and Room Board messages that people "
          "on site have recorded for rooms. Use for questions about what is already built, what is missing, or notes "
          "left for a trade. Omit space_id to get every room.",
          {"space_id": _S}, []),
    _decl("sum_values", "Add up numbers that earlier tool calls returned (e.g. total area of several rooms). "
          "Never add numbers yourself: call this so the total is computed and checkable.",
          {"values": {"type": "array", "items": {"type": "number"}}, "unit": _S, "label": _S}, ["values"]),
    _decl("count_in_drawing", "Count objects drawn on a raster drawing (PNG/JPG scan or a PDF page) using vision. "
          "Use for image and scanned drawings, where there is no model to query. "
          "`target` is a short English description, e.g. 'toilet bowls (WC seats)'.",
          {"path": _S, "target": _S, "page": _I}, ["path", "target"]),
]

# Shared project documents (Xinran, agent/docs_tools.py): search, versions, details, quantity questions on filed drawings.
# upload_doc is left out: files are uploaded by people in the Files area, not by the model.
DOC_TOOL_NAMES = {"search_docs", "list_versions", "get_doc", "ask_drawing"}


def _doc_decls() -> list[dict]:
    try:
        from . import docs_tools
    except ImportError:
        return []
    return [t for t in docs_tools.TOOLS if t["name"] in DOC_TOOL_NAMES]


def declarations() -> list[dict]:
    """Engine connected: offer the engine plus vision tools only (no mock tools that could mislead the model)."""
    if engine_adapter.available():
        return [ENGINE_DECL] + [d for d in DECLARATIONS if d["name"] not in ENGINE_TOOLS] + _doc_decls()
    return DECLARATIONS + _doc_decls()


def _docs_call(name: str, args: dict) -> dict:
    from . import docs_tools

    r = docs_tools.run_tool(name, args)
    if name == "ask_drawing" and isinstance(r, dict) and "value" in r:
        return {**r, "method": f"docs:ask_drawing:{r.get('method')}", "items": r.get("items") or [],
                "sources": r.get("sources") or [], "warnings": r.get("warnings") or []}
    return {"value": None, "items": [], "sources": [], "method": f"docs:{name}", "warnings": [], "result": r}


ENGINE_TOOLS = {"list_spaces", "count_elements", "elements_in_space", "space_area",
                "locate_elements", "element_status", "search_drawings"}


def _engine_fn(name: str) -> Callable[..., dict] | None:
    try:
        mod = importlib.import_module("engine.tools")
    except ImportError:
        return None
    return getattr(mod, name, None)


def _mock(name: str) -> dict:
    f = MOCK_DIR / f"{name}.json"
    data = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {
        "value": None, "unit": None, "items": [], "sources": [], "method": "none", "warnings": []}
    data = dict(data)
    data["warnings"] = list(data.get("warnings", [])) + ["MOCK DATA: engine tool not implemented yet"]
    return data


def call(name: str, args: dict[str, Any]) -> dict:
    """Run one tool call and always return the shared result format (never raise to the model)."""
    import time

    t0 = time.perf_counter()
    r = _call(name, args)
    r["elapsed_s"] = round(time.perf_counter() - t0, 2)
    return r


def _call(name: str, args: dict[str, Any]) -> dict:
    try:
        if name == "room_status":
            return room_status(**args)
        if name == "sum_values":
            return sum_values(**args)
        if name == "answer_from_engine":
            return engine_adapter.answer(**args)
        if name == "count_in_drawing":
            return vision.count_in_drawing(**args)
        if name == "scan_drawing_inventory":
            return vision.scan_drawing_inventory(**args)
        if name in DOC_TOOL_NAMES:
            return _docs_call(name, args)
        if name in ENGINE_TOOLS:
            fn = _engine_fn(name)
            return fn(**args) if fn else _mock(name)
        return {"value": None, "items": [], "sources": [], "method": "none",
                "warnings": [f"unknown tool {name}"]}
    except Exception as e:  # report to the model instead of crashing the request
        return {"value": None, "items": [], "sources": [], "method": "error",
                "warnings": [f"{type(e).__name__}: {e}"]}


def room_status(space_id: str | None = None) -> dict:
    data = collab.for_space(space_id)
    items = [{"id": sid, "space_id": sid, "category": "room_status", "name": f"{sid}: {v['status']}",
              "status": v["status"]} for sid, v in data["status"].items()]
    msgs = [{"space_id": m["space_id"], "role": m.get("role", ""), "text": m["text"], "notify": m.get("notify", [])}
            for m in data["messages"] if m.get("role") != "system"]
    return {"value": len(items), "unit": "rooms with status", "items": items, "sources": [], "messages": msgs,
            "method": "Room Board records entered by people on site (not read from the drawings)",
            "warnings": [] if items or msgs else ["No status or messages have been recorded yet"]}


def sum_values(values: list, unit: str | None = None, label: str | None = None) -> dict:
    nums = [float(v) for v in values]
    total = round(sum(nums), 3)
    return {"value": total, "unit": unit, "items": [], "sources": [], "terms": nums,
            "method": f"sum of {len(nums)} tool values" + (f" ({label})" if label else ""), "warnings": []}
