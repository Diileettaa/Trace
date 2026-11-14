"""Live YOLO detector for raster plans (doors, windows, toilets, sinks, showers, bathtubs).
Needs `pip install ultralytics`; without it, engine falls back to cached results (det_cache/) or priors.
Weights + thresholds: models/detector.json. ~7 ms per plan on a GPU, well under 1 s on CPU."""
import os, json
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "models", "detector.json")
CLASSES = ["door", "window", "toilet", "sink", "shower", "bathtub"]

@lru_cache(maxsize=1)
def _model():
    if not os.path.exists(CFG): return None, None
    cfg = json.load(open(CFG))
    try:
        from ultralytics import YOLO
    except ImportError:
        return None, cfg
    return YOLO(os.path.join(ROOT, "models", cfg["weights"])), cfg

def available():
    m, _ = _model(); return m is not None

@lru_cache(maxsize=512)
def detect(png_path):
    """-> {"model", "boxes": {category: [[x0,y0,x1,y1] in 0-1000]}, "scores": {...}} or None if no detector."""
    m, cfg = _model()
    if m is None: return None
    r = m.predict(png_path, imgsz=cfg.get("imgsz", 1280), conf=0.05, verbose=False)[0]
    H, W = r.orig_shape; boxes, scores = {}, {}
    for c, p, b in zip(r.boxes.cls, r.boxes.conf, r.boxes.xyxy):
        k = CLASSES[int(c)]; p = float(p)
        if p < cfg["thresholds"].get(k, 0.5): continue
        cat = "shower_tub" if k in ("shower", "bathtub") else k
        boxes.setdefault(cat, []).append([round(float(b[0]) * 1000 / W, 1), round(float(b[1]) * 1000 / H, 1),
                                          round(float(b[2]) * 1000 / W, 1), round(float(b[3]) * 1000 / H, 1)])
        scores.setdefault(cat, []).append(round(p, 3))
    return {"model": "yolo-cubicasa:" + cfg["weights"], "boxes": boxes, "scores": scores}
