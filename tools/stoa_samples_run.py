"""Run the Stoa example sheets (eval/stoa_samples/*.jpg, not in git, never used for training or tuning) through
answer_sheet and write eval/stoa_samples_result.md.   python tools/stoa_samples_run.py [index ...]"""
import os, sys, json, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from engine.answer import answer_sheet
qs = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "stoa_samples_questions.jsonl"))]
pick = [int(a) for a in sys.argv[1:]]
rows = []
for i, q in enumerate(qs):
    if pick and i not in pick: continue
    t = time.time(); r = answer_sheet(os.path.join(ROOT, q["path"]), q["question"])
    rows.append({"i": i, "sheet": os.path.basename(q["path"]), "q": q["question"], "expected": q["expected"],
                 "got": r.get("value"), "unit": r.get("unit"), "method": r.get("method"), "n_items": len(r.get("items") or []),
                 "warnings": "; ".join(r.get("warnings") or []), "s": round(time.time() - t, 1)})
    print(json.dumps(rows[-1], ensure_ascii=False))
md = ["# Stoa example sheets: engine results", "", "Run: `python tools/stoa_samples_run.py` (needs GEMINI_API_KEY). Sheets are low-resolution JPEGs; not used for tuning.", "",
      "| # | sheet | question | expected (where known) | answer | method | evidence boxes | warnings | s |", "|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    md.append(f"| {r['i']} | {r['sheet']} | {r['q']} | {r['expected']} | {r['got']} {r['unit'] or ''} | `{r['method']}` | {r['n_items']} | {r['warnings']} | {r['s']} |")
open(os.path.join(ROOT, "eval", "stoa_samples_result.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
print("wrote eval/stoa_samples_result.md")
