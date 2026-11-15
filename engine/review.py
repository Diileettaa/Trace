"""Interactive review of answers: the user sees every counted item as a box on the drawing and can fix the count
by removing wrong boxes or adding missed ones; areas and lengths can be measured by clicking on the drawing after a
one-line scale calibration. Every answer is stored, every correction is logged (corrections.jsonl), so the UI shows
"model said 41, reviewed by Xinran: 44" and the corrections can later serve as training / evaluation data.

  register(answer, file, question)            -> answer + answer_id, item ids, alternatives
  review(answer_id, remove=[ids], add=[boxes], choose=index, user=..)  -> updated answer
  calibrate(file, p1, p2, length_m)           -> metres per drawing unit for that file (and page)
  measure(file, points, kind="area"|"length") -> m2 / m from clicked points
Coordinates: whatever the answer's items use - 'box' (PDF points, vector sheets) or 'box_norm1000' (images:
0-1000 of width and height). For measuring on images give the image size so x and y are scaled correctly."""
import os, json, time, uuid, math

ROOT = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "review")

def _p(*a):
    os.makedirs(ROOT, exist_ok=True); return os.path.join(ROOT, *a)

def _save(a): json.dump(a, open(_p(f"{a['answer_id']}.json"), "w"), ensure_ascii=False)

def get(answer_id):
    p = _p(f"{answer_id}.json")
    return json.load(open(p)) if os.path.exists(p) else None

def alternatives(a):
    """Readings the user may prefer, e.g. door sets vs door leaves, tile-by-tile vs whole-sheet count."""
    ev = a.get("evidence") or {}; alt = list(a.get("alternatives") or [])
    rd = ev.get("readings") or []
    if len(rd) >= 2 and len({str(x) for x in rd}) > 1 and not alt:
        names = (["tile-by-tile reading", "whole-sheet reading", "tile-by-tile reading, second grid"] if "tiled" in str(a.get("method"))
                 else ["first reading", "second reading", "third reading"])
        alt = [{"label": n, "value": v} for n, v in zip(names, rd)]
    return alt

def register(answer, file, question):
    a = dict(answer); a["answer_id"] = uuid.uuid4().hex[:12]
    a["file"] = file; a["question"] = question; a["created"] = time.time()
    a["model_value"] = a.get("value")
    for i, it in enumerate(a.get("items") or []): it.setdefault("id", i)
    a["alternatives"] = alternatives(a)
    a["review"] = {"removed": [], "added": [], "chosen": None, "by": None}
    a["interactive"] = {"can_remove": a.get("unit") == "count", "can_add": a.get("unit") == "count",
                        "can_measure": True}
    _save(a); return a

def review(answer_id, remove=(), add=(), choose=None, user="user"):
    a = get(answer_id)
    if a is None: return {"error": f"no answer {answer_id}"}
    rv = a["review"]
    if choose is not None and 0 <= int(choose) < len(a["alternatives"]):
        rv["chosen"] = int(choose); a["value"] = a["alternatives"][int(choose)]["value"]
    rv["removed"] = sorted(set(rv["removed"]) | {int(i) for i in remove})
    nxt = max([it["id"] for it in a.get("items") or []] + [x["id"] for x in rv["added"]] + [-1]) + 1
    for k, b in enumerate(add):
        rv["added"].append({"id": nxt + k, "user_added": True, **({"box": b} if isinstance(b, list) else b)})
    if a.get("unit") == "count":
        # chosen reading (e.g. door leaves instead of door sets) is the base; the user's box edits apply on top
        base = a["alternatives"][rv["chosen"]]["value"] if rv["chosen"] is not None else len(a.get("items") or []) or a["model_value"]
        try: a["value"] = int(base) - len(rv["removed"]) + len(rv["added"])
        except (TypeError, ValueError): pass
    rv["by"] = user; rv["at"] = time.time()
    a["method"] = a["method"].split("+reviewed")[0] + "+reviewed"
    a["confidence"], a["confidence_reason"] = "high", "checked and corrected by a person in the review panel"
    _save(a)
    with open(_p("corrections.jsonl"), "a") as f:
        f.write(json.dumps({"answer_id": answer_id, "file": a["file"], "question": a["question"], "model_value": a["model_value"],
                            "reviewed_value": a["value"], "removed": list(remove), "added": list(add), "choose": choose,
                            "user": user, "at": rv["at"]}, ensure_ascii=False) + "\n")
    return a

# ------------------------------------------------------------------------------------------------ measuring
def _calib_key(file, page): return _p("calib_" + uuid.uuid5(uuid.NAMESPACE_URL, f"{os.path.abspath(file)}#{page}").hex + ".json")

def calibrate(file, p1, p2, length_m, page=0, image_size=None):
    """The user clicks both ends of a known dimension (or the scale bar). image_size=(w, h) when the points are
    0-1000 image coordinates. -> metres per unit."""
    sx, sy = (image_size[0] / 1000, image_size[1] / 1000) if image_size else (1, 1)
    d = math.hypot((p2[0] - p1[0]) * sx, (p2[1] - p1[1]) * sy)
    if d <= 0: return {"error": "the two points are the same"}
    c = {"file": file, "page": page, "m_per_unit": length_m / d, "image_size": image_size, "points": [p1, p2], "length_m": length_m}
    json.dump(c, open(_calib_key(file, page), "w")); return c

def _scale(file, page):
    p = _calib_key(file, page)
    if os.path.exists(p): return json.load(open(p)), "user calibration"
    if str(file).lower().endswith(".pdf"):                 # vector sheet: its own scale, PDF point units
        try:
            from . import sheet
            mpp = sheet.load(file, page)["scale"]["m_per_pt"]
            if mpp: return {"m_per_unit": mpp, "image_size": None}, "scale printed on the sheet"
        except Exception: pass
    return None, None

def measure(file, points, kind="area", page=0):
    """points: polygon (area) or polyline (length) in the answer's coordinates. -> value in m2 / m."""
    c, how = _scale(file, page)
    if c is None: return {"error": "no scale: calibrate first (click both ends of a known dimension)"}
    sx, sy = (c["image_size"][0] / 1000, c["image_size"][1] / 1000) if c.get("image_size") else (1, 1)
    P = [(x * sx, y * sy) for x, y in points]; k = c["m_per_unit"]
    if kind == "area":
        if len(P) < 3: return {"error": "an area needs at least 3 points"}
        a = abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2
        return {"value": round(a * k * k, 3), "unit": "m2", "scale_from": how, "points": points}
    L = sum(math.dist(P[i], P[i + 1]) for i in range(len(P) - 1))
    return {"value": round(L * k, 3), "unit": "m", "scale_from": how, "points": points}
