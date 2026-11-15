"""2.5D scene for Swiss Dwellings floors straight from their DXF (semantic layers: WALL, ROOM_OUTLINE, ROOM_TEXT,
DOOR, WINDOW, FIXTURE). Exact plan geometry in metres; heights are not in a plan, so standard heights are used and
marked `assumed`. Same JSON shape as Xinran's /scene (web-ifc frame: X = x, Y = up, Z = -y)."""
from __future__ import annotations

import functools
import os

HEIGHT = {"wc": 0.42, "washbasin": 0.85, "shower": 0.05, "bathtub": 0.55, "stove": 0.9}
CATEGORY = {"wc": "toilet", "washbasin": "sink", "shower": "shower", "bathtub": "bathtub", "stove": "stove"}
WALL_H, DOOR_H, WIN_H, WIN_SILL, STOREY_H = 2.6, 2.1, 1.3, 0.9, 2.8


def _pt(x, y):
    return [round(float(x), 4), round(-float(y), 4)]


def _centre(b):
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


@functools.lru_cache(maxsize=32)
def _scene_cached(dxf_path: str, rel_path: str, mtime: float) -> dict:
    from engine import dxf, swiss

    d = swiss.parse(dxf_path)
    sid = "floor"
    src = lambda what: {"file": rel_path, "page": 1, "layer": what}
    rooms = []
    for i, r in enumerate(d.get("rooms") or []):
        if not r.get("poly"):
            continue
        cx, cy = dxf.centroid(r["poly"])
        rooms.append({"id": f"room-{r['number'] or i}", "number": r.get("number"), "name": r.get("name") or "Room",
                      "storey_id": sid, "polygon": [_pt(x, y) for x, y in r["poly"]], "floor_y_m": 0.0,
                      "height_m": STOREY_H, "area_m2": r.get("area"), "label_point": [round(cx, 4), 0.05, round(-cy, 4)],
                      "confidence": 1.0, "method": "swiss_dxf:room_outline", "source": src("ROOM_OUTLINE"), "assumed": False})
    walls = []
    for k, e in enumerate(x for x in dxf.read_entities(dxf_path) if x["layer"] == "WALL" and x["type"] == "LWPOLYLINE"):
        pts = e.get("points") or []
        if len(pts) < 2:
            continue
        ring = list(pts) + ([pts[0]] if len(pts) > 2 else [])
        for j in range(len(ring) - 1):
            (x0, y0), (x1, y1) = ring[j], ring[j + 1]
            if (x1 - x0) ** 2 + (y1 - y0) ** 2 < 0.01 ** 2:
                continue
            walls.append({"id": f"wall-{k}-{j}", "storey_id": sid, "points": [_pt(x0, y0), _pt(x1, y1)],
                          "thickness_m": 0.04, "base_y_m": 0.0, "height_m": WALL_H, "confidence": 1.0,
                          "method": "swiss_dxf:wall_outline", "source": src("WALL"), "assumed": True})
    openings = []
    for kind, items, h, sill in (("door", d.get("doors") or [], DOOR_H, 0.0), ("window", d.get("windows") or [], WIN_H, WIN_SILL)):
        for i, it in enumerate(items):
            b = it["bbox"]
            w, dpt = b[2] - b[0], b[3] - b[1]
            cx, cy = _centre(b)
            openings.append({"id": f"{kind}-{i + 1}", "kind": kind, "storey_id": sid,
                             "position": [round(cx, 4), sill, round(-cy, 4)], "rotation_deg": 0.0 if w >= dpt else 90.0,
                             "width_m": round(max(w, dpt), 3), "height_m": h, "sill_y_m": sill, "confidence": 1.0,
                             "method": f"swiss_dxf:{kind}", "source": src(kind.upper()), "assumed": True})
    objects = []
    fixtures = list(d.get("fixtures") or [])
    if not any(f.get("kind") == "bathtub" for f in fixtures):
        fixtures += [{"kind": "bathtub", "bbox": t["bbox"]} for t in d.get("bathtubs") or []]
    for i, f in enumerate(fixtures):
        kind = f.get("kind")
        if kind not in CATEGORY:
            continue
        b = f["bbox"]
        cx, cy = _centre(b)
        room = next((r for r in rooms if _inside(cx, -cy, r["polygon"])), None)
        objects.append({"id": f"{CATEGORY[kind]}-{i + 1}", "category": CATEGORY[kind], "name": CATEGORY[kind].title(),
                        "storey_id": sid, "room_id": room["id"] if room else None,
                        "position": [round(cx, 4), 0.0, round(-cy, 4)], "rotation_deg": 0.0,
                        "footprint": {"width_m": round(b[2] - b[0], 3), "depth_m": round(b[3] - b[1], 3)},
                        "height_m": HEIGHT[kind], "confidence": 1.0, "method": f"swiss_dxf:{kind}",
                        "source": src("FIXTURE"), "assumed": True})
    return {"project_id": os.path.splitext(os.path.basename(dxf_path))[0], "source_kind": "vector-drawing",
            "unit": "m", "quality": "measured",
            "coordinate_system": "web-ifc world: X = x_ifc, Y = z_ifc, Z = -y_ifc (DXF metres, X right, Y up, Z down)",
            "plan_up_vector": [0, -1],
            "warnings": ["Swiss DXF: walls, rooms, doors, windows and fixtures are exact plan geometry; heights are standard values (assumed)"],
            "sources": [{"file": rel_path}],
            "storeys": [{"id": sid, "name": "Floor", "elevation_m": 0.0, "height_m": STOREY_H}],
            "rooms": rooms, "walls": walls, "openings": openings, "objects": objects, "systems": []}


def _inside(x, z, poly):
    n, c = len(poly), False
    for i in range(n):
        x0, z0 = poly[i]; x1, z1 = poly[(i + 1) % n]
        if (z0 > z) != (z1 > z) and x < (x1 - x0) * (z - z0) / ((z1 - z0) or 1e-12) + x0:
            c = not c
    return c


def scene_for(rel_path: str, full_path) -> dict | None:
    """rel_path = the drawing the user opened (pdf/png/dxf of a Swiss floor); None when there is no DXF beside it."""
    base = os.path.splitext(str(full_path))[0]
    dxf_path = base + ".dxf"
    if "swiss_dwellings" not in rel_path.replace("\\", "/") or not os.path.isfile(dxf_path):
        return None
    return _scene_cached(dxf_path, rel_path, os.path.getmtime(dxf_path))
