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
- Windows: count every pane separately - a window opening divided by a thin line (mullion) is 2 windows.
- Doors: count only doors drawn with a swing arc (the curved line of the opening door leaf); a wall opening without
  a swing arc is not a door. Box each swing arc.
- For text you read (title, place, architect, date, scale), box that text and copy it into "quote".
- If the sheet does not show the information, set found=false and answer=null. Never guess.
- Rectangular area that is not printed but whose side lengths are written as dimension strings on the sheet: set
  answer=null and add "dims": [<side 1 as written>, <side 2 as written>] (e.g. ["6200", "9950"] or ["52'-8\"", "137'-4\""]);
  the code multiplies them. Box the two dimension strings.
- Tag abbreviations on mechanical / fuel sheets: FP fuel pump, CV check valve, FSI filter separator (issue),
  FSR filter separator (receipt), FSCV filter separator control valve, PS pipe support, PG pressure gauge.

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
    dims = resp.get("dims") if isinstance(resp.get("dims"), list) and len(resp.get("dims")) == 2 else None
    return {"found": found, "value": val, "quote": resp.get("quote"), "items": ev, "reason": resp.get("reason"), "dims": dims}

def _dim_m(t):
    """'6200' (mm) -> 6.2 ; 52'-8\" -> metres. None if unreadable."""
    t = str(t).strip().replace("\u2019", "'").replace("\u201d", '"').replace("''", '"')
    m = re.match(r"^(\d+)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*\"?$", t)
    if m: return (int(m.group(1)) + float(m.group(2) or 0) / 12) * 0.3048
    m = re.match(r"^(\d+(?:[.,]\d+)?)\s*(mm|m)?$", t)
    if m:
        v = float(m.group(1).replace(",", ".")); u = m.group(2)
        return v if u == "m" or (u is None and v < 100) else v / 1000
    return None

GAMMA = 1.0

def _gray(image_bytes, target=4800):
    """Decode to grey and bring small images up to ~target px (the analysis thresholds assume an A1/A2 sheet at
    ~150-200 dpi; low-resolution JPEGs are upscaled instead of re-tuning every kernel)."""
    import cv2, numpy as np
    im = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    if im is None: return None
    m = max(im.shape)
    if m < 0.75 * target: im = cv2.resize(im, None, fx=target / m, fy=target / m, interpolation=cv2.INTER_CUBIC)
    if GAMMA != 1:     # faint hairlines (light-grey arcs in low-resolution exports) darkened; white paper stays white
        lut = (255 * (np.arange(256) / 255.0) ** GAMMA).astype(np.uint8); im = cv2.LUT(im, lut)
    return im

def raster_marks(image_bytes, min_count=5):
    """Repeated small filled marks found by image analysis (dots, solid squares), grouped by size.
    -> [{"id": "g0", "count", "diameter_px", "items": [{box_norm1000}]}] largest group first; [] without OpenCV."""
    try:
        import cv2, numpy as np
    except ImportError: return []
    im = _gray(image_bytes)
    if im is None: return []
    H, W = im.shape
    b = (im < 110).astype(np.uint8)
    o = cv2.morphologyEx(b, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))   # drop lines and text
    n, lab, st, _ = cv2.connectedComponentsWithStats(o)
    blobs = []
    for i in range(1, n):
        x, y, w, h, a = (int(v) for v in st[i])
        if 6 <= w <= 40 and 6 <= h <= 40 and abs(w - h) <= 0.25 * max(w, h) + 1 and a > 0.6 * w * h:
            blobs.append(((4 * a / 3.14159) ** 0.5, [round(1000 * x / W, 1), round(1000 * y / H, 1), round(1000 * (x + w) / W, 1), round(1000 * (y + h) / H, 1)]))
    blobs.sort(key=lambda t: t[0]); groups = []
    for d, bx in blobs:
        if groups and d - groups[-1]["d"][-1] <= 1.5: groups[-1]["d"].append(d); groups[-1]["items"].append({"box_norm1000": bx})
        else: groups.append({"d": [d], "items": [{"box_norm1000": bx}]})
    groups = sorted([g for g in groups if len(g["items"]) >= min_count], key=lambda g: -len(g["items"]))[:4]
    return [{"id": f"g{i}", "count": len(g["items"]), "diameter_px": round(sum(g["d"]) / len(g["d"]), 1), "items": g["items"]}
            for i, g in enumerate(groups)]

WIN_ALONG = 0.4

def raster_windows(image_bytes):
    """Window symbols in a scanned plan: openings in thick (solid) walls that are bridged by 2+ thin lines running
    along the wall, on the building's outside wall. Mullions (thin lines across the opening) split it into panes;
    each pane counts as one window. -> [{"box_norm1000", "panes"}] or [] (needs OpenCV)."""
    try:
        import cv2, numpy as np
    except ImportError: return []
    im = _gray(image_bytes)
    if im is None: return []
    H0, W0 = im.shape
    f = min(1.0, 5000 / max(H0, W0)); im = cv2.resize(im, None, fx=f, fy=f) if f < 1 else im; H, W = im.shape
    b0 = (im < 120).astype(np.uint8)
    small = cv2.resize(cv2.morphologyEx(b0, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(np.float32), None, fx=0.25, fy=0.25)
    h2, w2 = small.shape; best = (0, 0.0)
    for a in np.arange(-2, 2.01, 0.1):                      # deskew: walls should be axis-aligned
        R = cv2.warpAffine(small, cv2.getRotationMatrix2D((w2 / 2, h2 / 2), a, 1), (w2, h2))
        sc = R.sum(1).var() + R.sum(0).var()
        if sc > best[0]: best = (sc, float(a))
    M = cv2.getRotationMatrix2D((W / 2, H / 2), best[1], 1); Mi = cv2.invertAffineTransform(M)
    im = cv2.warpAffine(im, M, (W, H), borderValue=255)
    b = (im < 120).astype(np.uint8)
    thick = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    dt = cv2.distanceTransform(thick, cv2.DIST_L2, 3)
    if not (dt > 0).any(): return []
    t = float(np.percentile(dt[dt > 0], 90) * 2)
    if t < 4: return []
    ad = cv2.adaptiveThreshold(im, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 12).astype(np.uint8)
    thin = ad & (1 - cv2.dilate(thick, np.ones((3, 3), np.uint8)))
    seal = cv2.morphologyEx(thick, cv2.MORPH_CLOSE, np.ones((int(6 * t), int(6 * t)), np.uint8))
    ff = (1 - seal).astype(np.uint8); cv2.floodFill(ff, np.zeros((H + 2, W + 2), np.uint8), (2, 2), 2); outside = ff == 2
    def outer(axis, x, y, w, h):
        o = int(1.5 * t)
        A, B = ((outside[max(0, y - o):y, x:x + w], outside[y + h:y + h + o, x:x + w]) if axis == "h"
                else (outside[y:y + h, max(0, x - o):x], outside[y:y + h, x + w:x + w + o]))
        a_out = bool(A.size and A.mean() > 0.5); b_out = bool(B.size and B.mean() > 0.5)
        return a_out != b_out                     # outside on exactly one side (logos / title-block marks have it on both)
    nT, labT, stT, _ = cv2.connectedComponentsWithStats(thick)
    big = np.zeros(nT, bool); tot = stT[1:, cv2.CC_STAT_AREA].sum() if nT > 1 else 0
    for j in range(1, nT): big[j] = stT[j, cv2.CC_STAT_AREA] >= 0.01 * tot      # the building's wall network, not logos
    def on_walls(axis, x, y, w, h):
        if axis == "h": A, B = labT[y:y + h, max(0, x - 3):x], labT[y:y + h, x + w:x + w + 3]
        else: A, B = labT[max(0, y - 3):y, x:x + w], labT[y + h:y + h + 3, x:x + w]
        return any(big[v] for v in np.unique(A) if v) and any(big[v] for v in np.unique(B) if v)
    out = []; L = int(t * 7)
    for axis in ("h", "v"):
        k = np.ones((1, L), np.uint8) if axis == "h" else np.ones((L, 1), np.uint8)
        gap = cv2.morphologyEx(thick, cv2.MORPH_CLOSE, k) & (1 - thick)
        n, lab, st, _ = cv2.connectedComponentsWithStats(gap)
        for i in range(1, n):
            x, y, w, h, _a = (int(v) for v in st[i])
            ln, th = (w, h) if axis == "h" else (h, w)
            if not (0.5 * t <= th <= 2.2 * t and ln >= t): continue
            reg = thin[y:y + h, x:x + w]
            along = reg.mean(axis=1) if axis == "h" else reg.mean(axis=0)
            if int(np.sum(np.diff(np.r_[0, (along > WIN_ALONG).astype(int)]) == 1)) < 2 or not outer(axis, x, y, w, h): continue
            cross = reg.mean(axis=0) if axis == "h" else reg.mean(axis=1)
            inner = cross[2:-2] if len(cross) > 4 else cross
            panes = int(np.sum(np.diff(np.r_[0, (inner > 0.7).astype(int)]) == 1)) + 1
            if panes > 3: continue                # text / logos / glazed screens, not a window opening
            pts = cv2.transform(np.array([[[x, y], [x + w, y + h]]], np.float32), Mi)[0]
            x0, y0 = pts.min(0); x1, y1 = pts.max(0)
            out.append({"box_norm1000": [round(1000 * x0 / W, 1), round(1000 * y0 / H, 1), round(1000 * x1 / W, 1), round(1000 * y1 / H, 1)],
                        "panes": panes})
    return out

DOOR_LEAF, DOOR_INNER, DOOR_THIN_WALLS, RING, DOOR_C, DOOR_NEAR = 0.85, 0.35, False, 0.4, 12, 5   # set on the synthetic school scan only

def raster_doors(image_bytes):
    """Door swings in a scanned plan: a quarter-circle arc + a straight leaf line from a hinge at a solid wall, with an
    empty swing area. Openings without a swing arc are not doors. -> [{"box_norm1000"}] or [] (needs OpenCV)."""
    try:
        import cv2, numpy as np, math
    except ImportError: return []
    im = _gray(image_bytes)
    if im is None: return []
    f = min(1.0, 5000 / max(im.shape)); im = cv2.resize(im, None, fx=f, fy=f) if f < 1 else im; H, W = im.shape
    b0 = (im < 120).astype(np.uint8)
    small = cv2.resize(cv2.morphologyEx(b0, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(np.float32), None, fx=0.25, fy=0.25)
    h2, w2 = small.shape; best = (0, 0.0)
    for a in np.arange(-2, 2.01, 0.1):
        R = cv2.warpAffine(small, cv2.getRotationMatrix2D((w2 / 2, h2 / 2), a, 1), (w2, h2)); sc = R.sum(1).var() + R.sum(0).var()
        if sc > best[0]: best = (sc, float(a))
    M = cv2.getRotationMatrix2D((W / 2, H / 2), best[1], 1); Mi = cv2.invertAffineTransform(M)
    im = cv2.warpAffine(im, M, (W, H), borderValue=255)
    b = (im < 120).astype(np.uint8); thick = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    dt = cv2.distanceTransform(thick, cv2.DIST_L2, 3)
    if not (dt > 0).any(): return []
    t = float(np.percentile(dt[dt > 0], 90) * 2)
    if t < 4: return []
    ad = cv2.adaptiveThreshold(im, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, DOOR_C).astype(np.uint8)
    thin = cv2.dilate(ad & (1 - cv2.dilate(thick, np.ones((3, 3), np.uint8))), np.ones((2, 2), np.uint8))
    near = cv2.dilate(thin, np.ones((DOOR_NEAR, DOOR_NEAR), np.uint8)).astype(bool)
    rmin, rmax = 1.6 * t, 4.0 * t
    A = np.linspace(0, math.pi / 2, 26)[1:-1]; Ks = np.linspace(0.15, 0.95, 12); a2 = np.linspace(0.35, 1.22, 10)
    def ok(xs, ys):
        xs = np.round(xs).astype(int); ys = np.round(ys).astype(int)
        m = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H); v = np.zeros(len(xs), bool); v[m] = near[ys[m], xs[m]]; return v.mean()
    def door_at(cx, cy, sx, sy, r):
        if ok(cx + sx * r * np.cos(A), cy + sy * r * np.sin(A)) < 0.8: return 0
        leaf = max(ok(cx + sx * r * Ks, cy + 0 * Ks), ok(cx + 0 * Ks, cy + sy * r * Ks))
        if leaf < DOOR_LEAF: return 0
        if ok(cx - sx * r * np.cos(A), cy - sy * r * np.sin(A)) > 0.5 and ok(cx - sx * r * np.cos(A), cy + sy * r * np.sin(A)) > 0.5 \
                and ok(cx + sx * r * np.cos(A), cy - sy * r * np.sin(A)) > 0.5: return 0          # a full circle, not a swing
        if max(ok(cx + sx * k * r * np.cos(a2), cy + sy * k * r * np.sin(a2)) for k in (0.45, 0.65, 0.8)) > DOOR_INNER: return 0
        if RING and ok(cx + sx * 1.25 * r * np.cos(a2), cy + sy * 1.25 * r * np.sin(a2)) > RING: return 0
        return 1 + leaf
    found = []
    walls = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) if DOOR_THIN_WALLS else thick
    cs = cv2.goodFeaturesToTrack((walls * 255).astype(np.uint8), maxCorners=12000, qualityLevel=0.02, minDistance=3)
    for cx, cy in ([] if cs is None else cs.reshape(-1, 2)):       # hinges sit at wall ends (corners of walls)
        for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            bestd = max(((door_at(cx, cy, sx, sy, r), r) for r in np.arange(rmin, rmax, 2.0)), default=(0, 0))
            if bestd[0]:
                r = bestd[1]; found.append((bestd[0], (min(cx, cx + sx * r), min(cy, cy + sy * r), max(cx, cx + sx * r), max(cy, cy + sy * r))))
    def iou(p, q):
        x0, y0, x1, y1 = max(p[0], q[0]), max(p[1], q[1]), min(p[2], q[2]), min(p[3], q[3]); i = max(0, x1 - x0) * max(0, y1 - y0)
        u = (p[2] - p[0]) * (p[3] - p[1]) + (q[2] - q[0]) * (q[3] - q[1]) - i; return i / u if u > 0 else 0
    keep = []
    for _, bx in sorted(found, key=lambda z: -z[0]):
        if all(iou(bx, k) < 0.3 for k in keep): keep.append(bx)
    out = []
    for x0, y0, x1, y1 in keep:
        pts = cv2.transform(np.array([[[x0, y0], [x1, y1]]], np.float32), Mi)[0]; p0, p1 = pts.min(0), pts.max(0)
        out.append({"box_norm1000": [round(1000 * p0[0] / W, 1), round(1000 * p0[1] / H, 1), round(1000 * p1[0] / W, 1), round(1000 * p1[1] / H, 1)]})
    return out

DOORS_NOTE = """
Image analysis also found {n} door swings (quarter-circle arc + door leaf hinged at a wall), e.g. at (0-1000 x,y):
{ex}. If the question asks how many doors / door leaves there are and these look right, add "door_candidates": true
to your JSON; the code counts them. Add boxes labelled "extra door" for swings the analysis missed and boxes labelled
"not a door" for candidates that are wrong (copy their location)."""

def _doors_prompt(ds):
    ex = ", ".join(f"({int((d['box_norm1000'][0] + d['box_norm1000'][2]) / 2)},{int((d['box_norm1000'][1] + d['box_norm1000'][3]) / 2)})" for d in ds[:6])
    return DOORS_NOTE.replace("{n}", str(len(ds))).replace("{ex}", ex)

def _doors_answer(ds, resp):
    if not resp.get("door_candidates"): return None
    ev = normalise(resp, True)["items"]
    extra = [e for e in ev if "extra" in str(e.get("label", "")).lower()]
    wrong = [e for e in ev if "not a door" in str(e.get("label", "")).lower()]
    def hit(d, e):
        b, c = d["box_norm1000"], e["box_norm1000"]; cx, cy = (c[0] + c[2]) / 2, (c[1] + c[3]) / 2
        return b[0] - 5 <= cx <= b[2] + 5 and b[1] - 5 <= cy <= b[3] + 5
    kept = [d for d in ds if not any(hit(d, w) for w in wrong)]
    items = [dict(d, label="door swing") for d in kept] + [dict(e, label="extra door (vision model)") for e in extra]
    for i, it in enumerate(items): it["id"] = i
    est = _num(resp.get("answer")); n = len(items)
    unsure = est is not None and abs(est - n) > max(2, 0.15 * max(est, n))
    return {"value": n, "unit": "count", "items": items, "method": "scan:doors+vlm" + (":uncertain" if unsure else ""),
            "warnings": [f"uncertain: image analysis + model give {n}, the model's own estimate is {resp.get('answer')}; please review the boxes"] if unsure else [],
            "alternatives": [{"label": "door swings found (boxes)", "value": n}, {"label": "vision model estimate", "value": resp.get("answer")}] if unsure else [],
            "evidence": {"reason": resp.get("reason"), "found_by_analysis": len(ds), "removed_by_model": len(ds) - len(kept),
                         "extra_from_model": len(extra), "readings": [len(items), resp.get("answer")]}}

MARKS_NOTE = """
Image analysis also found these groups of identical small FILLED marks (dots / solid squares), with example
locations (0-1000 x,y): {groups}
If the question asks for things drawn as such filled marks (e.g. a note or legend says the dots mean pipe supports),
add "mark_group": "<group id>" to your JSON instead of boxing them one by one; the code counts that group."""

WINDOWS_NOTE = """
Image analysis also found {n} window panes ({m} openings) in the outside walls: openings in the solid walls bridged by
thin parallel lines; an opening split by thin cross lines counts one window per pane. Example locations (0-1000 x,y):
{ex}. If the question asks how many windows there are and these look right, add "window_candidates": true to your JSON;
the code then counts them (you may still list extra windows the analysis missed as evidence boxes with label
"extra window")."""

def _windows_prompt(ws):
    n = sum(w["panes"] for w in ws)
    ex = ", ".join(f"({int((w['box_norm1000'][0] + w['box_norm1000'][2]) / 2)},{int((w['box_norm1000'][1] + w['box_norm1000'][3]) / 2)})" for w in ws[:5])
    return WINDOWS_NOTE.replace("{n}", str(n)).replace("{m}", str(len(ws))).replace("{ex}", ex)

def _windows_answer(ws, resp):
    if not resp.get("window_candidates"): return None
    items = [{"label": f"window ({w['panes']} pane{'s' if w['panes'] > 1 else ''})", "box_norm1000": w["box_norm1000"], "panes": w["panes"]} for w in ws]
    extra = [e for e in normalise(resp, True)["items"] if "extra" in str(e.get("label", "")).lower()]
    items += [dict(e, label="extra window (vision model)") for e in extra]
    for i, it in enumerate(items): it["id"] = i
    n = sum(w["panes"] for w in ws) + len(extra)
    return {"value": n, "unit": "count", "items": items, "method": "scan:windows+vlm", "warnings": [],
            "evidence": {"reason": resp.get("reason"), "openings": len(ws), "panes": n - len(extra), "extra_from_model": len(extra),
                         "readings": [n, resp.get("answer")]}}

def _door_check(m, image_bytes, question, call_model):
    """Door swings are the weakest symbol on poor scans (faint arcs). Count them a second, independent way - tile by
    tile by the vision model - and flag the answer for review when the two disagree by more than 15 %."""
    if not str(m.get("method", "")).startswith("scan:doors") or DOOR_SECOND_READING is False: return m
    try:
        W, H = _image_size(image_bytes); grid = (3, 3) if max(W, H) > 5000 else (2, 2)
        tiled = count_tiled(image_bytes, question, call_model, grid); t = len(tiled)
    except Exception: return m
    n = m["value"]; m.setdefault("evidence", {})["tiled_vision_count"] = t
    if t > 1.5 * max(n, 1):
        # image analysis clearly missed most swings (faint arcs): the model's tile-by-tile boxes, plus any analysis box
        # it did not cover, become the answer - still boxed, still flagged for review
        items = merge_boxes([dict(it, label="door (vision, tile by tile)") for it in tiled] +
                            [dict(it, label="door swing (image analysis)") for it in m["items"]])
        for i, it in enumerate(items): it["id"] = i
        v = len(items) if len(items) <= 1.1 * t else t     # boxes from the two methods that did not line up: keep the model's count
        m.update(value=v, items=items, method="scan:doors+vlm:tiled:uncertain",
                 warnings=[f"image analysis found only {n} door swings (faint arcs?); the vision model counted {t} tile by tile; "
                           f"answer = {v} ({len(items)} boxes merged from both); please review"],
                 alternatives=[{"label": "merged boxes", "value": len(items)}, {"label": "tile-by-tile vision count", "value": t},
                               {"label": "image analysis only", "value": n}])
        return m
    if abs(t - n) > max(2, 0.15 * max(t, n)):
        m["method"] = m["method"].split(":uncertain")[0] + ":uncertain"
        m["warnings"] = [w for w in m.get("warnings", []) if not w.startswith("uncertain")] + [
            f"uncertain: {n} door swings found by image analysis (boxed), {t} counted tile by tile by the vision model; please review"]
        m["alternatives"] = [{"label": "door swings found (boxes)", "value": n}, {"label": "tile-by-tile vision count", "value": t}]
    return m

DOOR_SECOND_READING = True

def _marks_prompt(groups):
    return MARKS_NOTE.replace("{groups}", "; ".join(
        f"{g['id']}: {g['count']} marks, ~{g['diameter_px']} px, e.g. " + ", ".join(
            f"({int((it['box_norm1000'][0] + it['box_norm1000'][2]) / 2)},{int((it['box_norm1000'][1] + it['box_norm1000'][3]) / 2)})" for it in g["items"][:3])
        for g in groups))

def _marks_answer(groups, resp):
    g = next((g for g in groups if g["id"] == str(resp.get("mark_group"))), None)
    if g is None: return None
    items = [dict(it, id=i, label="filled mark") for i, it in enumerate(g["items"])]
    return {"value": g["count"], "unit": "count", "items": items, "method": "scan:marks+vlm", "warnings": [],
            "evidence": {"reason": resp.get("reason"), "mark_group": g["id"], "diameter_px": g["diameter_px"],
                         "readings": [g["count"], resp.get("answer")]}}

ROOM_Q = re.compile(r"\brooms?\b|\boffices?\b|classrooms?|bedrooms?|toilets?\b|\bwc\b|stores?\b|\blabel", re.I)
MEASURE_Q = re.compile(r"\barea\b|\bm2\b|m²|square (?:feet|metres|meters)|\bsq\.?\s?(?:ft|m)\b|baseboard|skirting|perimeter|\blength\b|how long|pinta-ala|fläche", re.I)
DOOR_Q = re.compile(r"\bdoors?\b|door leaves|ovi|ovet|tür|porte|porta|dörr|puerta|门", re.I)
WINDOW_Q = re.compile(r"window|ikkun|fenster|fenêtre|finestr|fönster|ventana|窗", re.I)

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
            t = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
            if max(t.size) < 1600: t = t.resize((int(t.size[0] * 1600 / max(t.size)), int(t.size[1] * 1600 / max(t.size))), Image.LANCZOS)
            t.thumbnail((max_side, max_side))
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

SMALL_COUNT = int(os.environ.get("JUNCTION_SMALL_COUNT", 12))   # below this the whole-sheet count is kept (no tiling)

def answer(image_bytes, question, call_model, votes=2, file=None, page=0):
    """Scans: counts and reads (below); areas / lengths of a named room that are not printed are measured from the
    traced room outline when a scale is known (engine.scan_rooms), with the outline as evidence."""
    r = _answer(image_bytes, question, call_model, votes)
    if r.get("value") is None and MEASURE_Q.search(question):
        try:
            from . import scan_rooms
            m = scan_rooms.measure(image_bytes, question, call_model, file=file, page=page)
        except Exception as e:
            m = None; r.setdefault("warnings", []).append(f"room measuring failed: {e!r}"[:120])
        if m: return m
    return r

def _answer(image_bytes, question, call_model, votes=2, tile_from=int(os.environ.get("JUNCTION_TILE_FROM", 2600))):
    """Large scans + count questions: the whole sheet is read once (legend, context) and counted again tile by tile
    at full resolution, because small symbols vanish when a big sheet is shrunk for the model. The tiled count is the
    answer; the whole-sheet count is the second reading."""
    is_count = looks_like_count(question)
    try: W, H = _image_size(image_bytes)
    except Exception: W = H = 0
    label_q = is_count and ROOM_Q.search(question) and not (DOOR_Q.search(question) or WINDOW_Q.search(question))
    if is_count and (max(W, H) > tile_from or (label_q and W)):   # room names are small text: read them tile by tile
        grid = (3, 3) if max(W, H) > 5000 else (2, 2)
        if W > 1.6 * H: grid = (grid[0] + 1, grid[1])
        groups, ws = raster_marks(image_bytes), (raster_windows(image_bytes) if WINDOW_Q.search(question) else [])
        ds = raster_doors(image_bytes) if DOOR_Q.search(question) else []
        raw = call_model(PROMPT.replace("{q}", question) + (_marks_prompt(groups) if groups else "") + (_windows_prompt(ws) if ws else "")
                         + (_doors_prompt(ds) if ds else ""), _shrink(image_bytes), 0.0)
        m = (_marks_answer(groups, raw) if groups else None) or (_windows_answer(ws, raw) if ws else None) or (_doors_answer(ds, raw) if ds else None)
        if m: return _door_check(m, image_bytes, question, call_model)
        whole = normalise(raw, True)
        if not whole["found"]:
            return {"value": None, "unit": "count", "items": [], "method": "scan:vlm", "warnings": ["not shown on this drawing"],
                    "evidence": {"reason": whole["reason"], "readings": [None]}}
        b = _num(whole["value"])
        if b is not None and b < SMALL_COUNT and not label_q:
            # few, large or labelled items (5 pumps, 3 slab types): the whole sheet sees them; tiles only add look-alikes
            for i, it in enumerate(whole["items"]): it["id"] = i
            return {"value": whole["value"], "unit": "count", "items": whole["items"], "method": "scan:vlm", "warnings": [],
                    "evidence": {"reason": whole["reason"], "readings": [whole["value"]]}}
        items = count_tiled(image_bytes, question, call_model, grid)
        for i, it in enumerate(items): it["id"] = i
        a = len(items)
        close = lambda x, y: x is not None and y is not None and abs(x - y) <= max(1, 0.1 * max(x, y))
        agree = close(a, b)
        readings = [a, whole["value"]]; method = f"scan:vlm:tiled{grid[0]}x{grid[1]}"; value = a; warn = []
        if not agree:
            # two readings disagree: a third, independent tile-by-tile count on a different grid decides (median of
            # three); the answer stays flagged and every reading is offered for review
            g2 = (grid[0] + 1, grid[1] + 1) if grid[0] * grid[1] < 9 else (grid[0] - 1, grid[1] - 1)
            try: items2 = count_tiled(image_bytes, question, call_model, g2)
            except Exception: items2 = None
            c = len(items2) if items2 is not None else None
            if c is not None:
                readings.append(c)
                trio = sorted([(a, "tiles", items), (b if b is not None else -1, "whole", whole["items"]), (c, "tiles2", items2)], key=lambda t: t[0])
                value, src_name, src_items = trio[1]
                items = src_items
                for i, it in enumerate(items): it["id"] = i
                pair = close(a, c) or close(b, c) or close(a, b)
                method += ":median3" + ("" if pair else ":uncertain")
                warn.append(f"readings disagreed (tiles {grid[0]}x{grid[1]}: {a}, whole sheet: {whole['value']}, tiles {g2[0]}x{g2[1]}: {c}); "
                            f"answer = median ({src_name})" + ("" if pair else "; still uncertain, please review the boxes"))
            else:
                method += ":uncertain"
                warn.append(f"uncertain: tile-by-tile count {a}, whole-sheet count {whole['value']}; please review the boxes")
        return {"value": value, "unit": "count", "items": items, "method": method,
                "warnings": warn, "evidence": {"reason": whole["reason"], "readings": readings, "agree": agree,
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
    groups = raster_marks(image_bytes) if is_count else []
    ws = raster_windows(image_bytes) if is_count and WINDOW_Q.search(question) else []
    ds = raster_doors(image_bytes) if is_count and DOOR_Q.search(question) else []
    if groups or ws or ds:
        raw = call_model(PROMPT.replace("{q}", question) + (_marks_prompt(groups) if groups else "") + (_windows_prompt(ws) if ws else "")
                         + (_doors_prompt(ds) if ds else ""), image_bytes, 0.0)
        m = (_marks_answer(groups, raw) if groups else None) or (_windows_answer(ws, raw) if ws else None) or (_doors_answer(ds, raw) if ds else None)
        if m: return _door_check(m, image_bytes, question, call_model)
    runs = [normalise(call_model(PROMPT.replace("{q}", question), image_bytes, t), is_count) for t in (0.0, 0.6)[:votes]]
    a = runs[0]
    same = lambda x, y: (x["value"] is None and y["value"] is None) or (
        _num(x["value"]) is not None and _num(y["value"]) is not None and abs(_num(x["value"]) - _num(y["value"])) < 1e-6) or (
        x["value"] is not None and y["value"] is not None and str(x["value"]).strip().lower() == str(y["value"]).strip().lower())
    agree = len(runs) < 2 or same(runs[0], runs[1])
    warn = [] if agree else [f"uncertain: two readings disagree ({runs[0]['value']!r} vs {runs[1]['value']!r})"]
    if not a["found"]:
        warn.append("not shown on this drawing")
        if MEASURE_Q.search(question):
            warn.append("no room areas / lengths printed for this; calibrate the scale and measure (POST /calibrate, /measure)")
    for i, it in enumerate(a["items"]): it["id"] = i
    if a["value"] is None and a.get("dims"):
        d1, d2 = (_dim_m(x) for x in a["dims"])
        if d1 and d2:
            imperial = "'" in str(a["dims"][0])
            v = d1 * d2 / (0.09290304 if imperial else 1)
            return {"value": round(v, 2), "unit": "sq ft" if imperial else "m2", "items": a["items"], "method": "scan:vlm+dims",
                    "warnings": [f"area = {a['dims'][0]} x {a['dims'][1]} read from dimension strings (rectangle assumed); check the outline"],
                    "evidence": {"dims": a["dims"], "reason": a["reason"], "readings": [r["value"] for r in runs]}}
    return {"value": a["value"], "unit": "count" if is_count else None, "items": a["items"],
            "method": "scan:vlm" + ("" if agree else ":uncertain"), "warnings": warn,
            "evidence": {"quote": a["quote"], "reason": a["reason"], "readings": [r["value"] for r in runs], "agree": agree}}
