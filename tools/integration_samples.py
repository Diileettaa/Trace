"""Reply to handoff 44: real request / response samples for every route the frontend uses, produced by calling the
API handler in-process (same code path as HTTP). Writes eval/integration/<name>.json (+ .png for evidence).

python tools/integration_samples.py [--dataset <junction-dataset folder>]
Needs GEMINI_API_KEY for the vector-PDF / scan / project questions; without it those samples record the engine's
honest 'needs the vision model' answer. IFC and geometry scenes need no key."""
import sys, os, json, shutil, argparse, uuid
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument("--dataset", default=os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset")))
a = ap.parse_args()
os.environ["JUNCTION_DATA"] = os.path.abspath(a.dataset)
if not os.environ.get("GEMINI_API_KEY", "").strip():
    import getpass
    k = getpass.getpass("GEMINI_API_KEY not set. Paste key (hidden, Enter to skip): ").strip()
    if k: os.environ["GEMINI_API_KEY"] = k
print("vision model:", "ON" if os.environ.get("GEMINI_API_KEY") else "OFF (PDF/scan/project samples will be null)")
UP = os.environ.setdefault("JUNCTION_UPLOADS", os.path.join(ROOT, "eval", "integration", "_uploads"))
os.makedirs(UP, exist_ok=True)
from agent import docs_api as API, docs_store
OUT = os.path.join(ROOT, "eval", "integration"); os.makedirs(OUT, exist_ok=True)
S = docs_store.DocsStore(os.environ.get("SAMPLES_STORE", os.path.join(OUT, "_store")))

def call(method, path, query="", body=None, headers=None, name=None):
    b = json.dumps(body).encode() if isinstance(body, dict) else (body or b"")
    st, hd, data = API.handle(method, path, query, headers or {"Content-Type": "application/json"}, b, S)
    ct = hd.get("Content-Type", "")
    if name:
        if ct.startswith("image/png"): open(os.path.join(OUT, name + ".png"), "wb").write(data)
        else:
            json.dump({"request": {"method": method, "path": path, "query": query, "body": body if isinstance(body, dict) else None},
                       "status": st, "response": json.loads(data)}, open(os.path.join(OUT, name + ".json"), "w"), ensure_ascii=False, indent=1)
    print(f"{st} {method} {path}?{query} -> {name or ''} {ct}")
    return st, (json.loads(data) if ct.startswith("application/json") else data)

def upload(src):
    dst = os.path.join(UP, os.path.basename(src)); shutil.copy(src, dst); return "uploads/" + os.path.basename(src)

def multipart(files, fields):
    bnd = uuid.uuid4().hex; parts = []
    for k, v in fields.items(): parts.append(f'--{bnd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for fn in files:
        parts.append(f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="{os.path.basename(fn)}"\r\nContent-Type: application/pdf\r\n\r\n'.encode()
                     + open(fn, "rb").read() + b"\r\n")
    return b"".join(parts) + f"--{bnd}--\r\n".encode(), {"Content-Type": f"multipart/form-data; boundary={bnd}"}

XSC = os.path.join(a.dataset, "data/opening_design/Sports_Complex")
school_pdf = upload(os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf"))
names_sidecar = os.path.join(ROOT, "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf.p1.symbol_names.json")
if os.path.exists(names_sidecar): shutil.copy(names_sidecar, os.path.join(UP, os.path.basename(names_sidecar)))
school_scan = upload(os.path.join(ROOT, "eval/scans_synth/school_L00_scan.jpg"))

# --- B1 /ask: IFC, vector PDF, scan -------------------------------------------------------------------------------
ifc = "data/ifc_models/bsc-duplex_duplex-a-20110907.ifc"
for name, body in [("ask_ifc", {"path": ifc, "question": "How many doors are in this model?"}),
                   ("ask_pdf_vector", {"path": school_pdf, "page": 1, "question": "How many doors are shown on this floor plan?"}),
                   ("ask_scan", {"path": school_scan, "question": "How many windows are shown on this floor plan?"})]:
    st, r = call("POST", "/ask", body=body, name=name)
    if st == 200 and r.get("answer_id"):
        call("GET", "/evidence", f"answer_id={r['answer_id']}", name=name.replace("ask", "evidence"))
        call("GET", "/evidence", f"answer_id={r['answer_id']}&view=zoom", name=name.replace("ask", "evidence") + "_zoom")
# --- B2 /project: site plan + floor plan + door schedule -----------------------------------------------------------
sheets = [os.path.join(XSC, p) for p in ("Transfer/_Archive/20150922 - site dimensions/20150922 - XSC - A-100.A - SITE PLAN.pdf",
                                         "Models/2D/Sports Complex - Sheet - A-101 - First Floor Plan.pdf",
                                         "Sheets - Current Set/A-801 - Door and Finish Schedules & Wall Types.pdf")]
if all(os.path.exists(p) for p in sheets):
    body, hd = multipart(sheets, {"project": "xsc", "building": "Xcel Sports Complex"})
    call("POST", "/docs", "", body, hd, name="docs_upload")
    call("GET", "/project/sheets", "project=xsc", name="project_sheets")
    st, r = call("POST", "/project/ask", body={"project": "xsc", "question": "How many doors are on the first floor?"}, name="project_ask")
    if st == 200 and r.get("answer_id"): call("GET", "/evidence", f"answer_id={r['answer_id']}", name="evidence_project")
else: print("Sports Complex sheets not found under", XSC)
# --- C /api/geometry/scene ----------------------------------------------------------------------------------------
call("GET", "/api/geometry/scene", "path=data/ifc_models/bsc-duplex_duplex-plumbing-20121113.ifc&room=Bathroom%201"
     "&space_model=data/ifc_models/bsc-duplex_duplex-a-20110907.ifc", name="scene_ifc_bathroom")
call("GET", "/api/geometry/scene", f"path={school_pdf}&page=1", name="scene_pdf_vector_school")
call("GET", "/api/geometry/scene", f"path={school_scan}", name="scene_scan_school")
# --- D errors -----------------------------------------------------------------------------------------------------
call("POST", "/ask", body={"path": "../secret.txt", "question": "x"}, name="error_bad_path")
call("GET", "/evidence", "answer_id=does-not-exist", name="error_unknown_answer")
call("GET", "/api/geometry/scene", "path=data/ifc_models/bsc-duplex_duplex-a-20110907.ifc&room=No%20Such%20Room", name="error_no_room")
print("written to", OUT)
