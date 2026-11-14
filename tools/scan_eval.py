"""Evaluate engine/scanqa.py on our hand-checked set of historic scans (eval/scan_set.jsonl, 45 questions,
12 sheets from habs / wikimedia / finna / europeana, incl. 3 questions whose answer is NOT on the sheet).
Standard library only; runs on Windows:   python tools\\scan_eval.py
Needs GEMINI_API_KEY in the environment (never printed). Images: eval/scans/_q/*.jpg (prepared at 2400 px).
Reports: single-call accuracy, accuracy when both readings agree, how often they agree, and correct declines."""
import os, sys, json, base64, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from engine import scanqa

def gemini(prompt, image_bytes, temperature):
    key = os.environ.get("GEMINI_API_KEY") or sys.exit("set GEMINI_API_KEY in the environment first")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {"contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(image_bytes).decode()}}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": temperature}}
    err = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r: res = json.loads(r.read())
            txt = res["candidates"][0]["content"]["parts"][0]["text"]
            out = json.loads(txt[txt.find("{"): txt.rfind("}") + 1]) if "{" in txt else {}
            if isinstance(out, list): out = out[0] if out else {}
            gemini.tokens += (res.get("usageMetadata") or {}).get("totalTokenCount", 0); return out
        except Exception as e:
            err = (type(e).__name__ + ": " + str(e)[:120]).replace(key, "***"); time.sleep(3 * (attempt + 1))
    return {"found": False, "answer": None, "reason": "model call failed: " + err}
gemini.tokens = 0

def ok(q, v):
    if q["type"] == "none": return v is None
    if v is None: return False
    if q["type"] == "count":
        n = scanqa._num(v); return n is not None and abs(n - q["answer"]) < 1e-6
    return any(a in str(v).lower() for a in q["accept"])

def main():
    S = [json.loads(l) for l in open(os.path.join(ROOT, "eval", "scan_set.jsonl"), encoding="utf-8")]
    out = open(os.path.join(ROOT, "eval", "_scan_answers.jsonl"), "w", encoding="utf-8"); stats = {"n": 0, "ok": 0, "agree": 0, "agree_ok": 0}
    for i, q in enumerate(S):
        img = open(os.path.join(ROOT, "eval", "scans", "_q", q["image"]), "rb").read()
        r = scanqa.answer(img, q["question"], gemini)
        c = ok(q, r["value"]); ag = r["evidence"]["agree"]
        stats["n"] += 1; stats["ok"] += c; stats["agree"] += ag; stats["agree_ok"] += (ag and c)
        out.write(json.dumps({"id": q["id"], "q": q["question"], "expected": q.get("answer", q.get("accept")), "type": q["type"],
                              "value": r["value"], "readings": r["evidence"]["readings"], "quote": r["evidence"]["quote"],
                              "n_boxes": len(r["items"]), "correct": c, "agree": ag}, ensure_ascii=False) + "\n"); out.flush()
        print(f"{q['id']} {'OK' if c else 'XX'} {'  ' if ag else '?'} exp={str(q.get('answer', q.get('accept')))[:22]:22s} got={str(r['value'])[:30]:30s} readings={r['evidence']['readings']}")
    n = stats["n"]
    print(f"\nsingle answer correct: {stats['ok']}/{n} = {100*stats['ok']/n:.1f}%")
    print(f"both readings agree:   {stats['agree']}/{n} = {100*stats['agree']/n:.1f}%;  correct when they agree: "
          f"{stats['agree_ok']}/{max(1,stats['agree'])} = {100*stats['agree_ok']/max(1,stats['agree']):.1f}%")
    print(f"tokens used: {gemini.tokens} (avg {gemini.tokens//max(1,n)} per question, 2 calls each)")

if __name__ == "__main__":
    main()
