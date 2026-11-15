"""W4 gate: CubiCasa5K official model vs our detector on the same CubiCasa plans (not trained on by either model's
fair-split definition). python tools/cubiseg_eval.py eval/cubiseg_in dets.json cubi_gt.json gold.json"""
import sys, os, json, glob, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.detector import fuse, _iou
D, DETS, GT, GOLD = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3])), json.load(open(sys.argv[4]))
CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "models", "detector.json")))
Q = {"toilet": "How many toilet bowls (WC seats) are drawn on this floor plan?",
     "sink": "How many sinks and wash basins (kitchen and bathroom combined; a double-bowl sink counts as one) are drawn on this floor plan?",
     "door": "How many doors are shown on this floor plan? Count doorways fitted with a door; open doorways without a door leaf do not count.",
     "window": "How many windows are shown on this floor plan?"}
SEG = {"toilet": "Toilet", "sink": "Sink", "door": "Door", "window": "Window"}
def ours(png, k):
    split = "test" if png in DETS["r1"]["test"] else "val"
    m = lambda t: [(x[1], x[2:6]) for x in DETS[t][split].get(png, []) if x[0] == k]
    mem = CFG["fuse"].get(k); dd = fuse([m(t) for t in mem]) if mem else m("r1")
    return [b for p, b in dd if p >= CFG["thresholds"][k]]
def theirs(seg, k):
    L = seg["icons"] + seg["openings"]; out = []
    for x in L:
        if x["class"] != SEG[k]: continue
        xs = [p[0] for p in x["polygon"]]; ys = [p[1] for p in x["polygon"]]; out.append([min(xs), min(ys), max(xs), max(ys)])
    return out
def match(g, d, thr=0.3):
    used = set(); tp = 0
    for gb in g:
        best = max(((_iou(gb, b), j) for j, b in enumerate(d) if j not in used), default=(0, None))
        if best[0] >= thr: used.add(best[1]); tp += 1
    return tp
R = {m: {k: collections.Counter() for k in Q} for m in ("ours", "cubicasa5k")}
files = sorted(glob.glob(os.path.join(D, "*.png.cubiseg.json")))
for f in files:
    png = os.path.basename(f)[:-len(".cubiseg.json")]
    if png not in GT: continue
    seg = json.load(open(f))
    for k in Q:
        g = [x[1:] for x in GT[png]["boxes"] if x[0] == k]
        for name, d in (("ours", ours(png, k)), ("cubicasa5k", theirs(seg, k))):
            r = R[name][k]; tp = match(g, d); r["tp"] += tp; r["gt"] += len(g); r["det"] += len(d)
            if Q[k] in GOLD.get(png, {}): r["q"] += 1; r["ok"] += GOLD[png][Q[k]] == len(d)
print(f"# W4: CubiCasa5K official model vs our detector ({len(files)} plans, official val/test plans)\n")
print("| class | model | answer correct | recall | precision |\n|---|---|---|---|---|")
for k in Q:
    for name in ("ours", "cubicasa5k"):
        r = R[name][k]
        print(f"| {k} | {name} | {r['ok']}/{r['q']} | {100*r['tp']/max(1,r['gt']):.0f}% | {100*r['tp']/max(1,r['det']):.0f}% |")
