"""Write '<pdf>.p<N>.facts.json' and '<pdf>.p<N>.jpg' sidecars next to PDF sheets (needs pdfplumber + pypdfium2),
so engine/sheet.py works on machines without them.  python tools/sheet_facts.py eval/sheets/*.pdf"""
import os, sys, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from engine import sheet, docqa
for p in sys.argv[1:]:
    import pdfplumber
    n = len(pdfplumber.open(p).pages)
    for i in range(min(n, 3)):
        json.dump(sheet.load(p, i), open(f"{p}.p{i + 1}.facts.json", "w"))
        img = docqa.render_page(p, i)
        if img: open(f"{p}.p{i + 1}.jpg", "wb").write(img)
        print(p, i + 1)
