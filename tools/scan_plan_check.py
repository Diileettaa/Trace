"""V2: walls + rooms traced from the school *scan* vs rooms traced from the school *vector PDF* (same drawing).
python tools/scan_plan_check.py  -> eval/scenes/scan_plan_check.md + .png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import scan_plan, sheet
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = os.path.join(ROOT, "eval/scans_synth/school_L00_scan.jpg")
PDF = os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf")
f = sheet.load(PDF, 0); vec = f.get("rooms") or []
if vec and "polygon" not in vec[0]: vec = sheet.rooms(PDF, 0, f)
r = scan_plan.analyse(open(SCAN, "rb").read())
W, H = r["size"]; pw, ph = f["size"]
mpp_scan = 0.594 * 200 / max(W, H)          # printed 1:200 on an A2 sheet (title block): metres per scan pixel
sx, sy = W / pw, H / ph
def inside(p, poly):
    x, y = p; c = False
    for i in range(len(poly)):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: c = not c
    return c
# the synthetic scan is a re-printed page (margins / scale differ slightly): register it to the vector page from the
# room centres first (a least-squares scale + shift), so this check measures tracing, not the scale lookup
import numpy as np
pairs = []
for v in vec:
    lb = v.get("label_box") or v["box"]; p = ((lb[0] + lb[2]) / 2 * sx, (lb[1] + lb[3]) / 2 * sy)
    hit = next((s for s in r["rooms"] if inside(p, s["polygon"])), None)
    if hit and 0.7 < hit["area_px"] * mpp_scan ** 2 / v["area_m2"] < 1.3:
        P = np.array(v["polygon"]); c = P.mean(0); pairs.append((c, np.array(hit["polygon"]).mean(0)))
if len(pairs) >= 4:
    A = np.array([a for a, _ in pairs]); B = np.array([b for _, b in pairs]); Ac, Bc = A - A.mean(0), B - B.mean(0)
    s_fit = float(np.sqrt((Bc ** 2).sum() / (Ac ** 2).sum()))      # px per PDF point
    mpp_scan = f["scale"]["m_per_pt"] / s_fit; sx = sy = s_fit; off = B.mean(0) - s_fit * A.mean(0)
else: off = np.zeros(2)
rows = []; ok = 0; n = 0
for v in vec:
    lb = v.get("label_box") or v["box"]; p = ((lb[0] + lb[2]) / 2 * sx + off[0], (lb[1] + lb[3]) / 2 * sy + off[1])
    hit = next((s for s in r["rooms"] if inside(p, s["polygon"])), None)
    a_s = hit["area_px"] * mpp_scan ** 2 if hit else None; n += 1
    err = abs(a_s - v["area_m2"]) / v["area_m2"] if hit else None; ok += err is not None and err <= 0.10
    rows.append((v["name"], v["area_m2"], round(a_s, 2) if a_s else None, f"{100*err:.1f}%" if err is not None else "not found"))
out = os.path.join(ROOT, "eval/scenes/scan_plan_check")
with open(out + ".md", "w") as F:
    F.write(f"# V2: rooms traced from the school scan vs the vector PDF\n\nscan deskew {r['angle_deg']:.2f} deg, wall ~{r['wall_px']:.1f} px, "
            f"{len(r['walls'])} wall runs, {len(r['rooms'])} room regions; scale {mpp_scan*1000:.2f} mm/px (registered to the vector page from {len(pairs)} room centres)\n\n"
            f"**{ok}/{n} vector rooms matched within 10 % area**\n\n| room | vector m2 | scan m2 | error |\n|---|---|---|---|\n")
    for row in rows: F.write("| " + " | ".join(str(x) for x in row) + " |\n")
try:
    from PIL import Image, ImageDraw
    im = Image.open(SCAN).convert("RGB"); d = ImageDraw.Draw(im)
    for s in r["rooms"]: d.polygon([tuple(p) for p in s["polygon"]], outline=(0, 160, 0), width=4)
    for w in r["walls"]: d.line([tuple(p) for p in w["points"]], fill=(220, 0, 0), width=5)
    im.thumbnail((2400, 2400)); im.save(out + ".png")
except Exception as e: print("overlay", e)
print(open(out + ".md").read()[:600])
