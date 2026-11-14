"""Hard scan test: degraded 'scans' rendered from the vector example sheets, so the answers are known from the
vectors (doors, windows, pipe supports). Compares tiled vs whole-sheet reading.
  python tools/scan_hard_run.py            tiled (default for big scans)
  python tools/scan_hard_run.py single     whole sheet only (old behaviour)"""
import os, sys, json, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
mode = sys.argv[1] if len(sys.argv) > 1 else "tiled"
if mode == "single": os.environ["JUNCTION_TILE_FROM"] = "999999"
from engine.answer import answer_sheet
out = open(os.path.join(ROOT, "eval", "_scan_hard_answers.jsonl"), "a"); ok = 0
qs = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "scan_hard.jsonl"))]
for i, q in enumerate(qs):
    t = time.time(); r = answer_sheet(os.path.join(ROOT, q["path"]), q["question"])
    v = r.get("value"); hit = str(v).strip().lower() == str(q["answer"]).lower()
    ok += hit
    rec = {"mode": mode, "i": i, "q": q["question"][:70], "expected": q["answer"], "got": v, "hit": hit, "method": r.get("method"),
           "readings": (r.get("evidence") or {}).get("readings"), "s": round(time.time() - t, 1)}
    print(json.dumps(rec, ensure_ascii=False)); out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
print(f"{mode}: {ok}/{len(qs)}")
