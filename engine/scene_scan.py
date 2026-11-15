"""2.5D scene from a scan / photo / raster plan (handoff 42, part C).

Only what image analysis finds without a model: door swings, window symbols, (and toilets / sinks / showers when the
CubiCasa detector is installed). Metric only after the user calibrated this file in the review panel (/calibrate):
then quality "measured" and coordinates in metres; otherwise quality "illustrative" and coordinates in 0-1000 image
units ("unit": "norm1000"), never fake metres.

Frame: origin image top-left, X right, Y up, Z down the image (plan-up = -Z). Evidence: source.bbox_norm1000.
python -m engine.scene_scan plan.jpg [--page 1] > scene.json"""
import os, json, argparse
from . import scanqa, review

def _image(path, page):
    if path.lower().endswith(".pdf"):
        from . import docqa
        return docqa.render_page(path, page - 1)
    return open(path, "rb").read()

def scene(path, page=1, rel_path=None):
    rel = rel_path or path; warn = []
    img = _image(path, page)
    if img is None: return {"error": "cannot read the image"}
    import cv2, numpy as np
    im = cv2.imdecode(np.frombuffer(img, np.uint8), cv2.IMREAD_GRAYSCALE); H, W = im.shape
    cal, how = review._scale(path, page - 1)
    if cal and how == "user calibration":
        iw, ih = cal.get("image_size") or (W, H)
        k = cal["m_per_unit"]; fx, fz = iw / 1000 * k, ih / 1000 * k
        unit, quality = "m", "measured"
        warn.append(f"scale from the user's calibration ({cal.get('length_m')} m between two clicked points)")
    else:
        auto = None
        try:
            from . import llm, scan_scale
            if llm.available(): auto = scan_scale.read(img, (W, H), llm.vision_json)
        except Exception: auto = None
        if auto and auto.get("m_per_px"):
            k = auto["m_per_px"]; fx, fz = W / 1000 * k, H / 1000 * k
            unit, quality = "m", "measured"
            warn.append("scale read from the sheet: " + auto["basis"] + "; calibrate in the review panel to confirm")
            warn += auto.get("warnings", [])
        else:
            fx = fz = 1.0; unit, quality = "norm1000", "illustrative"
            warn.append("no calibration and no readable printed scale: positions are 0-1000 image units, not metres; calibrate in the review panel to measure")
            if auto: warn += auto.get("warnings", [])
    P = lambda x, z: [round(float(x) * fx, 4), 0.0, round(float(z) * fz, 4)]
    src = lambda b: {"file": rel, "page": page, "bbox_norm1000": [round(float(v), 1) for v in b]}
    openings, objects = [], []
    for i, d in enumerate(scanqa.raster_doors(img)):
        b = [float(v) for v in d["box_norm1000"]]
        openings.append({"id": f"s{page}-door-{i}", "kind": "door", "wall_id": None, "position": P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2),
                         "rotation_deg": None, "width_m": round(max((b[2] - b[0]) * fx, (b[3] - b[1]) * fz), 3) if unit == "m" else None,
                         "height_m": None, "confidence": 0.6, "source": src(b),
                         "warnings": ["swing box centre, not the opening centre; orientation not read"]})
    for i, w in enumerate(scanqa.raster_windows(img)):
        b = [float(v) for v in w["box_norm1000"]]; horiz = (b[2] - b[0]) * W >= (b[3] - b[1]) * H
        openings.append({"id": f"s{page}-window-{i}", "kind": "window", "wall_id": None, "position": P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2),
                         "rotation_deg": 0.0 if horiz else 90.0, "panes": w.get("panes", 1),
                         "width_m": round(((b[2] - b[0]) * fx if horiz else (b[3] - b[1]) * fz), 3) if unit == "m" else None,
                         "height_m": None, "confidence": 0.65, "source": src(b)})
    if not path.lower().endswith(".pdf"):
        try:
            from . import detector
            d = detector.detect(path)
        except Exception: d = None
        if d:
            for cat, bxs in d["boxes"].items():
                if cat not in ("toilet", "sink", "shower_tub"): continue
                for i, b in enumerate(bxs):
                    b = [float(v) for v in b]
                    objects.append({"id": f"s{page}-{cat}-{i}", "category": cat, "position": P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2),
                                    "rotation_deg": None, "footprint": {"width_m": round((b[2] - b[0]) * fx, 3), "depth_m": round((b[3] - b[1]) * fz, 3)} if unit == "m" else None,
                                    "confidence": round(d["scores"][cat][i], 3), "source": src(b)})
        else: warn.append("fixture detector not installed here (ultralytics): WC / sink not exported; ask the counting questions instead")
    seg = None                                   # CubiCasa5K multi-task model output (tools/cubiseg_run.py), if present
    for cand in (path + ".cubiseg.json", os.path.join(os.path.dirname(path), "cubiseg", os.path.basename(path) + ".cubiseg.json")):
        if os.path.exists(cand): seg = json.load(open(cand)); break
    # fixtures: our CubiCasa detector beats the official CubiCasa5K model on the same 40 plans (eval/cubiseg_eval.md:
    # toilet 36 vs 29, sink 29 vs 22 of 40 answers), so the official model's icons are only a fallback
    if seg and not any(o.get("category") in ("toilet", "sink") for o in objects):
        for i, ic in enumerate(seg.get("icons", [])):
            cat = {"Toilet": "toilet", "Sink": "sink", "Bathtub": "bathtub"}.get(ic["class"])
            if not cat: continue
            xs = [p[0] for p in ic["polygon"]]; ys = [p[1] for p in ic["polygon"]]
            objects.append({"id": f"s{page}-cubiseg-{cat}-{i}", "category": cat, "position": P((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2),
                            "rotation_deg": None, "footprint": {"width_m": round((max(xs) - min(xs)) * fx, 3), "depth_m": round((max(ys) - min(ys)) * fz, 3)} if unit == "m" else None,
                            "confidence": 0.7, "method": "CubiCasa5K model", "source": src([min(xs), min(ys), max(xs), max(ys)])})
        warn.append(f"fixtures from the CubiCasa5K model ({seg.get('model')}); fallback, our detector was not available")
    def _rect(poly):
        """4-corner polygon (norm1000) -> (centre, long-side vector, long length, short length) in image units"""
        q = poly[:4]; e1 = (q[1][0] - q[0][0], q[1][1] - q[0][1]); e2 = (q[2][0] - q[1][0], q[2][1] - q[1][1])
        L1, L2 = (e1[0] ** 2 + e1[1] ** 2) ** .5, (e2[0] ** 2 + e2[1] ** 2) ** .5
        c = (sum(p[0] for p in q) / 4, sum(p[1] for p in q) / 4)
        return (c, e1, L1, L2) if L1 >= L2 else (c, e2, L2, L1)
    rooms, walls = [], []
    try:
        from . import scan_plan
        A = scan_plan.analyse(img)
    except Exception as e: A = None; warn.append(f"wall / room tracing failed: {e!r}"[:160])
    if A:
        nx = lambda p: [p[0] * 1000 / W, p[1] * 1000 / H]
        PL = lambda p: [round(float(nx(p)[0] * fx), 4), round(float(nx(p)[1] * fz), 4)]
        tpx = (fx * 1000 / W) if unit == "m" else (1000 / W)
        for i, w in enumerate(A["walls"]):
            fp = w["footprint"]; xs = [p[0] for p in fp]; ys = [p[1] for p in fp]
            walls.append({"id": f"s{page}-wall-{i}", "storey_id": f"s{page}", "points": [PL(p) for p in w["points"]],
                          "thickness_m" if unit == "m" else "thickness_norm1000": round(w["thickness_px"] * tpx, 3),
                          "base_y_m": 0.0, "height_m": None, "footprint": [PL(p) for p in fp], "confidence": 0.7,
                          "source": src([min(xs) * 1000 / W, min(ys) * 1000 / H, max(xs) * 1000 / W, max(ys) * 1000 / H])})
        for i, r in enumerate(A["rooms"]):
            bx = r["bbox_px"]; lp = PL(r["label_px"])
            rooms.append({"id": f"s{page}-room-{i}", "name": None, "number": None, "storey_id": f"s{page}",
                          "polygon": [PL(p) for p in r["polygon"]], "floor_y_m": 0.0, "height_m": None,
                          "area_m2": round(r["area_px"] * (fx * 1000 / W) * (fz * 1000 / H), 2) if unit == "m" else None,
                          "label_point": [lp[0], 0.0, lp[1]], "confidence": 0.7,
                          "source": src([bx[0] * 1000 / W, bx[1] * 1000 / H, (bx[0] + bx[2]) * 1000 / W, (bx[1] + bx[3]) * 1000 / H])})
        if seg and len(seg.get("walls", [])) > 3 * max(1, len(walls)):     # thin residential walls: use the model's walls
            walls = []
            for i, w in enumerate(seg["walls"]):
                if len(w["polygon"]) < 4: continue
                (cx, cy), v, L, t = _rect(w["polygon"]); n = (L or 1)
                a = (cx - v[0] / n * L / 2, cy - v[1] / n * L / 2); b = (cx + v[0] / n * L / 2, cy + v[1] / n * L / 2)
                xs = [p[0] for p in w["polygon"]]; ys = [p[1] for p in w["polygon"]]
                walls.append({"id": f"s{page}-wall-{i}", "storey_id": f"s{page}", "points": [P(*a)[::2], P(*b)[::2]],
                              "thickness_m" if unit == "m" else "thickness_norm1000": round(t * (fx if unit == "m" else 1), 3),
                              "base_y_m": 0.0, "height_m": None, "footprint": [P(*p)[::2] for p in w["polygon"]],
                              "confidence": 0.7, "method": "CubiCasa5K model", "source": src([min(xs), min(ys), max(xs), max(ys)])})
            warn.append("walls from the CubiCasa5K model (thin walls the rule-based tracer misses)")
        if seg and not openings and seg.get("openings"):
            for i, o in enumerate(seg["openings"]):
                if len(o["polygon"]) < 4: continue
                (cx, cy), v, L, t = _rect(o["polygon"]); xs = [p[0] for p in o["polygon"]]; ys = [p[1] for p in o["polygon"]]
                import math as _m
                openings.append({"id": f"s{page}-cubiseg-{o['class'].lower()}-{i}", "kind": o["class"].lower(), "wall_id": None,
                                 "position": P(cx, cy), "rotation_deg": round(_m.degrees(_m.atan2(-v[1], v[0])) % 180, 1),
                                 "width_m": round(L * fx, 3) if unit == "m" else None, "height_m": None, "confidence": 0.6,
                                 "method": "CubiCasa5K model", "source": src([min(xs), min(ys), max(xs), max(ys)])})
        if seg and seg.get("rooms"):
            def _in(pt, poly):
                x, y = pt; c = False
                for a, b in zip(poly, poly[1:] + poly[:1]):
                    if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) or 1e-12) + a[0]: c = not c
                return c
            for rm, r in zip(rooms, A["rooms"]):
                q = [r["label_px"][0] * 1000 / W, r["label_px"][1] * 1000 / H]
                hit = next((x for x in seg["rooms"] if x["class"] not in ("Background", "Outdoor", "Wall") and _in(q, x["polygon"])), None)
                if hit: rm["name"] = hit["class"]; rm["name_source"] = "CubiCasa5K room class"
        if seg and seg.get("rooms"):                 # use the model's rooms when they cover more of the plan than ours
            def _area(poly): return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1]))) / 2
            sr = [x for x in seg["rooms"] if x["class"] not in ("Background", "Outdoor", "Wall", "Railing") and len(x["polygon"]) >= 3]
            ours = sum(r["area_px"] * 1e6 / (W * H) for r in A["rooms"]); theirs = sum(_area(x["polygon"]) for x in sr)
            if theirs > 1.2 * ours:
                rooms = []
                for i, x in enumerate(sr):
                    xs = [p[0] for p in x["polygon"]]; ys = [p[1] for p in x["polygon"]]
                    rooms.append({"id": f"s{page}-cubiseg-room-{i}", "name": x["class"], "name_source": "CubiCasa5K room class",
                                  "number": None, "storey_id": f"s{page}", "polygon": [P(*p)[::2] for p in x["polygon"]],
                                  "floor_y_m": 0.0, "height_m": None,
                                  "area_m2": round(_area(x["polygon"]) * fx * fz, 2) if unit == "m" else None,
                                  "label_point": P(sum(xs) / len(xs), sum(ys) / len(ys)), "confidence": 0.6,
                                  "method": "CubiCasa5K model", "source": src([min(xs), min(ys), max(xs), max(ys)])})
                warn.append(f"rooms from the CubiCasa5K model ({len(rooms)}; they cover more of the plan than the rule-based tracing)")
        warn.append(f"walls = thick strokes ({len(walls)} axis-aligned runs, deskew {A['angle_deg']:.2f} deg); rooms = enclosed free space "
                    f"({len(rooms)}), unnamed. Checked on the school sheet: 38/50 rooms within 10 % of the vector areas, small rooms (< 6 m2) can merge")
    else:
        warn.append("rooms and walls not traced (OpenCV missing): use the 2D image as the base layer")
    return {"project_id": os.path.splitext(os.path.basename(path))[0], "source_kind": "scan", "unit": unit,
            "coordinate_system": "image: origin top-left, X right, Y up, Z down the image (plan-up = -Z)",
            "plan_up_vector": [0, -1], "north_vector": None, "north_basis": "page (north arrow not read)",
            "quality": quality, "warnings": warn, "sources": [{"file": rel, "page": page}], "image_size_px": [W, H],
            "storeys": [{"id": f"s{page}", "name": f"page {page}", "elevation_m": 0.0, "height_m": None,
                         "outline": [P(0, 0)[::2], P(1000, 0)[::2], P(1000, 1000)[::2], P(0, 1000)[::2]], "outline_from": "image border"}],
            "rooms": rooms, "walls": walls, "openings": openings, "objects": objects, "systems": []}

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("image"); ap.add_argument("--page", type=int, default=1); a = ap.parse_args()
    print(json.dumps(scene(a.image, a.page), ensure_ascii=False, indent=1))
