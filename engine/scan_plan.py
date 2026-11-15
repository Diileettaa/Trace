"""W3: walls and rooms from a scanned / raster floor plan (no model, OpenCV only).

walls: thick dark strokes (cut walls) kept by a morphological opening that removes text, hatching, furniture and thin
       lines; split into horizontal / vertical runs -> centre line + thickness; anything else -> footprint polygon.
rooms: free space between all drawn lines (walls, door leaves and swing arcs close the openings), as polygons;
       pieces touching the image border or too small are dropped.
Coordinates returned in pixels of the original image (x right, y down); the caller converts with a scale.
Deskew: the plan is rotated (search +-2 deg) so walls are axis-aligned; results are mapped back to the original image."""
import math

def _load(image_bytes):
    import cv2, numpy as np
    im = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
    return im

def deskew(im):
    import cv2, numpy as np
    H, W = im.shape
    b0 = (im < 120).astype(np.uint8)
    small = cv2.resize(cv2.morphologyEx(b0, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(np.float32), None, fx=0.25, fy=0.25)
    h2, w2 = small.shape; best = (0, 0.0)
    for a in np.arange(-2, 2.01, 0.05):
        R = cv2.warpAffine(small, cv2.getRotationMatrix2D((w2 / 2, h2 / 2), a, 1), (w2, h2))
        sc = R.sum(1).var() + R.sum(0).var()
        if sc > best[0]: best = (sc, float(a))
    M = cv2.getRotationMatrix2D((W / 2, H / 2), best[1], 1)
    return cv2.warpAffine(im, M, (W, H), borderValue=255), M, cv2.invertAffineTransform(M), best[1]

def _back(Mi, pts):
    return [[round(Mi[0][0] * x + Mi[0][1] * y + Mi[0][2], 1), round(Mi[1][0] * x + Mi[1][1] * y + Mi[1][2], 1)] for x, y in pts]

def analyse(image_bytes, dark=120, line=170):
    """-> {"angle_deg", "wall_px", "walls": [{points, thickness_px, footprint}], "rooms": [{polygon, area_px, label_px}], "size"}"""
    import cv2, numpy as np
    im0 = _load(image_bytes)
    if im0 is None: return None
    H0, W0 = im0.shape; up = 1.0
    if max(H0, W0) < 3000:                       # low-resolution exports: trace at ~4500 px, report in original pixels
        up = 4500 / max(H0, W0); im0 = cv2.resize(im0, None, fx=up, fy=up, interpolation=cv2.INTER_CUBIC)
    im, M, Mi, ang = deskew(im0); H, W = im.shape
    b = (im < dark).astype(np.uint8)
    k = max(3, int(round(max(H, W) / 1000)))                      # thinnest wall ~ 3-5 px at ~4800 px per sheet
    thick = cv2.morphologyEx(b, cv2.MORPH_OPEN, np.ones((k + 1, k + 1), np.uint8))
    # drop thick blobs that are not wall-like (title block logos, filled triangles): need a long side >= 6 k
    n, lab, st, _ = cv2.connectedComponentsWithStats(thick, 8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        if max(st[i, 2], st[i, 3]) >= 6 * k: keep[i] = True
    thick = keep[lab].astype(np.uint8)
    dt = cv2.distanceTransform(thick, cv2.DIST_L2, 3)
    wall_px = float(np.percentile(dt[dt > 0], 90) * 2) if (dt > 0).any() else None
    walls = []
    L = max(8, int(3 * (wall_px or k)))
    for kind, ker in (("h", np.ones((1, L), np.uint8)), ("v", np.ones((L, 1), np.uint8))):
        runs = cv2.morphologyEx(thick, cv2.MORPH_OPEN, ker)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(runs, 8)
        for i in range(1, n2):
            x, y, w, h = st2[i, :4]
            if kind == "h": a, c, t = (x, y + h / 2), (x + w, y + h / 2), h
            else: a, c, t = (x + w / 2, y), (x + w / 2, y + h), w
            if t > 3 * (wall_px or 1e9): continue                    # solid blocks, not walls
            fp = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
            walls.append({"axis": kind, "points": _back(Mi, [a, c]), "thickness_px": float(t), "footprint": _back(Mi, fp)})
    # rooms: everything drawn (thin lines too) is a barrier; furniture greys above `line` are ignored
    ad = cv2.adaptiveThreshold(im, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    # seal door / window openings: join collinear wall pieces across gaps up to ~5 wall thicknesses (a door leaf width)
    G = max(10, int(5 * (wall_px or k)))
    # close only along each run's own direction: horizontal runs across horizontal gaps, vertical runs across vertical
    # gaps (closing the whole mask would also fill the space between two parallel walls closer than G)
    hr = cv2.morphologyEx(thick, cv2.MORPH_OPEN, np.ones((1, L), np.uint8)); vr = cv2.morphologyEx(thick, cv2.MORPH_OPEN, np.ones((L, 1), np.uint8))
    seal = thick | cv2.morphologyEx(hr, cv2.MORPH_CLOSE, np.ones((1, G), np.uint8)) | cv2.morphologyEx(vr, cv2.MORPH_CLOSE, np.ones((G, 1), np.uint8))
    bar = ((im < line) | (ad > 0) & (im < 200)).astype(np.uint8) | seal
    bar = cv2.dilate(bar, np.ones((3, 3), np.uint8))
    n3, lab3, st3, cen = cv2.connectedComponentsWithStats(1 - bar, 4)
    border = set(lab3[0, :]) | set(lab3[-1, :]) | set(lab3[:, 0]) | set(lab3[:, -1])
    rooms = []
    min_area = (3 * (wall_px or k)) ** 2                          # ~1 m2 at a typical wall thickness
    big = 0.25 * H * W                                            # the space around the building, inside the sheet frame
    for i in range(1, n3):
        if i in border or st3[i, cv2.CC_STAT_AREA] < min_area or st3[i, cv2.CC_STAT_AREA] > big: continue
        m = (lab3[st3[i, 1]:st3[i, 1] + st3[i, 3], st3[i, 0]:st3[i, 0] + st3[i, 2]] == i).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        c = max(cs, key=cv2.contourArea)
        poly = cv2.approxPolyDP(c, max(2.0, 0.6 * (wall_px or k)), True).reshape(-1, 2) + [st3[i, 0], st3[i, 1]]
        # area of the outer outline (furniture drawn inside a room cuts holes in the free space: they belong to the room),
        # grown by the 1 px barrier dilation on every side
        area = cv2.contourArea(c) + cv2.arcLength(c, True) * 1.5
        rooms.append({"polygon": _back(Mi, poly.tolist()), "area_px": int(area), "free_px": int(st3[i, cv2.CC_STAT_AREA]),
                      "label_px": _back(Mi, [cen[i]])[0], "bbox_px": [int(v) for v in st3[i, :4]]})
    if up != 1.0:
        sc = lambda P: [[round(x / up, 1), round(y / up, 1)] for x, y in P]
        for w in walls: w["points"] = sc(w["points"]); w["footprint"] = sc(w["footprint"]); w["thickness_px"] /= up
        for r in rooms:
            r["polygon"] = sc(r["polygon"]); r["label_px"] = [r["label_px"][0] / up, r["label_px"][1] / up]
            r["area_px"] = int(r["area_px"] / up / up); r["free_px"] = int(r["free_px"] / up / up)
            r["bbox_px"] = [int(v / up) for v in r["bbox_px"]]
        W, H = W0, H0; wall_px = wall_px / up if wall_px else wall_px
    return {"angle_deg": ang, "wall_px": wall_px, "kernel_px": k, "size": [W, H], "walls": walls, "rooms": rooms, "upscaled": round(up, 2)}

def scale_from_ratio(ratio, image_size, paper_mm=None):
    """Metres per pixel from a printed ratio (1:N) and the paper size. paper_mm=(w, h); if None, the ISO A size whose
    aspect matches the image is assumed (A0-A4 landscape / portrait) -> (m_per_px, paper name) or (None, None)."""
    W, H = image_size
    if paper_mm is None:
        iso = {"A0": (1189, 841), "A1": (841, 594), "A2": (594, 420), "A3": (420, 297), "A4": (297, 210)}
        asp = max(W, H) / min(W, H)
        if abs(asp - math.sqrt(2)) > 0.03: return None, None             # not an ISO A sheet: the paper size is unknown
        return None, "ISO A aspect, size unknown: need the paper size (title block) or a calibration"
    return (paper_mm[0] / 1000 * ratio) / max(W, H), f"{paper_mm[0]}x{paper_mm[1]} mm at 1:{ratio}"
