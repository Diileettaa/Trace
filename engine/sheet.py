"""Vector understanding of one drawing sheet (a PDF page with real vector geometry and a text layer).

What it extracts, all with page coordinates so every answer can point at its evidence:
  - text, including rotated text (vertical dimension strings are read the right way round),
  - the drawing scale (1:50, 1:200, 1/4" = 1'-0", 1" = 40'-0") -> metres per PDF point,
  - dimension strings (mm numbers, feet-inches) and equipment / pipe-support tags (PS-12, FP-3, CV-1, FSCV-6 ...),
  - repeated small filled marks (e.g. "large filled dots on piping indicate pipe support locations"),
  - door leaves: quarter-circle swing arcs of a door-sized radius (0.6-1.4 m at the sheet scale), and double
    doors (two leaves whose hinges are about two leaf widths apart).

sheet.answer() lets a language model pick ONE operation over these facts; this module does the counting and the
arithmetic, so numbers are never made up by the model. Needs pdfplumber + numpy."""
import os, re, json, math, hashlib, collections

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "sheet")
TAG = re.compile(r"^([A-Z]{1,5})-(\d{1,3}[A-Z]?)$")
INCH_PER_PT = 1 / 72

# ----------------------------------------------------------------------------------------------------------- text
def _words(pg):
    out = []
    flow = [w for w in pg.extract_words(use_text_flow=True, extra_attrs=["upright"], return_chars=True) if w["upright"]]
    vert = [w for w in pg.extract_words(extra_attrs=["upright"], return_chars=True) if not w["upright"]]
    for w in flow + vert:            # text-flow order keeps kerned labels whole; rotated text needs the geometric pass
        t = w["text"]
        if not w["upright"]:
            m = w["chars"][0].get("matrix") or (0, 1, 0, 0, 0, 0)
            if m[1] > 0: t = t[::-1]          # rotated 90 deg counter-clockwise: pdfplumber reads it top-down
        out.append({"t": t, "box": [round(w["x0"], 1), round(w["top"], 1), round(w["x1"], 1), round(w["bottom"], 1)],
                    "vertical": not w["upright"]})
    return out

def _lines_of_text(words, gap=1.6):
    """Group horizontal words into text lines (for notes and callouts)."""
    hs = sorted([w for w in words if not w["vertical"]], key=lambda w: (round(w["box"][1]), w["box"][0]))
    lines = []
    for w in hs:
        for L in lines:
            b = L["box"]; h = b[3] - b[1]
            if abs(w["box"][1] - b[1]) < 0.4 * h and 0 <= w["box"][0] - b[2] < gap * h:
                L["t"] += " " + w["t"]; L["box"] = [b[0], min(b[1], w["box"][1]), w["box"][2], max(b[3], w["box"][3])]; break
        else: lines.append({"t": w["t"], "box": list(w["box"])})
    return lines

def _blocks(lines):
    """Stack text lines that belong to one label (room names split over 2-3 lines, centred on each other)."""
    out = []
    for L in sorted(lines, key=lambda L: L["box"][1]):
        b = L["box"]; h = b[3] - b[1]; cx = (b[0] + b[2]) / 2
        for B in out:
            bb = B["box"]
            aligned = abs(cx - (bb[0] + bb[2]) / 2) < 1.0 * h or abs(b[0] - bb[0]) < 0.6 * h
            if 0 <= b[1] - bb[3] < 0.8 * h and aligned and abs((bb[3] - bb[1]) / B["n"] - h) < 0.3 * h:
                B["t"] += " " + L["t"]; B["box"] = [min(bb[0], b[0]), bb[1], max(bb[2], b[2]), b[3]]; B["n"] += 1; break
        else: out.append({"t": L["t"], "box": list(b), "n": 1})
    return out

# ---------------------------------------------------------------------------------------------------------- scale
SCALE_PATTERNS = [
    (re.compile(r"1\s*:\s*(\d{1,4})\b"), lambda m: 0.0254 * INCH_PER_PT * float(m.group(1))),
    (re.compile(r"(\d+(?:/\d+)?)\s*\"\s*=\s*(\d+)\s*'\s*-?\s*(\d+)?\s*\"?"),
     lambda m: (float(m.group(2)) + float(m.group(3) or 0) / 12) * 0.3048 / (eval_frac(m.group(1)) * 72)),
]
def eval_frac(s):
    a, _, b = s.partition("/"); return float(a) / float(b) if b else float(a)

def scale_of(text):
    """-> (metres per PDF point, the scale text) from 'SCALE: 1 : 50', '1/4" = 1'-0"', '1:200' ... or (None, None).
    Prefers a value written after the word SCALE."""
    cands = []
    for pat, f in SCALE_PATTERNS:
        for m in pat.finditer(text):
            pre = text[max(0, m.start() - 12):m.start()].upper()
            try: cands.append((("SCALE" in pre), f(m), m.group(0).strip()))
            except Exception: pass
    if not cands: return None, None
    cands.sort(key=lambda c: -c[0]); return cands[0][1], cands[0][2]

FTIN = re.compile(r"^(\d+)'-?(\d+(?:\s?\d/\d)?)?\"?$")
def dim_value(t):
    """'12000' -> 12000 (mm as written); 133'-10\" -> metres. -> (value, unit) or None."""
    t = t.strip().replace("’", "'").replace("”", '"')
    m = FTIN.match(t)
    if m:
        inch = m.group(2) or "0"; inch = sum(eval_frac(x) for x in inch.split())
        return round((int(m.group(1)) + inch / 12) * 0.3048, 4), "m"
    if re.fullmatch(r"\d{2,6}", t): return int(t), "mm?"
    return None

# -------------------------------------------------------------------------------------------------------- symbols
def _fit_circle(P):
    import numpy as np
    P = np.array(P, float); x, y = P[:, 0], P[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]; b = x * x + y * y
    (cx, cy, c), *_ = np.linalg.lstsq(A, b, rcond=None); r = math.sqrt(max(c + cx * cx + cy * cy, 1e-9))
    err = float(np.abs(np.hypot(x - cx, y - cy) - r).max()); ang = np.unwrap(np.arctan2(y - cy, x - cx))
    return float(cx), float(cy), r, err, math.degrees(abs(ang[-1] - ang[0]))

def door_leaves(pg, mpp):
    """Quarter-circle swing arcs with a door-sized radius. -> leaves [{box, hinge, radius_m}], doorsets."""
    if not mpp: return [], []
    leaves = []
    for o in pg.curves:
        P = o["pts"]
        if len(P) < 5: continue
        w, h = o["x1"] - o["x0"], o["bottom"] - o["top"]
        if not (0.7 < (w + 1e-6) / (h + 1e-6) < 1.43): continue        # a swing (with or without its leaf) is square
        for Q in (P, P[:-1], P[1:], P[:-2]):                            # the leaf line may close the arc path
            if len(Q) < 4: continue
            cx, cy, r, err, span = _fit_circle(Q)
            if err < 0.03 * r + 0.15 and 0.6 <= r * mpp <= 1.4 and 75 <= span <= 105:
                leaves.append({"box": [round(o["x0"], 1), round(o["top"], 1), round(o["x1"], 1), round(o["bottom"], 1)],
                               "hinge": [round(cx, 1), round(cy, 1)], "radius_m": round(r * mpp, 2),
                               "ends": [[round(Q[0][0], 1), round(Q[0][1], 1)], [round(Q[-1][0], 1), round(Q[-1][1], 1)]]}); break
    # de-duplicate (same arc drawn twice)
    uniq = []
    for L in leaves:
        if not any(abs(L["hinge"][0] - u["hinge"][0]) < 1 and abs(L["hinge"][1] - u["hinge"][1]) < 1 and
                   abs(L["radius_m"] - u["radius_m"]) < 0.05 for u in uniq): uniq.append(L)
    # double doors: two leaves of similar radius, hinges ~2 leaf widths apart, closed-leaf tips meeting in the middle
    used, sets = set(), []
    for i, a in enumerate(uniq):
        if i in used: continue
        for j in range(i + 1, len(uniq)):
            b = uniq[j]
            if j in used or abs(a["radius_m"] - b["radius_m"]) > 0.25: continue
            d = math.dist(a["hinge"], b["hinge"]) * mpp
            tips = min(math.dist(p, q) for p in a["ends"] for q in b["ends"]) * mpp
            if abs(d - a["radius_m"] - b["radius_m"]) < 0.15 and tips < 0.06:
                used |= {i, j}; sets.append({"leaves": [i, j], "type": "double"}); break
        else: used.add(i); sets.append({"leaves": [i], "type": "single"})
    return uniq, sets

BLACK = {"0", "0.0", "(0,)", "[0]", "(0.0,)", "[0.0]", "(0, 0, 0)", "[0, 0, 0]", "(0.0, 0.0, 0.0)", "[0.0, 0.0, 0.0]"}

def windows(pg, mpp):
    """Window symbols in plan: 3+ thin parallel lines of the same span (wall faces + glazing) spanning a wall-thick
    band (0.15-0.7 m) between two solid wall pieces; stair treads (long ladders of lines) are rejected.
    -> [{box, width_m}]"""
    if not mpp: return []
    segs = []
    for o in pg.lines:
        if o.get("linewidth", 0) > 1.5: continue
        x0, y0, x1, y1 = o["x0"], o["top"], o["x1"], o["bottom"]
        if abs(y1 - y0) < 0.3: segs.append(("h", round(min(x0, x1)), round(max(x0, x1)), (y0 + y1) / 2))
        elif abs(x1 - x0) < 0.3: segs.append(("v", round(min(y0, y1)), round(max(y0, y1)), (x0 + x1) / 2))
    for o in pg.rects:
        if o["fill"]: continue
        x0, x1, t, b = o["x0"], o["x1"], o["top"], o["bottom"]
        segs += [("h", round(x0), round(x1), t), ("h", round(x0), round(x1), b), ("v", round(t), round(b), x0), ("v", round(t), round(b), x1)]
    fills = [(o["x0"], o["top"], o["x1"], o["bottom"]) for o in list(pg.rects) + list(pg.curves)
             if o.get("fill") and str(o.get("non_stroking_color")) in BLACK]
    solid = lambda x, y, e=1.2: any(b[0] - e <= x <= b[2] + e and b[1] - e <= y <= b[3] + e for b in fills)
    G = collections.defaultdict(list)
    for k, a, b, c in segs: G[(k, a, b)].append(c)
    out = []
    for (k, a, b), cs in G.items():
        if not 0.3 <= (b - a) * mpp <= 4: continue
        cs = sorted(set(round(c, 1) for c in cs)); cl = [[cs[0]]]
        for c in cs[1:]: (cl[-1].append(c) if (c - cl[-1][0]) * mpp <= 0.7 else cl.append([c]))
        for g in cl:
            iso = not any((c < g[0] and (g[0] - c) * mpp < 0.4) or (c > g[-1] and (c - g[-1]) * mpp < 0.4) for c in cs)
            if len(g) < 3 or not 0.15 <= (g[-1] - g[0]) * mpp <= 0.7 or not iso: continue
            m = (g[0] + g[-1]) / 2
            if not ((solid(a, m) and solid(b, m)) if k == "h" else (solid(m, a) and solid(m, b))): continue
            box = [a, g[0], b, g[-1]] if k == "h" else [g[0], a, g[-1], b]
            out.append({"box": [round(v, 1) for v in box], "width_m": round((b - a) * mpp, 2)})
    return out

def rooms(pdf_path, page, facts, res=0.02):
    """Rooms as the free space around each text label, from a raster of the dark linework (walls) with door leaves
    and window symbols drawn shut. -> [{name, area_m2, perimeter_m, doors: [widths], baseboard_m, box}].
    Baseboard = room perimeter minus the widths of the door leaves hinged on that room's boundary."""
    mpp = facts["scale"]["m_per_pt"]
    if not mpp: return []
    try:
        import numpy as np, cv2, pypdfium2 as pdfium
    except ImportError: return []
    s = mpp / res
    img = np.array(pdfium.PdfDocument(pdf_path)[page].render(scale=s, grayscale=True).to_pil())
    wall = cv2.dilate((img < 110).astype(np.uint8), np.ones((2, 2), np.uint8))   # furniture is grey, walls black
    P = lambda p: (int(p[0] * s), int(p[1] * s))
    for L in facts["door_leaves"]:
        for e in L["ends"]: cv2.line(wall, P(L["hinge"]), P(e), 1, 3)
    for w in facts.get("windows", []): b = w["box"]; cv2.rectangle(wall, P(b[:2]), P(b[2:]), 1, -1)
    n, lab, st, _ = cv2.connectedComponentsWithStats(1 - wall, connectivity=4)
    border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    out, seen = [], {}
    k = max(1, int(0.35 / res))
    for B in facts.get("labels", []):
        cx, cy = P(((B["box"][0] + B["box"][2]) / 2, (B["box"][1] + B["box"][3]) / 2))
        if not (0 <= cy < lab.shape[0] and 0 <= cx < lab.shape[1]): continue
        i = int(lab[cy, cx])
        if i == 0 or i in border: continue
        area = st[i, cv2.CC_STAT_AREA] * res * res
        if area < 1.0 or area > 1500: continue
        if i not in seen:
            m = (lab == i).astype(np.uint8)
            cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            per = sum(cv2.arcLength(c, True) for c in cs) * res
            near = cv2.dilate(m, np.ones((k, k), np.uint8))
            doors = [L["radius_m"] for L in facts["door_leaves"]
                     if 0 <= P(L["hinge"])[1] < near.shape[0] and 0 <= P(L["hinge"])[0] < near.shape[1] and near[P(L["hinge"])[1], P(L["hinge"])[0]]]
            x, y, w, h = st[i, 0], st[i, 1], st[i, 2], st[i, 3]
            seen[i] = {"name": B["t"], "area_m2": round(area, 2), "perimeter_m": round(per, 2), "doors": doors,
                       "baseboard_m": round(per - sum(doors), 2), "box": [round(v / s, 1) for v in (x, y, x + w, y + h)]}
            out.append(seen[i])
        elif B["t"] not in seen[i]["name"].split(" + "):
            seen[i]["name"] += " + " + B["t"]          # two labels in one region: the split between them was not found
    return out

def filled_marks(pg, max_size=10):
    """Groups of identical small filled marks (dots / squares) -> [{size, count, boxes}] largest first."""
    g = collections.defaultdict(list)
    for o in list(pg.rects) + list(pg.curves):
        w, h = o["x1"] - o["x0"], o["bottom"] - o["top"]
        if not o.get("fill") or o.get("stroke") and o.get("linewidth", 0) > 1: continue
        if not (2 <= w <= max_size and abs(w - h) < 0.6): continue
        g[(round(w, 1), round(h, 1))].append([round(o["x0"], 1), round(o["top"], 1), round(o["x1"], 1), round(o["bottom"], 1)])
    return sorted(({"size_pt": list(k), "count": len(v), "boxes": v} for k, v in g.items() if len(v) >= 3), key=lambda x: -x["count"])

# ---------------------------------------------------------------------------------------------------------- facts
def load(pdf_path, page=0):
    """-> facts dict for one page (cached). A sidecar '<pdf>.p<N>.facts.json' (written by tools/sheet_facts.py on a
    machine with pdfplumber) is used as is, so the model step also runs where pdfplumber is missing."""
    side = f"{pdf_path}.p{page + 1}.facts.json"
    if os.path.exists(side): return json.load(open(side))
    st = os.stat(pdf_path)
    key = hashlib.md5(f"{os.path.abspath(pdf_path)}|{st.st_size}|{st.st_mtime}|{page}|v9".encode()).hexdigest()
    cp = os.path.join(CACHE, key + ".json")
    if os.path.exists(cp): return json.load(open(cp))
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        pg = pdf.pages[page]
        words = _words(pg); lines = _lines_of_text(words); blocks = _blocks(lines)
        text = "\n".join(L["t"] for L in lines)
        mpp, scale_text = scale_of(text)
        tags = collections.defaultdict(list)
        for w in words:
            m = TAG.match(w["t"])
            if m: tags[m.group(1)].append({"tag": w["t"], "box": w["box"]})
        dims = []
        for w in words:
            v = dim_value(w["t"])
            if v: dims.append({"id": f"d{len(dims)}", "text": w["t"], "value": v[0], "unit": v[1], "box": w["box"],
                               "vertical": w["vertical"]})
        leaves, sets = door_leaves(pg, mpp)
        marks = filled_marks(pg); wins = windows(pg, mpp)
        facts = {"file": os.path.basename(pdf_path), "page": page, "size": [pg.width, pg.height],
                 "scale": {"text": scale_text, "m_per_pt": mpp},
                 "lines": [{"id": f"t{i}", **L} for i, L in enumerate(lines)],
                 "labels": [{"t": B["t"], "box": B["box"]} for B in blocks],
                 "tags": {k: v for k, v in sorted(tags.items())}, "dims": dims,
                 "door_leaves": leaves, "doorsets": sets, "windows": wins, "filled_marks": marks}
    try: facts["rooms"] = rooms(pdf_path, page, facts)
    except Exception as e: facts["rooms"] = []; facts["rooms_error"] = repr(e)[:200]
    os.makedirs(CACHE, exist_ok=True); json.dump(facts, open(cp, "w"))
    return facts

def summary(f, max_lines=400):
    """Compact text the model reads: every fact has an id it can cite."""
    out = [f"SHEET {f['file']} page {f['page'] + 1}; scale: {f['scale']['text'] or 'not found'}"]
    out.append("TEXT LINES (id: text):")
    W, H = f["size"]
    pos = lambda b: f"@{int(100 * (b[0] + b[2]) / 2 / W)},{int(100 * (b[1] + b[3]) / 2 / H)}"
    out.append("(@x,y = position in % of sheet width/height from top-left)")
    out += [f"  {L['id']}{pos(L['box'])}: {L['t']}" for L in f["lines"][:max_lines]]
    lab = collections.Counter(B["t"] for B in f.get("labels", []) if B.get("n", 1) or True)
    out.append("TEXT LABELS (multi-line labels joined; label x occurrences):")
    out.append("  " + "; ".join(f"{k} x{v}" for k, v in lab.most_common(150)))
    out.append("TAGS (prefix: distinct tags, instances):")
    for k, v in f["tags"].items():
        names = sorted({x["tag"] for x in v}, key=lambda s: (len(s), s))
        out.append(f"  {k}: {len(names)} distinct [{', '.join(names)}], {len(v)} label instances")
    out.append("FILLED MARK GROUPS (id: size in pt, count):")
    out += [f"  m{i}: {g['size_pt']} x{g['count']}" for i, g in enumerate(f["filled_marks"][:8])]
    nd = sum(1 for s in f["doorsets"] if s["type"] == "double")
    out.append(f"DOOR SWING ARCS: {len(f['door_leaves'])} leaves; {len(f['doorsets'])} doorsets ({nd} double). "
               "Doors drawn without a swing arc (sliding, folding, openings) are not in these numbers.")
    if f.get("rooms"):
        out.append("ROOMS (id: label | floor area m2 | perimeter m | door leaves on it | baseboard m = perimeter - door widths):")
        out += [f"  r{i}: {R['name']} | {R['area_m2']} | {R['perimeter_m']} | {len(R['doors'])} | {R['baseboard_m']}" for i, R in enumerate(f["rooms"])]
    out.append(f"WINDOW SYMBOLS IN WALLS: {len(f.get('windows', []))} (each glazed panel between two solid wall pieces)")
    out.append("DIMENSIONS (id: text):")
    out.append("  " + ", ".join(f"{d['id']}{pos(d['box'])}:{d['text']}{'(v)' if d['vertical'] else ''}" for d in f["dims"][:600]))
    return "\n".join(out)

PROMPT = """You answer a question about one construction drawing sheet using ONLY the extracted facts below
(text lines, tags, filled-mark groups, door swing arcs, dimension strings). Every fact has an id.
Never count or do arithmetic yourself: choose ONE operation and the code computes it.
Return JSON only:
{"op": "count_tags" | "count_marks" | "count_doors" | "count_windows" | "count_labels" | "rooms" | "expr" | "lookup" | "schedule" | "vision" | "none",
 "label": "<count_labels: exact label text from TEXT LABELS, e.g. Secondary Classroom>",
 "rooms": ["<rooms: room ids r0, r1 ... to use>"], "field": "area_m2" | "perimeter_m" | "baseboard_m",
 "prefix": "<count_tags: tag prefix, e.g. FP>", "distinct": true,
 "mark_group": "<count_marks: m0, m1 ...>",
 "doors": "leaves" | "doorsets",
 "expr": "<expr: arithmetic over dimension ids, e.g. (d12*d40)/1e6 + d3*d7/1e6>",
 "unit": "<unit of the answer>",
 "cite": ["<ids of text lines / dims used>"],
 "answer": "<your answer as the question expects it>",
 "reason": "<one sentence: which facts and why>"}
Common tag abbreviations on mechanical / fuel sheets: FP fuel pump, CV check valve, FSI filter separator (issue),
FSR filter separator (receipt), FSCV filter separator control valve, PS pipe support, PG pressure gauge, MAV manual
air vent, PIT pressure indicating transmitter, DPT differential pressure transmitter, BPCV back pressure control valve.
A question may need the sum of two tag prefixes (e.g. filter separators = FSI + FSR): then use "prefix": "FSI,FSR".
Rules: count_tags counts distinct tags with that prefix (distinct=false: label instances). count_marks counts a
filled-mark group; use it when a note on the sheet says what those marks mean (cite the note). count_doors uses the
door swing arcs (doorsets: a double door = 1; leaves: a double door = 2). count_windows uses the window symbols
found in the walls (if 0, the sheet draws windows differently: use vision). count_labels counts text labels equal to
the given text (case-insensitive), e.g. rooms by name. rooms sums a field over the listed ROOMS (floor area,
perimeter, baseboard length); pick every room the question means (e.g. all rooms named Group Room); a room whose label contains ' + ' is a region
holding several rooms: leave it out unless the question asks for all of them. expr evaluates numbers from DIMENSIONS (mm values stay mm; divide by 1e6 for m2). lookup = a value
written in a text line (answer = that text). Use "schedule" when the answer is in a table / schedule /
area summary on the sheet that needs adding or selecting rows. Use "vision" if the answer needs looking at the drawing (e.g. windows,
regions with no dimension strings); "none" if the sheet does not contain it.

QUESTION: {q}

{facts}"""

def _safe_expr(expr, dims):
    vals = {d["id"]: d["value"] for d in dims}
    used = re.findall(r"\bd\d+\b", expr)
    if any(u not in vals for u in used): return None, used
    e = re.sub(r"\bd\d+\b", lambda m: repr(float(vals[m.group()])), expr)
    if not re.fullmatch(r"[\d\.\s\+\-\*/\(\)e]+", e): return None, used
    try: return eval(e, {"__builtins__": {}}, {}), used
    except Exception: return None, used

def compute(f, r):
    """-> (value, unit, items with boxes, warnings)."""
    op = r.get("op"); warn = []
    if op == "count_tags":
        v = [x for p in str(r.get("prefix", "")).upper().replace(" ", "").split(",") for x in f["tags"].get(p, [])]
        if r.get("distinct", True):
            seen = {}
            for x in v: seen.setdefault(x["tag"], x)
            items = list(seen.values())
        else: items = v
        return len(items), "count", [{"tag": x["tag"], "box": x["box"]} for x in items], warn
    if op == "count_marks":
        try: g = f["filled_marks"][int(str(r.get("mark_group", "m0")).lstrip("m"))]
        except Exception: return None, None, [], ["unknown mark group"]
        return g["count"], "count", [{"box": b} for b in g["boxes"]], warn
    if op == "count_doors":
        if r.get("doors") == "leaves":
            return len(f["door_leaves"]), "count", [{"box": L["box"], "radius_m": L["radius_m"]} for L in f["door_leaves"]], warn
        items = []
        for s in f["doorsets"]:
            bs = [f["door_leaves"][i]["box"] for i in s["leaves"]]
            items.append({"type": s["type"], "box": [min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)]})
        warn.append("doors drawn without a swing arc (sliding, folding) are not counted")
        f["_alternatives"] = [{"label": "door sets (a double door = 1)", "value": len(items)},
                              {"label": "door leaves (a double door = 2)", "value": len(f["door_leaves"])}]
        return len(items), "count", items, warn
    if op == "count_windows":
        return len(f.get("windows", [])), "count", [{"box": w["box"], "width_m": w["width_m"]} for w in f.get("windows", [])], warn
    if op == "rooms":
        fld = r.get("field") if r.get("field") in ("area_m2", "perimeter_m", "baseboard_m") else "area_m2"
        sel = []
        for rid in r.get("rooms") or []:
            try: sel.append(f["rooms"][int(str(rid).lstrip("r"))])
            except Exception: warn.append(f"unknown room {rid}")
        if not sel: return r.get("answer"), r.get("unit"), [], warn + ["no rooms selected"]
        warn.append("rooms are traced from the drawn walls; openings without a door leaf are not deducted from baseboards")
        for R in sel:
            if " + " in R["name"]: warn.append(f"'{R['name']}' is one traced region holding several labels (a wall between them was not found); its value covers all of them")
        return round(sum(R[fld] for R in sel), 2), "m2" if fld == "area_m2" else "m", \
            [{"room": R["name"], fld: R[fld], "box": R["box"]} for R in sel], warn
    if op == "count_labels":
        t = re.sub(r"\s+", " ", str(r.get("label", ""))).strip().lower()
        items = [{"text": B["t"], "box": B["box"]} for B in f.get("labels", []) if re.sub(r"\s+", " ", B["t"]).strip().lower() == t]
        return len(items), "count", items, warn
    if op == "expr":
        v, used = _safe_expr(str(r.get("expr", "")), f["dims"])
        if v is None: return r.get("answer"), r.get("unit"), [], ["expression could not be evaluated: " + str(r.get("expr"))]
        by = {d["id"]: d for d in f["dims"]}
        return round(v, 3), r.get("unit"), [{"dim": u, "text": by[u]["text"], "box": by[u]["box"]} for u in dict.fromkeys(used)], warn
    if op == "lookup":
        by = {L["id"]: L for L in f["lines"]}
        return r.get("answer"), r.get("unit"), [{"text": by[c]["t"], "box": by[c]["box"]} for c in r.get("cite", []) if c in by], warn
    return r.get("answer"), r.get("unit"), [], warn

def find_page(pdf_path, question):
    """Page to answer from: 'file.pdf#p96' style is handled by the caller; else a sheet number named in the question
    (e.g. M-101A), else the first page."""
    import pdfplumber
    ids = re.findall(r"\b[A-Z]{1,3}-?\d{2,4}[A-Z]?\b", question)
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) == 1 or not ids: return 0
        for i, pg in enumerate(pdf.pages):
            t = pg.extract_text() or ""
            if any(re.search(r"\b" + re.escape(x) + r"\b", t) for x in ids): return i
    return 0

def _render(pdf_path, page):
    side = f"{pdf_path}.p{page + 1}.jpg"
    if os.path.exists(side): return open(side, "rb").read()
    from . import docqa
    return docqa.render_page(pdf_path, page)

def answer(pdf_path, question, call_model, page=None, vision=None):
    if page is None:
        try: page = find_page(pdf_path, question)
        except ImportError: page = 0
    f = load(pdf_path, page)
    if len(f["lines"]) < 8 and vision is not None:           # a scan saved as PDF: no text layer to work with
        from . import scanqa, docqa
        img = (open(f"{pdf_path}.p{page + 1}.jpg", "rb").read() if os.path.exists(f"{pdf_path}.p{page + 1}.jpg")
               else docqa.render_page(pdf_path, page, max_side=7000))
        if img is not None:
            out = scanqa.answer(img, question, vision); out["method"] = "sheet:scanned+" + out["method"]
            out["sources"] = [{"file": pdf_path, "page": page + 1}]; return out
    prompt = PROMPT.replace("{q}", question).replace("{facts}", summary(f))
    img = None
    if vision is not None:                    # the model also sees the drawing, so it can tell which dimension is where
        img = _render(pdf_path, page)
    r = vision(prompt + "\n\nThe rendered sheet is attached; use it to locate things, but take numbers from the facts.", img) \
        if img is not None else call_model(prompt)
    if r.get("op") == "schedule":
        from . import docqa
        out = docqa.answer(pdf_path, question, call_model, vision, page=page)
        out["method"] = "sheet:schedule+" + out["method"]; return out
    if r.get("op") == "vision" and vision is not None:
        from . import scanqa
        img = _render(pdf_path, page)
        if img is not None:
            out = scanqa.answer(img, question, vision); out["method"] = "sheet:vision+" + out["method"]
            out["sources"] = [{"file": pdf_path, "page": page + 1}]; return out
    v, unit, items, warn = compute(f, r)
    return {"value": v, "unit": unit, "items": items, "alternatives": f.pop("_alternatives", []), "sources": [{"file": pdf_path, "page": page + 1}],
            "method": f"sheet:{r.get('op')}", "warnings": warn,
            "evidence": {"rule": r.get("reason"), "cite": r.get("cite"), "model_answer": r.get("answer"),
                         "scale": f["scale"]["text"], "coords": "PDF points, origin top-left"}}
