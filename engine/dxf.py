"""Minimal dependency-free reader for ASCII DXF files (enough for the Swiss Dwellings drawings)."""
import math

def _pairs(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    for i in range(0, len(lines) - 1, 2):
        yield lines[i].strip(), lines[i + 1].strip()

def read_entities(path):
    """Return the entities of the ENTITIES section as dicts: {type, layer, ...geometry}."""
    out, cur, in_ent, last_code_was_section = [], None, False, False
    for code, val in _pairs(path):
        if code == "0":
            if cur is not None and in_ent:
                out.append(_finish(cur))
            if val == "SECTION":
                cur = None; last_code_was_section = True; continue
            if val == "ENDSEC":
                in_ent = False; cur = None; continue
            cur = {"type": val, "tags": []}
            continue
        if last_code_was_section and code == "2":
            in_ent = (val == "ENTITIES"); last_code_was_section = False; continue
        if cur is not None:
            cur["tags"].append((code, val))
    return out

def _finish(e):
    t = e["tags"]
    g = lambda c: [v for k, v in t if k == c]
    first = lambda c, d=None: (g(c) or [d])[0]
    ent = {"type": e["type"], "layer": first("8", "0")}
    typ = e["type"]
    if typ == "LWPOLYLINE":
        xs, ys = [float(v) for v in g("10")], [float(v) for v in g("20")]
        ent["points"] = list(zip(xs, ys))
        ent["closed"] = bool(int(first("70", "0")) & 1)
    elif typ in ("TEXT", "MTEXT"):
        ent["text"] = first("1", "")
        ent["pos"] = (float(first("10", 0)), float(first("20", 0)))
        ent["height"] = float(first("40", 0))
    elif typ == "CIRCLE":
        ent["center"] = (float(first("10", 0)), float(first("20", 0)))
        ent["r"] = float(first("40", 0))
    elif typ == "ARC":
        ent["center"] = (float(first("10", 0)), float(first("20", 0)))
        ent["r"] = float(first("40", 0))
        ent["a0"], ent["a1"] = float(first("50", 0)), float(first("51", 0))
    elif typ == "LINE":
        ent["points"] = [(float(first("10", 0)), float(first("20", 0))), (float(first("11", 0)), float(first("21", 0)))]
    elif typ == "ELLIPSE":
        ent["center"] = (float(first("10", 0)), float(first("20", 0)))
        ent["major"] = (float(first("11", 0)), float(first("21", 0)))
        ent["ratio"] = float(first("40", 1))
    return ent

# ---------- geometry helpers ----------
def area(poly):
    n = len(poly)
    return abs(sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))) / 2

def bbox(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))

def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def centroid(points):
    return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))
