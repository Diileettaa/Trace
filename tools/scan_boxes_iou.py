"""Per-class box quality of the live detector on CubiCasa (offline, from cached raw detections).
python tools/scan_boxes_iou.py dets.json cubi_gt.json fair.json > eval/scan_boxes_iou.md
dets.json: {model: {split: {png: [[cls, score, x0, y0, x1, y1] (0-1000)]}}} (train/r2_eval.py output)
cubi_gt.json: SVG ground truth (tools/cubi_diag/gt.py). GT is used for measuring only, never to answer."""
import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.detector import fuse, suppress_nested, _iou, _cover

D = json.load(open(sys.argv[1])); GT = json.load(open(sys.argv[2])); FAIR = set(json.load(open(sys.argv[3])))
CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "models", "detector.json")))
CAT = {"shower": "shower_tub", "bathtub": "shower_tub"}
CLASSES = ["door", "window", "toilet", "shower_tub"]
GOLD = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else {}
QG = {"door": "How many doors are shown on this floor plan? Count doorways fitted with a door; open doorways without a door leaf do not count.",
      "window": "How many windows are shown on this floor plan?", "toilet": "How many toilet bowls (WC seats) are drawn on this floor plan?",
      "shower_tub": "How many showers and bathtubs are drawn on this floor plan in total?"}

def dets(png, nested):
    def m(tag, k): return [(x[1], x[2:6]) for x in D[tag]["test"].get(png, []) if x[0] == k]
    B = collections.defaultdict(list); S = collections.defaultdict(list)
    for k in CFG["thresholds"]:
        mem = CFG["fuse"].get(k); dd = fuse([m(t, k) for t in mem]) if mem else m("r1", k)
        for p, b in dd:
            if p >= CFG["thresholds"][k]: B[CAT.get(k, k)].append(b); S[CAT.get(k, k)].append(p)
    if nested:
        for c in CFG.get("suppress_nested", []):
            if c in B: B[c], S[c] = suppress_nested(B[c], S[c])
    return B

def evaluate(pngs, nested, thr=0.5):
    R = {c: collections.Counter() for c in CLASSES}; IO = collections.defaultdict(list)
    for png in pngs:
        B = dets(png, nested)
        for c in CLASSES:
            g = [x[1:] for x in GT[png]["boxes"] if CAT.get(x[0], x[0]) == c]; d = B.get(c, [])
            R[c]["plans"] += 1; R[c]["exact"] += len(g) == len(d)
            if QG[c] in GOLD.get(png, {}): R[c]["qa"] += 1; R[c]["qa_ok"] += GOLD[png][QG[c]] == len(d)
            R[c]["GT"] += len(g); R[c]["DET"] += len(d)
            pairs = sorted(((_iou(a, b), i, j) for i, a in enumerate(g) for j, b in enumerate(d)), reverse=True)
            ug, ud = set(), set()
            for v, i, j in pairs:
                if v < thr: break
                if i in ug or j in ud: continue
                ug.add(i); ud.add(j); IO[c].append(v)
            R[c]["TP"] += len(ug)
            for i, a in enumerate(g):
                if i not in ug: R[c]["FN_merged" if any(_cover(b, a) > 0.6 for b in d) else "FN_missed"] += 1
            for j, b in enumerate(d):
                if j not in ud: R[c]["FP_partial" if any(_cover(a, b) > 0.6 for a in g) else "FP_none"] += 1
    return R, IO

pngs = sorted(p for p in D["r1"]["test"] if p in GT)
fair = [p for p in pngs if p in FAIR]
print("# Scan box quality: live detector on CubiCasa test plans\n")
print(f"Detector = models/detector.json (fused ensemble). Match = IoU >= 0.5, one-to-one. {len(pngs)} test plans; "
      f"fair subset (official val/test plans no model trained on) = {len(fair)}.\n")
for name, P in (("all test plans", pngs), ("fair subset", fair)):
    for nested in (False, True):
        R, IO = evaluate(P, nested)
        print(f"## {name}, nested suppression {'ON' if nested else 'off'}\n")
        print("| class | answer correct (dataset gold) | box count = SVG count | recall | precision | mean IoU (matched) | missed | merged into bigger box | false box | partial box |")
        print("|---|---|---|---|---|---|---|---|---|---|")
        for c in CLASSES:
            r = R[c]; tp = r["TP"]
            print(f"| {c} | {100*r['qa_ok']/max(1,r['qa']):.1f}% (n={r['qa']}) | {100*r['exact']/r['plans']:.1f}% | {100*tp/max(1,r['GT']):.1f}% | {100*tp/max(1,r['DET']):.1f}% | "
                  f"{sum(IO[c])/max(1,len(IO[c])):.3f} | {r['FN_missed']} | {r['FN_merged']} | {r['FP_none']} | {r['FP_partial']} |")
        print()
