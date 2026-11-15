"""Crops of each repeated-symbol cluster (exemplar + count) for naming / checking. python tools/symbols_montage.py sheet.pdf [page] out.png"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pdfplumber, pypdfium2 as pdfium
from PIL import Image, ImageDraw
from engine import symbols, sheet
pdf, page, out = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1, sys.argv[3] if len(sys.argv) > 3 else "symbols.png"
mpp = sheet.load(pdf, page - 1)["scale"]["m_per_pt"]
with pdfplumber.open(pdf) as P: cl = symbols.clusters(P.pages[page - 1], mpp)
S = 6; img = pdfium.PdfDocument(pdf)[page - 1].render(scale=S).to_pil().convert("RGB")
tiles = []
for c in cl[:30]:
    b = c["instances"][0]["bbox_pt"]; m = 6
    crop = img.crop([int((b[0] - m) * S), int((b[1] - m) * S), int((b[2] + m) * S), int((b[3] + m) * S)]); crop.thumbnail((160, 160))
    t = Image.new("RGB", (170, 190), "white"); t.paste(crop, (5, 5)); d = ImageDraw.Draw(t)
    d.text((5, 170), f"{c['id']} n={c['n']} {c['size_m'][0]:.2f}x{c['size_m'][1]:.2f}m", fill="black"); tiles.append(t)
W = 6; H = (len(tiles) + W - 1) // W; M = Image.new("RGB", (170 * W, 190 * max(H, 1)), "white")
for i, t in enumerate(tiles): M.paste(t, ((i % W) * 170, (i // W) * 190))
M.save(out); json.dump(cl, open(out + ".json", "w")); print(len(cl), "clusters", [(c["id"], c["n"]) for c in cl[:30]])
