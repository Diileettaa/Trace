"""Questions about scanned / historic drawings (no vectors, no text layer): a vision model answers, but it must
point at what it counted or read, and it is asked twice.

* counts: one evidence box per counted item; the reported value is the number of boxes, so the boxes are the proof.
* text (titles, places, dates, scales): the model quotes the text it read and boxes it.
* not on the drawing: found=false, value None - never a guess.
* self-consistency: two independent calls (temperature 0 and 0.6). If they disagree the answer is still returned,
  flagged 'uncertain' with both readings, so the UI can say so instead of sounding sure.
call_model(prompt, image_bytes, temperature) -> dict is supplied by the caller (Gemini in tools/scan_eval.py)."""
import re

PROMPT = """You are reading a scanned architectural drawing (it may be old, hand-drawn, in any language).
Answer the question using ONLY what is visible on the sheet. Return JSON only:
{"found": true|false,
 "answer": <a number for counts/years/scales, a short text otherwise, null if not found>,
 "quote": "<for text answers: the exact words as written on the sheet>",
 "evidence": [{"label": "<what this box shows>", "box_2d": [ymin, xmin, ymax, xmax]}],
 "reason": "<one sentence>"}
Rules:
- box_2d uses 0-1000 coordinates of the whole image.
- For a count, give exactly one evidence box per counted item, and "answer" must equal the number of boxes.
  Count only what is drawn or labelled; do not infer hidden items.
- For text you read (title, place, architect, date, scale), box that text and copy it into "quote".
- If the sheet does not show the information, set found=false and answer=null. Never guess.

QUESTION: {q}"""

def _num(v):
    if isinstance(v, (int, float)): return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v or "").replace(",", ""))
    return float(m.group()) if m else None

def normalise(resp, is_count):
    """Count = number of evidence boxes when the model gave boxes; boxes converted to [x0,y0,x1,y1] 0-1000."""
    ev = []
    for e in resp.get("evidence") or []:
        b = e.get("box_2d") if isinstance(e, dict) else None
        if isinstance(b, list) and len(b) == 4 and all(isinstance(v, (int, float)) for v in b):
            ev.append({"label": e.get("label"), "box_norm1000": [b[1], b[0], b[3], b[2]]})
    found = bool(resp.get("found", resp.get("answer") is not None)) and resp.get("answer") is not None
    val = resp.get("answer") if found else None
    if found and is_count and ev and _num(val) is not None and len(ev) != int(_num(val)) and len(ev) > 1:
        val = len(ev)                         # the boxes are the evidence; a count must match them
    return {"found": found, "value": val, "quote": resp.get("quote"), "items": ev, "reason": resp.get("reason")}

def looks_like_count(q):
    return bool(re.search(r"\bhow many\b|\bnumber of\b|montako|wie viele|combien|quanti|hur många|多少|几", q, re.I))

def answer(image_bytes, question, call_model, votes=2):
    is_count = looks_like_count(question)
    runs = [normalise(call_model(PROMPT.replace("{q}", question), image_bytes, t), is_count) for t in (0.0, 0.6)[:votes]]
    a = runs[0]
    same = lambda x, y: (x["value"] is None and y["value"] is None) or (
        _num(x["value"]) is not None and _num(y["value"]) is not None and abs(_num(x["value"]) - _num(y["value"])) < 1e-6) or (
        x["value"] is not None and y["value"] is not None and str(x["value"]).strip().lower() == str(y["value"]).strip().lower())
    agree = len(runs) < 2 or same(runs[0], runs[1])
    warn = [] if agree else [f"uncertain: two readings disagree ({runs[0]['value']!r} vs {runs[1]['value']!r})"]
    if not a["found"]: warn.append("not shown on this drawing")
    return {"value": a["value"], "unit": "count" if is_count else None, "items": a["items"],
            "method": "scan:vlm" + ("" if agree else ":uncertain"), "warnings": warn,
            "evidence": {"quote": a["quote"], "reason": a["reason"], "readings": [r["value"] for r in runs], "agree": agree}}
