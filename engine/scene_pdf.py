"""2.5D scene from a vector PDF sheet (handoff 42, part B): rooms / walls / openings, in metres from the printed scale.

Frame (same as engine.scene_ifc): X right, Y up, Z = down the page (plan-up = -Z). Origin = the page's top-left corner,
rotation 0 (the sheet as drawn). Plan points are [X, Z] metres; with no printed scale the scene is "illustrative" and
coordinates stay in PDF points ("unit": "pt").
Every element keeps its evidence: source.page (1-based), bbox_pt (PDF points) and bbox_norm1000 (0-1000 of the page,
the same for any render size of the page).
What is not read from the sheet is left out and said in warnings (fixtures such as WCs need symbol recognition).

python -m engine.scene_pdf sheet.pdf [--page 1] > scene.json"""
import os, math, json, argparse
from . import sheet as SH

BLACK = SH.BLACK

def _norm(b, size): return [round(b[0] * 1000 / size[0], 1), round(b[1] * 1000 / size[1], 1),
                            round(b[2] * 1000 / size[0], 1), round(b[3] * 1000 / size[1], 1)]

def _wall_fills(pdf_path, page):
    """Solid black fills = cut walls (poche). -> [(x0, top, x1, bottom, pts or None)] in PDF points."""
    import pdfplumber
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        pg = pdf.pages[page]
        for o in list(pg.rects) + list(pg.curves):
            if o.get("fill") and str(o.get("non_stroking_color")) in BLACK:
                out.append((o["x0"], o["top"], o["x1"], o["bottom"], o.get("pts")))
    return out

CATEGORY = {"toilet": "toilet", "urinal": "urinal", "washbasin": "sink", "kitchen_sink": "sink", "shower": "shower",
            "bathtub": "bathtub", "chair": "chair", "table": "table", "bed": "bed", "desk": "desk"}

def _names_sidecar(pdf_path, page0):
    p = f"{pdf_path}.p{page0 + 1}.symbol_names.json"
    return (json.load(open(p)), "named manually from the symbol montage (sidecar)") if os.path.exists(p) else (None, None)

def _fixtures(pdf_path, p0, mpp, k, M, src, out_rooms, rooms, warn):
    """Repeated CAD symbols (engine.symbols) -> objects. Names: sidecar <pdf>.pN.symbol_names.json, else one vision call."""
    from . import symbols
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as P: cl = symbols.clusters(P.pages[p0], mpp or 1.0)
    except Exception as e:
        warn.append(f"symbol clustering unavailable: {e!r}"[:160]); return []
    names, how = _names_sidecar(pdf_path, p0)
    vision = None
    if names is None:
        from . import llm
        if llm.available(): vision, how = llm.vision_json, "vision model on the symbol montage"
    symbols.name(pdf_path, p0, cl, vision_json=vision, names=names)
    objs = []
    for c in cl:
        cat = CATEGORY.get(c.get("label"))
        if cat is None and c.get("label") not in (None,): continue          # doors, windows, stairs, 'other': not objects
        for j, ins in enumerate(c["instances"]):
            b = ins["bbox_pt"]; cx, cy = ins["centre_pt"]
            room = next((out_rooms[i]["id"] for i, r in enumerate([r for r in rooms if r.get("polygon")])
                         if _inside((cx, cy), r["polygon"])), None)
            objs.append({"id": f"p{p0+1}-{c['id']}-{j}", "category": cat or "unnamed_symbol", "symbol_cluster": c["id"],
                         "cluster_size": c["n"], "storey_id": f"p{p0+1}", "room_id": room,
                         "position": [M(cx, 0)[0], 0.0, M(0, cy)[1]],
                         "rotation_deg": round((-ins["axis_deg"]) % 180, 1),
                         "footprint": {"width_m": c["size_m"][0], "depth_m": c["size_m"][1],
                                       "note": "width along the symbol's long axis (rotation_deg); front/back not resolved (0-180 deg)"} if mpp else None,
                         "height_m": None, "confidence": 0.9 if cat else 0.4,
                         "label_source": c.get("label_source"), "source": src(b)})
    named = sum(1 for c in cl if c.get("label"))
    if not cl: warn.append("no repeated symbols on this sheet: fixtures not exported")
    elif not named: warn.append(f"{len(cl)} repeated symbol types found but not named (no vision key, no review sidecar): exported as unnamed_symbol")
    else: warn.append(f"fixtures from repeated CAD symbols: {named}/{len(cl)} symbol types named ({how}); a fixture drawn only once on a sheet is not found")
    return objs

def clearances(b, fills, mpp, reach_m=3.0):
    """Fixture box (PDF points) -> nearest solid wall in each page direction within reach:
    [{dir, distance_m, wall_bbox_pt, line_pt: [[x, y], [x, y]]}] (line_pt = the measured segment, for drawing)."""
    x0, y0, x1, y1 = b; reach = reach_m / mpp; out = []
    for d in ("left", "right", "up", "down"):
        best = None
        for F in fills:
            fx0, fy0, fx1, fy1 = F[:4]
            if d in ("left", "right"):
                if fy1 < y0 or fy0 > y1: continue                       # must overlap the fixture's vertical extent
                gap = x0 - fx1 if d == "left" else fx0 - x1
                if -0.5 <= gap <= reach and (best is None or gap < best[0]):
                    yy = (max(y0, fy0) + min(y1, fy1)) / 2
                    best = (max(gap, 0), F, [[x0, yy], [fx1, yy]] if d == "left" else [[x1, yy], [fx0, yy]])
            else:
                if fx1 < x0 or fx0 > x1: continue
                gap = y0 - fy1 if d == "up" else fy0 - y1
                if -0.5 <= gap <= reach and (best is None or gap < best[0]):
                    xx = (max(x0, fx0) + min(x1, fx1)) / 2
                    best = (max(gap, 0), F, [[xx, y0], [xx, fy1]] if d == "up" else [[xx, y1], [xx, fy0]])
        if best:
            out.append({"dir": "page-" + d, "distance_m": round(best[0] * mpp, 3), "wall_bbox_pt": [round(v, 1) for v in best[1][:4]],
                        "line_pt": [[round(v, 1) for v in p] for p in best[2]]})
    return sorted(out, key=lambda c: c["distance_m"])

def _inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: c = not c
    return c

def scene(pdf_path, page=1, rel_path=None):
    rel = rel_path or pdf_path; p0 = int(page) - 1
    f = SH.load(pdf_path, p0)
    size = f["size"]; mpp = f["scale"]["m_per_pt"]; warn = []
    quality = "measured" if mpp else "illustrative"
    k = mpp or 1.0
    if not mpp: warn.append("no printed scale found: coordinates are PDF points, not metres (calibrate to measure)")
    M = lambda x, y: [round(x * k, 4), round(y * k, 4)]
    src = lambda b, **kw: {"file": rel, "page": p0 + 1, "bbox_pt": [round(v, 1) for v in b], "bbox_norm1000": _norm(b, size), **kw}
    # rooms (polygons traced around each label; recomputed when the cached facts predate polygons)
    rooms = f.get("rooms") or []
    if rooms and "polygon" not in rooms[0]:
        try: rooms = SH.rooms(pdf_path, p0, f)
        except Exception as e: warn.append(f"room outlines unavailable: {e!r}"[:160])
    out_rooms = []
    for i, r in enumerate(rooms):
        poly = r.get("polygon")
        if not poly: continue
        lb = r.get("label_box") or r["box"]
        out_rooms.append({"id": f"p{p0+1}-room-{i}", "name": r["name"], "number": None, "storey_id": f"p{p0+1}",
                          "polygon": [M(x, y) for x, y in poly], "floor_y_m": 0.0, "height_m": None,
                          "area_m2": r.get("area_m2") if mpp else None, "baseboard_m": r.get("baseboard_m") if mpp else None,
                          "label_point": [M((lb[0] + lb[2]) / 2, 0)[0], 0.0, M(0, (lb[1] + lb[3]) / 2)[1]],
                          "confidence": 0.8 if " + " not in r["name"] else 0.5,
                          "source": src(r["box"], label=r["name"]),
                          **({"warnings": ["two labels in one traced region: the wall between them was not found"]} if " + " in r["name"] else {})})
    # walls from solid fills
    walls = []
    try: fills = _wall_fills(pdf_path, p0)
    except Exception as e: fills = []; warn.append(f"walls unavailable (pdfplumber): {e!r}"[:160])
    for i, (x0, t, x1, b, pts) in enumerate(fills):
        w, h = x1 - x0, b - t
        if max(w, h) * k < 0.3 or min(w, h) * k > 0.8: continue          # specks and big solid areas are not walls
        rect = not pts or len(pts) <= 5
        if w >= h: a, c, th = (x0, (t + b) / 2), (x1, (t + b) / 2), h
        else: a, c, th = ((x0 + x1) / 2, t), ((x0 + x1) / 2, b), w
        walls.append({"id": f"p{p0+1}-wall-{i}", "storey_id": f"p{p0+1}", "points": [M(*a), M(*c)],
                      "thickness_m": round(th * k, 3), "base_y_m": 0.0, "height_m": None,
                      "footprint": [M(x0, t), M(x1, t), M(x1, b), M(x0, b)],
                      "confidence": 0.8 if rect else 0.5, "source": src([x0, t, x1, b]),
                      **({} if rect else {"warnings": ["non-rectangular fill: centre line is its bounding box axis"]})})
    if not walls: warn.append("no solid wall fills on this sheet: walls not exported (outline-only walls are not traced yet)")
    else: warn.append("walls = solid black fills (cut walls); outline-drawn walls are not included; wall height is not on a plan")
    solid = lambda x, y, e=1.2: any(F[0] - e <= x <= F[2] + e and F[1] - e <= y <= F[3] + e for F in fills)
    # openings
    openings = []
    for i, L in enumerate(f.get("door_leaves") or []):
        hx, hy = L["hinge"]; r_pt = (L["radius_m"] / mpp) if mpp else None
        best, how = None, "ambiguous"
        for e in L["ends"]:
            d = math.dist((hx, hy), e) or 1; ux, uy = (e[0] - hx) / d, (e[1] - hy) / d
            beyond = (e[0] + ux * 0.12 / k, e[1] + uy * 0.12 / k)     # the closed leaf ends at the far jamb (wall)
            if solid(*beyond) and best is None: best, how = (e, ux, uy), "closed leaf ends on a wall"
        if best is None:
            e = L["ends"][0]; d = math.dist((hx, hy), e) or 1; best = (e, (e[0] - hx) / d, (e[1] - hy) / d)
        e, ux, uy = best
        cx, cy = (hx + e[0]) / 2, (hy + e[1]) / 2
        openings.append({"id": f"p{p0+1}-door-{i}", "kind": "door", "wall_id": None, "storey_id": f"p{p0+1}",
                         "position": [M(cx, 0)[0], 0.0, M(0, cy)[1]],
                         "rotation_deg": round(math.degrees(math.atan2(-uy, ux)) % 360, 2),
                         "width_m": L["radius_m"] if mpp else None, "height_m": None,
                         "hinge": [M(hx, 0)[0], 0.0, M(0, hy)[1]], "swing_ends": [M(*x) for x in L["ends"]],
                         "confidence": 0.85 if how != "ambiguous" else 0.6, "placement": how,
                         "source": src(L["box"])})
    for i, w in enumerate(f.get("windows") or []):
        b = w["box"]; horiz = (b[2] - b[0]) >= (b[3] - b[1])
        openings.append({"id": f"p{p0+1}-window-{i}", "kind": "window", "wall_id": None, "storey_id": f"p{p0+1}",
                         "position": [M((b[0] + b[2]) / 2, 0)[0], 0.0, M(0, (b[1] + b[3]) / 2)[1]],
                         "rotation_deg": 0.0 if horiz else 90.0, "width_m": w["width_m"] if mpp else None,
                         "height_m": None, "panes": w.get("panes", 1), "confidence": 0.8, "source": src(b)})
    # attach openings to the nearest wall piece (wall_id) when one touches the opening
    for o in openings:
        x, z = o["position"][0], o["position"][2]
        near = [(min(math.dist((x, z), p) for p in wl["points"]), wl["id"]) for wl in walls]
        o["wall_id"] = min(near)[1] if near and min(near)[0] <= (o["width_m"] or 1) else None
    objects = _fixtures(pdf_path, p0, mpp, k, M, src, out_rooms, rooms, warn)
    if mpp and fills:
        for o in objects:
            if o["category"] in ("toilet", "sink", "urinal", "shower", "bathtub"):
                o["clearances"] = clearances(o["source"]["bbox_pt"], fills, mpp)
                for c in o["clearances"]:                         # same segment on the page image (any render size)
                    c["line_norm1000"] = [[round(x * 1000 / size[0], 1), round(y * 1000 / size[1], 1)] for x, y in c["line_pt"]]
                    c["line_m"] = [M(*q) for q in c["line_pt"]]
        if any(o.get("clearances") for o in objects):
            warn.append("clearances: shortest distance from the fixture symbol's outline to the nearest cut wall in each page direction (page-up = plan-up); walls drawn only as outlines are not considered")
    warn.append("door/window heights and storey height are not on a plan: null")
    return {"project_id": os.path.splitext(os.path.basename(pdf_path))[0], "source_kind": "pdf_vector",
            "unit": "m" if mpp else "pt", "scale": f["scale"],
            "coordinate_system": "sheet: origin page top-left, X right, Y up, Z down the page (plan-up = -Z), rotation 0",
            "plan_up_vector": [0, -1], "north_vector": None, "north_basis": "page (north arrow not read)",
            "rotation_convention": "rotation_deg about +Y, three.js: local +X -> (cos r, 0, -sin r)",
            "quality": quality, "warnings": warn, "sources": [{"file": rel, "page": p0 + 1}],
            "storeys": [{"id": f"p{p0+1}", "name": f"sheet page {p0+1}", "elevation_m": 0.0, "height_m": None,
                         "outline": [M(0, 0), M(size[0], 0), M(*size), M(0, size[1])], "outline_from": "page border",
                         "source": src([0, 0, *size])}],
            "rooms": out_rooms, "walls": walls, "openings": openings, "objects": objects, "systems": []}

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("pdf"); ap.add_argument("--page", type=int, default=1); a = ap.parse_args()
    print(json.dumps(scene(a.pdf, a.page), ensure_ascii=False, indent=1))
