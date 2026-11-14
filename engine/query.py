"""Structured entry points for an LLM agent (function calling):
    inventory(path)                       -> what this drawing supports (categories, scopes, labels in the drawing's language)
    query(path, intent, category, scope)  -> same evidence dict as engine.answer(), plus "interpreted"
query() turns the parameters into the dataset's canonical English question and runs the validated engine.answer(),
so its accuracy is exactly the evaluated accuracy. Unsupported combinations return value=None with a reason;
the engine never guesses a number.
    classify(path, question)              -> free-form question in any of en/zh/fi/sv/de/fr/it -> query parameters"""
import os
from . import answer as A, swiss, ifc, cubicasa

# ---------- canonical vocabulary ----------
SYN = {  # anything an LLM may pass -> canonical category
    "door": "door", "doors": "door", "window": "window", "windows": "window",
    "toilet": "toilet", "toilets": "toilet", "wc": "toilet", "wcs": "toilet", "toilet bowl": "toilet",
    "sink": "sink", "sinks": "sink", "washbasin": "sink", "washbasins": "sink", "basin": "sink", "lavabo": "sink",
    "bathtub": "bathtub", "bathtubs": "bathtub", "tub": "bathtub", "shower": "shower", "showers": "shower",
    "shower_tub": "shower_tub", "showers and bathtubs": "shower_tub",
    "apartment": "apartment", "apartments": "apartment", "unit": "apartment", "units": "apartment",
    "room": "room", "rooms": "room", "space": "room", "spaces": "room",
    "wall": "wall", "walls": "wall", "slab": "slab", "slabs": "slab", "floor slab": "slab",
    "column": "column", "columns": "column", "beam": "beam", "beams": "beam", "stair": "stair", "stairs": "stair",
    "sanitary": "sanitary", "sanitary fixtures": "sanitary", "light": "light", "light fixtures": "light",
    "storey": "storey", "storeys": "storey", "floors": "storey", "floor": "storey", "level": "storey", "levels": "storey",
    "sauna": "sauna", "saunas": "sauna", "kitchen": "kitchen", "kitchens": "kitchen", "bedroom": "bedroom", "bedrooms": "bedroom",
    "bathroom": "bathroom", "bathrooms": "bathroom", "wc room": "wc_room", "wc rooms": "wc_room", "wc_room": "wc_room",
    "balcony": "balcony", "balconies": "balcony",
}
DEFINITIONS = {
    "door": "doorways fitted with a door leaf; open doorways without a leaf are not counted",
    "sink": "kitchen and bathroom sinks/wash basins; a double-bowl sink counts as one",
    "area": "net floor area in m² (inside the walls)",
    "apartment_area": "net area of all rooms of the apartment except balconies, loggias, terraces and other outdoor spaces",
}

def source_of(path):
    return A.resolve_source(path)

def _canon(category):
    return SYN.get((category or "").strip().lower(), None) if category else None

# ---------- inventory ----------
def inventory(path):
    src = source_of(path)
    if src == "swiss_dwellings":
        stem = os.path.splitext(os.path.basename(path))[0]
        f = swiss.parse(A.swiss_dxf(path))
        return {"source": src, "kind": "vector floor plan (one storey)",
                "count_categories": ["door", "window", "toilet", "sink", "bathtub", "shower", "apartment", "room (by label)"],
                "area_scopes": ["room (by number)", "apartment (by letter)", "label (all rooms with that label)", "floor (all numbered indoor rooms)"],
                "room_labels": sorted({r["name"] for r in f["rooms"] if r["name"]}),
                "rooms": [{"number": r["number"], "label": r["name"], "apartment": r["unit"]} for r in f["rooms"]],
                "apartments": sorted({u["letter"] for u in f["units"] if u["letter"]}),
                "not_supported": ["counts inside one room", "lengths", "volumes"]}
    if src in ("ifc_models", "ifc_bench"):
        M = ifc.load(A._model_path(path, src))
        return {"source": src, "kind": "IFC building model", "model_name": (M["project"] or [""])[0],
                "count_categories": ["door", "window", "wall", "slab", "column", "beam", "stair", "room", "sanitary", "light"],
                "scopes": ["model (whole building)", "storey (by name)"],
                "storeys": [s["name"] for s in M["storeys"]],
                "rooms": [{"name": (f"{s['long']} ({s['name']})" if s["long"] else s["name"]), "storey": s["storey"]} for s in M["spaces"]],
                "measures": ["room net area", "storey total room area", "wall total length / net side area / net volume", "slab net volume"],
                "not_supported": ["counts inside one room"]}
    if src == "cubicasa5k":
        return {"source": src, "kind": "raster floor plan image (no vector data)",
                "count_categories": list(cubicasa.CATS.keys()),
                "scopes": ["whole plan only"],
                "note": "door/window/toilet/sink/shower_tub come from a trained detector, bedrooms from a room detector "
                        "(boxes as evidence); other room types use the vision model, or the room detector in zero-API mode",
                "not_supported": ["areas (plans are not to scale)", "counts inside one room"]}
    return {"source": src, "kind": "unsupported by the engine", "not_supported": ["everything: use the vision model"]}

# ---------- canonical question templates (exact dataset phrasings, validated by eval/run.py) ----------
SWISS_COUNT = {
    "door": "How many doors (interior doors and entrance doors together) are drawn on this floor plan?",
    "window": "How many windows are drawn on this floor plan?",
    "toilet": "How many toilets (WC) are drawn on this floor plan?",
    "sink": "How many washbasins are drawn on this floor plan?",
    "bathtub": "How many bathtubs are drawn on this floor plan?",
    "shower": "How many showers are drawn on this floor plan?",
    "apartment": "How many apartments (residential units) are shown on this floor plan?",
}
CUBI = {
    "door": "How many doors are shown on this floor plan? Count doorways fitted with a door; open doorways without a door leaf do not count.",
    "window": "How many windows are shown on this floor plan?",
    "toilet": "How many toilet bowls (WC seats) are drawn on this floor plan?",
    "sink": "How many sinks and wash basins (kitchen and bathroom combined; a double-bowl sink counts as one) are drawn on this floor plan?",
    "shower_tub": "How many showers and bathtubs are drawn on this floor plan in total?",
    "storey": "How many floors (storeys) does this floor plan show?",
    "sauna": "How many saunas are on this floor plan?",
    "kitchen": "How many kitchens (including kitchenettes, open kitchens and utility kitchens) are on this floor plan?",
    "bedroom": "How many bedrooms (makuuhuone, usually marked MH) are on this floor plan?",
    "bathroom": "How many bathrooms or washrooms (e.g. KH, KPH, PH, PESUH, SH) are on this floor plan, not counting separate WC rooms?",
    "wc_room": "How many separate WC rooms (toilet rooms marked WC) are on this floor plan?",
    "balcony": "How many balconies (parveke, including glazed balconies) are on this floor plan?",
}
IFC_COUNT_WORD = {"door": "doors", "window": "windows", "wall": "walls", "slab": "slabs", "column": "columns",
                  "beam": "beams", "stair": "stairs", "room": "rooms (spaces)", "sanitary": "sanitary fixtures", "light": "light fixtures"}

def _unsupported(reason, interpreted):
    return {"value": None, "unit": None, "items": [], "sources": [], "method": "query:unsupported",
            "warnings": [reason], "interpreted": interpreted}

def query(path, intent, category=None, scope=None):
    """intent: "count" | "area" | "length" | "volume".
    scope: None/{} (whole drawing or model) | {"storey": name} | {"room": number-or-name} | {"apartment": "A"} | {"label": text}"""
    scope = scope or {}; src = source_of(path); cat = _canon(category)
    interp = {"intent": intent, "category": cat or category, "scope": scope or "whole drawing", "source": src}
    if category and not cat: return _unsupported(f"unknown category '{category}'", interp)
    q = None
    if src == "swiss_dwellings":
        if intent == "count" and cat == "room" and "label" in scope:
            q = f"How many rooms labelled '{scope['label']}' are there on this floor?"
        elif intent == "count" and cat in SWISS_COUNT and not scope:
            q = SWISS_COUNT[cat]
        elif intent == "area" and "room" in scope:
            q = f"What is the net floor area of room {scope['room']} ('') in m²?"; interp["definition"] = DEFINITIONS["area"]
        elif intent == "area" and "apartment" in scope:
            q = (f"What is the net floor area of apartment {str(scope['apartment']).strip()[-1].upper()} in m², summing all its rooms "
                 "except balconies, loggias, terraces and other outdoor spaces?"); interp["definition"] = DEFINITIONS["apartment_area"]
        elif intent == "area" and "label" in scope:
            q = f"What is the total net area in m² of all rooms labelled '{scope['label']}' on this floor?"
        elif intent == "area" and not scope:
            q = ("What is the total net floor area in m² of all numbered indoor rooms on this floor (excluding balconies, "
                 "loggias, terraces and other outdoor spaces, shafts and voids)?")
    elif src in ("ifc_models", "ifc_bench"):
        M = ifc.load(A._model_path(path, src)); model = (M["project"] or [""])[0]
        st = scope.get("storey")
        if intent == "count" and cat in IFC_COUNT_WORD and not scope:
            q = f"How many {IFC_COUNT_WORD[cat]} are there in the model '{model}'?"
        elif intent == "count" and cat in IFC_COUNT_WORD and st:
            q = f"How many {IFC_COUNT_WORD[cat]} are shown on the floor plan of '{st}'?"
        elif intent == "area" and "room" in scope:
            q = f"What is the net floor area of the room '{scope['room']}' on '{st or ''}', in m²?"
        elif intent == "area" and cat in (None, "room") and st:
            q = f"What is the total net floor area of all rooms (spaces) on '{st}', in m²?"
        elif cat == "wall" and st and intent in ("length", "area", "volume"):
            q = {"length": f"What is the total length of all walls on '{st}', in metres?",
                 "area": f"What is the total net side area of all walls on '{st}', in m²?",
                 "volume": f"What is the total net volume of all walls on '{st}', in m³?"}[intent]
        elif cat == "slab" and st and intent == "volume":
            q = f"What is the total net volume of all slabs on '{st}', in m³?"
    elif src == "cubicasa5k":
        if intent == "count" and not scope:
            key = "shower_tub" if cat in ("shower", "bathtub") else cat
            if key in CUBI:
                q = CUBI[key]
                if cat in ("shower", "bathtub"): interp["note"] = "this plan type only supports showers and bathtubs counted together"
    if q is None:
        return _unsupported(f"'{intent}' of '{cat}' with scope {scope or 'whole drawing'} is not supported for {src}; "
                            "call inventory() to see what is", interp)
    r = A.answer(path, q, _fallback=False)
    if cat in DEFINITIONS and intent == "count": interp["definition"] = DEFINITIONS[cat]
    r["interpreted"] = interp; r["canonical_question"] = q
    return r


def classify(path, question):
    from .nlq import classify as _c
    return _c(path, question)
