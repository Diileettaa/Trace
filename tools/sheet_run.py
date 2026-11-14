"""Run eval/sheet_set.jsonl (the tricky-question examples Stoa sent: piping, slab, school plan, dorm) through
answer_sheet with the real model. Needs GEMINI_API_KEY.  python tools/sheet_run.py [index ...]"""
import os, sys, json, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from engine.answer import answer_sheet
qs = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "sheet_set.jsonl"))]
pick = [int(a) for a in sys.argv[1:]] or range(len(qs))
out = open(os.path.join(ROOT, "eval", "_sheet_answers.jsonl"), "a")
for i in pick:
    q = qs[i]; t = time.time()
    r = answer_sheet(os.path.join(ROOT, q["path"]), q["question"])
    rec = {"i": i, "q": q["question"], "expected": q["answer"], "got": r.get("value"), "unit": r.get("unit"),
           "method": r.get("method"), "warnings": r.get("warnings"), "n_items": len(r.get("items") or []),
           "rule": (r.get("evidence") or {}).get("rule"), "s": round(time.time() - t, 1)}
    print(json.dumps(rec, ensure_ascii=False)); out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
