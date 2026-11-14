"""Live YOLO detectors for raster plans: fixtures (models/detector.json: doors, windows, toilets, sinks, showers,
bathtubs) and rooms (models/rooms.json: bedrooms, kitchens, balconies, storeys, WC labels).
Needs `pip install ultralytics`; without it, engine falls back to cached results (det_cache/) or priors.
Weights + thresholds: models/detector.json. ~7 ms per plan on a GPU, well under 1 s on CPU."""
import os, json
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "models", "detector.json")
CLASSES = ["door", "window", "toilet", "sink", "shower", "bathtub"]

@lru_cache(maxsize=4)
def _model(cfg_name="detector.json"):
    path = os.path.join(ROOT, "models", cfg_name)
    if not os.path.exists(path): return None, None
    cfg = json.load(open(path))
    try:
        from ultralytics import YOLO
    except ImportError:
        return None, cfg
    w = os.path.join(ROOT, "models", cfg["weights"])
    return (YOLO(w) if os.path.exists(w) else None), cfg

def available(cfg_name="detector.json"):
    m, _ = _model(cfg_name); return m is not None

@lru_cache(maxsize=512)
def detect(png_path, cfg_name="detector.json"):
    """-> {"model", "boxes": {category: [[x0,y0,x1,y1] in 0-1000]}, "scores": {...}} or None if no detector."""
    m, cfg = _model(cfg_name)
    if m is None: return None
    classes = cfg.get("classes", CLASSES)
    cat_of = cfg.get("category_of", {"shower": "shower_tub", "bathtub": "shower_tub"})
    r = m.predict(png_path, imgsz=cfg.get("imgsz", 1280), conf=0.05, verbose=False)[0]
    H, W = r.orig_shape; boxes, scores = {}, {}
    for c, p, b in zip(r.boxes.cls, r.boxes.conf, r.boxes.xyxy):
        k = classes[int(c)]; p = float(p)
        if p < cfg["thresholds"].get(k, 0.5): continue
        cat = cat_of.get(k, k)
        boxes.setdefault(cat, []).append([round(float(b[0]) * 1000 / W, 1), round(float(b[1]) * 1000 / H, 1),
                                          round(float(b[2]) * 1000 / W, 1), round(float(b[3]) * 1000 / H, 1)])
        scores.setdefault(cat, []).append(round(p, 3))
    return {"model": "yolo-cubicasa:" + cfg["weights"], "boxes": boxes, "scores": scores}
