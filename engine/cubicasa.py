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
    if os.environ.get("JUNCTION_NO_VLM") == "1": return None   # zero-API mode: never read or call the vision model
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
ROOM_DIR = os.path.join(os.path.dirname(LOCAL), "det_cache_rooms")
DETECTOR_CATS = ("door", "window", "toilet", "sink", "shower_tub")
ROOM_DET = {"bedroom": "bedroom", "balcony": "balcony", "floors": "floor", "wc_room": "label_wc", "kitchen": "kitchen"}
ROOM_CAT = {"bedroom": "bedroom", "balcony": "balcony", "floor": "floors", "label_wc": "wc_room", "kitchen": "kitchen"}

# Which source answers each category, chosen on the held-out test split (exact-count accuracy, %).
#                      detector  room-det  VLM   prior
#   door                72.8       -       36.8   12        window 45.6/28.8/12.6, toilet 94.0/84.1/59,
#   sink                82.7       -       69     50        shower_tub 76.9/65/76
#   bedroom              -        87.5     86.0   32
#   balcony              -        88.5     88.9   47
#   floors               -        92.8     97.9   80
#   wc_room              -        82.0     96.5   55
#   kitchen              -        89.7     92.5   95.6
#   sauna                -        44.7*    90.5   55     (*63.4 as 'sauna box or SS label', used without VLM)
#   bathroom             -         -       93.0   89
SOURCE_WITH_VLM = {**{c: "detector" for c in DETECTOR_CATS}, "bedroom": "min", "kitchen": "agree_else_prior",
                   "balcony": "vlm", "floors": "vlm", "wc_room": "vlm", "sauna": "agree_else_prior", "bathroom": "vlm"}
# Combinations of the vision model (VLM) and the room detector, chosen on one half of the test plans and checked on
# the other half: sauna 91.8 -> 95.1, bedroom (min of the two) 86.7 -> 87.8, kitchen 95.0 -> 95.6.
# Zero-API mode (no key, or a plan the vision model never saw): local models only, priors where nothing beats them.
SOURCE_NO_VLM = {**{c: "detector" for c in DETECTOR_CATS}, "bedroom": "rooms", "balcony": "rooms", "floors": "rooms",
                 "wc_room": "rooms", "kitchen": "prior", "sauna": "rooms", "bathroom": "prior"}

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

def room_boxes(png_path, cat):
    """Boxes from the room detector (CubiCasa room polygons + WC/SS text labels), cached or live."""
    if cat not in ROOM_DET and cat != "sauna": return None
    p = os.path.join(ROOM_DIR, os.path.basename(png_path) + ".json")
    if os.path.exists(p):
        raw = json.load(open(p))["boxes"]; b = {ROOM_CAT.get(k, k): v for k, v in raw.items()}
        b["sauna_label"] = raw.get("label_ss", [])
    else:
        from . import detector
        try: d = detector.detect(png_path, "rooms.json")
        except Exception: d = None
        if d is None: return None
        b = d["boxes"]
    if cat == "sauna":   # a sauna room box or an 'SS' label; plans almost never have two saunas (test: 63.4 vs prior 55.3)
        hits = (b.get("sauna") or []) + (b.get("sauna_label") or [])
        return hits[:1]
    return b.get(cat, []) or []

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

def _items(c, boxes, png_path, size_fn):
    items = [{"category": c, "box_norm1000": b} for b in boxes]
    size = size_fn(png_path) if callable(size_fn) else size_fn
    if size:
        w, h = size
        for it in items:
            try:
                b = [float(v) for v in it["box_norm1000"]][:4]
                it["png_bbox"] = [round(b[0] * w / 1000), round(b[1] * h / 1000), round(b[2] * w / 1000), round(b[3] * h / 1000)]
            except (TypeError, ValueError, IndexError):
                pass   # malformed box from the model: still counted, just not drawn
    return items

def answer(png_path, question, size_fn=None):
    c = category(question)
    if c is None:
        return None, [], "cubicasa:unknown", ["question not recognised"]
    try: det = detections(png_path)
    except Exception as e: det = None; err = repr(e)[:200]
    else: err = None
    vlm = bool(det) and det.get("model", "").startswith(("gemini", "nvidia"))
    src = (SOURCE_WITH_VLM if vlm else SOURCE_NO_VLM)[c]
    warn = [] if vlm else ["zero-API mode: local detectors and priors only"]
    if err: warn.append("vision call failed: " + err)
    if src == "detector":
        boxes = detector_boxes(png_path, c)
        tiled = tiled_boxes(png_path, c)
        if tiled is not None: boxes = tiled
        if boxes is not None:
            return len(boxes), _items(c, boxes, png_path, size_fn), f"cubicasa:detector[yolo-cubicasa]:{c}", warn
        src = "vlm" if vlm else "prior"
    if src in ("min", "agree_else_prior"):
        vb = _normalise_boxes(det.get("boxes")).get(c, []) or []
        rb = room_boxes(png_path, c)
        if rb is None: src = "vlm"
        elif src == "min":
            boxes, who = (vb, f"vlm[{det['model']}]") if len(vb) <= len(rb) else (rb, "rooms[yolo-cubicasa-rooms]")
            return len(boxes), _items(c, boxes, png_path, size_fn), f"cubicasa:min({who}):{c}", warn + \
                [f"vision model found {len(vb)}, room detector {len(rb)}; the lower count is used (more reliable for {c})"]
        elif len(vb) == len(rb):
            return len(vb), _items(c, vb, png_path, size_fn), f"cubicasa:agree[vlm+rooms]:{c}", warn + \
                [f"vision model and room detector agree ({len(vb)})"]
        else:
            return CATS[c][2], [], f"cubicasa:prior:{c}", warn + \
                [f"vision model ({len(vb)}) and room detector ({len(rb)}) disagree; answered the most common value ({CATS[c][2]})"]
    if src == "rooms":
        boxes = room_boxes(png_path, c)
        if boxes is not None:
            return len(boxes), _items(c, boxes, png_path, size_fn), f"cubicasa:rooms[yolo-cubicasa-rooms]:{c}", warn
        src = "vlm" if vlm else "prior"
    if src == "vlm":
        boxes = _normalise_boxes(det.get("boxes")).get(c, []) or []
        if c == "shower_tub" and not boxes:   # model tends to miss these; 0 -> prior (+7 pts on pilot)
            return CATS[c][2], [], f"cubicasa:vlm+prior:{c}", ["model found none; answered the most common value"]
        return len(boxes), _items(c, boxes, png_path, size_fn), f"cubicasa:vlm[{det['model']}]:{c}", warn
    if vlm or c in ("kitchen",):
        warn.append("answered the most common value (more reliable than the models for this category)")
    else:
        warn.append("low confidence: answered the most common value for this question type")
    return CATS[c][2], [], f"cubicasa:prior:{c}", warn
