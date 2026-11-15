"""Sports Complex door questions through the engine (needs GEMINI_API_KEY and the dataset's opening_design folder).
python tools/sports_complex_run.py <path to junction-dataset> -> answers + eval/scenes/evidence_xsc_<n>.png"""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.answer import answer_sheet
from engine import review, evidence
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DS = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/work/junction-dataset")
B = os.path.join(DS, "data/opening_design/Sports_Complex")
QS = [("Transfer/_Archive/20150922 - site dimensions/20150922 - XSC - A-100.A - SITE PLAN.pdf", "How many doors are on this floor?",
       "site plan: expect a site-plan warning, not a door count"),
      ("Models/2D/Sports Complex - Sheet - A-101 - First Floor Plan.pdf", "How many doors are on this floor?", "~38 (door schedule)"),
      ("Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf",
       "On sheet A-801 of the Xcel Sports Complex drawings, how many doors (door numbers) are listed in the door schedule?", "38 (dataset answer)")]
for i, (rel, q, exp) in enumerate(QS):
    p = os.path.join(B, rel)
    if not os.path.exists(p): print("missing", p); continue
    t = time.time(); r = answer_sheet(p, q); a = review.register(r, p, q); ev = evidence.render(a)
    png = ev.get("zoom_png") or ev.get("full_png")
    if png: open(os.path.join(ROOT, f"eval/scenes/evidence_xsc_{i}.png"), "wb").write(png)
    print(json.dumps({"sheet": rel[-60:], "q": q, "expected": exp, "got": r.get("value"), "method": r.get("method"),
                      "confidence": r.get("confidence"), "warnings": (r.get("warnings") or [])[:3], "items": len(r.get("items") or []),
                      "s": round(time.time() - t, 1)}, ensure_ascii=False))
