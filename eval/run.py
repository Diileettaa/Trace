"""Score the engine against questions.jsonl using the README rules:
counts exact; area/length/volume within 2%; text not scored here.
usage: python eval/run.py [--source swiss_dwellings] [--split dev|test|all] [--limit N]"""
import sys, os, json, argparse, hashlib, collections, time, traceback
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.answer import answer, DATA

def split_of(path):  # split by drawing, not by question: 80% dev / 20% test, stable
    return "test" if int(hashlib.md5(path.encode()).hexdigest(), 16) % 5 == 0 else "dev"

def correct(q, pred):
    if pred is None: return False
    try: pred = float(pred)
    except (TypeError, ValueError): return False
    if q["type"] == "count": return round(pred) == round(float(q["answer"])) and abs(pred - round(pred)) < 1e-6
    if q["type"] in ("area", "length", "volume"):
        g = float(q["answer"]); return abs(pred - g) <= 0.02 * abs(g) + 1e-9
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source"); ap.add_argument("--split", default="all"); ap.add_argument("--limit", type=int)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "results"))
    ap.add_argument("--resume", help="jsonl state file: skip questions already scored there, append new ones")
    ap.add_argument("--budget", type=float, help="stop after this many seconds (use with --resume, rerun to continue)")
    a = ap.parse_args()
    Q = [json.loads(l) for l in open(os.path.join(DATA, "questions.jsonl"), encoding="utf-8")]
    Q = [q for q in Q if q["type"] != "text"]
    if a.source: Q = [q for q in Q if f"/{a.source}/" in q["path"]]
    if a.split != "all": Q = [q for q in Q if split_of(q["path"]) == a.split]
    if a.limit: Q = Q[:a.limit]
    os.makedirs(a.out, exist_ok=True)
    stats = collections.defaultdict(lambda: [0, 0]); fails = []; t0 = time.time()
    conf = collections.defaultdict(lambda: [0, 0])
    done = {}
    if a.resume and os.path.exists(a.resume):
        for l in open(a.resume, encoding="utf-8"):
            x = json.loads(l); done[(x["path"], x["question"])] = x
    st = open(a.resume, "a", encoding="utf-8") if a.resume else None
    for q in Q:
        if (q["path"], q["question"]) in done:
            r = done[(q["path"], q["question"])]
        else:
            if a.budget and time.time() - t0 > a.budget:
                print(f"partial: {len(done)}/{len(Q)} scored, rerun to continue"); return
            try: r = answer(q["path"], q["question"])
            except Exception as e: r = {"value": None, "method": "error", "warnings": [repr(e)]}
            r = {"path": q["path"], "question": q["question"], "value": r.get("value"), "method": r.get("method"),
                 "warnings": r.get("warnings"), "confidence": r.get("confidence")}
            done[(q["path"], q["question"])] = r
            if st: st.write(json.dumps(r, ensure_ascii=False) + "\n"); st.flush()
        ok = correct(q, r["value"]); key = (q["path"].split("/")[1], r.get("method", "?"))
        conf[(r.get("confidence") or "?")][0] += ok; conf[(r.get("confidence") or "?")][1] += 1
        stats[key][0] += ok; stats[key][1] += 1
        if not ok: fails.append({**q, "pred": r["value"], "method": r.get("method"), "warnings": r.get("warnings")})
    tot_ok = sum(v[0] for v in stats.values()); tot = sum(v[1] for v in stats.values())
    lines = [f"overall {tot_ok}/{tot} = {100*tot_ok/max(tot,1):.2f}%  ({time.time()-t0:.0f}s)"]
    for (src, m), (o, n) in sorted(stats.items(), key=lambda x: -x[1][1]):
        lines.append(f"{src:16s} {m:28s} {o:6d}/{n:<6d} {100*o/n:6.2f}%")
    lines.append("by confidence: " + ", ".join(f"{k} {o}/{n} = {100*o/max(n,1):.1f}%" for k, (o, n) in sorted(conf.items())))
    print("\n".join(lines))
    tag = f"{a.source or 'all'}_{a.split}"
    open(os.path.join(a.out, f"score_{tag}.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    with open(os.path.join(a.out, f"fails_{tag}.jsonl"), "w", encoding="utf-8") as f:
        for x in fails: f.write(json.dumps(x, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
