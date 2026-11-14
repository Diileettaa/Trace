"""Dependency-free IFC (STEP ISO-10303-21) reader that extracts what quantity-takeoff questions need:
storeys, spaces (with net floor area), building elements per class and storey, and their base quantities."""
import re, os, pickle, hashlib, collections
from functools import lru_cache

KEEP = {"IFCBUILDINGSTOREY", "IFCSPACE", "IFCRELAGGREGATES", "IFCRELCONTAINEDINSPATIALSTRUCTURE",
        "IFCRELDEFINESBYPROPERTIES", "IFCELEMENTQUANTITY", "IFCQUANTITYAREA", "IFCQUANTITYVOLUME",
        "IFCQUANTITYLENGTH", "IFCQUANTITYCOUNT", "IFCPROPERTYSET", "IFCPROPERTYSINGLEVALUE", "IFCPROJECT",
        "IFCBUILDING", "IFCSITE", "IFCRELDEFINESBYTYPE",
        # geometry needed for space footprints
        "IFCPRODUCTDEFINITIONSHAPE", "IFCSHAPEREPRESENTATION", "IFCEXTRUDEDAREASOLID", "IFCARBITRARYCLOSEDPROFILEDEF",
        "IFCARBITRARYPROFILEDEFWITHVOIDS", "IFCRECTANGLEPROFILEDEF", "IFCPOLYLINE", "IFCCARTESIANPOINT",
        "IFCINDEXEDPOLYCURVE", "IFCCARTESIANPOINTLIST2D", "IFCSIUNIT", "IFCBOOLEANCLIPPINGRESULT", "IFCBOOLEANRESULT",
        "IFCFACETEDBREP", "IFCCLOSEDSHELL", "IFCFACE", "IFCFACEOUTERBOUND", "IFCFACEBOUND", "IFCPOLYLOOP",
        "IFCPOLYGONALFACESET", "IFCCARTESIANPOINTLIST3D", "IFCINDEXEDPOLYGONALFACE", "IFCCONVERSIONBASEDUNIT",
        "IFCSANITARYTERMINALTYPE", "IFCLIGHTFIXTURETYPE", "IFCSTAIRTYPE", "IFCDOORSTYLE", "IFCWINDOWSTYLE",
        "IFCFLOWTERMINALTYPE", "IFCUNITASSIGNMENT"}
ELEMENTS = {"IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE", "IFCDOOR", "IFCDOORSTANDARDCASE", "IFCWINDOW",
            "IFCWINDOWSTANDARDCASE", "IFCSLAB", "IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE", "IFCCOLUMN",
            "IFCCOLUMNSTANDARDCASE", "IFCBEAM", "IFCBEAMSTANDARDCASE", "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAMP",
            "IFCROOF", "IFCRAILING", "IFCCURTAINWALL", "IFCPLATE", "IFCMEMBER", "IFCCOVERING", "IFCFURNISHINGELEMENT",
            "IFCFURNITURE", "IFCSANITARYTERMINAL", "IFCLIGHTFIXTURE", "IFCFLOWTERMINAL", "IFCBUILDINGELEMENTPROXY",
            "IFCOPENINGELEMENT", "IFCFOOTING"}
CACHE = os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine"))

# ---------- STEP text -> records ----------
def _decode(s):
    s = re.sub(r"\\X2\\((?:[0-9A-F]{4})+)\\X0\\", lambda m: "".join(chr(int(m.group(1)[i:i+4], 16)) for i in range(0, len(m.group(1)), 4)), s)
    s = re.sub(r"\\X\\([0-9A-F]{2})", lambda m: bytes([int(m.group(1), 16)]).decode("latin-1"), s)
    s = re.sub(r"\\S\\(.)", lambda m: chr(ord(m.group(1)) + 128), s)
    return s.replace("''", "'")

def parse_args(s, i=0):
    """Parse a STEP argument list starting at s[i]=='(' -> (list, next_index)."""
    assert s[i] == "("; i += 1; out = []; n = len(s)
    while i < n:
        c = s[i]
        if c in " \r\n\t,": i += 1; continue
        if c == ")": return out, i + 1
        if c == "(":
            v, i = parse_args(s, i); out.append(v); continue
        if c == "'":
            j = i + 1
            while True:
                j = s.index("'", j)
                if j + 1 < n and s[j + 1] == "'": j += 2; continue
                break
            out.append(_decode(s[i + 1:j])); i = j + 1; continue
        if c == "#":
            j = i + 1
            while j < n and s[j].isdigit(): j += 1
            out.append(("ref", int(s[i + 1:j]))); i = j; continue
        if c == "$" or c == "*": out.append(None); i += 1; continue
        if c == ".":
            j = s.index(".", i + 1); out.append(("enum", s[i + 1:j])); i = j + 1; continue
        if c.isalpha():  # typed value e.g. IFCLABEL('x')
            j = i
            while s[j] != "(": j += 1
            v, i = parse_args(s, j); out.append(v[0] if len(v) == 1 else v); continue
        j = i
        while j < n and s[j] not in ",)": j += 1
        tok = s[i:j].strip()
        try: out.append(float(tok) if any(ch in tok for ch in ".Ee") else int(tok))
        except ValueError: out.append(tok)
        i = j
    return out, i

_ENT = re.compile(r"#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(", re.S)

def read_records(path):
    with open(path, encoding="latin-1") as f: txt = f.read()
    data = txt[txt.find("DATA;"):]
    recs = {}
    for m in _ENT.finditer(data):
        typ = m.group(2).upper()
        if typ not in KEEP and typ not in ELEMENTS: continue
        try: args, _ = parse_args(data, m.end() - 1)
        except Exception: continue
        recs[int(m.group(1))] = (typ, args)
    return recs

def _r(v): return v[1] if isinstance(v, tuple) and v[0] == "ref" else None

# ---------- geometry: space footprint area ----------
def _poly_area(pts):
    n = len(pts)
    if n > 1 and pts[0] == pts[-1]: pts = pts[:-1]; n -= 1
    return abs(sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))) / 2 if n >= 3 else 0.0

def _curve_pts(R, k):
    t, a = R.get(k, (None, None))
    if t == "IFCPOLYLINE":
        return [tuple(R[_r(p)][1][0][:2]) for p in a[0] if _r(p) in R]
    if t == "IFCINDEXEDPOLYCURVE":
        pl = R.get(_r(a[0]))
        return [tuple(c[:2]) for c in pl[1][0]] if pl else []
    return []

def _profile_area(R, k):
    t, a = R.get(k, (None, None))
    if t == "IFCARBITRARYCLOSEDPROFILEDEF": return _poly_area(_curve_pts(R, _r(a[2])))
    if t == "IFCARBITRARYPROFILEDEFWITHVOIDS":
        return _poly_area(_curve_pts(R, _r(a[2]))) - sum(_poly_area(_curve_pts(R, _r(v))) for v in a[3] or [])
    if t == "IFCRECTANGLEPROFILEDEF": return float(a[3]) * float(a[4])
    return 0.0

def _poly3_area_xy(pts):
    return _poly_area([(p[0], p[1]) for p in pts])

def _brep_footprint(R, k):
    """Area of the lowest horizontal faces of a faceted B-rep / polygonal face set (plan footprint)."""
    t, a = R.get(k, (None, None)); faces = []
    if t == "IFCFACETEDBREP":
        sh = R.get(_r(a[0]))
        for fk in (sh[1][0] if sh else []) or []:
            f = R.get(_r(fk))
            if not f: continue
            for bk in f[1][0] or []:
                b = R.get(_r(bk))
                if b and b[0] == "IFCFACEOUTERBOUND":
                    loop = R.get(_r(b[1][0]))
                    if loop: faces.append([tuple(R[_r(p)][1][0]) + (0,) * (3 - len(R[_r(p)][1][0])) for p in loop[1][0] if _r(p) in R])
    elif t == "IFCPOLYGONALFACESET":
        pl = R.get(_r(a[0])); P = pl[1][0] if pl else []
        for fk in a[2] or []:
            f = R.get(_r(fk))
            if f: faces.append([tuple(P[i - 1]) for i in f[1][0]])
    if not faces: return 0.0
    zmin = min(p[2] for f in faces for p in f if len(p) > 2)
    flat = [f for f in faces if f and all(abs(p[2] - zmin) < 1e-3 for p in f)]
    return sum(_poly3_area_xy(f) for f in flat)

def _solid_area(R, k, depth=0):
    t, a = R.get(k, (None, None))
    if t in ("IFCFACETEDBREP", "IFCPOLYGONALFACESET"): return _brep_footprint(R, k)
    if t == "IFCEXTRUDEDAREASOLID": return _profile_area(R, _r(a[0]))
    if t in ("IFCBOOLEANCLIPPINGRESULT", "IFCBOOLEANRESULT") and depth < 6: return _solid_area(R, _r(a[1]), depth + 1)
    return 0.0

def _shape_area(R, k):
    t, a = R.get(k, (None, None))
    if t != "IFCPRODUCTDEFINITIONSHAPE": return 0.0
    reps = [R.get(_r(rk)) for rk in a[2] or []]
    reps = [r for r in reps if r]
    for wanted in (("Body", "body"), ("Facetation", "Reference")):
        for rep in reps:
            if rep[1][1] in wanted:
                v = sum(_solid_area(R, _r(i)) for i in rep[1][3] or [])
                if v > 0: return v
    return 0.0

_PRE = {"MILLI": 1e-3, "CENTI": 1e-2, "DECI": 1e-1}
def _unit_scales(R, T):
    sc = {"LENGTHUNIT": 1.0, "AREAUNIT": 1.0, "VOLUMEUNIT": 1.0}
    units = T["IFCSIUNIT"]
    for pk in T["IFCPROJECT"]:            # prefer the units the project itself assigns
        ua = R.get(_r(R[pk][1][8])) if len(R[pk][1]) > 8 else None
        if ua: units = [_r(u) for u in ua[1][0] if _r(u) in R and R[_r(u)][0] == "IFCSIUNIT"]; break
    for k in units:
        a = R[k][1]
        if isinstance(a[1], tuple) and a[1][1] in sc:
            pre = a[2][1] if isinstance(a[2], tuple) else None
            p = _PRE.get(pre, 1.0); sc[a[1][1]] = p ** {"LENGTHUNIT": 1, "AREAUNIT": 2, "VOLUMEUNIT": 3}[a[1][1]]
    return sc

def _length_scale(R, T): return _unit_scales(R, T)["LENGTHUNIT"]

# ---------- records -> model summary ----------
def build(path):
    R = read_records(path)
    T = collections.defaultdict(list)
    for k, (t, a) in R.items(): T[t].append(k)
    name = lambda k: R[k][1][2] if k in R else None
    storeys = {k: {"name": R[k][1][2], "long": R[k][1][7] if len(R[k][1]) > 7 else None,
                   "elev": R[k][1][9] if len(R[k][1]) > 9 and isinstance(R[k][1][9], (int, float)) else None}
               for k in T["IFCBUILDINGSTOREY"]}
    parent = {}                                   # child -> spatial/aggregate parent
    for k in T["IFCRELAGGREGATES"]:
        a = R[k][1]; p = _r(a[4])
        for c in a[5] or []: parent[_r(c)] = p
    contained = {}
    for k in T["IFCRELCONTAINEDINSPATIALSTRUCTURE"]:
        a = R[k][1]; p = _r(a[5])
        for c in a[4] or []: contained[_r(c)] = p
    def storey_of(k, depth=0):
        if k in storeys: return k
        if depth > 8: return None
        p = contained.get(k) or parent.get(k)
        return storey_of(p, depth + 1) if p else None
    # quantities and single-value properties per object
    US = _unit_scales(R, T)
    QSCALE = {"IFCQUANTITYLENGTH": US["LENGTHUNIT"], "IFCQUANTITYAREA": US["AREAUNIT"], "IFCQUANTITYVOLUME": US["VOLUMEUNIT"]}
    qty = collections.defaultdict(dict); props = collections.defaultdict(dict)
    for k in T["IFCRELDEFINESBYPROPERTIES"]:
        a = R[k][1]; d = _r(a[5]); objs = [_r(x) for x in (a[4] or [])]
        if d not in R: continue
        dt, da = R[d]
        if dt == "IFCELEMENTQUANTITY":
            for qk in da[5] or []:
                q = R.get(_r(qk))
                if not q: continue
                val = q[1][3] if len(q[1]) > 3 else None
                if isinstance(val, (int, float)):
                    val = val * QSCALE.get(q[0], 1.0)
                    for o in objs: qty[o].setdefault(q[1][0], val)
        elif dt == "IFCPROPERTYSET":
            for pk in da[4] or []:
                p = R.get(_r(pk))
                if p and p[0] == "IFCPROPERTYSINGLEVALUE":
                    for o in objs: props[o].setdefault(p[1][0], p[1][2])
    scale = _length_scale(R, T)
    typeof = {}
    for k in T["IFCRELDEFINESBYTYPE"]:
        a = R[k][1]; ty = R.get(_r(a[5]))
        if ty:
            for o in a[4] or []: typeof[_r(o)] = ty[0]
    spaces = []
    for k in T["IFCSPACE"]:
        a = R[k][1]
        ga = _shape_area(R, _r(a[6])) * scale ** 2 if len(a) > 6 else 0.0
        spaces.append({"id": k, "guid": a[0], "name": a[2], "long": a[7] if len(a) > 7 else None,
                       "geom_area": round(ga, 4) if ga > 0 else None,
                       "storey": storeys.get(storey_of(k), {}).get("name"), "q": qty.get(k, {}),
                       "p": {kk: v for kk, v in props.get(k, {}).items() if isinstance(v, (int, float, str))}})
    elements = []
    for t in ELEMENTS:
        for k in T[t]:
            a = R[k][1]
            elements.append({"id": k, "guid": a[0], "cls": t, "name": a[2], "type": a[7] if len(a) > 7 else None,
                             "storey": storeys.get(storey_of(k), {}).get("name"), "q": qty.get(k, {}),
                             "aggregated": k in parent and parent[k] not in storeys,
                             "type_cls": typeof.get(k),
                             "predef": a[-1][1] if a and isinstance(a[-1], tuple) and a[-1][0] == "enum" else None})
    proj = [R[k][1][2] for k in T["IFCPROJECT"]] + [R[k][1][3] for k in T["IFCPROJECT"]]
    bld = [R[k][1][2] for k in T["IFCBUILDING"]] + [R[k][1][7] for k in T["IFCBUILDING"] if len(R[k][1]) > 7]
    return {"file": os.path.basename(path), "project": [p for p in proj if p], "building": [b for b in bld if b],
            "storeys": list(storeys.values()), "spaces": spaces, "elements": elements}

@lru_cache(maxsize=16)
def load(path):
    st = os.stat(path); key = hashlib.md5(f"{path}|{st.st_size}|{st.st_mtime}|v6".encode()).hexdigest()
    os.makedirs(CACHE, exist_ok=True); cp = os.path.join(CACHE, key + ".pkl")
    if os.path.exists(cp):
        with open(cp, "rb") as f: return pickle.load(f)
    m = build(path)
    with open(cp, "wb") as f: pickle.dump(m, f)
    return m
