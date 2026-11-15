"""confidence + confidence_reason for every answer, from how it was obtained (method) and its warnings.

high   - read from data the file states (vector geometry, IFC quantities/geometry, schedules), a person reviewed it,
         or the method is measured >= 90 % correct on held-out data
medium - measured 70-90 %, or image analysis + vision model agree
low    - measured < 70 %, a vision model alone, or the engine flagged it uncertain
none   - no value; the reason says why

Measured accuracy quoted in the reasons: eval/scan_boxes_iou.md (CubiCasa test plans, dataset answers)."""

import re

# measured on the CubiCasa test split (eval/run.py --source cubicasa5k --split test, 2026-11-15), per (source, category)
MEASURED = {("detector", "window"): 57.2, ("detector", "door"): 73.1, ("detector", "toilet"): 94.0,
            ("detector", "sink"): 82.7, ("detector", "shower_tub"): 82.5, ("vlm", "floors"): 97.9, ("vlm", "bathroom"): 93.0,
            ("vlm", "wc_room"): 96.5, ("vlm", "balcony"): 88.9, ("prior", "sauna"): 96.3, ("prior", "kitchen"): 89.8,
            ("agree", "kitchen"): 97.6, ("agree", "sauna"): 94.0, ("min", "bedroom"): 95.3, ("rooms", "bedroom"): 51.2}
SOFT = ("uncertain", "estimate", "not confirmed", "convex hull", "unsupported", "verify", "review", "guess", "partly")

def rate(r):
    m = str(r.get("method") or ""); w = [str(x) for x in (r.get("warnings") or [])]
    soft = [x for x in w if any(s in x.lower() for s in SOFT)]
    if r.get("value") is None and not r.get("items"):
        return "none", (w[0] if w else "no answer")
    if "+reviewed" in m or r.get("reviewed"):
        return "high", "checked and corrected by a person in the review panel"
    if m.startswith("project:"):
        levels = [rate(p)[0] for p in (r.get("items") or []) if isinstance(p, dict)]
        order = ["none", "low", "medium", "high"]
        lv = min(levels, key=order.index) if levels else "low"
        return lv, f"lowest confidence of the {len(levels)} sheet answer(s) combined"
    if ":uncertain" in m or "uncertain" in m:
        return "low", "the engine's two independent counts disagree; alternatives are offered for review"
    if m.startswith("cubicasa:"):
        parts = m.split(":"); cat = parts[-1]
        src = re.split(r"[\[(]", parts[1])[0] if len(parts) > 1 else ""      # detector[yolo-cubicasa] -> detector
        if src == "min" and "vlm" not in parts[1]: src = "rooms"
        acc = MEASURED.get((src, cat))
        how = {"detector": "object detector", "vlm": "vision model", "prior": "most common value (no reliable reading)",
               "agree": "vision model and room detector agree", "min": "vision model and room detector combined",
               "rooms": "room detector only (zero-API mode)"}.get(src, src)
        if acc is None: return "medium", how
        return ("high" if acc >= 90 else "medium" if acc >= 70 else "low"), f"{how}; correct on {acc:.0f}% of held-out CubiCasa test questions of this kind"
    if m.startswith(("swiss_dxf", "ifc:", "geometry:", "sheet:count_", "sheet:rooms", "sheet:schedule",
                     "sheet:lookup", "sheet:expr", "sheet:count", "docqa:")) and "vision" not in m:
        if soft: return "medium", "read from the file's own data, with a caveat: " + soft[0]
        return "high", "read from the file's own data (vector geometry, model quantities or a printed table)"
    if m.startswith("scan:rooms+scale") and m.endswith(":lowres"):
        return "low", "room outline traced on a low-resolution scan: walls between rooms may be missed; check the outline"
    if m.startswith("scan:rooms+scale"):
        cal = any("user calibration" in x for x in w)
        return ("medium", "room outline traced from the walls on the scan, scale from " +
                ("the user's calibration" if cal else "the printed ratio and paper size (confirm with a calibration)"))
    if m.startswith("scan:") or "vision" in m:
        if "+dims" in m: return "medium", "area from printed dimension strings read by the vision model"
        if "+vlm" in m and m.split(":")[1].split("+")[0] in ("marks", "windows", "doors"):
            return "medium", "image analysis found the candidates and the vision model confirmed them"
        return "low", "vision model only; check the marked items"
    return ("medium" if not soft else "low"), (soft[0] if soft else "rule-based reading")

def attach(r):
    if isinstance(r, dict) and "confidence" not in r:
        r["confidence"], r["confidence_reason"] = rate(r)
    return r
