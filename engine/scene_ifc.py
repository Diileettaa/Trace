"""2.5D measured scene from IFC (handoff 42): storeys / rooms / walls / openings / objects / systems.

Frame: web-ifc world without COORDINATE_TO_ORIGIN (offset 0): metres, X = x_ifc (east / right), Y = z_ifc (up),
Z = -y_ifc. Plan polygons are [X, Z]. Plan-up (project north, model +Y) is the -Z direction; `north_vector` gives the
model's true north as [X, Z] when the model states it.
rotation_deg: rotation about +Y in three.js convention (counter-clockwise seen from above): the element's local +X
axis maps to (cos r, 0, -sin r). `front_vector` [X, Z] = the element's local +Y (usual "front" of Revit families).

python -m engine.scene_ifc model.ifc [--storey NAME] [--room NAME|GUID] [--space-model arch.ifc] > scene.json"""
import os, math, json, argparse
from . import ifc as I, ifc_geom as G

TOILET = ("water closet", "toilet", "wc", "closet", "klosett", "wc-")
SINK = ("lavatory", "sink", "basin", "washbasin", "waschbecken", "lavabo", "allas")
SHOWER = ("shower", "dusche", "suihku")
BATH = ("bath tub", "bathtub", "badewanne", "amme")
SEGMENTS = {"IFCFLOWSEGMENT", "IFCPIPESEGMENT", "IFCDUCTSEGMENT", "IFCCABLECARRIERSEGMENT", "IFCCABLESEGMENT"}

def _cat(cls, name):
    n = str(name or "").lower()
    if cls in ("IFCDOOR", "IFCDOORSTANDARDCASE"): return "door"
    if cls in ("IFCWINDOW", "IFCWINDOWSTANDARDCASE"): return "window"
    if "vanity" in n: return "vanity"
    if "cabinet" in n or "counter" in n or "casework" in n: return None     # kitchen casework: not a fixture
    if any(w in n for w in TOILET): return "toilet"
    if any(w in n for w in SINK): return "sink"
    if any(w in n for w in SHOWER): return "shower"
    if any(w in n for w in BATH): return "bathtub"
    return None

def _xz(x, y): return [round(x, 4), round(-y, 4)]

def _local_box(pts, ax, ay):
    """Extents of plan points along the element's own axes -> (centre x,y, width along ax, depth along ay)."""
    u = [p[0] * ax[0] + p[1] * ax[1] for p in pts]; v = [p[0] * ay[0] + p[1] * ay[1] for p in pts]
    cu, cv = (min(u) + max(u)) / 2, (min(v) + max(v)) / 2
    return (cu * ax[0] + cv * ay[0], cu * ax[1] + cv * ay[1]), max(u) - min(u), max(v) - min(v), (min(u), max(u), cv)

def _rot(ax): return round(math.degrees(math.atan2(ax[1], ax[0])) % 360, 2)

def _frame(e):
    """Plan axes of an element. Usually local X/Y; wall-hosted families (sinks on a wall) may lay local Z flat, so take
    the first local axis that is horizontal as X and the in-plan perpendicular, signed like the other horizontal axis, as Y."""
    cols = e.get("axes3") or [[e["axes"][0][0], e["axes"][0][1], 0], [e["axes"][1][0], e["axes"][1][1], 0], [0, 0, 1]]
    flat = [c for c in cols if math.hypot(c[0], c[1]) > 0.5]
    if not flat: return (1.0, 0.0), (0.0, 1.0)
    ax = G._norm([flat[0][0], flat[0][1], 0])[:2]; ay = (-ax[1], ax[0])
    other = next((c for c in cols if c is not flat[0] and math.hypot(c[0], c[1]) > 0.5), None)
    if other is not None and other[0] * ay[0] + other[1] * ay[1] < 0: ay = (-ay[0], -ay[1])
    return ax, ay

def _src(path, guid): return {"file": path, "page": None, "guid": guid}

def _openings_of_walls(R, T):
    """door/window record id -> wall record id, via IfcRelFillsElement + IfcRelVoidsElement."""
    void = {}
    for k in T.get("IFCRELVOIDSELEMENT", []):
        a = R[k][1]; void[G._r(a[5])] = G._r(a[4])
    out = {}
    for k in T.get("IFCRELFILLSELEMENT", []):
        a = R[k][1]; op, el = G._r(a[4]), G._r(a[5])
        if op in void: out[el] = void[op]
    return out

def _num(v): return float(v) if isinstance(v, (int, float)) else None

def scene(path, storey=None, room=None, space_model=None, rel_path=None, rel_space_model=None):
    rel = rel_path or path; rel_sm = rel_space_model or space_model
    arch = space_model or path                                   # model with rooms / walls / openings
    R, T, s = G._records(arch); M = I.load(arch)
    N, basis = G.north(arch)
    sts = G.storeys(arch); sps = G.spaces(arch)
    warn = []
    st = None
    if storey is not None:
        st = next((x for x in sts if storey in (x["name"], x["guid"])), None)
        if st is None: return {"error": f"no storey {storey!r}", "storeys": [x["name"] for x in sts]}
    rm = None
    if room is not None:
        rm = next((x for x in sps if room in (x["guid"], x["name_raw"], x["long_name"], f"{x['name_raw']} {x['long_name']}")), None)
        if rm is None: return {"error": f"no room {room!r}", "rooms": [f"{x['name_raw']} {x['long_name']}" for x in sps]}
        st = next((x for x in sts if x["name"] == rm["storey_name"]), st)
    rooms = [x for x in sps if (rm is None or x["guid"] == rm["guid"]) and (st is None or x["storey_name"] == st["name"])]
    by_guid = {e["guid"]: e for e in M["elements"]}
    # ---------------------------------------------------------------- walls
    if rm is not None:
        rw = I.room_walls(arch, rm["guid"]); wall_guids = [w["guid"] for w in rw["walls"]]; warn += rw["warnings"]
    else:
        wall_guids = [e["guid"] for e in M["elements"] if e["cls"].startswith("IFCWALL") and (st is None or e["storey"] == st["name"])]
    walls, wall_id_of = [], {}
    for g in wall_guids:
        e = G.element_geometry(arch, g)
        if not e or not e["pts"]: warn.append(f"wall {g}: geometry not supported, left out"); continue
        ax, ay = _frame(e); P = [(p[0], p[1]) for p in e["pts"]]
        c, L, t, (u0, u1, cv) = _local_box(P, ax, ay)
        a = (u0 * ax[0] + cv * ay[0], u0 * ax[1] + cv * ay[1]); b = (u1 * ax[0] + cv * ay[0], u1 * ax[1] + cv * ay[1])
        zs = [p[2] for p in e["pts"]]
        hull = G._hull(P); area = abs(sum(hull[i][0] * hull[(i + 1) % len(hull)][1] - hull[(i + 1) % len(hull)][0] * hull[i][1] for i in range(len(hull)))) / 2
        straight = L * t > 0 and area / (L * t) > 0.85
        wall_id_of[e["id"]] = g
        walls.append({"id": g, "guid": g, "name": e["name"], "storey_id": (st or {}).get("guid") or _storey_guid(sts, by_guid.get(g)),
                      "points": [_xz(*a), _xz(*b)], "thickness_m": round(t, 3), "length_m": round(L, 3),
                      "base_y_m": round(min(zs), 3), "height_m": round(max(zs) - min(zs), 3),
                      "footprint": [_xz(x, y) for x, y in hull], "confidence": 1.0 if straight else 0.6,
                      "source": _src(rel if arch == path else rel_sm, g),
                      **({} if straight else {"warnings": ["not a straight wall: centre line is approximate; use footprint"]})})
    # ---------------------------------------------------------------- openings
    host = _openings_of_walls(R, T)
    openings = []
    keep_walls = {w["id"] for w in walls}
    for k in T.get("IFCDOOR", []) + T.get("IFCDOORSTANDARDCASE", []) + T.get("IFCWINDOW", []) + T.get("IFCWINDOWSTANDARDCASE", []):
        a = R[k][1]; g = a[0]; w_id = wall_id_of.get(host.get(k)) or (by_guid.get(_guid_of(R, host.get(k)), {}).get("guid"))
        el = by_guid.get(g)
        if rm is not None and w_id not in keep_walls: continue
        if rm is None and st is not None and el and el["storey"] != st["name"]: continue
        e = G.element_geometry(arch, g)
        if not e or not e["pts"]: warn.append(f"opening {g}: geometry not supported"); continue
        ax, ay = _frame(e); P = [(p[0], p[1]) for p in e["pts"]]; c, wdt, dep, _ = _local_box(P, ax, ay)
        zs = [p[2] for p in e["pts"]]
        H, W = (_num(a[8]), _num(a[9])) if len(a) > 9 else (None, None)
        kind = _cat(R[k][0], a[2])
        openings.append({"id": g, "guid": g, "kind": kind, "name": a[2], "wall_id": w_id,
                         "storey_id": (st or {}).get("guid") or _storey_guid(sts, el),
                         "position": [round(c[0], 4), round(min(zs), 4), round(-c[1], 4)],
                         "rotation_deg": _rot(ax), "front_vector": _xz(*ay),
                         "width_m": round(W * s, 3) if W else round(wdt, 3), "height_m": round(H * s, 3) if H else round(max(zs) - min(zs), 3),
                         "sill_y_m": round(min(zs), 3), "depth_m": round(dep, 3),
                         "size_from": "IfcDoor/IfcWindow OverallWidth/OverallHeight" if W else "geometry extents",
                         "confidence": 1.0, "source": _src(rel if arch == path else rel_sm, g)})
    # ---------------------------------------------------------------- objects (fixtures, from this model and the arch one)
    objects = []
    room_ids = {x["guid"] for x in rooms}
    for mp in dict.fromkeys([path, arch]):
        Mm = I.load(mp); cand = [e for e in Mm["elements"] if e["cls"] not in ("IFCDOOR", "IFCDOORSTANDARDCASE", "IFCWINDOW",
                                 "IFCWINDOWSTANDARDCASE", "IFCOPENINGELEMENT") and _cat(e["cls"], e["name"])]
        if not cand: continue
        where = G.room_of(mp, [e["guid"] for e in cand], space_model=None if mp == arch else arch)
        for e0 in cand:
            r = where[e0["guid"]]
            if rm is not None and r.get("space_guid") != rm["guid"]: continue
            if rm is None and st is not None and r.get("storey_name") != st["name"] and e0.get("storey") != st["name"]: continue
            e = G.element_geometry(mp, e0["guid"])
            if not e or not e["pts"]: continue
            ax, ay = _frame(e); P = [(p[0], p[1]) for p in e["pts"]]; c, wdt, dep, _ = _local_box(P, ax, ay)
            zs = [p[2] for p in e["pts"]]
            objects.append({"id": e0["guid"], "guid": e0["guid"], "category": _cat(e0["cls"], e0["name"]), "name": e0["name"],
                            "ifc_class": e0["cls"], "storey_id": _storey_guid(sts, None, r.get("storey_name")),
                            "room_id": r.get("space_guid"), "room_method": r.get("method"),
                            "position": [round(c[0], 4), round(min(zs), 4), round(-c[1], 4)],
                            "rotation_deg": _rot(ax), "front_vector": _xz(*ay),
                            "footprint": {"width_m": round(wdt, 3), "depth_m": round(dep, 3),
                                          "note": "width along local +X (rotation_deg), depth along front_vector"},
                            "height_m": round(max(zs) - min(zs), 3), "confidence": 1.0 if not e["unsupported"] else 0.6,
                            "source": _src(rel if mp == path else rel_sm, e0["guid"])})
    # ---------------------------------------------------------------- systems (pipe / duct / cable segments if the model has them)
    systems = []
    region = None                                   # IFC-frame box: the room (+0.5 m) or the storey's height band
    if rm is not None and rm["polygon"]:
        xs = [p[0] for p in rm["polygon"]]; ys = [-p[1] for p in rm["polygon"]]; y0 = rm["elevation_m"] or 0
        region = (min(xs) - .5, max(xs) + .5, min(ys) - .5, max(ys) + .5, y0 - .5, y0 + (rm["height_m"] or 3) + .5)
    elif st is not None:
        region = (-1e9, 1e9, -1e9, 1e9, st["elevation_m"] - .3, st["elevation_m"] + (st["height_m"] or 3.5) - .01)
    for mp in dict.fromkeys([path, arch]):
        Rm, Tm, sm = G._records(mp)
        for cls in SEGMENTS:
            for k in Tm.get(cls, []):
                pts, uns, _ = G._product(Rm, k)
                if not pts: continue
                P = [(p[0] * sm, p[1] * sm, p[2] * sm) for p in pts]
                if region and not any(region[0] <= p[0] <= region[1] and region[2] <= p[1] <= region[3] and region[4] <= p[2] <= region[5] for p in P): continue
                # segment axis = the two farthest-apart points of its body (straight segments)
                a0 = max(P, key=lambda p: (p[0] - P[0][0]) ** 2 + (p[1] - P[0][1]) ** 2 + (p[2] - P[0][2]) ** 2)
                b0 = max(P, key=lambda p: (p[0] - a0[0]) ** 2 + (p[1] - a0[1]) ** 2 + (p[2] - a0[2]) ** 2)
                systems.append({"id": Rm[k][1][0], "guid": Rm[k][1][0], "kind": _system_kind(mp, Rm[k][1][2]), "ifc_class": cls,
                                "points": [G._to("webifc", a0, 1.0), G._to("webifc", b0, 1.0)], "confidence": 0.7,
                                "warnings": ["axis from the segment's body extent (straight segment assumed)"],
                                "source": _src(rel if mp == path else rel_sm, Rm[k][1][0])})
    if not systems: warn.append("no pipe / duct / cable segments in these models: systems left empty")
    out_storeys = [x for x in sts if st is None or x["guid"] == st["guid"]]
    for x in out_storeys:
        P = [p for w in walls if w["storey_id"] == x["guid"] for p in w["footprint"]]
        x["outline"] = [[round(a, 4), round(b, 4)] for a, b in G._hull([tuple(p) for p in P])] if P else None
        x["outline_from"] = "convex hull of the storey's walls" if P else None
        x["id"] = x["guid"]; x["source"] = _src(rel if arch == path else rel_sm, x["guid"])
    out_rooms = [{"id": x["guid"], "guid": x["guid"], "name": x["long_name"] or x["name_raw"], "number": x["name_raw"],
                  "storey_id": x["storey_guid"], "polygon": x["polygon"], "outline": x["outline"],
                  "floor_y_m": x["elevation_m"], "height_m": x["height_m"], "area_m2": x["area_m2"],
                  "label_point": x["label_point"], "confidence": 1.0 if x["outline"] == "profile" else 0.7,
                  "source": _src(rel if arch == path else rel_sm, x["guid"])} for x in rooms]
    if basis != "true_north": warn.append("the model states no true north: north_vector = plan-up (project north), not confirmed")
    return {"project_id": os.path.splitext(os.path.basename(arch))[0], "source_kind": "ifc", "unit": "m",
            "coordinate_system": "web-ifc world, no COORDINATE_TO_ORIGIN: X = x_ifc (right/east), Y = z_ifc (up), Z = -y_ifc; plan [X, Z]",
            "plan_up_vector": [0, -1], "north_vector": [round(N[0], 4), round(-N[1], 4)], "north_basis": basis,
            "true_north_deg": round(math.degrees(math.atan2(N[0], N[1])) % 360, 2),
            "rotation_convention": "rotation_deg about +Y, three.js: local +X -> (cos r, 0, -sin r); footprint width along local +X, depth along front_vector = local +Y in [X, Z]. Which side is the user side of a family is not stated by IFC: place icons by rotation + footprint, treat front_vector as a hint",
            "quality": "measured", "warnings": warn,
            "sources": [{"file": f, "page": None} for f in dict.fromkeys([rel, rel_sm]) if f],
            "storeys": out_storeys, "rooms": out_rooms, "walls": walls, "openings": openings, "objects": objects, "systems": systems}

def _guid_of(R, k): return R[k][1][0] if k in R else None

def _storey_guid(sts, el, name=None):
    n = name or (el or {}).get("storey")
    return next((x["guid"] for x in sts if x["name"] == n), None)

def _system_kind(path, name):
    t = (os.path.basename(path) + " " + str(name)).lower()
    for k, ws in (("water", ("plumb", "water", "pipe", "sanit", "drain")), ("electrical", ("elec", "cable", "power")),
                  ("hvac", ("hvac", "duct", "air", "mech"))):
        if any(w in t for w in ws): return k
    return "unknown"

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("ifc"); ap.add_argument("--storey"); ap.add_argument("--room")
    ap.add_argument("--space-model"); a = ap.parse_args()
    print(json.dumps(scene(a.ifc, a.storey, a.room, a.space_model), ensure_ascii=False, indent=1))
