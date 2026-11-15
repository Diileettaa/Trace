"""V0 check: answer a few questions offline-safe (no API needed for vector counts / IFC) and write evidence images.
python tools/evidence_check.py  -> eval/evidence/*.png + index.md"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import sheet, review, evidence, scanqa
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, "eval", "evidence"); os.makedirs(OUT, exist_ok=True)
SCHOOL = os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf")
PIPE = os.path.join(ROOT, "eval/sheets/us_aw_078-24-28_march_2020_p096.pdf")
cases = []
# vector: doors / windows / rooms computed from facts (op chosen by hand here, as the model would)
f = sheet.load(SCHOOL, 0)
for q, r in [("How many doors are shown on this floor plan?", {"op": "count_doors"}),
             ("How many windows are shown on this floor plan?", {"op": "count_windows"})]:
    v, unit, items, warn = sheet.compute(f, r)
    cases.append(({"value": v, "unit": unit, "items": items, "method": f"sheet:{r['op']}", "confidence": "high",
                   "sources": [{"file": SCHOOL, "page": 1}]}, SCHOOL, q))
rooms = [x for x in (f.get("rooms") or []) if "polygon" in x] or sheet.rooms(SCHOOL, 0, f)
k = next(x for x in rooms if x["name"] == "Kitchen")
cases.append(({"value": k["area_m2"], "unit": "m2", "items": [{"label": "Kitchen", "polygon": k["polygon"]}], "method": "sheet:rooms",
               "confidence": "high", "sources": [{"file": SCHOOL, "page": 1}]}, SCHOOL, "What is the floor area of the Kitchen?"))
if os.path.exists(PIPE):
    fp = sheet.load(PIPE, 0); v, unit, items, warn = sheet.compute(fp, {"op": "count_marks", "group": "m0"} if fp.get("filled_marks") else {"op": "count_tags"})
    cases.append(({"value": v, "unit": unit, "items": items, "method": "sheet:count_marks", "confidence": "high",
                   "sources": [{"file": PIPE, "page": 1}]}, PIPE, "How many pipe supports (large filled dots) are shown?"))
idx = ["# Evidence images (V0)\n", "| question | answer | items | full | zoom |", "|---|---|---|---|---|"]
for n, (a, file, q) in enumerate(cases):
    a = review.register(a, file, q); ev = evidence.render(a)
    for view in ("full", "zoom"):
        png = ev[f"{view}_png"]
        if png: open(os.path.join(OUT, f"case{n}_{view}.png"), "wb").write(png)
    idx.append(f"| {q} | {a['value']} {a.get('unit') or ''} | {len(ev['locations'])} | case{n}_full.png | case{n}_zoom.png |")
    print(q, a["value"], len(ev["locations"]), ev["locations"][:1], ev["warnings"])
open(os.path.join(OUT, "index.md"), "w").write("\n".join(idx) + "\n")
