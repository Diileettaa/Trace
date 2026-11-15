"""Check the automatic scale on scans (needs GEMINI_API_KEY). The school scan is the vector school sheet re-printed:
its true scale, registered against the vector page, is 25.25 mm/px (eval/scenes/scan_plan_check.md)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import scan_scale, llm
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if not llm.available(): sys.exit("set GEMINI_API_KEY first")
for rel, truth in [("eval/scans_synth/school_L00_scan.jpg", 25.25), ("eval/scans_synth/slab_S100F_scan.jpg", None),
                   ("eval/scans_synth/piping_M101A_scan.jpg", None), ("eval/stoa_samples/school_L00.jpg", None),
                   ("eval/stoa_samples/dorm_A2.jpg", None), ("eval/stoa_samples/slab_S100F.jpg", None)]:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): continue
    W, H = Image.open(p).size; r = scan_scale.read(open(p, "rb").read(), (W, H), llm.vision_json)
    mm = r["m_per_px"] * 1000 if r.get("m_per_px") else None
    err = f"  error {100 * (mm - truth) / truth:+.1f}%" if mm and truth else ""
    print(f"{rel}: ratio {r.get('ratio')} paper {r.get('paper')} -> {mm and round(mm, 2)} mm/px{err}  {r.get('warnings')}")
