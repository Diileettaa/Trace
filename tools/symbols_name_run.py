"""Name the repeated-symbol clusters of a vector sheet with Gemini (needs GEMINI_API_KEY) and compare with the
reviewed sidecar names, if any. python tools/symbols_name_run.py [sheet.pdf] [page]"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pdfplumber
from engine import symbols, sheet, llm
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pdf = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf")
page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
if not llm.available(): sys.exit("set GEMINI_API_KEY first")
mpp = sheet.load(pdf, page - 1)["scale"]["m_per_pt"]
with pdfplumber.open(pdf) as P: cl = symbols.clusters(P.pages[page - 1], mpp)
symbols.name(pdf, page - 1, cl, vision_json=llm.vision_json)
side = f"{pdf}.p{page}.symbol_names.json"; ref = json.load(open(side)) if os.path.exists(side) else {}
agree = 0
for c in cl:
    r = ref.get(c["id"]); agree += r == c["label"]
    print(f"{c['id']:6s} n={c['n']:3d} {c['size_m'][0]:.2f}x{c['size_m'][1]:.2f} m  gemini={c['label']!s:12s} reviewed={r}")
if ref: print(f"agreement with the reviewed names: {agree}/{len(cl)}; toilets by gemini: {sum(c['n'] for c in cl if c['label']=='toilet')}")
json.dump({c["id"]: c["label"] for c in cl}, open(os.path.join(ROOT, "eval/scenes/symbols_school_gemini_names.json"), "w"), indent=0)
