"""Map Swiss DXF model coordinates (metres) to the PNG raster (pixels) and the PDF page (points).
Calibrated per drawing from the wall extents, so it works at 1:100 and 1:200."""
import os
from functools import lru_cache
from .dxf import read_entities, bbox

PNG_DPI = 150.0

@lru_cache(maxsize=256)
def calibration(dxf_path):
    import cv2, numpy as np
    png = os.path.splitext(dxf_path)[0] + ".png"
    W = [p for e in read_entities(dxf_path) if e["layer"] == "WALL" and "points" in e for p in e["points"]]
    x0, y0, x1, y1 = bbox(W)
    im = cv2.imread(png, 0)
    if im is None: return None
    H, Wd = im.shape
    reg = im[60:int(H * 0.80), 60:Wd - 60]; ys, xs = np.where(reg < 140)
    px0, px1, py0, py1 = xs.min() + 60, xs.max() + 60, ys.min() + 60, ys.max() + 60
    sx, sy = (px1 - px0) / (x1 - x0), (py1 - py0) / (y1 - y0); s = (sx + sy) / 2
    return {"scale_px_per_m": s, "dxf_min": (x0, y1), "png_min": (int(px0), int(py0)), "png_size": (Wd, H)}

def to_png(dxf_path, bb):
    c = calibration(dxf_path)
    if not c: return None
    s, (x0, ytop), (px0, py0) = c["scale_px_per_m"], c["dxf_min"], c["png_min"]
    return [round(px0 + (bb[0] - x0) * s), round(py0 + (ytop - bb[3]) * s), round(px0 + (bb[2] - x0) * s), round(py0 + (ytop - bb[1]) * s)]

def to_pdf(dxf_path, bb):
    p = to_png(dxf_path, bb)
    return [round(v * 72.0 / PNG_DPI, 1) for v in p] if p else None
