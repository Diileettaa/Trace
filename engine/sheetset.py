"""Sheet-set catalogue and sheet picking, rules only (no model calls: a project folder can hold 10 GB / 10k files).

scan(root_or_files) -> {"projects": [{"id", "title", "buildings": [{"id", "title", "sheets": [
    {"path", "page", "kind", "discipline", "level", "title", "scale", "sheet_no", "confidence", "reasons"}]}]}]}
pick(question, sheetset, current=None) -> [{"path", "page", "why", "score"}]  (best 1-3 sheets for a question)

Evidence used, in order: file and folder names (sheet numbers like M-101A, ISO 19650 names like
SEN-DFE-XX-00-D-X-0201, 'level_00', 'floor3', '_arc' / '_str' / '_plumbing' in IFC names), then the sheet's own
text layer (title block = biggest text: title, sheet number, scale), then IFC storey names. Every field carries the
reasons it was set, so the UI can show why a sheet sits where it does. Results are cached per file (size + mtime)."""
import os, re, json, hashlib, collections

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "sheetset")
KINDS = ("plan", "site", "section", "elevation", "detail", "schedule", "model", "photo", "doc")
DISC = ("architecture", "structural", "plumbing", "hvac", "electrical", "fire", "landscape", "other")
IMAGE = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif", ".webp")

# --------------------------------------------------------------------------------------------- vocabulary
DISC_WORDS = {
    "architecture": r"\bARC(H|HITECT\w*)?\b|\bGA PLAN\b|\bFLOOR PLAN\b|\bROOM\b|\bDOOR SCHEDULE\b|\bFINISH",
    "structural": r"\bSTR(UCT\w*)?\b|\bFOUNDATION\b|\bSLAB\b|\bFRAMING\b|\bREBAR\b|\bREINFORC\w*|\bBEAM\b|\bCOLUMN\b|\bPILE\b|\bRAKENNE\w*|\bTRAGWERK",
    "plumbing": r"\bPLUMB\w*|\bPIPING\b|\bSANITAR\w*|\bSAN\b|\bDRAIN\w*|\bWATER\b|\bSEWER\b|\bLVI\b|\bFUEL\b|\bHYDRANT\b",
    "hvac": r"\bHVAC\b|\bMECH\w*|\bVENTILAT\w*|\bLFT\b|\bHZG\b|\bHEATING\b|\bDUCT\w*|\bAIR\b|\bLÜFTUNG|\bIV\b",
    "electrical": r"\bELEC\w*|\bELT\b|\bELE\b|\bLIGHTING\b|\bPOWER\b|\bSÄHKÖ\w*|\bLIGHT\b",
    "fire": r"\bFIRE\b|\bSPRINKLER\w*|\bESCAPE\b|\bEGRESS\b|\bFP\b|\bFA\b",
    "landscape": r"\bLANDSCAPE\b|\bSITE PLAN\b|\bMASTER ?PLAN\b|\bPLANTING\b",
}
ROLE_LETTER = {"A": "architecture", "S": "structural", "P": "plumbing", "M": "hvac", "H": "hvac", "E": "electrical",
               "FP": "fire", "FA": "fire", "F": "fire", "L": "landscape", "C": "structural"}
KIND_WORDS = [("schedule", r"\bSCHEDULES?\b|\bROOM DATA\b|\bLEGEND\b|\bTABLE\b"),
              ("section", r"\bSECTIONS?\b|\bLEIKKAUS"), ("elevation", r"\bELEVATIONS?\b|\bJULKISIVU"),
              ("detail", r"\bDETAILS?\b|\bDETALJ"),
              ("site", r"\bSITE PLAN\b|\bSITE LAYOUT\b|\bMASTER ?PLAN\b"),
              ("plan", r"\bPLAN\b|\bLAYOUT\b|\bPOHJA\w*|\bGRUNDRISS|\bFLOOR\b|\bLEVEL\b")]
ORD = {"BASEMENT": -1, "GROUND": 0, "FIRST": 1, "SECOND": 2, "THIRD": 3, "FOURTH": 4, "FIFTH": 5, "SIXTH": 6,
       "SEVENTH": 7, "EIGHTH": 8, "NINTH": 9, "1ST": 1, "2ND": 2, "3RD": 3}
ISO = re.compile(r"\b([A-Z0-9]{2,6})-([A-Z0-9]{2,6})-([A-Z0-9]{1,3})-([A-Z0-9]{2,3})-([A-Z]{1,2})-([A-Z]{1,2})-(\d{3,6})\b")
SHEET_NO = re.compile(r"\b(FP|FA|[ASPMEHLC])-(\d{1,3}[\.\d]*[A-Z]?)\b")

def _lvl(n):
    return None if n is None else ("B%d" % -n if n < 0 else "%02d" % n)

def level_of(text):
    t = text.upper().replace("_", " ")
    for pat in (r"\bLEVEL\s*(-?\d{1,2})\b", r"\bL(\d{2})\b", r"\bFLOOR\s*(-?\d{1,2})\b", r"\bKERROS\s*(\d{1,2})\b",
                r"\b(\d{1,2})\.?\s*(?:KERROS|OG|STOCK|ETAGE)\b"):
        m = re.search(pat, t)
        if m: return int(m.group(1))
    m = re.search(r"\b(BASEMENT|GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|1ST|2ND|3RD|\dTH)\s+(?:FLOOR|STOREY|LEVEL)\b", t)
    if m: return ORD.get(m.group(1), int(m.group(1)[0]) if m.group(1)[0].isdigit() else None)
    if re.search(r"\b(EG|ERDGESCHOSS|POHJAKERROS|KELLARI|UG)\b", t): return -1 if re.search(r"KELLARI|\bUG\b", t) else 0
    return None

def _first(rules, text):
    for k, pat in rules:
        if re.search(pat, text): return k
    return None

# ---------------------------------------------------------------------------------------------- per file
def _cache_get(path):
    st = os.stat(path); k = hashlib.md5(f"{os.path.abspath(path)}|{st.st_size}|{st.st_mtime}|v1".encode()).hexdigest()
    p = os.path.join(CACHE, k + ".json")
    return (json.load(open(p)) if os.path.exists(p) else None), p

def _pdf_pages(path, max_pages):
    """[(page, text, big_lines)] with pdfium (fast, low memory; pdfplumber is far too slow for 150-page sets).
    big_lines = text lines sorted by font size, biggest first (the title block)."""
    import pypdfium2 as pdfium, pypdfium2.raw as R
    out = []
    pdf = pdfium.PdfDocument(path)
    try:
        for i in range(min(len(pdf), max_pages)):
            pg = pdf[i]; tp = pg.get_textpage(); x0m, y0m, x1m, y1m = pg.get_mediabox(); W, H = x1m - x0m, y1m - y0m
            rot = pg.get_rotation() % 360
            def norm(x, y):                       # unrotated PDF space -> (x, y) as displayed, 0-1, y from the top
                u, v = (x - x0m) / W, (y - y0m) / H
                return {0: (u, 1 - v), 90: (v, u), 180: (1 - u, v), 270: (1 - v, 1 - u)}.get(rot, (u, 1 - v))
            n = tp.count_chars(); lines, cur, size, pos = [], [], 0.0, None
            import ctypes
            l, r, b, t = (ctypes.c_double() for _ in range(4))
            for k in range(n):
                ch = chr(R.FPDFText_GetUnicode(tp.raw, k) or 32)
                if ch in "\r\n":
                    if cur: lines.append((size, "".join(cur).strip(), pos)); cur, size, pos = [], 0.0, None
                    continue
                if ch.strip():
                    R.FPDFText_GetCharBox(tp.raw, k, l, r, b, t)
                    if pos is None: pos = norm(l.value, t.value)
                    size = max(size, max(r.value - l.value, t.value - b.value))   # glyph size (font size is often 1 x matrix)
                cur.append(ch)
            if cur: lines.append((size, "".join(cur).strip(), pos))
            text = "\n".join(t for _, t, _ in lines)
            # title block: right-hand strip or bottom band of the sheet; big text there first, then anywhere
            tb = lambda p: p is not None and (p[0] > 0.8 or p[1] > 0.85)
            ordered = sorted(lines, key=lambda x: (not tb(x[2]), -x[0]))
            big = [t for _, t, _ in ordered if len(t) >= 3 and not re.fullmatch(r"[\d\s\.,]+", t)][:40]
            out.append((i, text, big))
            tp.close(); pg.close()
    finally: pdf.close()
    return out

def _ifc_info(path, limit=4_000_000):
    """IFC storeys and authoring hints from the file text (cheap, no geometry)."""
    try:
        with open(path, "r", errors="ignore") as f: head = f.read(limit)
    except Exception: return [], ""
    storeys = re.findall(r"IFCBUILDINGSTOREY\('[^']*',#\d+,'([^']*)'", head)
    return storeys, head[:3000]

def describe(path, root=None, max_pages=200):
    """-> list of sheet dicts for one file (one per PDF page)."""
    hit, cp = _cache_get(path)
    if hit is not None: return hit
    name = os.path.basename(path); stem, ext = os.path.splitext(name); ext = ext.lower()
    rel = os.path.relpath(path, root) if root else name
    fname = re.sub(r"[_\.]", " ", rel).upper()
    sheets = []
    def base(page=0):
        return {"path": path, "page": page, "kind": None, "discipline": None, "level": None, "title": None, "scale": None,
                "sheet_no": None, "confidence": 0.0, "reasons": []}
    def apply_names(s, text_upper, src):
        m = ISO.search(text_upper)
        if m:
            lv = m.group(4)
            if lv.isdigit() and s["level"] is None: s["level"] = lv.zfill(2); s["reasons"].append(f"level {lv} from ISO 19650 name ({src})")
            role = ROLE_LETTER.get(m.group(6))
            if role and s["discipline"] is None: s["discipline"] = role; s["reasons"].append(f"role code {m.group(6)} ({src})")
            if s["sheet_no"] is None: s["sheet_no"] = m.group(0)
        if s["sheet_no"] is None:
            m = SHEET_NO.search(text_upper)
            if m: s["sheet_no"] = f"{m.group(1)}-{m.group(2)}"
        words_first = src == "sheet title"
        def by_words():
            for d, pat in DISC_WORDS.items():
                if re.search(pat, text_upper): s["discipline"] = d; s["reasons"].append(f"'{re.search(pat, text_upper).group(0)}' in {src}"); return
        def by_letter():
            if s["sheet_no"]:
                d = ROLE_LETTER.get(re.split(r"[-\d]", s["sheet_no"])[0])
                if d: s["discipline"] = d; s["reasons"].append(f"sheet number {s['sheet_no']} ({src})")
        for f_ in ((by_words, by_letter) if words_first else (by_letter, by_words)):
            if s["discipline"] is None: f_()
        if s["level"] is None and src != "sheet text":
            lv = level_of(text_upper)
            if lv is not None: s["level"] = _lvl(lv); s["reasons"].append(f"level from {src}")
        if s["kind"] is None:
            k = _first(KIND_WORDS, text_upper)
            if k: s["kind"] = k; s["reasons"].append(f"kind '{k}' from {src}")

    if ext == ".ifc":
        s = base(); s["kind"] = "model"; s["reasons"].append("IFC model")
        storeys, head = _ifc_info(path)
        apply_names(s, fname, "file name")
        if s["discipline"] is None: s["discipline"] = "architecture"; s["reasons"].append("IFC without discipline hint: architecture")
        s["title"] = stem; s["storeys"] = storeys[:30]; s["confidence"] = 0.9; sheets.append(s)
    elif ext == ".pdf":
        try: pages = _pdf_pages(path, max_pages)
        except Exception as e: pages = [(0, "", [])]
        for i, text, big in pages:
            s = base(i)
            title = next((t for t in big if 6 <= len(t) <= 70 and re.search(r"PLAN|ELEVATION|SECTION|SCHEDULE|DETAIL|LAYOUT|DIAGRAM", t.upper())), None)
            if title:
                title = re.sub(r"\s+[A-Z]\d{1,2}\b.*$", "", title).strip()     # drop the detail bubble + scale bar glued on
                s["title"] = title; s["reasons"].append("title = title-block text that names a plan / section / ...")
            for t in big[:40]:                         # sheet number: title-block text that looks like one
                m = ISO.fullmatch(t.strip().upper()) or re.fullmatch(r"\s*((?:FP|FA|[ASPMEHLC])-?\d{1,3}[\.\d]*[A-Z]?)\s*", t.upper())
                if m: s["sheet_no"] = m.group(0).strip(); s["reasons"].append(f"sheet number {s['sheet_no']} from title block"); break
            from .sheet import scale_of
            mpp, st = scale_of(text); s["scale"] = st
            if title: apply_names(s, title.upper(), "sheet title")
            apply_names(s, fname, "file name")
            if text.strip(): apply_names(s, text.upper()[:20000], "sheet text")
            else: s["reasons"].append("no text layer (scan): only the file name was used")
            s["kind"] = s["kind"] or ("plan" if text.strip() else "doc")
            s["confidence"] = round(min(1.0, 0.25 + 0.2 * bool(title) + 0.2 * bool(s["sheet_no"]) + 0.15 * bool(s["discipline"]) + 0.1 * bool(s["level"]) + 0.1 * bool(st)), 2)
            sheets.append(s)
    elif ext in IMAGE:
        s = base(); apply_names(s, fname, "file name")
        if s["kind"] is None:
            plan_src = re.search(r"CUBICASA|SWISS|FLOOR|PLAN|POHJA", fname)
            s["kind"] = "plan" if plan_src else "photo" if re.search(r"PHOTO|IMG|DSC|PXL", fname) else "plan"
            s["reasons"].append("image: plan" + (" (folder/file name)" if plan_src else " (default; no text to read)"))
        s["discipline"] = s["discipline"] or "architecture"
        s["title"] = stem; s["confidence"] = 0.6 if s["level"] or s["sheet_no"] else 0.4; sheets.append(s)
    elif ext == ".dxf":
        s = base(); apply_names(s, fname, "file name"); s["kind"] = s["kind"] or "plan"; s["discipline"] = s["discipline"] or "architecture"
        s["title"] = stem; s["confidence"] = 0.7; sheets.append(s)
    else:
        s = base(); s["kind"] = "doc"; s["discipline"] = "other"; s["title"] = stem; s["confidence"] = 0.3; sheets.append(s)
    for s in sheets:
        s["discipline"] = s["discipline"] or "other"
        s["level"] = s["level"] if s["level"] is None else str(s["level"])
    os.makedirs(CACHE, exist_ok=True); json.dump(sheets, open(cp, "w")); return sheets

# --------------------------------------------------------------------------------------------- grouping
SWISS = re.compile(r"site(\d+)_bldg(\d+)_floor(\d+)", re.I)

def _group(path, root):
    """-> (project id, building id) from the folder structure and file name conventions."""
    rel = os.path.relpath(path, root) if root else os.path.basename(path)
    parts = rel.replace("\\", "/").split("/"); stem = os.path.splitext(parts[-1])[0]
    m = SWISS.search(stem)
    if m: return f"{parts[0] if len(parts) > 1 else 'swiss'}/site{m.group(1)}", f"bldg{m.group(2)}"
    m = ISO.search(stem.upper())
    if m: return (parts[0] if len(parts) > 1 else m.group(1)), f"{m.group(1)}-{m.group(3)}"
    if len(parts) >= 3: return parts[0], parts[1]
    if len(parts) == 2: return parts[0], re.sub(r"[-_ ]?(\d+|[A-Z]-?\d+[A-Z]?)$", "", stem) or stem
    return "upload", stem

def scan(root_or_files, max_pages=200, limit=None):
    if isinstance(root_or_files, (list, tuple)): files, root = list(root_or_files), os.path.commonpath([os.path.abspath(f) for f in root_or_files]) if len(root_or_files) > 1 else None
    else:
        root = root_or_files; files = []
        for d, _, fs in os.walk(root):
            for f in sorted(fs):
                if f.startswith(".") or f.upper() == "LICENSE.MD" or f.endswith((".facts.json", ".jpg.json")) or ".pdf.p" in f: continue
                files.append(os.path.join(d, f))
    if limit: files = files[:limit]
    tree = collections.OrderedDict()
    for f in files:
        try: sh = describe(f, root, max_pages)
        except Exception as e: sh = [{"path": f, "page": 0, "kind": "doc", "discipline": "other", "level": None, "title": os.path.basename(f),
                                      "scale": None, "sheet_no": None, "confidence": 0.0, "reasons": [f"could not read: {e!r}"[:200]]}]
        p, b = _group(f, root)
        tree.setdefault(p, collections.OrderedDict()).setdefault(b, []).extend(sh)
    return {"projects": [{"id": p, "title": p, "buildings": [{"id": b, "title": b, "sheets": s} for b, s in bs.items()]}
                         for p, bs in tree.items()]}

# ------------------------------------------------------------------------------------------------- pick
TOPIC = [  # question words -> (discipline, kind) preferences
    (r"toilet|wc\b|sink|washbasin|shower|bath|plumb|drain|water|sewer|pipe|piping|pump|valve|fuel|hydrant", ("plumbing", "plan")),
    (r"damper|duct|ventilat|air handling|hvac|heating|radiator|diffuser", ("hvac", "plan")),
    (r"slab|rebar|reinforc|foundation|footing|beam|column|pile|concrete|structural", ("structural", "plan")),
    (r"socket|outlet|lighting|luminaire|switch|electrical|cable|panel board", ("electrical", "plan")),
    (r"sprinkler|fire|escape|exit sign|extinguisher", ("fire", "plan")),
    (r"door|window|room|area|floor area|baseboard|skirting|wall|bedroom|kitchen|corridor|apartment|stair|dorm|unit|office|classroom", ("architecture", "plan")),
    (r"elevation|facade|façade", (None, "elevation")),
    (r"section|height|storey height|ceiling height", (None, "section")),
    (r"schedule|legend|table", (None, "schedule")),
]

def _sheets(ss):
    for p in ss.get("projects", []):
        for b in p["buildings"]:
            for s in b["sheets"]: yield p, b, s

def pick(question, sheetset, current=None, n=3):
    """Best sheets for a question that does not say which sheet. -> [{"path", "page", "why", "score", ...}]"""
    q = question.lower(); Q = question.upper()
    want_disc, want_kind = None, None
    for pat, (d, k) in TOPIC:
        if re.search(pat, q):
            want_disc = want_disc or d; want_kind = want_kind or k
    lv = level_of(Q); want_level = _lvl(lv) if lv is not None else None
    words = {w.rstrip("s") for w in re.findall(r"[a-z]{4,}", q)} - {"many", "what", "which", "where", "there", "shown", "sheet", "drawing", "plan", "total", "floor", "level", "second", "first", "third", "ground"}
    out = []
    for p, b, s in _sheets(sheetset):
        sc, why = 0.0, []
        if s.get("sheet_no") and re.search(r"\b" + re.escape(s["sheet_no"].upper()) + r"\b", Q): sc += 10; why.append(f"sheet {s['sheet_no']} named in the question")
        if p["id"].lower() in q or (len(b["id"]) > 2 and b["id"].lower() in q): sc += 3; why.append("project/building named")
        if want_disc and s.get("discipline") == want_disc: sc += 3; why.append(f"{want_disc} sheet")
        elif want_disc == "plumbing" and s.get("discipline") == "architecture": sc += 1; why.append("architecture plans also show fixtures")
        if want_kind and s.get("kind") == want_kind: sc += 2; why.append(f"{want_kind}")
        elif s.get("kind") == "model": sc += 1.5; why.append("3D model has everything")
        if want_level is not None and s.get("level") is not None:
            if s["level"] == want_level: sc += 4; why.append(f"level {want_level}")
            else: sc -= 3
        t = ((s.get("title") or "") + " " + os.path.basename(s["path"])).lower().replace("_", " ")
        ov = [w for w in words if w in t]
        if ov: sc += min(3, len(ov)); why.append("title mentions " + ", ".join(sorted(ov)[:3]))
        if current and os.path.abspath(current) == os.path.abspath(s["path"]): sc += 1.5; why.append("currently open")
        sc += 0.5 * (s.get("confidence") or 0)
        out.append({"path": s["path"], "page": s.get("page", 0), "score": round(sc, 2), "why": why or ["no specific match"],
                    "project": p["id"], "building": b["id"], "sheet_no": s.get("sheet_no"), "discipline": s.get("discipline"),
                    "level": s.get("level"), "kind": s.get("kind"), "title": s.get("title")})
    out.sort(key=lambda x: -x["score"])
    if not out: return []
    top = out[0]["score"]
    return [o for o in out[:n] if o["score"] >= top - 2.5] or out[:1]


if __name__ == "__main__":       # python -m engine.sheetset <folder> [question]  -> catalogue JSON (and picks)
    import sys
    ss = scan(sys.argv[1])
    if len(sys.argv) > 2: print(json.dumps(pick(" ".join(sys.argv[2:]), ss), indent=1, ensure_ascii=False))
    else: print(json.dumps(ss, indent=1, ensure_ascii=False))
