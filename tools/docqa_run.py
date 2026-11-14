"""Schedule / sheet-text questions (opening_design) end to end.

1) extract (needs pdfplumber; Linux VM or any machine with it):
       python3 tools/docqa_run.py extract            -> eval/_docqa_cache/*.json  (portable, no absolute paths)
2) ask + score (needs only the standard library and GEMINI_API_KEY in the environment; works on Windows):
       python tools/docqa_run.py ask                 -> eval/_docqa_answers.jsonl, prints accuracy
   GEMINI_MODEL defaults to gemini-3.6-flash. The key is read from the environment and never printed or stored.
Scoring = README rules: counts exact, areas within 2%; text answers are shown side by side (not scored)."""
import os, sys, json, re, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from engine import docqa

DATA = os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset"))
CACHE_DIR = os.path.join(ROOT, "eval", "_docqa_cache")
ONLY = None   # optional: python tools/docqa_run.py ask 24,29,34   (re-run only these question numbers)
safe = lambda p: re.sub(r"[^A-Za-z0-9._-]+", "_", p)[-150:] + ".json"

def questions():
    qf = os.path.join(DATA, "questions.jsonl")
    if not os.path.exists(qf): qf = os.path.join(ROOT, "eval", "_docqa_questions.jsonl")
    return [q for q in (json.loads(l) for l in open(qf, encoding="utf-8")) if "/opening_design/" in q["path"]]

def do_extract():
    os.makedirs(CACHE_DIR, exist_ok=True); Q = questions()
    with open(os.path.join(ROOT, "eval", "_docqa_questions.jsonl"), "w", encoding="utf-8") as f:
        for q in Q: f.write(json.dumps(q, ensure_ascii=False) + "\n")
    for p in sorted({q["path"] for q in Q}):
        src = os.path.join(DATA, p)
        if not os.path.exists(src):
            alt = os.path.join(os.path.expanduser("~/work/_od/junction-dataset"), p)
            src = alt if os.path.exists(alt) else src
        d = docqa.extract(src); d["file"] = p
        json.dump(d, open(os.path.join(CACHE_DIR, safe(p)), "w", encoding="utf-8"))
        img = docqa.render_page(src)          # page image for questions that are not in a schedule
        if img: open(os.path.join(CACHE_DIR, safe(p)[:-5] + ".jpg"), "wb").write(img)
        print("cached", p, sum(len(pg["tables"]) for pg in d["pages"]), "tables")

def gemini(prompt):
    key = os.environ.get("GEMINI_API_KEY")
    if not key: sys.exit("set GEMINI_API_KEY in the environment first")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0}}
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r: res = json.loads(r.read())
            txt = res["candidates"][0]["content"]["parts"][0]["text"]
            out = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
            out["_usage"] = res.get("usageMetadata", {}); return out
        except Exception as e:
            err = type(e).__name__ + ": " + str(e)[:120].replace(key, "***")
            time.sleep(3 * (attempt + 1))
    return {"op": "none", "answer": None, "reason": "model call failed: " + err}

def vision(prompt, image_bytes, temperature):
    import base64
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("set GEMINI_API_KEY in the environment first")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": temperature}}
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r: res = json.loads(r.read())
            txt = res["candidates"][0]["content"]["parts"][0]["text"]; out = json.loads(txt[txt.find("{"): txt.rfind("}") + 1])
            return out[0] if isinstance(out, list) else out
        except Exception:
            time.sleep(3 * (attempt + 1))
    return {"found": False, "answer": None}

def correct(q, v):
    if v is None: return False
    if q["type"] == "count":
        n = docqa._num(v); return n is not None and abs(n - float(q["answer"])) < 1e-6
    if q["type"] == "area":
        n, g = docqa._num(v), float(q["answer"]); return n is not None and abs(n - g) <= 0.02 * abs(g)
    return None

def do_ask():
    Q = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "_docqa_questions.jsonl"), encoding="utf-8")]
    out = open(os.path.join(ROOT, "eval", "_docqa_answers.jsonl"), "w", encoding="utf-8")
    ok = n = 0; toks = 0
    for i, q in enumerate(Q):
        if ONLY and str(i + 1) not in ONLY: continue
        doc = json.load(open(os.path.join(CACHE_DIR, safe(q["path"])), encoding="utf-8"))
        resp = gemini(docqa.PROMPT.replace("{q}", q["question"]).replace("{ctx}", docqa.context(doc, q["question"])))
        v, ev, warn = docqa.compute(doc, resp)
        jpg = os.path.join(CACHE_DIR, safe(q["path"])[:-5] + ".jpg")
        if resp.get("op") == "none" and os.path.exists(jpg):       # vision fallback on the rendered sheet
            from engine import scanqa
            r = scanqa.answer(open(jpg, "rb").read(), q["question"], vision); v = r["value"]; warn = r["warnings"]
            resp = {**resp, "op": "vision", "answer": v}
        c = correct(q, v)
        toks += (resp.get("_usage") or {}).get("totalTokenCount", 0)
        if c is not None: n += 1; ok += c
        rec = {"q": q["question"], "type": q["type"], "gold": q["answer"], "value": v, "model_answer": resp.get("answer"),
               "op": resp.get("op"), "table": resp.get("table"), "rows": resp.get("rows"), "warnings": warn, "correct": c}
        out.write(json.dumps(rec, ensure_ascii=False) + "\n"); out.flush()
        print(f"{i+1:2d}/{len(Q)} {'OK ' if c else ('-- ' if c is None else 'XX ')} gold={str(q['answer'])[:28]:28s} got={str(v)[:28]:28s} {q['question'][60:130]}")
    print(f"\nscored (count+area): {ok}/{n} = {100*ok/max(1,n):.1f}%   tokens used: {toks}  (avg {toks//max(1,len(Q))}/question)")

if __name__ == "__main__":
    if len(sys.argv) > 2: ONLY = set(sys.argv[2].split(","))
    {"extract": do_extract, "ask": do_ask}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
