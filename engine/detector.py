"""Live detectors for raster plans: fixtures (models/detector.json: doors, windows, toilets, sinks, showers,
bathtubs) and rooms (models/rooms.json: bedrooms, kitchens, balconies, storeys, WC labels).
Needs `pip install ultralytics`; without it, engine falls back to cached results (det_cache/) or priors.

detector.json may list several models and, per category, an ensemble of them ("fuse"): boxes of one class from the
listed models are clustered (IoU >= 0.5); a cluster's score is the mean over the models of their best score in it,
so a box only one model sees counts half. If a model of an ensemble is missing, that category falls back to the
first model with its own threshold ("fallback_thresholds"). Same procedure as train/r2_eval.py."""
import os, json
from functools import lru_cache

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES = ["door", "window", "toilet", "sink", "shower", "bathtub"]

def _cfg(cfg_name):
    path = os.path.join(ROOT, "models", cfg_name)
    if not os.path.exists(path): return None
    cfg = json.load(open(path))
    if "models" not in cfg:               # old single-model format
        cfg["models"] = [{"tag": "main", "weights": cfg["weights"], "imgsz": cfg.get("imgsz", 1280)}]
    return cfg

@lru_cache(maxsize=8)
def _load(weights, arch):
    w = os.path.join(ROOT, "models", weights)
    if not os.path.exists(w): return None
    try:
        from ultralytics import YOLO, RTDETR
    except ImportError:
        return None
    return (RTDETR if arch == "rtdetr" else YOLO)(w)

def _models(cfg):
    return {m["tag"]: (_load(m["weights"], m.get("arch", "yolo")), m) for m in cfg["models"]}

def available(cfg_name="detector.json"):
    cfg = _cfg(cfg_name)
    return bool(cfg) and _models(cfg)[cfg["models"][0]["tag"]][0] is not None

def _iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]); i = max(0, x1 - x0) * max(0, y1 - y0)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return i / u if u > 0 else 0

def fuse(parts, iou_thr=0.5):
    """parts: per model, list of (score, box). -> list of (mean score, box)."""
    boxes = sorted([(p, k, b) for k, dets in enumerate(parts) for p, b in dets], key=lambda x: -x[0])
    clusters = []
    for p, k, b in boxes:
        for c in clusters:
            if _iou(c["box"], b) >= iou_thr: c["s"][k] = max(c["s"].get(k, 0), p); break
        else: clusters.append({"box": b, "s": {k: p}})
    return [(sum(c["s"].values()) / len(parts), c["box"]) for c in clusters]

def _cover(outer, inner):
    """Fraction of `inner`'s area inside `outer`."""
    x0, y0, x1, y1 = max(outer[0], inner[0]), max(outer[1], inner[1]), min(outer[2], inner[2]), min(outer[3], inner[3])
    return max(0, x1 - x0) * max(0, y1 - y0) / max(1e-9, (inner[2] - inner[0]) * (inner[3] - inner[1]))

def suppress_nested(boxes, scores, cover=0.7):
    """Drop a box that lies >= `cover` inside a bigger box of the same category (a pane inside its window, a tub
    inside its shower/tub box). Validated on CubiCasa val+test halves: window and shower_tub up, doors unchanged."""
    order = sorted(range(len(boxes)), key=lambda i: -(boxes[i][2] - boxes[i][0]) * (boxes[i][3] - boxes[i][1]))
    keep = []
    for i in order:
        if not any(_cover(boxes[j], boxes[i]) >= cover for j in keep): keep.append(i)
    keep.sort()
    return [boxes[i] for i in keep], [scores[i] for i in keep]

def _predict(model, spec, png_path):
    r = model.predict(png_path, imgsz=spec.get("imgsz", 1280), conf=0.05, verbose=False)[0]
    H, W = r.orig_shape; names = model.names; out = {}
    for c, p, b in zip(r.boxes.cls, r.boxes.conf, r.boxes.xyxy):
        out.setdefault(str(names[int(c)]).lower(), []).append(
            (float(p), [round(float(b[0]) * 1000 / W, 1), round(float(b[1]) * 1000 / H, 1),
                        round(float(b[2]) * 1000 / W, 1), round(float(b[3]) * 1000 / H, 1)]))
    return out

@lru_cache(maxsize=512)
def detect(png_path, cfg_name="detector.json"):
    """-> {"model", "boxes": {category: [[x0,y0,x1,y1] in 0-1000]}, "scores": {...}} or None if no detector."""
    cfg = _cfg(cfg_name)
    if not cfg: return None
    ms = _models(cfg); first = cfg["models"][0]["tag"]
    if ms[first][0] is None: return None
    preds = {}
    def pred(tag):
        if tag not in preds: preds[tag] = _predict(ms[tag][0], ms[tag][1], png_path)
        return preds[tag]
    classes = cfg.get("classes", CLASSES)
    cat_of = cfg.get("category_of", {"shower": "shower_tub", "bathtub": "shower_tub"})
    boxes, scores, used = {}, {}, {}
    for k in classes:
        members = cfg.get("fuse", {}).get(k)
        if members and all(t in ms and ms[t][0] is not None for t in members):
            dets = fuse([pred(t).get(k, []) for t in members]); thr = cfg["thresholds"][k]; used[k] = "+".join(members)
        else:
            dets = pred(first).get(k, []); used[k] = first
            thr = cfg.get("fallback_thresholds", {}).get(k, cfg["thresholds"].get(k, 0.5)) if members else cfg["thresholds"].get(k, 0.5)
        cat = cat_of.get(k, k)
        for p, b in dets:
            if p < thr: continue
            boxes.setdefault(cat, []).append(b); scores.setdefault(cat, []).append(round(p, 3))
    for cat in cfg.get("suppress_nested", []):
        if cat in boxes: boxes[cat], scores[cat] = suppress_nested(boxes[cat], scores[cat])
    tags = sorted(set(used.values()))
    return {"model": "yolo-cubicasa:" + ",".join(tags), "boxes": boxes, "scores": scores, "models_used": used}
