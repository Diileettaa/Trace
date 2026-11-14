"""Questions about scanned / historic drawings (no vectors, no text layer): a vision model answers, but it must
point at what it counted or read, and it is asked twice.

* counts: one evidence box per counted item; the reported value is the number of boxes, so the boxes are the proof.
* text (titles, places, dates, scales): the model quotes the text it read and boxes it.
* not on the drawing: found=false, value None - never a guess.
* self-consistency: two independent calls (temperature 0 and 0.6). If they disagree the answer is still returned,
  flagged 'uncertain' with both readings, so the UI can say so instead of sounding sure.
call_model(prompt, image_bytes, temperature) -> dict is supplied by the caller (Gemini in tools/scan_eval.py)."""
import os, re

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

TILE_NOTE = """
This image is ONE TILE (tile {k} of {n}) cut from a larger sheet; neighbouring tiles overlap. Give one evidence box
for every item in THIS tile that the question asks about, including items cut by the tile edge; the code merges the
tiles and removes duplicates. Boxes are in 0-1000 coordinates of THIS tile. If the question is not about counting
things drawn on the sheet, set found=false."""

def _image_size(b):
    from PIL import Image
    import io
    return Image.open(io.BytesIO(b)).size

def tiles(image_bytes, grid, overlap=0.12, max_side=2400):
    """-> [(jpeg bytes, (x0, y0, x1, y1) of the tile in 0-1000 sheet coordinates)]"""
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(image_bytes)).convert("RGB"); W, H = im.size; out = []
    gx, gy = grid
    for j in range(gy):
        for i in range(gx):
            x0 = max(0.0, i / gx - overlap / 2); x1 = min(1.0, (i + 1) / gx + overlap / 2)
            y0 = max(0.0, j / gy - overlap / 2); y1 = min(1.0, (j + 1) / gy + overlap / 2)
            t = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))); t.thumbnail((max_side, max_side))
            buf = io.BytesIO(); t.save(buf, "JPEG", quality=90)
            out.append((buf.getvalue(), (x0 * 1000, y0 * 1000, x1 * 1000, y1 * 1000)))
    return out

def _iou(a, b):
    x0, y0, x1, y1 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]); i = max(0, x1 - x0) * max(0, y1 - y0)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i; return i / u if u > 0 else 0

def merge_boxes(items, thr=0.3):
    """Duplicates from overlapping tiles: same item if IoU >= thr or one box's centre lies in the other."""
    out = []
    inside = lambda c, b: b[0] <= c[0] <= b[2] and b[1] <= c[1] <= b[3]
    for it in sorted(items, key=lambda e: -((e["box_norm1000"][2] - e["box_norm1000"][0]) * (e["box_norm1000"][3] - e["box_norm1000"][1]))):
        b = it["box_norm1000"]; c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
        if any(_iou(b, o["box_norm1000"]) >= thr or inside(c, o["box_norm1000"]) for o in out): continue
        out.append(it)
    return out

def count_tiled(image_bytes, question, call_model, grid):
    from concurrent.futures import ThreadPoolExecutor
    items, n = [], grid[0] * grid[1]; T = tiles(image_bytes, grid)
    ask = lambda kt: normalise(call_model(PROMPT.replace("{q}", question) + TILE_NOTE.replace("{k}", str(kt[0] + 1)).replace("{n}", str(n)), kt[1][0], 0.0), True)
    with ThreadPoolExecutor(max_workers=min(9, n)) as ex: res = list(ex.map(ask, enumerate(T)))   # tiles in parallel
    for k, ((tb, (x0, y0, x1, y1)), r) in enumerate(zip(T, res)):
        for e in r["items"]:
            b = e["box_norm1000"]; sx, sy = (x1 - x0) / 1000, (y1 - y0) / 1000
            items.append({"label": e.get("label"), "box_norm1000": [round(x0 + b[0] * sx, 1), round(y0 + b[1] * sy, 1),
                                                                     round(x0 + b[2] * sx, 1), round(y0 + b[3] * sy, 1)], "tile": k})
    return merge_boxes(items)

def answer(image_bytes, question, call_model, votes=2, tile_from=int(os.environ.get("JUNCTION_TILE_FROM", 2600))):
    """Large scans + count questions: the whole sheet is read once (legend, context) and counted again tile by tile
    at full resolution, because small symbols vanish when a big sheet is shrunk for the model. The tiled count is the
    answer; the whole-sheet count is the second reading."""
    is_count = looks_like_count(question)
    try: W, H = _image_size(image_bytes)
    except Exception: W = H = 0
    if is_count and max(W, H) > tile_from:
        grid = (3, 3) if max(W, H) > 5000 else (2, 2)
        if W > 1.6 * H: grid = (grid[0] + 1, grid[1])
        whole = normalise(call_model(PROMPT.replace("{q}", question), _shrink(image_bytes), 0.0), True)
        if not whole["found"]:
            return {"value": None, "unit": "count", "items": [], "method": "scan:vlm", "warnings": ["not shown on this drawing"],
                    "evidence": {"reason": whole["reason"], "readings": [None]}}
        items = count_tiled(image_bytes, question, call_model, grid)
        for i, it in enumerate(items): it["id"] = i
        a, b = len(items), _num(whole["value"])
        agree = b is not None and abs(a - b) <= max(1, 0.1 * a)
        warn = [] if agree else [f"uncertain: tile-by-tile count {a}, whole-sheet count {whole['value']}"]
        return {"value": a, "unit": "count", "items": items, "method": f"scan:vlm:tiled{grid[0]}x{grid[1]}" + ("" if agree else ":uncertain"),
                "warnings": warn, "evidence": {"reason": whole["reason"], "readings": [a, whole["value"]], "agree": agree,
                                               "whole_sheet_items": whole["items"]}}
    return answer_single(_shrink(image_bytes), question, call_model, votes)

def _shrink(image_bytes, max_side=2400):
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(image_bytes))
        if max(im.size) <= max_side: return image_bytes
        im = im.convert("RGB"); im.thumbnail((max_side, max_side)); buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
        return buf.getvalue()
    except Exception: return image_bytes

def answer_single(image_bytes, question, call_model, votes=2):
    is_count = looks_like_count(question)
    runs = [normalise(call_model(PROMPT.replace("{q}", question), image_bytes, t), is_count) for t in (0.0, 0.6)[:votes]]
    a = runs[0]
    same = lambda x, y: (x["value"] is None and y["value"] is None) or (
        _num(x["value"]) is not None and _num(y["value"]) is not None and abs(_num(x["value"]) - _num(y["value"])) < 1e-6) or (
        x["value"] is not None and y["value"] is not None and str(x["value"]).strip().lower() == str(y["value"]).strip().lower())
    agree = len(runs) < 2 or same(runs[0], runs[1])
    warn = [] if agree else [f"uncertain: two readings disagree ({runs[0]['value']!r} vs {runs[1]['value']!r})"]
    if not a["found"]: warn.append("not shown on this drawing")
    for i, it in enumerate(a["items"]): it["id"] = i
    return {"value": a["value"], "unit": "count" if is_count else None, "items": a["items"],
            "method": "scan:vlm" + ("" if agree else ":uncertain"), "warnings": warn,
            "evidence": {"quote": a["quote"], "reason": a["reason"], "readings": [r["value"] for r in runs], "agree": agree}}
