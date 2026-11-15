"""Re-tune per-class detector thresholds against the Junction question answers on the VAL images only,
then rewrite det_cache/<image>.json for all images.   python tools/retune_detector.py"""
import os, sys, json, collections
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, here)
from engine import cubicasa
from engine.answer import DATA
DET = os.path.join(here, "det_cache"); R = json.load(open(os.path.join(DET, "_raw_detections.json")))
G = collections.defaultdict(dict)
for l in open(os.path.join(DATA, "questions.jsonl"), encoding="utf-8"):
    if "cubicasa" not in l: continue
    q = json.loads(l); c = cubicasa.category(q["question"])
    if c in cubicasa.DETECTOR_CATS: G[os.path.basename(q["path"])][c] = q["answer"]
KS = {"shower_tub": ("shower", "bathtub")}
def count(n, cat, t): return sum(1 for d in R["raw"][n]["dets"] if d[0] in KS.get(cat, (cat,)) and d[1] >= t)
best = {}
for cat in cubicasa.DETECTOR_CATS:
    vals = [n for n in R["val"] if cat in G[n]]
    best[cat] = max((sum(count(n, cat, t) == G[n][cat] for n in vals), t) for t in [x / 100 for x in range(10, 91, 5)])[1]
print("thresholds tuned on val answers:", best)
for n, r in R["raw"].items():
    W, H = r["size"]; boxes = collections.defaultdict(list)
    for k, p, x0, y0, x1, y1 in r["dets"]:
        cat = "shower_tub" if k in ("shower", "bathtub") else k
        if p >= best[cat]: boxes[cat].append([round(x0 * 1000 / W, 1), round(y0 * 1000 / H, 1), round(x1 * 1000 / W, 1), round(y1 * 1000 / H, 1)])
    json.dump({"model": "yolo-cubicasa", "thresholds": best, "boxes": boxes}, open(os.path.join(DET, n + ".json"), "w"))
json.dump(best, open(os.path.join(DET, "_thresholds.json"), "w"))
print("rewrote", len(R["raw"]), "detection files")
