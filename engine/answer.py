"""Single entry point: answer(path, question) -> evidence dict (see interface contract)."""
import os, collections
from . import swiss, questions, ifc, ifc_answer, swiss_view, cubicasa

DATA = os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset"))

def _item(kind, bbox, **kw):
    return dict(category=kind, bbox_m=[round(v, 3) for v in bbox], **kw)

import re
STAIR = re.compile(r"treppe|lift|aufzug|ascens|escalier|scala|elevator|stair", re.I)
AREA_RULE = {
    "room_area": "net area of the ROOM_OUTLINE polygon that contains the room number",
    "label_area": "sum of ROOM_OUTLINE polygons whose room name equals the label",
    "indoor_area": "sum of numbered rooms, minus outdoor spaces (by name or grey fill) and shafts/voids",
    "apt_area": "sum of rooms whose number lies inside the apartment outline, minus outdoor spaces, shafts/voids, "
                "common areas and stair/lift cores",
}

def _formula(terms, total, u):
    """'12.30 (1.01 Zimmer) + 8.10 (1.02 Bad) = 20.40 m²' - lets a reviewer re-add the numbers by hand."""
    if not terms: return f"0 {u} (nothing selected)"
    body = " + ".join(f"{v:.2f} ({lab})" if lab else f"{v:.2f}" for v, lab in terms)
    return f"{body} = {total:.2f} {u}"

def _room_ev(dxf, r, **kw):
    d = {"number": r["number"], "name": r["name"], "area_m2": r["area"]}
    if r.get("holes"):   # net = gross outline minus cut-outs, each shown so the subtraction can be checked
        d["gross_area_m2"] = r["gross_area"]; d["holes"] = r["holes"]
        d["net_formula"] = f'{r["gross_area"]:.2f} - ' + " - ".join(f'{h["area_m2"]:.2f}' for h in r["holes"]) + f' = {r["area"]:.2f} m²'

    try:
        d["png_polygon"] = swiss_view.to_png_poly(dxf, r["poly"]); d["pdf_polygon_pt"] = swiss_view.to_pdf_poly(dxf, r["poly"])
    except Exception:
        pass
    d.update(kw); return d

def _full(path):
    return path if os.path.isabs(path) or os.path.exists(path) else os.path.join(DATA, path)

def _is_swiss_dxf(dxf):
    """A DXF with the semantic layers the Swiss parser reads (ROOM_OUTLINE + ROOM_TEXT)."""
    try:
        with open(dxf, "r", errors="ignore") as f: head = f.read(4_000_000)
        return "ROOM_OUTLINE" in head and "ROOM_TEXT" in head
    except OSError:
        return False

def swiss_dxf(path):
    """The DXF for a Swiss plan: the dataset copy, the file itself (upload), or a .dxf next to an uploaded PDF/PNG."""
    stem = os.path.splitext(os.path.basename(path))[0]
    ds = os.path.join(DATA, "data", "swiss_dwellings", stem + ".dxf")
    if "swiss_dwellings" in path.replace("\\", "/") and os.path.exists(ds): return ds
    full = _full(path)
    cand = full if full.lower().endswith(".dxf") else os.path.splitext(full)[0] + ".dxf"
    return cand if os.path.exists(cand) else ds

def resolve_source(path):
    """Dataset paths keep their folder name; uploads are recognised by file type and content."""
    p = path.replace("\\", "/").split("/")
    if "data" in p and p.index("data") + 1 < len(p) - 1: return p[p.index("data") + 1]
    full = _full(path); ext = os.path.splitext(full)[1].lower()
    if ext == ".ifc" and os.path.exists(full): return "ifc_models"
    if ext in (".dxf", ".pdf", ".png", ".jpg", ".jpeg"):
        d = full if ext == ".dxf" else os.path.splitext(full)[0] + ".dxf"
        if os.path.exists(d) and _is_swiss_dxf(d): return "swiss_dwellings"
    return p[0] if len(p) > 1 else "upload"

def answer_swiss(path, question):
    stem = os.path.splitext(os.path.basename(path))[0]
    dxf = swiss_dxf(path)
    f = swiss.parse(dxf)
    q = questions.parse_swiss(question)
    it, items, value, unit, warn = q["intent"], [], None, "count", []
    rooms = f["rooms"]
    if it in ("doors", "windows"):
        items = [_item(it[:-1], d["bbox"]) for d in f[it]]; value = len(items)
    elif it == "bathtub":
        items = [_item(it, x["bbox"]) for x in f["bathtubs"]]; value = len(items)
    elif it in ("wc", "washbasin", "shower"):
        items = [_item(it, x["bbox"]) for x in f["fixtures"] if x["kind"] == it]; value = len(items)
    elif it == "apartments":
        letters = f.get("apartment_letters") or sorted({u["letter"] for u in f["units"] if u["letter"]})
        items = [_item("apartment", u["bbox"], label=u["label"]) for u in f["units"] if u["letter"]]; value = len(letters)
    elif it == "label_count":
        sel = [r for r in rooms if r["name"] == q["label"]]
        items = [_item("room", r["bbox"], number=r["number"], name=r["name"], area_m2=r["area"]) for r in sel if r["bbox"]]
        value = len(sel)
    elif it in ("room_area", "apt_area", "indoor_area", "label_area"):
        unit = "m2"; excluded = []
        if it == "room_area": sel = [r for r in rooms if r["number"] == q["room"] or r["number"].endswith(q["room"])]
        elif it == "label_area": sel = [r for r in rooms if r["name"] == q["label"]]
        else:
            fills = swiss_view.room_fills(dxf)
            if not fills: warn.append("PNG fill unavailable: outdoor/common spaces judged by name only")
            cand = [r for r in rooms if it == "indoor_area" or r["unit"] == q["apt"]]
            sel = []
            for r in cand:
                fl = fills.get(r["number"])
                why = ("outdoor (name)" if r["outdoor"] else "shaft/void (name)" if r["shaft_void"] else
                       "outdoor (grey fill on drawing)" if fl is not None and fl < swiss_view.OUTDOOR_FILL_MAX else None)
                if not why and it == "apt_area":
                    why = ("common area outside units (fill)" if fl is not None and fl < swiss_view.COMMON_FILL_MAX else
                           "stair/lift core" if STAIR.search(r["name"]) else None)
                if why: excluded.append(_room_ev(dxf, r, reason=why))
                else: sel.append(r)
        miss = [r for r in sel if r["area"] is None]
        if miss: warn.append(f"{len(miss)} rooms had no outline")
        value = round(sum(r["area"] for r in sel if r["area"] is not None), 2)
        items = [_item("room", r["bbox"], number=r["number"], name=r["name"], area_m2=r["area"]) for r in sel if r["bbox"]]
        breakdown = [_room_ev(dxf, r) for r in sel if r["area"] is not None]
        evidence = {"breakdown": breakdown, "excluded": excluded,
                    "formula": _formula([(b["area_m2"], f'{b["number"]} {b["name"]}'.strip()) for b in breakdown], value, "m²"),
                    "rule": AREA_RULE[it]}
    else:
        warn.append("question not recognised")
    for x in items:   # where to draw the box on the PNG / PDF the user is looking at
        try:
            x["png_bbox"] = swiss_view.to_png(dxf, x["bbox_m"]); x["pdf_bbox_pt"] = swiss_view.to_pdf(dxf, x["bbox_m"])
        except Exception:
            pass
    in_ds = os.path.abspath(dxf).startswith(os.path.abspath(os.path.join(DATA, "data")))
    rel = (lambda ext: f"data/swiss_dwellings/{stem}.{ext}") if in_ds else (lambda ext: os.path.splitext(dxf)[0] + "." + ext)
    sources = [{"file": rel("dxf"), "role": "computed from layers ROOM_OUTLINE/ROOM_TEXT/DOOR/WINDOW/FIXTURE/UNIT_OUTLINE"},
               {"file": rel("png"), "boxes": [x.get("png_bbox") for x in items if x.get("png_bbox")]},
               {"file": rel("pdf"), "page": 1, "boxes_pt": [x.get("pdf_bbox_pt") for x in items if x.get("pdf_bbox_pt")]}]
    out = {"value": value, "unit": unit, "items": items, "sources": sources,
           "method": f"swiss_dxf:{it}", "warnings": warn}
    if it in AREA_RULE: out["evidence"] = evidence
    return out

_MODELS = {}
def _model_path(path, source):
    full = _full(path)
    if full.lower().endswith(".ifc") and os.path.exists(full):
        return full                                    # the model itself (dataset or upload)
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
    ev = None
    if unit in ("m2", "m3", "m") and v is not None:
        key = next((k for k in ("area_m2", "area", "volume", "length") if any(k in x for x in items)), None)
        terms = [(x[key], x.get("name") or x.get("guid")) for x in items if key and isinstance(x.get(key), (int, float))]
        src = method[method.find("[") + 1:-1] if "[" in method else "IFC quantity sets (Qto_*BaseQuantities)"
        ev = {"breakdown": items, "excluded": [],
              "formula": _formula(terms, v, {"m2": "m²", "m3": "m³", "m": "m"}[unit]),
              "rule": f"summed from {src}; each term is one IFC element, identified by GlobalId"}
    out = {"value": v, "unit": unit, "items": items,
            "sources": [{"file": os.path.relpath(mp, DATA).replace(os.sep, "/") if os.path.abspath(mp).startswith(os.path.abspath(DATA)) else mp}] + ([{"file": path}] if path.endswith(".pdf") else []),
            "method": method, "warnings": warn}
    if ev: out["evidence"] = ev
    return out

from functools import lru_cache
@lru_cache(maxsize=4096)
def _png_size(png):
    """Image size from the PNG header (no decoding)."""
    try:
        import struct
        with open(png, "rb") as f: h = f.read(24)
        return struct.unpack(">II", h[16:24]) if h[:8] == b"\x89PNG\r\n\x1a\n" else None
    except Exception: return None

UNKNOWN = ("swiss_dxf:unknown", "ifc:unknown", "cubicasa:unknown")

def answer(path, question, _fallback=True):
    """Dataset phrasings go straight to the validated parsers; anything else is classified (engine.nlq) into a
    structured query. A question that stays ambiguous returns method 'unrecognised_question', never a guess.
    Every answer carries confidence (high/medium/low/none) + confidence_reason (engine.confidence)."""
    from .confidence import attach
    return attach(_answer(path, question, _fallback))

def _answer(path, question, _fallback=True):
    r = _answer_templates(path, question)
    if _fallback and r.get("method") in UNKNOWN:
        from . import nlq
        r2 = nlq.run(path, question)
        r2.setdefault("warnings", []).insert(0, "free-form question: interpreted by engine.nlq, see 'classified'")
        return r2
    return r

def _answer_templates(path, question):
    source = resolve_source(path)
    if source == "swiss_dwellings":
        return answer_swiss(path, question)
    if source in ("ifc_models", "ifc_bench"):
        return answer_ifc(path, question, source)
    if source == "cubicasa5k":
        png = os.path.join(DATA, path) if not os.path.isabs(path) else path
        v, items, method, warn = cubicasa.answer(png, question, _png_size)
        return {"value": v, "unit": "count", "items": items, "sources": [{"file": path}], "method": method, "warnings": warn}
    return _answer_sheet(path, question, source)

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp")

def answer_sheet(path, question, page=None, source=None):
    """Any other drawing: vector PDF sheets -> schedule QA (docqa) with a vision fallback; scans and photos -> scanqa.
    Both need the vision model; without it the engine says so instead of guessing.
    page: 1-based PDF page (same as the 'file.pdf#pN' suffix; the suffix wins if both are given)."""
    from .confidence import attach
    if page is not None and not re.search(r"#p\d+$", path): path = f"{path}#p{int(page)}"
    return attach(_answer_sheet(path, question, source))

def _answer_sheet(path, question, source=None):
    from . import llm
    path_nopage = path.rsplit("#p", 1)[0] if re.search(r"#p\d+$", path) else path
    full = path_nopage if os.path.isabs(path_nopage) else os.path.join(DATA, path_nopage)
    ext = os.path.splitext(path_nopage)[1].lower()
    base = {"value": None, "unit": None, "items": [], "sources": [{"file": path}]}
    if not os.path.exists(full):
        return {**base, "method": "sheet:not_found", "warnings": [f"file not found: {path}"]}
    if ext not in (".pdf",) + IMAGE_EXT:
        return {**base, "method": f"unsupported:{ext or source}", "warnings": [f"no solver for {ext or 'this file type'} (supported: PDF sheets, images, DXF of Swiss plans, IFC)"]}
    if not llm.available():
        return {**base, "method": "sheet:needs_vision_model",
                "warnings": ["this drawing needs the vision model (set GEMINI_API_KEY); zero-API mode has no answer for it"]}
    try:
        if ext == ".pdf":
            from . import docqa, sheet
            try:
                page = None
                if "#p" in path: page = int(path.rsplit("#p", 1)[1]) - 1
                return sheet.answer(full, question, llm.text_json, page=page, vision=llm.vision_json)
            except ImportError:                     # no pdfplumber here: read the sheet visually
                from . import scanqa
                img = docqa.render_page(full)
                if img is None: return {**base, "method": "sheet:cannot_read_pdf", "warnings": ["install pdfplumber or pypdfium2"]}
                r = scanqa.answer(img, question, llm.vision_json); r["sources"] = [{"file": path, "page": 1}]; return r
        from . import scanqa
        r = scanqa.answer(open(full, "rb").read(), question, llm.vision_json, file=full)     # full resolution: tiled when needed
        r["sources"] = [{"file": path}]; return r
    except RuntimeError as e:
        return {**base, "method": "sheet:model_error", "warnings": [str(e)]}
