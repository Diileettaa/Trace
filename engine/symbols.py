"""Repeated vector symbols on a CAD-exported PDF page (W1): CAD blocks (WC, basin, sink, shower tray, chairs ...) are
drawn as the same group of strokes, moved / rotated / mirrored. We group strokes into connected symbols, describe
each by a rotation- and mirror-invariant signature in metres, and cluster identical signatures.
-> clusters [{id, n, size_m, instances: [{bbox_pt, centre_pt, angle_deg}], exemplar}], each instance with an exact
position; a cluster is named afterwards (nearby text or one vision call), never guessed from its shape alone."""
import math, collections

def _prims(pg, max_m, mpp, colours=None):
    """Stroked primitives small enough to belong to a symbol -> list of point lists (PDF points, y down)."""
    out = []
    for o in list(pg.curves) + list(pg.lines) + list(pg.rects):
        if o.get("fill"): continue                       # filled = cut walls / poche, never part of a fixture block
        w, h = o["x1"] - o["x0"], o["bottom"] - o["top"]
        if max(w, h) * mpp > max_m: continue
        if colours is not None and str(o.get("stroking_color")) not in colours: continue
        if "pts" in o and o["pts"]: P = [(float(x), float(y)) for x, y in o["pts"]]
        elif o["object_type"] == "rect": P = [(o["x0"], o["top"]), (o["x1"], o["top"]), (o["x1"], o["bottom"]), (o["x0"], o["bottom"])]
        else: P = [(o["x0"], o["top"]), (o["x1"], o["bottom"])]
        out.append((P, str(o.get("stroking_color"))))
    return out

def _groups(prims, tol):
    """Union strokes of the same colour (CAD layer) whose bounding boxes touch (within tol points)."""
    col = [c for _, c in prims]; prims = [P for P, _ in prims]
    bb = [(min(p[0] for p in P) - tol, min(p[1] for p in P) - tol, max(p[0] for p in P) + tol, max(p[1] for p in P) + tol) for P in prims]
    parent = list(range(len(prims)))
    def f(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    cell = 20.0; grid = collections.defaultdict(list)
    for i, b in enumerate(bb):
        for gx in range(int(b[0] // cell), int(b[2] // cell) + 1):
            for gy in range(int(b[1] // cell), int(b[3] // cell) + 1): grid[(gx, gy)].append(i)
    for ids in grid.values():
        for a in range(len(ids)):
            i = ids[a]
            for j in ids[a + 1:]:
                A, B = bb[i], bb[j]
                if col[i] == col[j] and A[0] <= B[2] and B[0] <= A[2] and A[1] <= B[3] and B[1] <= A[3]: parent[f(i)] = f(j)
    G = collections.defaultdict(list)
    for i in range(len(prims)): G[f(i)].append(i)
    return list(G.values())

def _signature(pts, mpp, q):
    """Rotation/mirror invariant: point count, sorted radii from the centroid, principal extents (metres, quantised)."""
    cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
    r = sorted(round(math.hypot(x - cx, y - cy) * mpp / q) for x, y in pts)
    sxx = sum((x - cx) ** 2 for x, y in pts); syy = sum((y - cy) ** 2 for x, y in pts); sxy = sum((x - cx) * (y - cy) for x, y in pts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    u = [(x - cx) * math.cos(ang) + (y - cy) * math.sin(ang) for x, y in pts]; v = [-(x - cx) * math.sin(ang) + (y - cy) * math.cos(ang) for x, y in pts]
    ext = sorted([round((max(u) - min(u)) * mpp / q), round((max(v) - min(v)) * mpp / q)])
    # summarise radii in 8 quantiles so near-identical blocks with one extra vertex still match
    qs = tuple(r[min(len(r) - 1, int(k * len(r) / 8))] for k in range(8)) if r else ()
    return (tuple(ext), qs), (cx, cy), math.degrees(ang)

def clusters(pg, mpp, min_size_m=0.25, max_size_m=2.5, min_n=2, q=0.03, tol=0.6):
    prims = _prims(pg, max_size_m, mpp)
    out = collections.defaultdict(list)
    for g in _groups(prims, tol):
        pts = [p for i in g for p in prims[i][0]]
        x0, y0, x1, y1 = min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)
        if not (min_size_m <= max(x1 - x0, y1 - y0) * mpp <= max_size_m): continue
        if len(g) < 2 and len(pts) < 8: continue          # a lone straight line is not a symbol; a lone closed curve (WC pan) is
        sig, c, ang = _signature(pts, mpp, q)
        out[sig].append({"bbox_pt": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)], "centre_pt": [round(c[0], 1), round(c[1], 1)],
                         "axis_deg": round(ang, 1), "n_strokes": len(g)})
    # merge signatures that differ by at most one quantum everywhere (the same block, rounding on either side)
    keys = sorted(out, key=lambda k: -len(out[k])); merged = {}
    for k in keys:
        tgt = next((m for m in merged if all(abs(a - b) <= 1 for a, b in zip(k[0] + k[1], m[0] + m[1]))), None)
        if tgt is None: merged[k] = list(out[k])
        else: merged[tgt] += out[k]
    res = [{"signature": k, "n": len(v), "size_m": [round(k[0][1] * q, 2), round(k[0][0] * q, 2)], "instances": v}
           for k, v in merged.items() if len(v) >= min_n]
    res.sort(key=lambda c: -c["n"])
    for i, c in enumerate(res): c["id"] = f"sym{i}"
    return res


LABELS = ["toilet", "urinal", "washbasin", "kitchen_sink", "shower", "bathtub", "chair", "table", "bed", "desk",
          "door", "window", "stair", "other"]

NAME_PROMPT = ("These are crops of repeated symbols from one architectural floor plan, each tile marked with its id. "
               "For every id say which object the symbol draws, choosing exactly one of: " + ", ".join(LABELS) +
               ". A toilet is a WC pan (oval bowl, often with a cistern); a washbasin is a small hand basin; use 'other' "
               "when unsure. Return JSON {\"<id>\": \"<label>\", ...}.")

def montage(pdf_path, page0, cl, scale=6, k=30):
    """PNG bytes: one exemplar crop per cluster with its id (for naming by a vision model or a person)."""
    import io, pypdfium2 as pdfium
    from PIL import Image, ImageDraw
    img = pdfium.PdfDocument(pdf_path)[page0].render(scale=scale).to_pil().convert("RGB")
    tiles = []
    for c in cl[:k]:
        b = c["instances"][0]["bbox_pt"]; m = 6
        crop = img.crop([int((b[0] - m) * scale), int((b[1] - m) * scale), int((b[2] + m) * scale), int((b[3] + m) * scale)])
        crop.thumbnail((160, 160)); t = Image.new("RGB", (170, 190), "white"); t.paste(crop, (5, 5))
        ImageDraw.Draw(t).text((5, 170), f"{c['id']}  {c['size_m'][0]:.2f}x{c['size_m'][1]:.2f} m", fill="black"); tiles.append(t)
    W = 6; H = max(1, (len(tiles) + W - 1) // W); M = Image.new("RGB", (170 * W, 190 * H), "white")
    for i, t in enumerate(tiles): M.paste(t, ((i % W) * 170, (i // W) * 190))
    bio = io.BytesIO(); M.save(bio, "PNG"); return bio.getvalue()

def name(pdf_path, page0, cl, vision_json=None, names=None):
    """Attach `label` to clusters: from `names` ({id: label}, e.g. a person's review) or one vision call on the montage.
    Without either, label stays None (the symbols are still exported, unnamed)."""
    if names is None and vision_json is not None:
        try: names = vision_json(NAME_PROMPT, montage(pdf_path, page0, cl))
        except Exception as e: names = {}; cl and cl[0].setdefault("warnings", []).append(f"naming failed: {e!r}"[:120])
    for c in cl:
        lab = (names or {}).get(c["id"]); c["label"] = lab if lab in LABELS else None
        c["label_source"] = ("vision model" if vision_json else "review") if c["label"] else None
    return cl
