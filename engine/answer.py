"""Single entry point: answer(path, question) -> evidence dict (see interface contract)."""
import os, collections
from . import swiss, questions, ifc, ifc_answer, swiss_view, cubicasa

DATA = os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset"))

def _item(kind, bbox, **kw):
    return dict(category=kind, bbox_m=[round(v, 3) for v in bbox], **kw)

def answer_swiss(path, question):
    stem = os.path.splitext(os.path.basename(path))[0]
    dxf = os.path.join(DATA, "data", "swiss_dwellings", stem + ".dxf")
    f = swiss.parse(dxf)
    q = questions.parse_swiss(question)
    it, items, value, unit, warn = q["intent"], [], None, "count", []
    rooms = f["rooms"]
    if it in ("doors", "windows"):
        items = [_item(it[:-1], d["bbox"]) for d in f[it]]; value = len(items)
    elif it in ("wc", "washbasin", "bathtub", "shower"):
        items = [_item(it, x["bbox"]) for x in f["fixtures"] if x["kind"] == it]; value = len(items)
    elif it == "apartments":
        letters = sorted({u["letter"] for u in f["units"] if u["letter"]})
        items = [_item("apartment", u["bbox"], label=u["label"]) for u in f["units"] if u["letter"]]; value = len(letters)
    elif it == "label_count":
        sel = [r for r in rooms if r["name"] == q["label"]]
        items = [_item("room", r["bbox"], number=r["number"], name=r["name"], area_m2=r["area"]) for r in sel if r["bbox"]]
        value = len(sel)
    elif it in ("room_area", "apt_area", "indoor_area", "label_area"):
        unit = "m2"
        if it == "room_area": sel = [r for r in rooms if r["number"] == q["room"] or r["number"].endswith(q["room"])]
        elif it == "apt_area": sel = [r for r in rooms if r["unit"] == q["apt"] and not r["outdoor"] and not r["shaft_void"]]
        elif it == "indoor_area": sel = [r for r in rooms if not r["outdoor"] and not r["shaft_void"]]
        else: sel = [r for r in rooms if r["name"] == q["label"]]
        miss = [r for r in sel if r["area"] is None]
        if miss: warn.append(f"{len(miss)} rooms had no outline")
        value = round(sum(r["area"] for r in sel if r["area"] is not None), 2)
        items = [_item("room", r["bbox"], number=r["number"], name=r["name"], area_m2=r["area"]) for r in sel if r["bbox"]]
    else:
        warn.append("question not recognised")
    for x in items:   # where to draw the box on the PNG / PDF the user is looking at
        try:
            x["png_bbox"] = swiss_view.to_png(dxf, x["bbox_m"]); x["pdf_bbox_pt"] = swiss_view.to_pdf(dxf, x["bbox_m"])
        except Exception:
            pass
    rel = lambda ext: f"data/swiss_dwellings/{stem}.{ext}"
    sources = [{"file": rel("dxf"), "role": "computed from layers ROOM_OUTLINE/ROOM_TEXT/DOOR/WINDOW/FIXTURE/UNIT_OUTLINE"},
               {"file": rel("png"), "boxes": [x.get("png_bbox") for x in items if x.get("png_bbox")]},
               {"file": rel("pdf"), "page": 1, "boxes_pt": [x.get("pdf_bbox_pt") for x in items if x.get("pdf_bbox_pt")]}]
    return {"value": value, "unit": unit, "items": items, "sources": sources,
            "method": f"swiss_dxf:{it}", "warnings": warn}

_MODELS = {}
def _model_path(path, source):
    d = os.path.join(DATA, "data", source); stem = os.path.splitext(os.path.basename(path))[0]
    if path.endswith(".ifc"): return os.path.join(d, stem + ".ifc")
    if source not in _MODELS: _MODELS[source] = sorted(f[:-4] for f in os.listdir(d) if f.endswith(".ifc"))
    cands = [m for m in _MODELS[source] if stem.startswith(m + "_")]
    return os.path.join(d, max(cands, key=len) + ".ifc") if cands else None

def answer_ifc(path, question, source):
    mp = _model_path(path, source)
    if not mp or not os.path.exists(mp):
        return {"value": None, "unit": None, "items": [], "sources": [], "method": "ifc:no_model", "warnings": ["model not found"]}
    M = ifc.load(mp)
    v, unit, items, method, warn = ifc_answer.answer(path, question, M)
    return {"value": v, "unit": unit, "items": items,
            "sources": [{"file": os.path.relpath(mp, DATA).replace(os.sep, "/")}] + ([{"file": path}] if path.endswith(".pdf") else []),
            "method": method, "warnings": warn}

def _png_size(png):
    try:
        import cv2; im = cv2.imread(png); return (im.shape[1], im.shape[0]) if im is not None else None
    except Exception: return None

def answer(path, question):
    src = path.replace("\\", "/").split("/")
    source = src[src.index("data") + 1] if "data" in src else src[0]
    if source == "swiss_dwellings":
        return answer_swiss(path, question)
    if source in ("ifc_models", "ifc_bench"):
        return answer_ifc(path, question, source)
    if source == "cubicasa5k":
        png = os.path.join(DATA, path) if not os.path.isabs(path) else path
        v, items, method, warn = cubicasa.answer(png, question, _png_size)
        return {"value": v, "unit": "count", "items": items, "sources": [{"file": path}], "method": method, "warnings": warn}
    return {"value": None, "unit": None, "items": [], "sources": [], "method": f"unsupported:{source}",
            "warnings": [f"no solver yet for source '{source}'"]}
