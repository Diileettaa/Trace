"""Raster floor plans (cubicasa5k): counting needs vision.
* With GEMINI_API_KEY (or NVIDIA_API_KEY + NVIDIA_VLM_MODEL) set: one vision-model call per image locates every
  category below with a box; results are cached under JUNCTION_CACHE/vlm/. Count = number of boxes (evidence).
* Without a key: answer the most common value for that question type (dev split) and flag it as low confidence."""
import os, re, json, base64, hashlib, urllib.request

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "vlm")

# category -> (EN/FI question keywords, definition given to the model, prior from the dev split)
CATS = {
    "door":     (r"doors|ovea",            "doors: doorways fitted with a door leaf (swing arc or sliding leaf); open doorways without a leaf do not count", 6),
    "window":   (r"windows|ikkuna",        "windows: window openings drawn in exterior or interior walls", 4),
    "toilet":   (r"toilet bowls|WC-istuin","toilet bowls (WC seats)", 1),
    "sink":     (r"sinks and wash|pesu- ja tiski", "sinks and wash basins, kitchen and bathroom combined; a double-bowl sink counts as one", 2),
    "shower_tub":(r"showers and bathtubs|suihkua ja kylpy", "showers and bathtubs", 1),
    "floors":   (r"floors \(storeys\)|kerrosta", "separate storeys (floor levels) drawn on the sheet", 1),
    "sauna":    (r"saunas|saunaa",         "saunas (room marked S or SAUNA, or with sauna benches/stove)", 1),
    "kitchen":  (r"kitchens|keittiö",      "kitchens including kitchenettes, open kitchens and utility kitchens", 1),
    "bedroom":  (r"bedrooms|makuuhuone",   "bedrooms (makuuhuone, usually marked MH)", 1),
    "bathroom": (r"bathrooms or washrooms|kylpy- tai pesuhuone", "bathrooms or washrooms (KH, KPH, PH, PESUH, SH), not separate WC rooms", 1),
    "wc_room":  (r"separate WC rooms|erillistä WC", "separate WC rooms (toilet rooms marked WC)", 0),
    "balcony":  (r"balconies|parveke",     "balconies (parveke), including glazed balconies", 0),
}

def category(question):
    for c, (rx, _, _) in CATS.items():
        if re.search(rx, question, re.I): return c
    return None

PROMPT = ("You are reading a Finnish residential floor plan image. Find every instance of each category below. "
          "Return JSON only: {\"<category>\": [[x0,y0,x1,y1], ...], ...} with boxes in 0-1000 normalised image "
          "coordinates (x right, y down). Use an empty list when there are none. Count carefully; do not guess.\n" +
          "\n".join(f"- {c}: {d}" for c, (_, d, _) in CATS.items()) +
          "\nFor 'floors' return one box around each separate storey drawing.")

def _post(url, body, headers):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=120) as r: return json.loads(r.read())

def _vlm(png_path):
    b64 = base64.b64encode(open(png_path, "rb").read()).decode()
    if os.environ.get("GEMINI_API_KEY"):
        model = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ['GEMINI_API_KEY']}"
        r = _post(url, {"contents": [{"parts": [{"text": PROMPT}, {"inline_data": {"mime_type": "image/png", "data": b64}}]}],
                        "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}, {})
        return json.loads(r["candidates"][0]["content"]["parts"][0]["text"]), f"gemini:{model}"
    if os.environ.get("NVIDIA_API_KEY") and os.environ.get("NVIDIA_VLM_MODEL"):
        model = os.environ["NVIDIA_VLM_MODEL"]
        r = _post("https://integrate.api.nvidia.com/v1/chat/completions",
                  {"model": model, "temperature": 0, "messages": [{"role": "user", "content": [
                      {"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}}]}]},
                  {"Authorization": "Bearer " + os.environ["NVIDIA_API_KEY"]})
        txt = r["choices"][0]["message"]["content"]
        return json.loads(txt[txt.find("{"): txt.rfind("}") + 1]), f"nvidia:{model}"
    return None, None

def _have_key():
    return bool(os.environ.get("GEMINI_API_KEY") or (os.environ.get("NVIDIA_API_KEY") and os.environ.get("NVIDIA_VLM_MODEL")))

LOCAL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "vlm_cache")

def detections(png_path):
    shared = os.path.join(LOCAL, os.path.basename(png_path) + ".json")   # written by vlm_pilot.py
    if os.path.exists(shared): return json.load(open(shared))
    st = os.stat(png_path)
    key = hashlib.md5(f"{os.path.basename(png_path)}|{st.st_size}|{st.st_mtime}".encode()).hexdigest()
    cp = os.path.join(CACHE, key + ".json")
    if os.path.exists(cp): return json.load(open(cp))
    if not _have_key(): return None
    os.makedirs(CACHE, exist_ok=True)
    det, model = _vlm(png_path)
    if det is None: return None
    out = {"model": model, "boxes": det}
    json.dump(out, open(cp, "w"))
    return out

TILES_OUT = os.path.join(os.path.dirname(LOCAL), "vlm_tiles_out")
TILES_IN = os.path.join(os.path.dirname(LOCAL), "vlm_tiles")

DET_DIR = os.path.join(os.path.dirname(LOCAL), "det_cache")
DETECTOR_CATS = ("door", "window", "toilet", "sink", "shower_tub")
VLM_PREFERRED = ()        # full test set (933 plans): the detector beats the vision model on every fixture category
PRIOR_PREFERRED = ("kitchen",)   # almost every plan has exactly one kitchen; the prior (95.6%) beats the VLM (92.5%)

def _normalise_boxes(b):
    """Gemini sometimes returns [{"category": c, "box_2d": [[...]]}, ...] instead of {c: [[...]]}."""
    if isinstance(b, dict): return b
    out = {}
    for it in b or []:
        if isinstance(it, dict) and it.get("category"):
            bx = it.get("box_2d") or it.get("box") or []
            bx = bx if bx and isinstance(bx[0], list) else [bx]
            out.setdefault(it["category"], []).extend(x for x in bx if len(x) == 4)
    return out

def detector_boxes(png_path, cat):
    """Boxes from the YOLO detector trained on CubiCasa5k (train/predict_counts.py), if present for this image."""
    if cat not in DETECTOR_CATS: return None
    p = os.path.join(DET_DIR, os.path.basename(png_path) + ".json")
    if os.path.exists(p): return json.load(open(p))["boxes"].get(cat, []) or []
    from . import detector                       # live inference for new plans (needs ultralytics)
    try: d = detector.detect(png_path)
    except Exception: d = None
    return None if d is None else (d["boxes"].get(cat, []) or [])

def tiled_boxes(png_path, cat):
    """Merge per-tile boxes (tile-normalised 0-1000) back to whole-image 0-1000 and drop duplicates in overlaps."""
    base = os.path.basename(png_path); meta_p = os.path.join(TILES_IN, base + ".tiles.json")
    if os.environ.get("JUNCTION_TILES") != "1": return None   # off by default: worse than whole-image on the pilot
    if cat not in ("door", "window") or not os.path.exists(meta_p): return None
    meta = json.load(open(meta_p)); W, H = meta["size"]; out = []
    for t in meta["tiles"]:
        rp = os.path.join(TILES_OUT, t["file"] + ".json")
        if not os.path.exists(rp): return None      # incomplete -> fall back to whole-image pass
        x0, y0, x1, y1 = t["xyxy"]; tw, th = x1 - x0, y1 - y0
        for b in (json.load(open(rp)).get(cat) or []):
            if not isinstance(b, list) or len(b) != 4: continue
            g = [(x0 + b[0] * tw / 1000) * 1000 / W, (y0 + b[1] * th / 1000) * 1000 / H,
                 (x0 + b[2] * tw / 1000) * 1000 / W, (y0 + b[3] * th / 1000) * 1000 / H]
            cx, cy = (g[0] + g[2]) / 2, (g[1] + g[3]) / 2
            r, c = int(t["file"][-7]), int(t["file"][-5])          # ..__r{r}c{c}.jpg : each tile owns one quadrant
            if (cx >= 500) != (c == 1) or (cy >= 500) != (r == 1): continue
            out.append([round(v, 1) for v in g])
    return out

def answer(png_path, question, size_fn=None):
    c = category(question)
    if c is None:
        return None, [], "cubicasa:unknown", ["question not recognised"]
    try: det = detections(png_path)
    except Exception as e: det = None; err = repr(e)[:200]
    else: err = None
    if det is None and detector_boxes(png_path, c) is not None:
        det = {"model": "yolo-cubicasa", "boxes": {}}
    if det and c in PRIOR_PREFERRED:
        return CATS[c][2], [], f"cubicasa:prior:{c}", ["answered the most common value (more reliable than the vision model here)"]
    if det:
        det = {**det, "boxes": _normalise_boxes(det.get("boxes"))}
        boxes = det["boxes"].get(c, []) or []
        yolo = detector_boxes(png_path, c)
        vlm_better = c in VLM_PREFERRED and det.get("model", "").startswith(("gemini", "nvidia")) and c in det.get("boxes", {})
        if yolo is not None and not vlm_better:
            boxes = yolo; det = {**det, "model": "yolo-cubicasa"}
        tiled = tiled_boxes(png_path, c)
        if tiled is not None: boxes = tiled          # focused 2x2 tile pass (doors/windows) wins when present
        items = [{"category": c, "box_norm1000": b} for b in boxes]
        if c == "shower_tub" and not boxes and det.get("model", "").startswith(("gemini", "nvidia")):          # model tends to miss these; 0 -> prior (+7 pts on pilot)
            return CATS[c][2], [], f"cubicasa:vlm+prior:{c}", ["model found none; answered the most common value"]
        size = size_fn(png_path) if callable(size_fn) else size_fn
        if size:
            w, h = size
            for it in items:
                try:
                    b = [float(v) for v in it["box_norm1000"]][:4]
                    it["png_bbox"] = [round(b[0] * w / 1000), round(b[1] * h / 1000), round(b[2] * w / 1000), round(b[3] * h / 1000)]
                except (TypeError, ValueError, IndexError):
                    pass   # malformed box from the model: still counted, just not drawn
        return len(boxes), items, f"cubicasa:vlm[{det['model']}]:{c}", []
    warn = ["low confidence: no vision model configured, answered the most common value for this question type"]
    if err: warn.append("vision call failed: " + err)
    return CATS[c][2], [], f"cubicasa:prior:{c}", warn
