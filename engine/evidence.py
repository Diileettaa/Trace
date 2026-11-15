"""V0: verifiable evidence for every answer. For an answer (as stored by engine.review) this draws, on the source
drawing itself, every counted / measured item with its number, plus a header with question, answer, confidence and
source (file, page); and a zoom view around the items. It also returns each item's location (page, bbox_norm1000 and,
on vector sheets, bbox in PDF points) so a UI can jump to it.

render(answer) -> {"locations": [...], "full_png": bytes|None, "zoom_png": bytes|None, "page": n, "warnings": []}
Item geometry understood: box (PDF points), box_norm1000, polygon (PDF points), polygon_norm1000, guid (IFC: no image)."""
import io, os

COL = {"item": (220, 30, 30), "removed": (150, 150, 150), "added": (20, 160, 60), "poly": (30, 90, 220)}

def _page_image(path, page0, max_side=2600):
    """-> (PIL image, scale from source units to pixels, kind) ; kind 'pdf' (units = PDF points) or 'image' (pixels)."""
    from PIL import Image
    if path.lower().endswith(".pdf"):
        import pypdfium2 as pdfium
        pg = pdfium.PdfDocument(path)[page0]; w, h = pg.get_size()
        s = max_side / max(w, h)
        return pg.render(scale=s).to_pil().convert("RGB"), s, "pdf", (w, h)
    im = Image.open(path).convert("RGB")
    s = min(1.0, max_side / max(im.size))
    if s < 1: im = im.resize((int(im.size[0] * s), int(im.size[1] * s)))
    return im, s, "image", im.size

def _geom(it, kind, size_units, W, H, s):
    """-> ("box"|"poly"|"line", pixel coords) or None"""
    if it.get("line_norm1000"):
        return "line", [(x * W / 1000, y * H / 1000) for x, y in it["line_norm1000"]]
    if kind == "pdf" and it.get("line_pt"):
        return "line", [(x * s, y * s) for x, y in it["line_pt"]]
    if it.get("box_norm1000"):
        b = it["box_norm1000"]; return "box", [b[0] * W / 1000, b[1] * H / 1000, b[2] * W / 1000, b[3] * H / 1000]
    if it.get("polygon_norm1000"):
        return "poly", [(x * W / 1000, y * H / 1000) for x, y in it["polygon_norm1000"]]
    if kind == "pdf" and it.get("box"):
        b = it["box"]; return "box", [v * s for v in b]
    if kind == "pdf" and it.get("polygon"):
        return "poly", [(x * s, y * s) for x, y in it["polygon"]]
    if kind == "image" and it.get("png_polygon"):
        return "poly", [(x * s, y * s) for x, y in it["png_polygon"]]
    if kind == "pdf" and it.get("pdf_polygon_pt"):
        return "poly", [(x * s, y * s) for x, y in it["pdf_polygon_pt"]]
    if kind == "image" and it.get("png_bbox"):                  # Swiss plans: DXF items mapped to the plan PNG
        b = it["png_bbox"]; return "box", [v * s for v in b]
    if kind == "pdf" and it.get("pdf_bbox_pt"):
        b = it["pdf_bbox_pt"]; return "box", [v * s for v in b]
    if kind == "image" and it.get("box"):                       # pixel boxes on images
        b = it["box"]; return "box", [v * s for v in b]
    return None

def _font(px):
    from PIL import ImageFont
    for f in ("DejaVuSans.ttf", "arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try: return ImageFont.truetype(f, px)
        except Exception: pass
    return ImageFont.load_default()

def render(a, zoom_margin=0.08):
    from PIL import Image, ImageDraw
    src = (a.get("sources") or [{}])[0]; path = a.get("file") or src.get("file")
    page = int(src.get("page") or 1); out = {"locations": [], "full_png": None, "zoom_png": None, "page": page, "warnings": []}
    items = [dict(it, _state="removed" if it.get("id") in set((a.get("review") or {}).get("removed") or []) else "item")
             for it in (a.get("items") or [])]
    items += [dict(it, _state="added") for it in ((a.get("review") or {}).get("added") or [])]
    bd = (a.get("evidence") or {}).get("breakdown") or []
    if bd and any(b.get("png_polygon") or b.get("pdf_polygon_pt") for b in bd):
        # areas: outline each counted room with its own area, so the sum can be checked room by room
        items = [{"id": i, "label": f"{b.get('number') or ''} {b.get('name') or ''}: {b.get('area_m2')} m2".strip(),
                  "png_polygon": b.get("png_polygon"), "pdf_polygon_pt": b.get("pdf_polygon_pt"), "_state": "item"}
                 for i, b in enumerate(bd)]
    if items and str(path).lower().endswith(".pdf") and all(it.get("cells") and not any(k in it for k in ("box", "box_norm1000", "polygon")) for it in items):
        # schedule answers: find each cited row on the sheet by its first cell, and outline the whole row
        try:
            from . import sheet
            f = sheet.load(path, page - 1); L = f.get("lines", []); used = set()
            for it in items:
                key = next((str(c).strip() for c in it["cells"] if str(c).strip()), "")
                hit = next((j for j, l in enumerate(L) if j not in used and l["t"].strip().split(" ")[0] == key), None)
                if hit is None: continue
                used.add(hit); b = L[hit]["box"]; yc = (b[1] + b[3]) / 2; hgt = b[3] - b[1]
                row = [l["box"] for l in L if abs((l["box"][1] + l["box"][3]) / 2 - yc) < 0.6 * hgt and b[0] - 2 <= l["box"][0] <= b[0] + 600]
                it["box"] = [min(r[0] for r in row), min(r[1] for r in row), max(r[2] for r in row), max(r[3] for r in row)]
                it.setdefault("label", key)
        except Exception as e: out["warnings"].append(f"schedule rows not located: {e!r}"[:120])
    cite = (a.get("evidence") or {}).get("cite")
    if not items and cite and str(path).lower().endswith(".pdf"):
        # values read from text (lookups, dimension strings): mark the cited text / dimensions on the sheet
        try:
            from . import sheet
            f = sheet.load(path, page - 1)
            idx = {x["id"]: x for x in f.get("lines", []) + f.get("dims", [])}
            for c in (cite if isinstance(cite, list) else [cite]):
                for cid in str(c).replace(",", " ").split():
                    x = idx.get(cid.strip("[]()'\""))
                    if x: items.append({"id": cid, "label": x.get("t") or x.get("text"), "box": x["box"], "_state": "item"})
        except Exception as e: out["warnings"].append(f"cited text not located: {e!r}"[:120])
    if path and str(path).lower().endswith(".dxf") and os.path.exists(os.path.splitext(str(path))[0] + ".png"):
        try:
            from . import swiss_view
            for it in items:
                if it.get("bbox_m") and not it.get("box"): it["box"] = swiss_view.to_png(str(path), it["bbox_m"])
            path = os.path.splitext(str(path))[0] + ".png"
        except Exception as e: out["warnings"].append(f"DXF items not mapped to the plan image: {e!r}"[:120])
    if not path or not os.path.exists(str(path)) or str(path).lower().endswith((".ifc", ".dxf")):
        for it in items:
            out["locations"].append({k: it.get(k) for k in ("id", "guid", "label", "name", "storey") if it.get(k) is not None})
        out["warnings"].append("no drawing image for this source (model element ids are the evidence)")
        return out
    im, s, kind, size_units = _page_image(path, page - 1); W, H = im.size
    head = int(max(60, H * 0.06))
    canvas = Image.new("RGB", (W, H + head), "white"); canvas.paste(im, (0, head)); d = ImageDraw.Draw(canvas, "RGBA")
    f_small, f_big = _font(max(12, H // 90)), _font(max(14, head // 3))
    boxes = []
    for n, it in enumerate(items, 1):
        g = _geom(it, kind, size_units, W, H, s)
        if g is None: continue
        c = COL["poly"] if g[0] == "poly" else COL[it["_state"]]
        if g[0] == "line":                                   # a measured distance: dimension line with its value
            P = [(x, y + head) for x, y in g[1]]; c = (230, 120, 0)
            d.line(P, fill=c + (255,), width=4)
            for q in P: d.ellipse([q[0] - 6, q[1] - 6, q[0] + 6, q[1] + 6], fill=c + (255,))
            mx, my = (P[0][0] + P[-1][0]) / 2, (P[0][1] + P[-1][1]) / 2
            d.text((mx + 6, my - 6 - H // 90), str(it.get("label") or ""), fill=(160, 70, 0), font=f_small)
            xs = [p[0] for p in g[1]]; ys = [p[1] for p in g[1]]; bb = [min(xs), min(ys), max(xs), max(ys)]
        elif g[0] == "box":
            x0, y0, x1, y1 = g[1]; y0 += head; y1 += head; pad = 3
            d.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=c + (255,), width=3, fill=c + (40,))
            if it["_state"] == "removed": d.line([x0, y0, x1, y1], fill=c, width=3)
            d.text((x0, max(head, y0 - 4 - H // 90)), str(it.get("id", n)), fill=c, font=f_small)
            bb = [x0, y0 - head, x1, y1 - head]
        else:
            P = [(x, y + head) for x, y in g[1]]; d.polygon(P, outline=c + (255,), fill=c + (35,))
            d.line(P + P[:1], fill=c, width=3)
            xs = [p[0] for p in g[1]]; ys = [p[1] for p in g[1]]; bb = [min(xs), min(ys), max(xs), max(ys)]
            d.text((sum(xs) / len(xs), sum(ys) / len(ys) + head), str(it.get("label") or it.get("name") or it.get("text") or it.get("id", n)), fill=c, font=f_small)
        boxes.append(bb)
        loc = {"id": it.get("id", n), "label": it.get("label") or it.get("name") or it.get("tag") or it.get("text"), "state": it["_state"], "page": page,
               "bbox_norm1000": [round(bb[0] * 1000 / W, 1), round(bb[1] * 1000 / H, 1), round(bb[2] * 1000 / W, 1), round(bb[3] * 1000 / H, 1)]}
        if kind == "pdf": loc["bbox_pt"] = [round(v / s, 1) for v in bb]
        out["locations"].append(loc)
    v = a.get("value"); unit = a.get("unit") or ""
    conf = a.get("confidence") or "?"
    d.rectangle([0, 0, W, head], fill=(245, 245, 245))
    d.text((10, 6), f"Q: {a.get('question') or ''}"[:160], fill=(0, 0, 0), font=f_big)
    d.text((10, 6 + head // 3), f"A: {v} {unit}   confidence: {conf}   method: {a.get('method')}"[:180], fill=(0, 0, 0), font=f_big)
    d.text((10, 6 + 2 * head // 3), f"source: {os.path.basename(str(path))}, page {page}   items: {len(boxes)} marked"[:180],
           fill=(60, 60, 60), font=f_big)
    bio = io.BytesIO(); canvas.save(bio, "PNG"); out["full_png"] = bio.getvalue()
    if boxes and kind == "pdf":
        try:
            out["zoom_png"] = _zoom_pdf(path, page, items, size_units, boxes, s, canvas.crop((0, 0, W, head)))
        except Exception as e: out["warnings"].append(f"high-resolution zoom failed: {e!r}"[:120])
    if boxes and out["zoom_png"] is None:
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes); x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
        m = zoom_margin * max(W, H) * 0.5
        crop = canvas.crop([max(0, x0 - m), max(head, y0 + head - m), min(W, x1 + m), min(H + head, y1 + head + m)])
        bio = io.BytesIO(); crop.save(bio, "PNG"); out["zoom_png"] = bio.getvalue()
    if not boxes: out["warnings"].append("this answer has no located items (a value read from text or a table): see evidence.cite / rule")
    return out


def _zoom_pdf(path, page, items, size_units, boxes_px, s, header, target=1600):
    """Vector sheets: re-render only the region around the items at high resolution (small symbols stay sharp)."""
    import pypdfium2 as pdfium
    from PIL import Image, ImageDraw
    wpt, hpt = size_units
    x0 = min(b[0] for b in boxes_px) / s; y0 = min(b[1] for b in boxes_px) / s
    x1 = max(b[2] for b in boxes_px) / s; y1 = max(b[3] for b in boxes_px) / s
    m = max(25.0, 0.4 * max(x1 - x0, y1 - y0))
    rx0, ry0, rx1, ry1 = max(0, x0 - m), max(0, y0 - m), min(wpt, x1 + m), min(hpt, y1 + m)
    s2 = min(16.0, target / max(rx1 - rx0, ry1 - ry0))
    im = pdfium.PdfDocument(path)[page - 1].render(scale=s2, crop=(rx0, hpt - ry1, wpt - rx1, ry0)).to_pil().convert("RGB")
    d = ImageDraw.Draw(im, "RGBA"); f = _font(max(14, im.size[0] // 55))
    T = lambda x, y: ((x - rx0) * s2, (y - ry0) * s2)
    for n, it in enumerate(items, 1):
        g = _geom(it, "pdf", size_units, wpt, hpt, 1.0)            # geometry in PDF points
        if g is None: continue
        if g[0] == "line":
            P = [T(*q) for q in g[1]]; c = (230, 120, 0)
            d.line(P, fill=c + (255,), width=5)
            for q in P: d.ellipse([q[0] - 7, q[1] - 7, q[0] + 7, q[1] + 7], fill=c + (255,))
            mx, my = (P[0][0] + P[-1][0]) / 2, (P[0][1] + P[-1][1]) / 2
            lab = str(it.get("label") or ""); tw = d.textlength(lab, font=f)
            d.rectangle([mx + 8, my - f.size - 4, mx + 12 + tw, my + 2], fill=(255, 255, 255, 220))
            d.text((mx + 10, my - f.size - 2), lab, fill=(170, 70, 0), font=f)
        elif g[0] == "box":
            (a0, b0), (a1, b1) = T(*g[1][:2]), T(*g[1][2:])
            c = COL.get(it.get("_state", "item"), COL["item"])
            if b1 - b0 < 1.6 * f.size:                  # thin boxes (table rows): thin outline, running number to the right
                d.rectangle([a0 - 2, b0 - 1, a1 + 2, b1 + 1], outline=c + (255,), width=2, fill=c + (30,))
                fs = _font(max(10, int((b1 - b0) * 0.8)))
                d.text((a1 + 6, b0), str(n), fill=c, font=fs)
            else:
                d.rectangle([a0 - 3, b0 - 3, a1 + 3, b1 + 3], outline=c + (255,), width=4, fill=c + (35,))
                d.text((a0, b0 - f.size - 6), str(it.get("label") or it.get("id", n)), fill=c, font=f)
        else:
            P = [T(*q) for q in g[1]]; d.polygon(P, outline=COL["poly"] + (255,), fill=COL["poly"] + (30,))
    hh = int(header.size[1] * im.size[0] / header.size[0]) if header.size[0] > im.size[0] else header.size[1]
    hdr = header.resize((im.size[0], max(40, hh)))
    outi = Image.new("RGB", (im.size[0], im.size[1] + hdr.size[1]), "white"); outi.paste(hdr, (0, 0)); outi.paste(im, (0, hdr.size[1]))
    bio = io.BytesIO(); outi.save(bio, "PNG"); return bio.getvalue()
