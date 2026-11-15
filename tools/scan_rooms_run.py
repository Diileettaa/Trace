"""I1 with the real vision model (needs GEMINI_API_KEY): measure named rooms on scans end to end and save the evidence
image for each answer (eval/scenes/evidence_<n>.png). Expected values come from the vector sheet of the same school."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.answer import answer_sheet
from engine import review, evidence
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QS = [("eval/scans_synth/school_L00_scan.jpg", "What is the floor area of the Kitchen?", "34.04 m2 (vector)"),
      ("eval/scans_synth/school_L00_scan.jpg", "What is the floor area of the Fitness Room?", "25.32 m2 (vector)"),
      ("eval/scans_synth/school_L00_scan.jpg", "What is the baseboard length in the Meeting Room?", "14.79 m (vector)"),
      ("eval/stoa_samples/school_L00.jpg", "What is the floor area of the Kitchen?", "34.04 m2 (vector)"),
      ("eval/stoa_samples/school_L00.jpg", "What is the baseboard length in the Library?", "Library shares a room with a Group Room on the vector sheet")]
for i, (rel, q, exp) in enumerate(QS):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): continue
    r = answer_sheet(p, q); a = review.register(r, p, q); ev = evidence.render(a)
    png = ev.get("zoom_png") or ev.get("full_png")
    if png: open(os.path.join(ROOT, f"eval/scenes/evidence_scanroom_{i}.png"), "wb").write(png)
    print(json.dumps({"i": i, "sheet": rel, "q": q, "expected": exp, "got": r.get("value"), "unit": r.get("unit"),
                      "method": r.get("method"), "confidence": r.get("confidence"), "warnings": r.get("warnings")}, ensure_ascii=False))
