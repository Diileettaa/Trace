"""Project-level flow: a project has buildings, a building has many sheets (up to ~8 floor plans plus piping,
structural, schedules). This module

  1. indexes every sheet once: kind (floor plan / piping / structural / schedule / elevation / section / detail /
     site / other), building, level, sheet number, title, scale - from the title block text of vector PDFs, or
     from one vision call for scans (cached);
  2. answers project questions ("how many doors in building A", "total windows on all floors", "which sheet shows
     the pump room piping") by choosing the relevant sheets, asking each sheet, and adding the answers in code,
     with a per-sheet breakdown so every number can be opened and reviewed on its sheet.

classify(path) -> dict;  answer(sheets, question, ask_sheet, call_model) -> engine answer dict
where sheets = [{"id", "path", "building"?, "title"?}] and ask_sheet(sheet, question) -> engine answer dict."""
import os, re, json, hashlib

CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "project")
KINDS = ["floor_plan", "piping", "structural", "schedule", "elevation", "section", "detail", "site", "other"]

KIND_RULES = [
    ("piping", r"\bPIPING\b|\bP&ID\b|\bMECHANICAL\b|\bPLUMBING\b"),
    ("structural", r"\bFOUNDATION\b|\bSLAB\b|\bFRAMING\b|\bSTRUCTURAL\b|\bREINFORC"),
    ("schedule", r"\bSCHEDULES?\b|\bROOM DATA\b|\bLEGEND\b"),
    ("elevation", r"\bELEVATIONS?\b"),
    ("section", r"\bSECTIONS?\b"),
    ("site", r"\bSITE PLAN\b|\bMASTER ?PLAN\b|\bLANDSCAPE\b"),
    ("detail", r"\bDETAILS?\b"),
    ("floor_plan", r"\bFLOOR PLAN\b|\bPLAN LEVEL\b|\bGA PLAN\b|\bLEVEL \d+\b|\b(GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH) FLOOR\b|\bPLAN\b"),
]
ORD = {"BASEMENT": -1, "GROUND": 0, "FIRST": 1, "SECOND": 2, "THIRD": 3, "FOURTH": 4, "FIFTH": 5, "SIXTH": 6, "SEVENTH": 7, "EIGHTH": 8}

def _level(text):
    t = text.upper()
    m = re.search(r"\bLEVEL\s*(-?\d{1,2})\b", t)
    if m: return int(m.group(1))
    m = re.search(r"\b(BASEMENT|GROUND|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH) FLOOR\b", t)
    if m: return ORD[m.group(1)]
    m = re.search(r"\b(\d{1,2})(?:ST|ND|RD|TH) FLOOR\b", t)
    return int(m.group(1)) if m else None

def _sheet_no(text):
    m = re.search(r"\b(?:SHEET(?: ID| NUMBER| NO\.?)?)\s*[:\n ]\s*([A-Z]{1,3}-?\d{1,4}[A-Z]?)\b", text.upper())
    if m: return m.group(1)
    c = re.findall(r"\b[A-Z]{1,2}-\d{1,4}[A-Z]?\b|\b[A-Z]{2,4}(?:-[A-Z0-9]{1,4}){4,}\b", text.upper())
    return c[-1] if c else None

TITLE_WORDS = r"PLAN|ELEVATION|SECTION|SCHEDULE|DETAIL|LAYOUT|DIAGRAM"

def classify_text(text, lines=None):
    """lines = [{"t", "box"}] (with font size from box height): the title block is the biggest text, so the title,
    sheet number and kind come from the largest lines first, the rest of the sheet text only as a fallback."""
    big = sorted(lines or [], key=lambda L: -(L["box"][3] - L["box"][1]))
    title = next((L["t"].strip() for L in big if 6 <= len(L["t"].strip()) <= 70 and re.search(TITLE_WORDS, L["t"].upper())), None)
    if title is None:
        title = next((l.strip() for l in text.splitlines() if 6 <= len(l.strip()) <= 60 and re.search(TITLE_WORDS, l.upper())), None)
    kind = "other"
    for src in ([title] if title else []) + [text]:
        for k, pat in KIND_RULES:
            if re.search(pat, src.upper()): kind = k; break
        if kind != "other": break
    sheet_no = None
    for pat in (r"[A-Z]{2,4}(?:-[A-Z0-9]{1,4}){4,}", r"[A-Z]{1,2}-\d{1,4}[A-Z]?", r"[A-Z]{1,2}\d{2,4}[A-Z]?"):
        for L in big[:15]:
            m = re.fullmatch(r"\s*(" + pat + r")\s*", L["t"].upper())
            if m: sheet_no = m.group(1); break
        if sheet_no: break
    return {"kind": kind, "level": _level(title or "") if title and _level(title) is not None else _level(text),
            "sheet_no": sheet_no or _sheet_no(text), "title": title}

CLASSIFY_PROMPT = """This is one construction drawing sheet (possibly a scan). Read its title block and title.
Return JSON only: {"kind": one of %s, "title": "<sheet title>", "sheet_no": "<sheet number or null>",
"level": <floor level as an integer, ground = 0, or null>, "building": "<building name or null>",
"scale": "<scale text or null>"}""" % KINDS

def classify(path, vision=None):
    """-> {"kind", "level", "sheet_no", "title", "building"?, "scale"?, "how"} (cached by file content)."""
    h = hashlib.md5(open(path, "rb").read()).hexdigest()
    cp = os.path.join(CACHE, h + ".v2.json")
    if os.path.exists(cp): return json.load(open(cp))
    out = None
    if path.lower().endswith(".pdf"):
        try:
            from . import sheet
            f = sheet.load(path, 0)
            if len(f["lines"]) >= 8:
                out = classify_text("\n".join(L["t"] for L in f["lines"]), f["lines"]); out["scale"] = f["scale"]["text"]; out["how"] = "text layer"
        except Exception: pass
    if out is None and vision is not None:
        from . import docqa
        img = docqa.render_page(path, 0, max_side=2000) if path.lower().endswith(".pdf") else _small(path)
        if img is not None:
            try:
                r = vision(CLASSIFY_PROMPT, img)
                out = {k: r.get(k) for k in ("kind", "title", "sheet_no", "level", "building", "scale")}; out["how"] = "vision"
            except Exception as e: out = {"kind": "other", "how": f"vision failed: {e!r}"[:200]}
    if out is None: out = {"kind": "other", "level": None, "sheet_no": None, "title": None, "how": "no text, no model"}
    os.makedirs(CACHE, exist_ok=True); json.dump(out, open(cp, "w")); return out

def _small(path, max_side=2000):
    try:
        from PIL import Image
        import io
        im = Image.open(path).convert("RGB"); im.thumbnail((max_side, max_side)); b = io.BytesIO(); im.save(b, "JPEG", quality=85); return b.getvalue()
    except Exception: return open(path, "rb").read()

PLAN_PROMPT = """A construction project has these sheets (one per line: id | building | kind | level | sheet number | title):
{sheets}

QUESTION: {q}

Decide which sheets are needed and what to ask each one. Return JSON only:
{"combine": "sum" | "list" | "max" | "min" | "single",
 "sheets": [{"id": <sheet id>, "question": "<the question to ask about that one sheet>"}],
 "reason": "<one sentence>"}
Rules: for totals over floors or buildings use "sum" and ask each relevant sheet the same per-sheet question (e.g. all
floor plans of building A for doors). Use "list" to report per-sheet values without adding. Use "single" when one sheet
answers it. Never pick sheets of another building than the one asked about. Do not compute anything yourself."""

def answer(sheets, question, ask_sheet, call_model=None):
    """call_model=None (or a failing model): rules only - engine.sheetset.pick chooses the sheet."""
    from .confidence import attach
    out = attach(_answer(sheets, question, ask_sheet, call_model))
    try: _cross_check_doors(out, sheets, question, ask_sheet)
    except Exception as e: out.setdefault("warnings", []).append(f"door schedule cross-check failed: {type(e).__name__}")
    return out

DOOR_COUNT_Q = re.compile(r"\bhow many\b.*\bdoors?\b|\bnumber of doors\b|\bdoor count\b", re.I)

def _cross_check_doors(out, sheets, question, ask_sheet):
    """A door count from a plan is checked against the project's door schedule (a printed table, read from text).
    The schedule lists the whole building, so for one floor it is an upper bound; for the whole building it should match.
    Never changes the answer: adds evidence.cross_check and a warning when they disagree or the plan gave no number."""
    if not DOOR_COUNT_Q.search(question or "") or re.search(r"\bschedule\b", question, re.I): return
    used = set((out.get("evidence") or {}).get("sheets_used") or [])
    sch = [s for s in sheets if s["class"].get("kind") == "schedule" and s["id"] not in used]
    if not sch: return
    s = sch[0]; r = ask_sheet(s, "How many doors are listed in the door schedule?")
    n = _num(r.get("value"))
    if n is None: return
    one_floor = bool(re.search(r"\b(first|second|third|ground|basement|level|floor|storey)\b", question, re.I))
    v = _num(out.get("value"))
    cc = {"sheet": s["id"], "sheet_no": s["class"].get("sheet_no"), "schedule_doors": int(n), "answer_id": r.get("answer_id"),
          "scope": "whole building (upper bound for one floor)" if one_floor else "whole building"}
    w = out.setdefault("warnings", [])
    if v is None:
        cc["status"] = "plan gave no number"
        w.append(f"the plan gave no count; the door schedule ({cc['sheet_no']}) lists {int(n)} doors for the whole building")
    elif v == 0 and n > 0:
        cc["status"] = "plan count is 0 but the schedule lists doors"
        w.append(f"the plan count is 0, but the door schedule ({cc['sheet_no']}) lists {int(n)} doors: the plan reading is probably wrong, please review")
    elif one_floor and v > n:
        cc["status"] = "plan count exceeds the whole-building schedule"
        w.append(f"plan count {v:g} is more than the {int(n)} doors in the whole-building schedule ({cc['sheet_no']}): please review")
    elif not one_floor and abs(v - n) > max(1, 0.1 * n):
        cc["status"] = "disagree"
        w.append(f"plan count {v:g} differs from the door schedule ({cc['sheet_no']}: {int(n)} doors): please review")
    else:
        cc["status"] = "consistent"
    out.setdefault("evidence", {})["cross_check"] = cc
    if cc["status"] != "consistent" and out.get("confidence") in ("high", "medium"):
        out["confidence"], out["confidence_reason"] = "low", "plan count and door schedule disagree"

def _answer(sheets, question, ask_sheet, call_model=None):
    if call_model is None:
        from . import sheetset
        ss = {"projects": [{"id": "p", "buildings": [{"id": str(s.get("building") or "-"), "sheets": [
            {"path": s["path"], "page": 0, "kind": {"floor_plan": "plan"}.get(s["class"].get("kind"), s["class"].get("kind")),
             "discipline": s["class"].get("discipline"), "level": None if s["class"].get("level") is None else "%02d" % int(s["class"]["level"]),
             "title": s["class"].get("title") or s.get("title"), "sheet_no": s["class"].get("sheet_no"), "confidence": 0.5, "_id": s["id"]}]}
            for s in sheets]}]}
        best = sheetset.pick(question, ss, n=1)
        s = next(x for x in sheets if x["path"] == best[0]["path"]) if best else None
        if s is None: return {"value": None, "unit": None, "items": [], "method": "project:none", "warnings": ["no sheet matches"]}
        r = ask_sheet(s, question)
        return {"value": r.get("value"), "unit": r.get("unit"), "method": "project:pick",
                "items": [{"sheet": s["id"], "value": r.get("value"), "unit": r.get("unit"), "method": r.get("method"),
                           "answer_id": r.get("answer_id"), "warnings": r.get("warnings"), "why": best[0]["why"]}],
                "warnings": r.get("warnings") or [], "evidence": {"rule": "rules: " + "; ".join(best[0]["why"]), "sheets_used": [s["id"]]}}
    idx = "\n".join(f"{s['id']} | {s.get('building') or '-'} | {s['class'].get('kind')} | {s['class'].get('level')} | "
                    f"{s['class'].get('sheet_no') or '-'} | {s['class'].get('title') or s.get('title') or '-'}" for s in sheets)
    plan = call_model(PLAN_PROMPT.replace("{sheets}", idx).replace("{q}", question))
    by = {str(s["id"]): s for s in sheets}
    parts, warn = [], []
    for p in plan.get("sheets") or []:
        s = by.get(str(p.get("id")))
        if s is None: warn.append(f"unknown sheet {p.get('id')}"); continue
        r = ask_sheet(s, p.get("question") or question)
        parts.append({"sheet": s["id"], "building": s.get("building"), "level": s["class"].get("level"),
                      "sheet_no": s["class"].get("sheet_no"), "title": s["class"].get("title"), "question": p.get("question"),
                      "value": r.get("value"), "unit": r.get("unit"), "method": r.get("method"),
                      "answer_id": r.get("answer_id"), "warnings": r.get("warnings")})
    comb = plan.get("combine", "list"); nums = [_num(p["value"]) for p in parts]
    if comb in ("sum", "max", "min") and parts and all(n is not None for n in nums):
        v = sum(nums) if comb == "sum" else max(nums) if comb == "max" else min(nums)
        v = int(v) if float(v).is_integer() else round(v, 2)
    elif comb == "single" and parts: v = parts[0]["value"]
    else:
        v = None
        if comb in ("sum", "max", "min"): warn.append("some sheets gave no number; see the breakdown")
    if any(p.get("warnings") for p in parts): warn.append("some sheets carry warnings; open them to review")
    units = {p["unit"] for p in parts if p.get("unit")}
    return {"value": v, "unit": units.pop() if len(units) == 1 else None, "items": parts, "method": f"project:{comb}",
            "warnings": warn, "evidence": {"rule": plan.get("reason"), "sheets_used": [p["sheet"] for p in parts]}}

def _num(v):
    if isinstance(v, (int, float)): return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v or "").replace(",", ""))
    return float(m.group()) if m else None
