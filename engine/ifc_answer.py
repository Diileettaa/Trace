"""Answer ifc_models / ifc_bench quantity questions from the parsed IFC summary (engine.ifc)."""
import os, re
from . import ifc

OPEN = "'«„\""; CLOSE = "'»“”\""
QUOTED = re.compile(f"[{OPEN}](.+?)[{CLOSE}](?=[\\s,?.]|$)")

CLASSES = {  # concept -> IFC classes; multilingual keywords
    "door":    (r"\bdoors?\b|Türen|puertas|deuren|døre|ust\b|uksi|drzwi|\bporte\b|\buși\b|\busi\b", ["IFCDOOR", "IFCDOORSTANDARDCASE"]),
    "window":  (r"windows?|Fenster|ventanas|ramen|vinduer|aken|akn|okien|finestre|ferestre", ["IFCWINDOW", "IFCWINDOWSTANDARDCASE"]),
    "wall":    (r"\bwalls?\b|Wände|muros|wanden|vægge|\bsein[au]\b|ścian|\bmuri\b|pereți|pereti", ["IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE"]),
    "slab":    (r"slabs?|Decken|Bodenplatten|forjados|vloeren|dæk|plader|plaat|płyt", ["IFCSLAB", "IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE"]),
    "column":  (r"columns?|Stützen|pilares|kolommen|søjler|\bposti\b|słup", ["IFCCOLUMN", "IFCCOLUMNSTANDARDCASE"]),
    "beam":    (r"beams?|Träger|vigas|balken|bjælker|tala|belek", ["IFCBEAM", "IFCBEAMSTANDARDCASE"]),
    "stair":   (r"stairs?|Treppen|escaleras|trappen|trapper|trepp|schod|\bscale\b|scări|scari", ["IFCSTAIR"]),
    "sanitary":(r"sanitary|Sanitär|sanitari|sanitair|sanitet", ["IFCSANITARYTERMINAL"]),
    "light":   (r"light fixtures?|Leuchten|luminarias|armaturen|lamper", ["IFCLIGHTFIXTURE"]),
    "space":   (r"\brooms?\b|\bspaces?\b|Räume|\bRaums?\b|\blocal(?:es)?\b|\bruimtes?\b|\brum(?:met)?\b|ruumi|pomieszcze|\blocali\b|încăperi|camere", None),
}

def _num(v):
    try: return float(str(v).replace(",", ".").split()[0])
    except (ValueError, IndexError): return None

AREA_Q = ["NetFloorArea", "Net Floor Area", "NetArea", "SpaceNetFloorAreaBOMA", "GrossFloorArea"]
AREA_P = re.compile(r"^(?:\d+_)?(Pindala|Area|Fläche|Nettofläche|Superficie|Areal|Oppervlakte|Measured Net Area)$", re.I)

def space_area(s):
    if s.get("geom_area"): return s["geom_area"], "geometry:footprint"
    for k in AREA_Q:
        if k in s["q"]: return s["q"][k], f"Qto:{k}"
    for k, v in s["p"].items():
        if AREA_P.match(k) and _num(v) is not None: return _num(v), f"Pset:{k}"
    if s.get("geom_area"): return s["geom_area"], "geometry:footprint"
    return None, None

def _quoted(q):
    return [m.group(1) for m in QUOTED.finditer(q)]

def _storey_match(M, name):
    st = [s["name"] for s in M["storeys"]]
    if name in st: return name
    low = {s.lower(): s for s in st if s}
    return low.get(name.lower(), name)

def _find_space(M, room, storey):
    m = re.match(r"(.*) \((.*)\)$", room)
    long_, num = (m.group(1), m.group(2)) if m else (room, None)
    c = [s for s in M["spaces"] if (s["long"] == long_ and s["name"] == num) or (s["name"] == long_ and s["long"] == num)]
    if not c: c = [s for s in M["spaces"] if s["name"] == room or s["long"] == room]
    if len(c) > 1 and storey: c = [s for s in c if s["storey"] == storey] or c
    return c

def answer(path, question, M):
    q = question; quoted = _quoted(q); warn = []; items = []
    is_model = bool(re.search(r"in the model|enthält das Modell|en el modelo|in het model|i modellen|mudelis|w modelu|Modell|nel modello|modelul|bevat het model|het model", q))
    storey = None if is_model else (_storey_match(M, quoted[-1]) if quoted else None)
    bare = QUOTED.sub("X", q)   # keep quoted names out of keyword matching
    concept = next((c for c, (rx, _) in CLASSES.items() if re.search(rx, bare, re.I)), None)
    qtype = ("volume" if re.search(r"m³|volume|Volumen|volumen", bare) else
             "length" if re.search(r"length|\blang\b|longitud|lengte|længde|pikkus|metres|meter|Metern", bare, re.I) and "m²" not in q else
             "area" if "m²" in q else "count")
    TYPE_OF = {"sanitary": "IFCSANITARYTERMINALTYPE", "light": "IFCLIGHTFIXTURETYPE"}
    def els(cls, concept=None):
        tc = TYPE_OF.get(concept)
        out = [e for e in M["elements"] if (e["cls"] in cls or (tc and e.get("type_cls") == tc)) and (is_model or e["storey"] == storey)]
        if concept == "stair": out = [e for e in out if not e.get("aggregated")]
        return out
    def it(e, **kw): return {"guid": e["guid"], "category": e["cls"], "name": e.get("name"), "storey": e.get("storey"), **kw}
    if qtype == "area" and concept == "space" and not re.search(r"all rooms|aller Räume|todos los locales|alle ruimtes|alle rum|kõigi ruumide|wszystkich", bare):
        room = quoted[0] if quoted else ""
        c = _find_space(M, room, storey)
        if not c: return None, "count", [], "ifc:space_area", ["space not found: " + room]
        v, src = space_area(c[0])
        return (round(v, 3) if v is not None else None), "m2", [{"guid": c[0]["guid"], "category": "IFCSPACE", "name": room, "storey": c[0]["storey"], "area_m2": v}], f"ifc:space_area[{src}]", warn
    if qtype == "area" and concept == "space":
        sp = [s for s in M["spaces"] if s["storey"] == storey]
        vals = [(s, space_area(s)[0]) for s in sp]
        miss = [s for s, v in vals if v is None]
        if miss: warn.append(f"{len(miss)} spaces without area")
        return round(sum(v for _, v in vals if v), 3), "m2", [{"guid": s["guid"], "category": "IFCSPACE", "name": s["long"] or s["name"], "area_m2": v} for s, v in vals], "ifc:storey_space_area", warn
    if concept in ("wall", "slab") and qtype in ("area", "volume", "length"):
        key = {"volume": ["NetVolume", "GrossVolume"], "length": ["Length"], "area": ["NetSideArea", "GrossSideArea"]}[qtype]
        if concept == "slab" and qtype == "area": key = ["NetArea", "GrossArea"]
        es = els(CLASSES[concept][1]); tot = 0; miss = 0
        for e in es:
            v = next((e["q"][k] for k in key if k in e["q"]), None)
            if v is None: miss += 1; continue
            tot += v; items.append(it(e, **{qtype: v}))
        if miss: warn.append(f"{miss} of {len(es)} {concept}s had no {key[0]} quantity")
        return round(tot, 3), {"volume": "m3", "length": "m", "area": "m2"}[qtype], items, f"ifc:{concept}_{qtype}", warn
    if qtype == "count" and concept == "space":
        sp = [s for s in M["spaces"] if is_model or s["storey"] == storey]
        return len(sp), "count", [{"guid": s["guid"], "category": "IFCSPACE", "name": s["long"] or s["name"]} for s in sp], "ifc:count_space", warn
    if qtype == "count" and concept:
        es = els(CLASSES[concept][1], concept)
        return len(es), "count", [it(e) for e in es], f"ifc:count_{concept}", warn
    return None, None, [], "ifc:unknown", ["question not recognised"]
