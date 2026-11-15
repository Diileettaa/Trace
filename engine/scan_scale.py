"""Automatic scale for a scanned sheet: the printed ratio (1:N) and the paper size from the title block, read by the
vision model once per image, -> metres per image pixel. Valid only when the scan shows the whole sheet (edge to edge);
the result says so, and a user calibration (/calibrate) always wins over it."""
import os, json, hashlib

ISO = {"A0": (1189, 841), "A1": (841, 594), "A2": (594, 420), "A3": (420, 297), "A4": (297, 210),
       "ANSI D": (864, 559), "ANSI E": (1118, 864), "ARCH D": (914, 610), "ARCH E": (1219, 914), "ANSI B": (432, 279)}
PROMPT = ("This is a scanned drawing sheet. Read from it (title block, scale notes, scale bar labels) and answer in JSON: "
          '{"ratio": <N of the main plan scale 1:N, number, or null>, "ratio_text": "<as printed>", '
          '"paper": "<sheet size as printed, e.g. A1, A2, ARCH D, or null>", '
          '"full_sheet": <true if the image shows the whole sheet border to border>, "evidence": "<where you read it>"}. '
          "If the plan is not to scale (NTS) or nothing is printed, use null. Do not guess.")
CACHE = os.path.join(os.environ.get("JUNCTION_CACHE", os.path.expanduser("~/.cache/junction-engine")), "scale")

def read(image_bytes, size_px, vision_json):
    """-> {"m_per_px", "ratio", "paper", "basis", "warnings"} or {"m_per_px": None, ...}"""
    key = hashlib.md5(image_bytes).hexdigest(); cp = os.path.join(CACHE, key + ".json")
    if os.path.exists(cp): r = json.load(open(cp))
    else:
        try: r = vision_json(PROMPT, image_bytes)
        except Exception as e: return {"m_per_px": None, "warnings": [f"scale reading failed: {e!r}"[:120]]}
        os.makedirs(CACHE, exist_ok=True); json.dump(r, open(cp, "w"))
    W, H = size_px; warn = []
    ratio = r.get("ratio"); paper = str(r.get("paper") or "").upper().replace("SIZE", "").replace("ISO", "").strip()
    try: ratio = float(ratio) if ratio else None
    except (TypeError, ValueError): ratio = None
    mm = next((v for k, v in ISO.items() if paper == k or paper.startswith(k + " ")), None)
    if not ratio or not mm:
        return {"m_per_px": None, "ratio": ratio, "paper": paper or None, "read": r,
                "warnings": ["no printed scale and paper size found: calibrate to measure"]}
    if not r.get("full_sheet"): warn.append("the image may not show the whole sheet: the scale can be off; calibrate to confirm")
    asp_img = max(W, H) / min(W, H); asp_paper = mm[0] / mm[1]
    if abs(asp_img - asp_paper) / asp_paper > 0.05:
        warn.append(f"image aspect {asp_img:.2f} differs from {paper} ({asp_paper:.2f}): cropped or not the whole sheet; not used")
        return {"m_per_px": None, "ratio": ratio, "paper": paper, "read": r, "warnings": warn}
    m_per_px = mm[0] / 1000 * ratio / max(W, H)
    return {"m_per_px": m_per_px, "ratio": ratio, "paper": paper, "read": r,
            "basis": f"printed 1:{ratio:g} on {paper} ({mm[0]}x{mm[1]} mm), whole sheet assumed", "warnings": warn}
