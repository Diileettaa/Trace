"""I3 check: WC-to-wall clearances on the school vector sheet, drawn as dimension lines on the sheet (evidence images).
python tools/clearance_evidence.py -> eval/scenes/evidence_wc_clearance_<n>.png + printed distances"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import scene_pdf, evidence
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rel = "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf"
pdf = os.path.join(ROOT, rel)
sc = scene_pdf.scene(pdf, 1, rel_path=rel)
wcs = [o for o in sc["objects"] if o["category"] == "toilet"]
print(len(wcs), "toilets")
for n, o in enumerate(wcs):
    cl = o.get("clearances") or []
    print(n, o["id"], o["room_id"], [(c["dir"], c["distance_m"]) for c in cl])
    if n < 3:
        items = [{"id": "WC", "label": "WC", "box": o["source"]["bbox_pt"]}] + \
                [{"id": c["dir"], "label": f"{c['distance_m']:.2f} m", "line_pt": c["line_pt"]} for c in cl]
        a = {"question": "How far is this WC from the walls?", "value": cl[0]["distance_m"] if cl else None, "unit": "m",
             "confidence": "high", "method": "pdf:symbol-to-wall", "file": pdf, "sources": [{"file": pdf, "page": 1}], "items": items}
        ev = evidence.render(a)
        open(os.path.join(ROOT, f"eval/scenes/evidence_wc_clearance_{n}.png"), "wb").write(ev["zoom_png"] or ev["full_png"])
