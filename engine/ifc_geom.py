"""IFC placement + geometry, dependency-free (no IfcOpenShell): world coordinates of spaces, storeys and elements.

Supports the geometry most authoring tools export: IfcLocalPlacement chains, IfcExtrudedAreaSolid (arbitrary /
rectangle profiles), faceted B-reps, IfcPolygonalFaceSet, IfcMappedItem (shared type geometry), boolean clipping
(first operand). Anything else is reported as unsupported instead of being guessed.

Coordinates
  IFC world: metres, Z up (after the project's length unit).
  web-ifc world (what the 3D viewer shows): X = x, Y = z (up), Z = -y. Use frame="webifc" (default) to get those.
  If the viewer also moves the model to the origin (web-ifc COORDINATE_TO_ORIGIN), add `origin_shift` yourself.

spaces(path), storeys(path), room_of(path, guids), clearances(path, guid), element_geometry(path, guid)."""
import os, re, math, pickle, hashlib, collections
from functools import lru_cache
from . import ifc as I

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "ifcgeom")
GEOM = {"IFCLOCALPLACEMENT", "IFCAXIS2PLACEMENT3D", "IFCAXIS2PLACEMENT2D", "IFCDIRECTION", "IFCCARTESIANPOINT",
        "IFCPRODUCTDEFINITIONSHAPE", "IFCSHAPEREPRESENTATION", "IFCEXTRUDEDAREASOLID", "IFCARBITRARYCLOSEDPROFILEDEF",
        "IFCARBITRARYPROFILEDEFWITHVOIDS", "IFCRECTANGLEPROFILEDEF", "IFCPOLYLINE", "IFCINDEXEDPOLYCURVE",
        "IFCCARTESIANPOINTLIST2D", "IFCCARTESIANPOINTLIST3D", "IFCFACETEDBREP", "IFCCLOSEDSHELL", "IFCFACE",
        "IFCFACEOUTERBOUND", "IFCFACEBOUND", "IFCPOLYLOOP", "IFCPOLYGONALFACESET", "IFCINDEXEDPOLYGONALFACE",
        "IFCMAPPEDITEM", "IFCREPRESENTATIONMAP", "IFCCARTESIANTRANSFORMATIONOPERATOR3D",
        "IFCCARTESIANTRANSFORMATIONOPERATOR3DNONUNIFORM", "IFCBOOLEANCLIPPINGRESULT", "IFCBOOLEANRESULT",
        "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCRELAGGREGATES", "IFCBUILDINGSTOREY", "IFCSPACE", "IFCSIUNIT",
        "IFCPROJECT", "IFCUNITASSIGNMENT", "IFCCONVERSIONBASEDUNIT", "IFCMEASUREWITHUNIT", "IFCRELSPACEBOUNDARY",
        "IFCRELSPACEBOUNDARY1STLEVEL", "IFCRELSPACEBOUNDARY2NDLEVEL", "IFCTRIANGULATEDFACESET", "IFCCIRCLEPROFILEDEF",
        "IFCFACEBASEDSURFACEMODEL", "IFCSHELLBASEDSURFACEMODEL", "IFCCONNECTEDFACESET", "IFCOPENSHELL",
        "IFCFACETEDBREPWITHVOIDS", "IFCGEOMETRICREPRESENTATIONCONTEXT", "IFCRELFILLSELEMENT", "IFCRELVOIDSELEMENT",
        "IFCFLOWSEGMENT", "IFCPIPESEGMENT", "IFCDUCTSEGMENT", "IFCCABLECARRIERSEGMENT", "IFCCABLESEGMENT", "IFCSWEPTDISKSOLID", "IFCSURFACEOFLINEAREXTRUSION", "IFCHALFSPACESOLID", "IFCPOLYGONALBOUNDEDHALFSPACE"}

def _r(v): return v[1] if isinstance(v, tuple) and v[0] == "ref" else None

@lru_cache(maxsize=8)
def _records(path):
    st = os.stat(path); key = hashlib.md5(f"{path}|{st.st_size}|{st.st_mtime}|g5".encode()).hexdigest()
    cp = os.path.join(CACHE, key + ".pkl")
    if os.path.exists(cp):
        with open(cp, "rb") as f: return pickle.load(f)
    with open(path, encoding="latin-1") as f: txt = f.read()
    data = txt[txt.find("DATA;"):]
    R = {}
    for m in I._ENT.finditer(data):
        typ = m.group(2).upper()
        if typ not in GEOM and typ not in I.ELEMENTS: continue
        try: args, _ = I.parse_args(data, m.end() - 1)
        except Exception: continue
        R[int(m.group(1))] = (typ, args)
    T = collections.defaultdict(list)
    for k, (t, _) in R.items(): T[t].append(k)
    out = (R, dict(T), I._length_scale(R, T))
    os.makedirs(CACHE, exist_ok=True)
    with open(cp, "wb") as f: pickle.dump(out, f)
    return out

# ------------------------------------------------------------------------------------------- linear algebra
def _vec(R, k, default):
    if k is None or k not in R: return list(default)
    a = R[k][1][0]; v = [float(x) for x in a] + [0.0] * (3 - len(a))
    return v[:3]

def _norm(v):
    n = math.sqrt(sum(x * x for x in v)) or 1.0; return [x / n for x in v]

def _cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

def _mat(origin, x, z):
    """4x4 row-major from origin, x axis, z axis."""
    z = _norm(z); x = _norm([x[i] - sum(x[j] * z[j] for j in range(3)) * z[i] for i in range(3)]); y = _cross(z, x)
    return [[x[0], y[0], z[0], origin[0]], [x[1], y[1], z[1], origin[1]], [x[2], y[2], z[2], origin[2]], [0, 0, 0, 1]]

def _mul(A, B): return [[sum(A[i][k] * B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]

def _apply(M, p): return [M[i][0] * p[0] + M[i][1] * p[1] + M[i][2] * p[2] + M[i][3] for i in range(3)]

ID = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]

def _axis2(R, k):
    if k not in R: return ID
    t, a = R[k]
    if t == "IFCAXIS2PLACEMENT2D":
        o = _vec(R, _r(a[0]), (0, 0, 0)); x = _vec(R, _r(a[1]) if len(a) > 1 else None, (1, 0, 0))
        return _mat(o, x, (0, 0, 1))
    o = _vec(R, _r(a[0]), (0, 0, 0)); z = _vec(R, _r(a[1]) if len(a) > 1 else None, (0, 0, 1))
    x = _vec(R, _r(a[2]) if len(a) > 2 else None, (1, 0, 0) if abs(z[2]) > 0.9 else (0, 0, 1) if False else (1, 0, 0))
    if abs(sum(x[i] * _norm(z)[i] for i in range(3))) > 0.999: x = [0, 1, 0] if abs(z[1]) < 0.9 else [0, 0, 1]
    return _mat(o, x, z)

def placement(R, k, depth=0):
    """IfcLocalPlacement chain -> 4x4 (IFC units)."""
    if k not in R or depth > 30: return ID
    t, a = R[k]
    if t != "IFCLOCALPLACEMENT": return ID
    rel = _r(a[0]); M = _axis2(R, _r(a[1]))
    return _mul(placement(R, rel, depth + 1), M) if rel else M

def _operator(R, k):
    """IfcCartesianTransformationOperator3D -> 4x4."""
    if k not in R: return ID
    a = R[k][1]
    x = _vec(R, _r(a[0]), (1, 0, 0)); y = _vec(R, _r(a[1]), (0, 1, 0)); o = _vec(R, _r(a[2]), (0, 0, 0))
    s = float(a[3]) if len(a) > 3 and isinstance(a[3], (int, float)) else 1.0
    z = _vec(R, _r(a[4]) if len(a) > 4 else None, _cross(_norm(x), _norm(y)))
    M = _mat(o, x, z)
    for i in range(3):
        for j in range(3): M[i][j] *= s
    return M

# ---------------------------------------------------------------------------------------------- geometry
def _pts2(R, k):
    t, a = R.get(k, (None, None))
    if t == "IFCPOLYLINE": return [list(R[_r(p)][1][0][:2]) for p in a[0] if _r(p) in R]
    if t == "IFCINDEXEDPOLYCURVE":
        pl = R.get(_r(a[0])); return [list(c[:2]) for c in pl[1][0]] if pl else []
    return []

def _profile(R, k):
    """-> outer polygon (2D, profile coordinates) or None."""
    t, a = R.get(k, (None, None))
    if t in ("IFCARBITRARYCLOSEDPROFILEDEF", "IFCARBITRARYPROFILEDEFWITHVOIDS"):
        p = _pts2(R, _r(a[2])); return p if len(p) >= 3 else None
    if t == "IFCRECTANGLEPROFILEDEF":
        M = _axis2(R, _r(a[2])) if len(a) > 2 and _r(a[2]) else ID; X, Y = float(a[3]) / 2, float(a[4]) / 2
        return [_apply(M, [x, y, 0])[:2] for x, y in ((-X, -Y), (X, -Y), (X, Y), (-X, Y))]
    if t == "IFCCIRCLEPROFILEDEF":
        M = _axis2(R, _r(a[2])) if len(a) > 2 and _r(a[2]) else ID; r = float(a[3])
        return [_apply(M, [r * math.cos(2 * math.pi * i / 16), r * math.sin(2 * math.pi * i / 16), 0])[:2] for i in range(16)]
    return None

def _item_pts(R, k, M, unsupported, depth=0):
    """World vertices (IFC units) of one representation item under transform M."""
    if depth > 12: return []
    if k not in R: unsupported.add("unread item"); return []
    t, a = R[k]
    if t == "IFCEXTRUDEDAREASOLID":
        prof = _profile(R, _r(a[0]))
        if not prof: unsupported.add(R.get(_r(a[0]), ("?",))[0]); return []
        P = _mul(M, _axis2(R, _r(a[1]))) if _r(a[1]) else M
        d = _norm(_vec(R, _r(a[2]), (0, 0, 1))); h = float(a[3])
        return [_apply(P, [x, y, 0]) for x, y in prof] + [_apply(P, [x + d[0] * h, y + d[1] * h, d[2] * h]) for x, y in prof]
    if t in ("IFCFACEBASEDSURFACEMODEL", "IFCSHELLBASEDSURFACEMODEL"):
        pts = []
        for sh in a[0] or []:
            for f in (R.get(_r(sh), (None, [[]]))[1][0] or []):
                for b in R.get(_r(f), (None, [[]]))[1][0]:
                    loop = R.get(_r(R.get(_r(b), (None, [None]))[1][0]))
                    if loop: pts += [_apply(M, _vec(R, _r(p), (0, 0, 0))) for p in loop[1][0]]
        return pts
    if t in ("IFCFACETEDBREP", "IFCFACETEDBREPWITHVOIDS"):
        sh = R.get(_r(a[0])); pts = []
        for f in (sh[1][0] if sh else []):
            for b in R.get(_r(f), (None, [[]]))[1][0]:
                loop = R.get(_r(R.get(_r(b), (None, [None]))[1][0]))
                if loop: pts += [_apply(M, _vec(R, _r(p), (0, 0, 0))) for p in loop[1][0]]
        return pts
    if t in ("IFCPOLYGONALFACESET", "IFCTRIANGULATEDFACESET"):
        pl = R.get(_r(a[0])); return [_apply(M, [float(c) for c in v[:3]]) for v in (pl[1][0] if pl else [])]
    if t == "IFCMAPPEDITEM":
        rm = R.get(_r(a[0]))
        if not rm: return []
        origin = rm[1][0]; MO = _axis2(R, _r(origin)) if _r(origin) in R and R[_r(origin)][0].startswith("IFCAXIS2") else _operator(R, _r(origin))
        MT = _operator(R, _r(a[1])); rep = R.get(_r(rm[1][1])); pts = []
        for it in (rep[1][3] if rep and len(rep[1]) > 3 else []):
            pts += _item_pts(R, _r(it), _mul(_mul(M, MT), MO), unsupported, depth + 1)
        return pts
    if t in ("IFCBOOLEANCLIPPINGRESULT", "IFCBOOLEANRESULT"):
        return _item_pts(R, _r(a[1]), M, unsupported, depth + 1)
    unsupported.add(t); return []

def _product(R, k):
    """-> (world vertices in metres, IFC frame; unsupported item types) for an IfcProduct record id."""
    a = R[k][1]; M = placement(R, _r(a[5])) if len(a) > 5 else ID
    unsupported, pts = set(), []
    pds = R.get(_r(a[6])) if len(a) > 6 else None
    reps = [R[_r(x)] for x in (pds[1][2] if pds else []) if _r(x) in R]
    body = [r for r in reps if str(r[1][1]).strip("'") in ("Body", "Facetation", "Brep", "MappedRepresentation")] or reps
    for r in body[:1]:
        for it in r[1][3] or []: pts += _item_pts(R, _r(it), M, unsupported)
    return pts, unsupported, M

def _to(frame, p, s):
    x, y, z = p[0] * s, p[1] * s, p[2] * s
    return [round(x, 4), round(z, 4), round(-y, 4)] if frame == "webifc" else [round(x, 4), round(y, 4), round(z, 4)]

def _hull(P):
    P = sorted(set((round(x, 5), round(y, 5)) for x, y in P))
    if len(P) < 3: return [list(p) for p in P]
    cr = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return [list(p) for p in lo[:-1] + up[:-1]]

def _inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: c = not c
    return c

def _seg_dist(p, a, b):
    ax, ay = a; bx, by = b; px, py = p; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L))
    q = (ax + t * dx, ay + t * dy); return math.hypot(px - q[0], py - q[1]), q

def _label_point(poly):
    """A point well inside the polygon (works for L-shapes): best of a grid by distance to the edges."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]; best, bp = -1, None
    for i in range(1, 20):
        for j in range(1, 20):
            p = (min(xs) + (max(xs) - min(xs)) * i / 20, min(ys) + (max(ys) - min(ys)) * j / 20)
            if not _inside(p, poly): continue
            d = min(_seg_dist(p, poly[k], poly[(k + 1) % len(poly)])[0] for k in range(len(poly)))
            if d > best: best, bp = d, p
    return list(bp) if bp else None

# ------------------------------------------------------------------------------------------------ public
def _space_outline(R, k, s):
    """Exact outline (IFC frame, metres) when the space is an extrusion of a profile; else convex hull of vertices."""
    a = R[k][1]; M = placement(R, _r(a[5])); pds = R.get(_r(a[6])) if len(a) > 6 else None
    for x in (pds[1][2] if pds else []):
        rep = R.get(_r(x))
        for it in (rep[1][3] if rep and len(rep[1]) > 3 else []):
            if R.get(_r(it), ("",))[0] == "IFCEXTRUDEDAREASOLID":
                ia = R[_r(it)][1]; prof = _profile(R, _r(ia[0]))
                if prof and abs(sum(prof[i][0] * prof[(i + 1) % len(prof)][1] - prof[(i + 1) % len(prof)][0] * prof[i][1]
                                    for i in range(len(prof)))) / 2 * s * s > 0.05:   # degenerate profile -> body hull
                    P = _mul(M, _axis2(R, _r(ia[1]))) if _r(ia[1]) else M
                    return [[_apply(P, [x, y, 0])[0] * s, _apply(P, [x, y, 0])[1] * s] for x, y in prof], "profile", float(ia[3]) * s
    pts, uns, _ = _product(R, k)
    if pts: return [[p[0] * s, p[1] * s] for p in _hull([(p[0], p[1]) for p in pts])], "convex hull of the body", None
    return None, "no supported geometry (" + ", ".join(sorted(uns)) + ")" if uns else "no geometry", None

@lru_cache(maxsize=8)
def _spaces_ifc(path):
    R, T, s = _records(path); M = I.load(path)
    st_of = {sp["guid"]: sp["storey"] for sp in M["spaces"]}
    area_of = {sp["guid"]: sp["q"].get("NetFloorArea") or sp.get("geom_area") for sp in M["spaces"]}
    out = []
    for k in T.get("IFCSPACE", []):
        a = R[k][1]; poly, how, h = _space_outline(R, k, s)
        if poly and how == "profile" and _label_point(poly) is None:          # self-overlapping / sliver profile
            pts0, _, _ = _product(R, k)
            if pts0: poly, how = [[p[0] * s, p[1] * s] for p in _hull([(p[0], p[1]) for p in pts0])], "convex hull of the body (profile unusable)"
        pts, _, _ = _product(R, k); zs = [p[2] * s for p in pts]
        out.append({"id": k, "guid": a[0], "name_raw": a[2], "long_name": a[7] if len(a) > 7 else None,
                    "storey_name": st_of.get(a[0]), "polygon_ifc": poly, "outline": how,
                    "z": [min(zs), max(zs)] if zs else None, "height_m": round(h, 3) if h else (round(max(zs) - min(zs), 3) if zs else None),
                    "area_m2": area_of.get(a[0])})
    return out

def spaces(path, frame="webifc"):
    sts = {x["name"]: x for x in storeys(path, frame)}
    out = []
    for sp in _spaces_ifc(path):
        poly = sp["polygon_ifc"]; z0, z1 = sp["z"] or (None, None)
        lp = _label_point(poly) if poly else None
        conv = (lambda x, y, z: _to(frame, [x, y, z], 1.0))
        P2 = [[c[0], c[2]] if frame == "webifc" else [c[0], c[1]] for c in (conv(x, y, 0) for x, y in poly)] if poly else None
        bb = None
        if poly and z0 is not None:
            xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
            A, B = conv(min(xs), min(ys), z0), conv(max(xs), max(ys), z1)
            bb = [[min(A[i], B[i]) for i in range(3)], [max(A[i], B[i]) for i in range(3)]]
        st = sts.get(sp["storey_name"]) or {}
        out.append({"guid": sp["guid"], "name_raw": sp["name_raw"], "long_name": sp["long_name"], "storey_guid": st.get("guid"),
                    "storey_name": sp["storey_name"], "elevation_m": st.get("elevation_m"), "height_m": sp["height_m"],
                    "area_m2": sp["area_m2"], "polygon": [[round(x, 4), round(y, 4)] for x, y in P2] if P2 else None,
                    "polygon_frame": "webifc: [X, Z] floor plane" if frame == "webifc" else "ifc: [x, y]",
                    "label_point": conv(lp[0], lp[1], (z0 or 0) + 0.05) if lp else None, "bbox": bb,
                    "outline": sp["outline"]})
    return out

def storeys(path, frame="webifc"):
    R, T, s = _records(path)
    ks = T.get("IFCBUILDINGSTOREY", [])
    elev = {}
    for k in ks:
        a = R[k][1]; e = a[9] if len(a) > 9 and isinstance(a[9], (int, float)) else None
        if e is None: e = placement(R, _r(a[5]))[2][3]
        elev[k] = e * s
    order = sorted(ks, key=lambda k: elev[k]); sp = _spaces_ifc(path); out = []
    n_sp = {k: sum(1 for x in sp if x["storey_name"] == R[k][1][2]) for k in order}
    for i, k in enumerate(order):
        a = R[k][1]; mine = [x for x in sp if x["storey_name"] == a[2]]
        # floor-to-floor: next storey that holds rooms (skips split / intermediate levels), else the next one
        nxt = next((j for j in order[i + 1:] if n_sp[j]), order[i + 1] if i + 1 < len(order) else None) if mine else \
              (order[i + 1] if i + 1 < len(order) else None)
        h = round(elev[nxt] - elev[k], 3) if nxt is not None else None
        bb = None
        P = [p for x in mine if x["polygon_ifc"] for p in x["polygon_ifc"]]
        if P:
            z0 = elev[k]; z1 = z0 + (h or max((x["height_m"] or 0) for x in mine) or 3.0)
            A = _to(frame, [min(p[0] for p in P), min(p[1] for p in P), z0], 1.0); B = _to(frame, [max(p[0] for p in P), max(p[1] for p in P), z1], 1.0)
            bb = [[min(A[j], B[j]) for j in range(3)], [max(A[j], B[j]) for j in range(3)]]
        out.append({"guid": a[0], "name": a[2], "elevation_m": round(elev[k], 3), "height_m": h, "bbox": bb, "space_count": len(mine)})
    return out

def element_geometry(path, guid):
    R, T, s = _records(path)
    k = next((k for k, (t, a) in R.items() if t in I.ELEMENTS and a and a[0] == guid), None)
    if k is None: return None
    pts, uns, M = _product(R, k)
    return {"id": k, "class": R[k][0], "name": R[k][1][2], "pts": [[p[0] * s, p[1] * s, p[2] * s] for p in pts],
            "unsupported": sorted(uns), "axes": [[M[0][0], M[1][0]], [M[0][1], M[1][1]]],
            "axes3": [[M[0][j], M[1][j], M[2][j]] for j in range(3)], "origin": [M[0][3] * s, M[1][3] * s, M[2][3] * s]}

def north(path):
    """-> (unit north vector in IFC plan x/y, basis). basis "true_north" when the model states IfcGeometricRepresentation
    Context.TrueNorth, else "project_north" (+Y of the model, i.e. plan-up; not confirmed as geographic north)."""
    R, T, s = _records(path)
    for k in T.get("IFCGEOMETRICREPRESENTATIONCONTEXT", []):
        a = R[k][1]
        if len(a) > 5 and _r(a[5]) in R:
            v = _vec(R, _r(a[5]), (0, 1, 0))
            if math.hypot(v[0], v[1]) > 1e-9: n = _norm([v[0], v[1], 0]); return (n[0], n[1]), "true_north"
    return (0.0, 1.0), "project_north"

def compass(v, n):
    """Bearing (deg, clockwise from north) and N/E/S/W of plan vector v given north n."""
    e = (n[1], -n[0]); b = math.degrees(math.atan2(v[0] * e[0] + v[1] * e[1], v[0] * n[0] + v[1] * n[1])) % 360
    return round(b, 1), "NESW"[int(((b + 45) % 360) // 90)]

def room_of(path, guids, frame="webifc", space_model=None):
    """space_model: another IFC of the same project holding the rooms (e.g. the architectural model when the
    fixtures are in a plumbing model); both must share coordinates."""
    R, T, s = _records(path); sp = _spaces_ifc(space_model or path); by_id = {x["id"]: x for x in sp} if not space_model else {}
    contained = {}
    for k in T.get("IFCRELCONTAINEDINSPATIALSTRUCTURE", []):
        a = R[k][1]; p = _r(a[5])
        if p in by_id:
            for c in a[4] or []: contained[_r(c)] = by_id[p]
    out = {}
    for g in guids:
        e = element_geometry(path, g)
        if e is None: out[g] = {"space_guid": None, "warnings": ["no element with this GlobalId"]}; continue
        if e["id"] in contained:
            x = contained[e["id"]]; out[g] = {"space_guid": x["guid"], "space_name": x["long_name"] or x["name_raw"], "method": "rel-contained", "storey_name": x["storey_name"]}; continue
        pts = e["pts"] or [e["origin"]]
        c = [sum(p[i] for p in pts) / len(pts) for i in range(3)]; zmin = min(p[2] for p in pts)
        hit = [x for x in sp if x["polygon_ifc"] and _inside((c[0], c[1]), x["polygon_ifc"]) and (x["z"] is None or x["z"][0] - 0.3 <= zmin <= x["z"][1])]
        if hit:
            x = min(hit, key=lambda x: abs(x["z"][0] - zmin) if x["z"] else 0)
            out[g] = {"space_guid": x["guid"], "space_name": x["long_name"] or x["name_raw"], "method": "point-in-polygon", "storey_name": x["storey_name"]}
        else: out[g] = {"space_guid": None, "space_name": None, "method": "point-in-polygon", "storey_name": None,
                        "warnings": ["element centre is not inside any room outline"]}
    return out

def clearances(path, guid, frame="webifc", space_model=None):
    """Shortest horizontal distance from the element's own geometry to each wall bounding its room."""
    base = {"guid": guid, "room_guid": None, "north_basis": None, "sides": [], "exact": False, "method": "geometry:mesh-to-wall-face", "warnings": []}
    e = element_geometry(path, guid)
    if e is None: return {**base, "warnings": ["no element with this GlobalId"]}
    if not e["pts"]: return {**base, "warnings": ["element geometry not supported: " + (", ".join(e["unsupported"]) or "none")]}
    room = room_of(path, [guid], frame, space_model)[guid]; base["room_guid"] = room.get("space_guid")
    if not room.get("space_guid"): return {**base, "warnings": ["element is not inside a room outline; walls unknown"]}
    wpath = space_model or path
    walls = I.room_walls(wpath, room["space_guid"])
    if not walls["walls"]: return {**base, "warnings": ["room walls unknown: " + "; ".join(walls["warnings"])]}
    R, T, s = _records(wpath)
    foot = _hull([(p[0], p[1]) for p in e["pts"]]); zmin = min(p[2] for p in e["pts"]) + 0.01
    ax, ay = e["axes"]; o = e["origin"]; N, basis = north(path)
    if space_model:
        N2, b2 = north(space_model)
        if basis != "true_north": N, basis = N2, b2
        if b2 == "true_north" and basis == "true_north" and abs(N[0] * N2[0] + N[1] * N2[1] - 1) > 1e-3:
            warn_n = "the two models state different true north; using the fixture model's"
        elif (b2 == "true_north") != (north(path)[1] == "true_north"):
            warn_n = "only one of the two models states true north; using it - confirm the models share orientation"
        else: warn_n = None
    else: warn_n = None
    sides, warn, exact = [], [], not e["unsupported"]
    for w in walls["walls"]:
        wk = next((k for k, (t, a) in R.items() if t in I.ELEMENTS and a and a[0] == w["guid"]), None)
        wp, wu, _ = _product(R, wk) if wk else ([], {"missing"}, None)
        if not wp: warn.append(f"wall {w['name']}: geometry not supported"); exact = False; continue
        if wu: exact = False
        wf = _hull([(p[0] * s, p[1] * s) for p in wp])
        best = None
        for p in foot:                                   # element vertex -> wall outline edge
            for i in range(len(wf)):
                d, q = _seg_dist(p, wf[i], wf[(i + 1) % len(wf)])
                if best is None or d < best[0]: best = (d, p, q)
        for q in wf:                                     # wall vertex -> element outline edge
            for i in range(len(foot)):
                d, p = _seg_dist(q, foot[i], foot[(i + 1) % len(foot)])
                if best is None or d < best[0]: best = (d, p, q)
        d, p, q = best; v = (q[0] - p[0], q[1] - p[1])
        lx = v[0] * ax[0] + v[1] * ax[1]; ly = v[0] * ay[0] + v[1] * ay[1]   # in the element's own axes
        dirn = ("right" if lx > 0 else "left") if abs(lx) >= abs(ly) else ("front" if ly > 0 else "back")
        bearing, cp = compass(v, N) if math.hypot(*v) > 1e-9 else (None, None)
        if cp is None:     # touching: direction from the element centre to the contact point
            cxy = (sum(x[0] for x in foot) / len(foot), sum(x[1] for x in foot) / len(foot)); v2 = (q[0] - cxy[0], q[1] - cxy[1])
            bearing, cp = compass(v2, N) if math.hypot(*v2) > 1e-9 else (None, None)
        sides.append({"dir": dirn, "compass": cp, "bearing_deg": bearing, "basis": basis,
                      "distance_m": round(d, 3), "wall_guid": w["guid"], "wall_name": w["name"],
                      "from": _to(frame, [p[0], p[1], zmin], 1.0), "to": _to(frame, [q[0], q[1], zmin], 1.0)})
    sides.sort(key=lambda x: x["distance_m"])
    if warn_n: warn.append(warn_n)
    if e["unsupported"]: warn.append("element geometry partly unsupported: " + ", ".join(e["unsupported"]))
    warn.append("compass (N/E/S/W, bearing clockwise from north) is the common direction: " +
                ("true north stated in the model" if basis == "true_north" else
                 "the model states no true north, so north = model +Y (project north, plan-up), not confirmed") +
                "; dir (front/back/left/right) is the element's own local axes, reference only; outlines are convex hulls in plan")
    return {**base, "north_basis": basis, "sides": sides, "exact": exact and bool(sides), "warnings": warn + walls["warnings"]}
