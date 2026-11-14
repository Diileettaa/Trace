"""Parse one Swiss Dwellings floor (DXF with semantic layers) into rooms, apartments, doors, windows, fixtures.
All coordinates are in metres in the DXF's model space."""
import re, collections
from functools import lru_cache
from .dxf import read_entities, area, bbox, inside, centroid

ROOM_NO = re.compile(r"^[A-Z]?\d+\.\d+$")
UNIT_LABEL = re.compile(r"^(?:Whg|App|Appt|Apt|Wohnung|Appartement|Appartamento|Logement|Unit)\.?\s*[A-Z]$", re.I)
AREA_TXT = re.compile(r"\d\s*m(²|2)\b")
OUTDOOR = re.compile(r"balkon|balcon|loggia|terrass|terrazz|veranda|sitzplatz|jardin|garten|giardino|patio", re.I)
SHAFT_VOID = re.compile(r"schacht|luftraum|gaine|vide|cavedi|cavedio|vuoto", re.I)

WC_OFFSET = 0.03  # WC bowl sits ~10% of the box length off-centre; a washbasin bowl is centred (offset ~0)

def _fixture_kind(inner):
    c = collections.Counter(inner)
    if c["P69"]: return "bathtub"
    if c["P48"] and c["L"]: return "washbasin"
    if c["P48"] and c["C"]: return "wc"
    if c["P5"] and c["C"]: return "shower"
    if c["C"] >= 4: return "stove"
    if c["Lmany"] or c["L"] >= 3: return "stair_or_lift"
    return "other"

@lru_cache(maxsize=64)
def parse(path):
    E = read_entities(path)
    by = collections.defaultdict(list)
    for e in E: by[e["layer"]].append(e)

    # ---- rooms: number text -> smallest containing outline; name = nearest other text above the number
    outlines = [e["points"] for e in by["ROOM_OUTLINE"] if e["type"] == "LWPOLYLINE" and len(e["points"]) >= 3]
    texts = [e for e in by["ROOM_TEXT"] if e["type"] in ("TEXT", "MTEXT")]
    nums = [t for t in texts if ROOM_NO.match(t["text"].strip())]
    unit_labels = [t for t in texts if UNIT_LABEL.match(t["text"].strip())]
    others = [t for t in texts if not ROOM_NO.match(t["text"].strip()) and not AREA_TXT.search(t["text"])
              and not UNIT_LABEL.match(t["text"].strip())]
    rooms = []
    # Each label text names one room. Pass 1: labels inside the room's own outline; pass 2: small rooms whose label is
    # drawn outside take the nearest label within 1.5 m that no other room has claimed (else they stay unnamed).
    d2 = lambda o, t: (o["pos"][0] - t["pos"][0]) ** 2 + (o["pos"][1] - t["pos"][1]) ** 2
    plan, used = [], set()
    for t in nums:
        hits = [p for p in outlines if inside(t["pos"], p)]
        poly = min(hits, key=area) if hits else None
        cand = [o for o in others if poly is None or inside(o["pos"], poly)]
        cand = [o for o in cand if not re.search(r"\b[A-Z]$", o["text"].strip()) or " " not in o["text"].strip()] or cand
        plan.append([t, poly, cand])
    for item in plan:                                   # pass 1: own label inside the outline
        t, poly, cand = item
        free = [o for o in cand if id(o) not in used]
        pick = min(free, key=lambda o: d2(o, t)) if free else None
        if pick is not None: used.add(id(pick))
        item.append(pick)
    for item in plan:                                   # pass 2: label drawn just outside a small room
        t, poly, cand, pick = item
        if pick is None:
            near = [o for o in others if id(o) not in used and d2(o, t) < 1.5 ** 2]
            if near: pick = min(near, key=lambda o: d2(o, t)); used.add(id(pick)); item[3] = pick
    for t, poly, cand, pick in plan:
        name = pick["text"] if pick is not None else ""
        rooms.append({"number": t["text"].strip(), "name": name.strip(), "area": round(area(poly), 2) if poly else None,
                      "poly": poly, "bbox": bbox(poly) if poly else None, "text_pos": t["pos"]})
    # ---- holes: ROOM_OUTLINE polygons drawn inside a room (lift core, shaft, column) are cut out of its net area.
    # Even-odd semantics: only top-level inner polygons count; a polygon inside a hole is not subtracted again.
    for r in rooms:
        if not r["poly"]: continue
        inner = [o for o in outlines if o is not r["poly"] and all(inside(p, r["poly"]) for p in o)]
        top = [o for o in inner if not any(o2 is not o and area(o2) > area(o) and all(inside(p, o2) for p in o) for o2 in inner)]
        if top:
            r["gross_area"] = r["area"]
            r["holes"] = [{"area_m2": round(area(o), 2), "number": next((x["number"] for x in rooms if x["poly"] is o), None)} for o in top]
            r["area"] = round(r["area"] - sum(area(o) for o in top), 2)
    # ---- apartments: UNIT_OUTLINE polylines + the unit label text inside them
    units, claimed = [], set()
    polys = [e["points"] for e in by["UNIT_OUTLINE"] if e["type"] == "LWPOLYLINE" and len(e["points"]) >= 3]
    for poly in polys:
        lab = next((o for o in unit_labels if id(o) not in claimed and inside(o["pos"], poly)), None)
        if lab is not None: claimed.add(id(lab))
        units.append({"label": lab["text"].strip() if lab else "", "poly": poly, "bbox": bbox(poly)})
    for u in units:   # label drawn outside its outline: nearest label nobody claimed
        if u["label"]: continue
        free = [o for o in unit_labels if id(o) not in claimed]
        if not free: continue
        c = centroid(u["poly"]); o = min(free, key=lambda o: (o["pos"][0] - c[0]) ** 2 + (o["pos"][1] - c[1]) ** 2)
        claimed.add(id(o)); u["label"] = o["text"].strip()
    for u in units: u["letter"] = u["label"][-1] if u["label"] else ""
    apartment_letters = sorted({t["text"].strip()[-1] for t in unit_labels})
    for r in rooms:
        r["unit"] = next((u["letter"] for u in units if u["letter"] and inside(r["text_pos"], u["poly"])), "") or \
                    next((u["letter"] for u in units if u["letter"] and r["poly"] and inside(centroid(r["poly"]), u["poly"])), "")
        r["outdoor"] = bool(OUTDOOR.search(r["name"]))
        r["shaft_void"] = bool(SHAFT_VOID.search(r["name"]))

    # ---- doors: one 5-vertex leaf polyline per door (double doors share one)
    doors = [{"bbox": bbox(e["points"])} for e in by["DOOR"] if e["type"] == "LWPOLYLINE" and len(e["points"]) == 5]
    # ---- windows: one closed rectangle per window
    windows = [{"bbox": bbox(e["points"])} for e in by["WINDOW"] if e["type"] == "LWPOLYLINE" and e.get("closed")]
    # ---- fixtures: closed rectangles; each other FIXTURE element goes to the smallest rectangle containing it
    F = by["FIXTURE"]
    rects = [e for e in F if e["type"] == "LWPOLYLINE" and e.get("closed") and len(e["points"]) == 4]
    rest = [e for e in F if e not in rects]
    inner = [[] for _ in rects]
    aspects = [[] for _ in rects]
    rb = [bbox(r["points"]) for r in rects]
    for o in rest:
        c = o["center"] if "center" in o else centroid(o["points"])
        cont = [i for i, b in enumerate(rb) if b[0] - 1e-6 <= c[0] <= b[2] + 1e-6 and b[1] - 1e-6 <= c[1] <= b[3] + 1e-6]
        if not cont: continue
        i = min(cont, key=lambda i: (rb[i][2] - rb[i][0]) * (rb[i][3] - rb[i][1]))
        if o["type"] == "CIRCLE": tag = "C"
        elif o["type"] == "LWPOLYLINE" and len(o["points"]) > 2:
            tag = "P%d" % min(len(o["points"]), 99)
            if tag == "P48":
                ob, b = bbox(o["points"]), rb[i]; W, H = b[2] - b[0], b[3] - b[1]
                bx, by = (ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2
                # WC bowl sits off-centre; washbasin bowl is centred on both axes. Measure both axes: square
                # WC boxes (0.5 x 0.5 m) have no long axis, and their bowl may be offset either way.
                off = max(abs(bx - (b[0] + b[2]) / 2) / W, abs(by - (b[1] + b[3]) / 2) / H)
                aspects[i].append(off)
        else: tag = "L"
        inner[i].append(tag)
    fixtures = []
    for r, b, inn, asp in zip(rects, rb, inner, aspects):
        if inn.count("L") >= 3: inn = [t for t in inn if t != "L"] + ["Lmany"]
        kind = _fixture_kind(inn)
        if kind in ("wc", "washbasin") and asp:
            kind = "wc" if max(asp) > WC_OFFSET else "washbasin"
        fixtures.append({"kind": kind, "bbox": b})
    # bathtubs: one 69-vertex tub outline per bathtub (two tubs can share one fixture rectangle)
    bathtubs = [{"bbox": bbox(e["points"])} for e in F if e["type"] == "LWPOLYLINE" and len(e["points"]) == 69]
    return {"rooms": rooms, "units": units, "apartment_letters": apartment_letters, "bathtubs": bathtubs, "doors": doors, "windows": windows, "fixtures": fixtures,
            "extent": bbox([p for r in rooms if r["poly"] for p in r["poly"]]) if rooms else None}
