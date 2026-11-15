"""I1 offline check: measure named rooms on the school scan with room labels taken from the vector sheet (mapped onto
the scan) instead of the vision model, so this checks outline + scale + baseboard logic; the label reading itself is
checked with tools/scan_rooms_run.py (needs GEMINI_API_KEY). Scale: printed 1:200 on A2 (what the model read)."""
import sys, os, json, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import scan_plan, scan_rooms, sheet
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "eval/scans_synth/school_L00_scan.jpg")
PDF = os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf")
img = open(SCAN, "rb").read(); A = scan_plan.analyse(img); W, H = A["size"]
f = sheet.load(PDF, 0); vec = f.get("rooms") or []
if vec and "polygon" not in vec[0]: vec = sheet.rooms(PDF, 0, f)
pw, ph = f["size"]
# same registration as scan_plan_check (re-printed page): fit scale + shift from matched room centres
import numpy as np
def inside(p, poly): return scan_rooms._inside(p, poly)
sx = W / pw; pairs = []
for v in vec:
    lb = v.get("label_box") or v["box"]; p = ((lb[0] + lb[2]) / 2 * sx, (lb[1] + lb[3]) / 2 * sx)
    hit = next((r for r in A["rooms"] if inside(p, r["polygon"])), None)
    if hit: pairs.append((np.array(v["polygon"]).mean(0), np.array(hit["polygon"]).mean(0)))
Aa = np.array([a for a, _ in pairs]); Bb = np.array([b for _, b in pairs]); s_fit = float(np.sqrt(((Bb - Bb.mean(0)) ** 2).sum() / ((Aa - Aa.mean(0)) ** 2).sum())); off = Bb.mean(0) - s_fit * Aa.mean(0)
labels = []
for v in vec:
    lb = v.get("label_box") or v["box"]; x, y = ((lb[0] + lb[2]) / 2) * s_fit + off[0], ((lb[1] + lb[3]) / 2) * s_fit + off[1]
    for t in v["name"].split(" + "): labels.append({"text": t, "point": [x * 1000 / W, y * 1000 / H]})
fake = lambda prompt, img_b, t=0.0: {"ratio": 200, "paper": "A2", "full_sheet": True}
names = collections.Counter(l["text"] for l in labels)
rows = []; ok_a = ok_b = n = 0
for v in vec:
    if " + " in v["name"] or names[v["name"]] != 1: continue
    q = f"What is the floor area of the {v['name']}?"
    r = scan_rooms.measure(img, q, fake, analysis=A, label_list=labels)
    qb = f"What is the baseboard length in the {v['name']}?"
    rb = scan_rooms.measure(img, qb, fake, analysis=A, label_list=labels)
    a, b = (r or {}).get("value"), (rb or {}).get("value")
    ea = abs(a - v["area_m2"]) / v["area_m2"] if a else None; eb = abs(b - v["baseboard_m"]) / v["baseboard_m"] if b else None
    n += 1; ok_a += ea is not None and ea <= 0.10; ok_b += eb is not None and eb <= 0.10
    rows.append((v["name"], v["area_m2"], a, f"{100*ea:.1f}%" if ea is not None else (r or {}).get("method"), v["baseboard_m"], b, f"{100*eb:.1f}%" if eb is not None else "-"))
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "eval/scenes/scan_rooms_check.md")
with open(out, "w") as F:
    F.write("# I1 offline: named rooms measured on the school scan (labels from the vector sheet, scale 1:200 on A2)\n\n")
    F.write(f"**area within 10 %: {ok_a}/{n} uniquely named rooms; baseboard within 10 %: {ok_b}/{n}**\n\n")
    F.write("| room | vector m2 | scan m2 | error | vector baseboard m | scan baseboard m | error |\n|---|---|---|---|---|---|---|\n")
    for r in rows: F.write("| " + " | ".join(str(x) for x in r) + " |\n")
print(open(out).read())
