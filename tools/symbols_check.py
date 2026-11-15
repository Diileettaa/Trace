"""V1: overlay of one labelled symbol cluster on the whole sheet, to check for misses. python tools/symbols_check.py sheet.pdf page out.png sym8,sym11"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pdfplumber, pypdfium2 as pdfium
from PIL import ImageDraw
from engine import symbols, sheet
pdf, page, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]; want = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None
mpp = sheet.load(pdf, page - 1)["scale"]["m_per_pt"]
with pdfplumber.open(pdf) as P: cl = symbols.clusters(P.pages[page - 1], mpp)
S = 3; img = pdfium.PdfDocument(pdf)[page - 1].render(scale=S).to_pil().convert("RGB"); d = ImageDraw.Draw(img)
open(out + ".montage.png", "wb").write(symbols.montage(pdf, page - 1, cl))
for c in cl:
    if want and c["id"] not in want: continue
    for i in c["instances"]:
        b = i["bbox_pt"]; d.rectangle([b[0] * S - 6, b[1] * S - 6, b[2] * S + 6, b[3] * S + 6], outline="red", width=4)
img.save(out); print([(c["id"], c["n"], c["size_m"]) for c in cl])
