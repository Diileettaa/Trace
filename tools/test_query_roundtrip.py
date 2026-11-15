"""Round-trip check: dataset question -> structured parameters -> query()  must equal  answer(question).
python tools/test_query_roundtrip.py [--limit N]"""
import os, sys, json, re, collections, argparse
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, here)
from engine.answer import answer, DATA
from engine.query import query
from engine import questions, cubicasa
from engine.ifc_answer import _quoted

SW = {"doors": "door", "windows": "window", "wc": "toilet", "washbasin": "sink", "bathtub": "bathtub", "shower": "shower", "apartments": "apartment"}
def params(q, src, method):
    t = q["question"]
    if src == "swiss_dwellings":
        p = questions.parse_swiss(t); i = p["intent"]
        if i in SW: return ("count", SW[i], {})
        if i == "label_count": return ("count", "room", {"label": p["label"]})
        if i == "room_area": return ("area", None, {"room": p["room"]})
        if i == "apt_area": return ("area", None, {"apartment": p["apt"]})
        if i == "indoor_area": return ("area", None, {})
        if i == "label_area": return ("area", None, {"label": p["label"]})
    if src == "ifc_models":
        qs = _quoted(t); m = method
        if m.startswith("ifc:count_"):
            cat = m.split("_", 1)[1]; cat = "room" if cat == "space" else cat
            model_q = bool(re.search(r"model|Modell|modelo|mudelis|modelul|modello|modellen", t))
            return ("count", cat, {} if model_q else {"storey": qs[-1]})
        if m.startswith("ifc:space_area"): return ("area", None, {"room": qs[0], "storey": qs[-1]})
        if m == "ifc:storey_space_area": return ("area", "room", {"storey": qs[-1]})
        mm = re.match(r"ifc:(wall|slab)_(length|area|volume)", m)
        if mm: return (mm.group(2), mm.group(1), {"storey": qs[-1]})
    if src == "cubicasa5k":
        c = cubicasa.category(t); return ("count", {"floors": "storey"}.get(c, c), {})
    return None

ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=4000); a = ap.parse_args()
Q = [json.loads(l) for l in open(os.path.join(DATA, "questions.jsonl"), encoding="utf-8")]
by = collections.defaultdict(list)
for q in Q:
    s = q["path"].split("/")[1]
    if s in ("swiss_dwellings", "ifc_models", "cubicasa5k") and q["type"] != "text": by[s].append(q)
for s, qs in by.items():
    qs = qs[::max(1, len(qs) // a.limit)][:a.limit]; same = diff = nop = 0; ex = []
    for q in qs:
        r = answer(q["path"], q["question"]); p = params(q, s, r.get("method", ""))
        if p is None: nop += 1; continue
        v = query(q["path"], *p)["value"]
        if v == r["value"]: same += 1
        else:
            diff += 1
            if len(ex) < 3: ex.append((q["question"][:70], p, r["value"], v))
    print(f"{s:16s} checked {same + diff:5d}  identical {same:5d}  different {diff:3d}  (no structured form: {nop})", ex)
