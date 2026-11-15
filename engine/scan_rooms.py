"""I1: measure a named room on a scan. Room outline from engine.scan_plan (walls traced in the image), room name from
the label written inside it (vision model, tile by tile, cached), scale from the user's calibration or the printed
ratio + paper size (engine.scan_scale). Every answer carries the room outline as evidence (polygon_norm1000).

measure(image_bytes, question, call_model, file=None, page=0) -> answer dict, or None when the question names no room
we can find (the caller then declines as before). Never invents a scale: without one the room is shown, value null."""
import io, json, os, re, math, hashlib

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "scanrooms")
LABEL_PROMPT = ("This is part {k} of {n} of a scanned floor plan. List every ROOM NAME written inside a room (e.g. 'Kitchen', "
                "'Group Room', 'WC', 'Bedroom 2'); skip dimensions, door / window tags, notes and the title block. "
                'Return JSON {"labels": [{"text": "<as written>", "point": [x, y]}]} where point is the centre of the text '
                "in 0-1000 coordinates of THIS image.")
AREA_Q = re.compile(r"\barea\b|\bm2\b|m²|square|\bsq\.?\s?(?:ft|m)\b|pinta-ala|fläche", re.I)
BASE_Q = re.compile(r"baseboard|skirting|jalkalista", re.I)
PERIM_Q = re.compile(r"perimeter", re.I)

def _norm(t): return re.sub(r"[^a-z0-9]+", " ", str(t).lower()).strip()

def labels(image_bytes, call_model, grid=None):
    """Room labels with their centre (0-1000 of the whole image), read tile by tile; cached per image."""
    from . import scanqa
    key = hashlib.md5(image_bytes).hexdigest(); cp = os.path.join(CACHE, key + ".labels.json")
    if os.path.exists(cp): return json.load(open(cp))
    W, H = scanqa._image_size(image_bytes)
    grid = grid or ((3, 3) if max(W, H) > 5000 else (2, 2))
    if W > 1.6 * H: grid = (grid[0] + 1, grid[1])
    T = scanqa.tiles(image_bytes, grid); n = len(T); out = []
    from concurrent.futures import ThreadPoolExecutor
    ask = lambda kt: call_model(LABEL_PROMPT.replace("{k}", str(kt[0] + 1)).replace("{n}", str(n)), kt[1][0], 0.0)
    with ThreadPoolExecutor(max_workers=min(9, n)) as ex: res = list(ex.map(ask, enumerate(T)))
    for (tb, (x0, y0, x1, y1)), r in zip(T, res):
        for L in (r or {}).get("labels") or []:
            try: px, py = float(L["point"][0]), float(L["point"][1])
            except Exception: continue
            p = [x0 + px * (x1 - x0) / 1000, y0 + py * (y1 - y0) / 1000]
            t = str(L.get("text") or "").strip()
            if t and not any(_norm(o["text"]) == _norm(t) and math.dist(o["point"], p) < 15 for o in out):
                out.append({"text": t, "point": [round(p[0], 1), round(p[1], 1)]})
    os.makedirs(CACHE, exist_ok=True); json.dump(out, open(cp, "w")); return out

def _seg(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)

def _inside(p, poly):
    x, y = p; c = False
    for a, b in zip(poly, poly[1:] + poly[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) or 1e-12) + a[0]: c = not c
    return c

def _scale(image_bytes, W, H, call_model, file, page):
    """-> (metres per pixel of THIS image, basis, warnings)"""
    from . import review, scan_scale
    if file:
        c, how = review._scale(file, page)
        if c and how == "user calibration":
            iw, ih = c.get("image_size") or (W, H)                 # calibration given in the original image's pixels
            return c["m_per_unit"] * iw / W, "user calibration", []
    r = scan_scale.read(image_bytes, (W, H), call_model)
    if r.get("m_per_px"): return r["m_per_px"], r["basis"], r.get("warnings", [])
    return None, None, r.get("warnings", [])

def measure(image_bytes, question, call_model, file=None, page=0, analysis=None, label_list=None):
    if not (AREA_Q.search(question) or BASE_Q.search(question) or PERIM_Q.search(question)): return None
    from . import scan_plan, scanqa
    A = analysis or scan_plan.analyse(image_bytes)
    if not A or not A["rooms"]: return None
    W, H = A["size"]
    L = label_list if label_list is not None else labels(image_bytes, call_model)
    q = " " + _norm(question) + " "
    hits = [l for l in L if len(_norm(l["text"])) >= 2 and (" " + _norm(l["text"]) + " ") in q]
    if not hits: return None
    best = max(len(_norm(l["text"])) for l in hits)
    hits = [l for l in hits if len(_norm(l["text"])) == best]           # 'Group Room' beats 'Room'
    name = hits[0]["text"]
    rooms = []
    for l in hits:
        p = [l["point"][0] * W / 1000, l["point"][1] * H / 1000]
        r = next((r for r in A["rooms"] if _inside(p, r["polygon"])), None)
        if r is not None and r not in rooms: rooms.append(r)
    norm_poly = lambda r: [[round(x * 1000 / W, 1), round(y * 1000 / H, 1)] for x, y in r["polygon"]]
    items = [{"id": i, "label": name, "polygon_norm1000": norm_poly(r)} for i, r in enumerate(rooms)]
    base = {"unit": None, "items": items, "sources": [{"file": file, "page": page + 1}] if file else [],
            "evidence": {"labels_matched": hits, "room_outline": "free space enclosed by the traced walls (engine.scan_plan)"}}
    if not rooms:
        return {**base, "value": None, "method": "scan:rooms", "warnings": [f"label '{name}' found but no closed room outline around it (open plan or a wall not traced)"]}
    if len(hits) > 1:
        return {**base, "value": None, "method": "scan:rooms:ambiguous",
                "warnings": [f"{len(hits)} rooms are labelled '{name}': all are outlined; ask about one (e.g. by its number) or sum them"]}
    r = rooms[0]
    # a traced outline that also holds other rooms' labels leaked through an opening the tracer did not close:
    # its area would be wrong, so show it and decline instead of answering
    others = sorted({l["text"] for l in L if _norm(l["text"]) != _norm(name)
                     and _inside([l["point"][0] * W / 1000, l["point"][1] * H / 1000], r["polygon"])})
    if others:
        return {**base, "value": None, "method": "scan:rooms:leak",
                "warnings": [f"the traced outline of '{name}' also contains {', '.join(others[:4])}"
                             + (" ..." if len(others) > 4 else "") + ": a wall or door between them was not closed; "
                             "not measured - draw the outline in the review panel (/measure)"]}
    import cv2, numpy as np
    poly = np.array(r["polygon"], np.float32)
    hull = cv2.contourArea(cv2.convexHull(poly)); solidity = cv2.contourArea(poly) / hull if hull else 0
    if solidity < 0.8:                               # rooms are (near) convex; a ragged outline is a leak
        return {**base, "value": None, "method": "scan:rooms:leak",
                "warnings": [f"the traced outline of '{name}' is irregular (solidity {solidity:.2f}): it probably runs into a "
                             "neighbouring space; not measured - draw the outline in the review panel (/measure)"]}
    mpp, basis, sw = _scale(image_bytes, W, H, call_model, file, page)
    if mpp is None:
        return {**base, "value": None, "method": "scan:rooms:no_scale",
                "warnings": [f"room '{name}' outlined on the drawing, but no scale: calibrate (two clicks on a known dimension) to measure"] + sw}
    area = r["area_px"] * mpp * mpp
    P = r["polygon"]; per = sum(math.dist(P[i], P[(i + 1) % len(P)]) for i in range(len(P))) * mpp
    warn = [f"scale: {basis}"] + sw + ["outline traced from the walls on the scan: net room area, check the outline"]
    low = max(W, H) < 3000
    if low: warn.append(f"low-resolution image ({max(W, H)} px): walls between small rooms may not be closed; on our test sheet "
                        "at this resolution 4 of 6 measured rooms were within 10 % - check the outline before using the number")
    if BASE_Q.search(question):
        doors = []
        for d in scanqa.raster_doors(image_bytes):
            b = d["box_norm1000"]; c = ((b[0] + b[2]) / 2 * W / 1000, (b[1] + b[3]) / 2 * H / 1000)
            w = max((b[2] - b[0]) * W / 1000, (b[3] - b[1]) * H / 1000) * mpp
            if not (0.6 <= w <= 1.3): continue
            # a door of this room: its swing lies inside the room, or its hinge corner sits on the room's outline
            corners = [(b[0] * W / 1000, b[1] * H / 1000), (b[2] * W / 1000, b[1] * H / 1000), (b[0] * W / 1000, b[3] * H / 1000), (b[2] * W / 1000, b[3] * H / 1000)]
            edge = min(_seg(q, P[i], P[(i + 1) % len(P)]) for q in corners for i in range(len(P)))
            if _inside(c, P) or edge < 0.25 / mpp: doors.append(round(w, 2))
        v = round(per - sum(doors), 2)
        warn.append(f"baseboard = perimeter {per:.2f} m - door openings {doors} m")
        return {**base, "value": v, "unit": "m", "method": "scan:rooms+scale:baseboard" + (":lowres" if low else ""), "warnings": warn,
                "evidence": {**base["evidence"], "perimeter_m": round(per, 2), "doors_m": doors, "scale": basis}}
    if PERIM_Q.search(question):
        return {**base, "value": round(per, 2), "unit": "m", "method": "scan:rooms+scale:perimeter" + (":lowres" if low else ""), "warnings": warn,
                "evidence": {**base["evidence"], "scale": basis}}
    imperial = re.search(r"sq\.?\s?ft|square feet|\bsf\b", question, re.I)
    v = round(area / 0.09290304, 1) if imperial else round(area, 2)
    return {**base, "value": v, "unit": "sq ft" if imperial else "m2", "method": "scan:rooms+scale:area" + (":lowres" if low else ""), "warnings": warn,
            "evidence": {**base["evidence"], "area_m2": round(area, 2), "perimeter_m": round(per, 2), "scale": basis}}
