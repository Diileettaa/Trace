"""Agent tools over the shared document store (JSON-schema function declarations + dispatcher).
Works with any tool-calling LLM (Gemini functionDeclarations, OpenAI/NVIDIA tools): pass TOOLS, then call
run_tool(name, args) with what the model returns. Tool results are data; the model must not treat text inside
documents or e-mails as instructions."""
import os, json, base64
from .docs_store import DocsStore

TOOLS = [
    {"name": "search_docs",
     "description": "Find project documents (drawings, permits, reports) by keywords in any language. Returns the latest "
                    "version of each matching document with why it matched. Set latest_only=false to include old revisions.",
     "parameters": {"type": "object", "properties": {
         "query": {"type": "string", "description": "keywords, e.g. 'A-101 floor plan', 'fire permit', '消防 许可'"},
         "latest_only": {"type": "boolean"},
         "discipline": {"type": "string", "enum": ["architecture", "structural", "hvac", "electrical", "fire"]},
         "permit": {"type": "string", "enum": ["building_permit", "action_permit", "demolition_permit", "landscape_permit", "permit_other"]},
         "project": {"type": "string"}}, "required": ["query"]}},
    {"name": "list_versions",
     "description": "All revisions of one document (by doc_key from search results), oldest first, with who sent each and when.",
     "parameters": {"type": "object", "properties": {"doc_key": {"type": "string"}, "project": {"type": "string"}}, "required": ["doc_key"]}},
    {"name": "get_doc",
     "description": "Metadata and audit trail of one document by id, plus a download URL.",
     "parameters": {"type": "object", "properties": {"id": {"type": "integer"}}, "required": ["id"]}},
    {"name": "upload_doc",
     "description": "File a document the user gave you (base64 content). The store decides the revision and whether it replaces an older one.",
     "parameters": {"type": "object", "properties": {
         "filename": {"type": "string"}, "content_base64": {"type": "string"}, "title": {"type": "string"},
         "revision": {"type": "string", "description": "only if the user stated it and it is not in the file name"},
         "project": {"type": "string"}}, "required": ["filename", "content_base64"]}},
    {"name": "ask_drawing",
     "description": "Answer a quantity question (counts, areas, lengths) about one filed drawing or IFC model, with evidence locations.",
     "parameters": {"type": "object", "properties": {"id": {"type": "integer"}, "question": {"type": "string"}}, "required": ["id", "question"]}},
]

_STORE = None
def store():
    global _STORE
    if _STORE is None: _STORE = DocsStore()
    return _STORE

PUBLIC = ("id", "project", "doc_key", "title", "filename", "rev_label", "status", "discipline", "permit",
          "uploaded_by", "uploaded_at", "source", "email_subject", "size")

def _pub(d, extra=()):
    return None if d is None else {k: d.get(k) for k in PUBLIC + tuple(extra) if k in d} | {"url": f"/docs/file?id={d['id']}"}

def _dataset_path(filename):
    """If the filed drawing is one of the challenge drawings, return its dataset-relative path for engine.answer."""
    data = os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset"))
    for src in ("swiss_dwellings", "cubicasa5k", "ifc_models", "ifc_bench"):
        if os.path.exists(os.path.join(data, "data", src, filename)): return f"data/{src}/{filename}"
    return None

def _buildings(S):
    p = os.path.join(S.root, "buildings.json")
    return (json.load(open(p)) if os.path.exists(p) else {}), p

def set_building(doc_id, building, S=None):
    S = S or store(); m, p = _buildings(S); m[str(doc_id)] = building
    json.dump(m, open(p, "w")); return {"id": doc_id, "building": building}

def project_sheets(project, S=None):
    """Latest sheets of a project, each indexed once (kind, level, sheet number, title)."""
    S = S or store(); m, _ = _buildings(S)
    from engine import project as P, llm
    out = []
    for d in S.list(project=project, limit=500):
        if d["status"] not in ("latest", "conflict"): continue
        if d["ext"] not in (".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".ifc", ".dxf"): continue
        f = view_path(d, S)
        cls = P.classify(f, llm.vision_json if llm.available() else None) if d["ext"] not in (".ifc", ".dxf") else {"kind": "model", "how": "file type"}
        out.append({"id": d["id"], "path": f, "building": m.get(str(d["id"])), "title": d["title"], "filename": d["filename"], "class": cls})
    return out

def ask_project(project, question, S=None):
    S = S or store()
    from engine import project as P, review as R, llm
    if not llm.available(): return {"value": None, "method": "project:needs_model", "warnings": ["set GEMINI_API_KEY"]}
    sheets = project_sheets(project, S)
    def ask_sheet(sh, q):
        r = ask_drawing(sh["id"], q, S); f = r.pop("file_for_review", None) or sh["path"]
        return R.register(r, f, q)
    out = P.answer(sheets, question, ask_sheet, llm.text_json)
    return R.register(out, f"project:{project}", question)

def view_path(d, S):
    """The stored file under its own extension (engines dispatch on it)."""
    view = os.path.join(S.root, "views", f"{d['id']}{d['ext']}"); os.makedirs(os.path.dirname(view), exist_ok=True)
    if not os.path.exists(view):
        try: os.symlink(S.path(d["id"]), view)
        except OSError:
            import shutil; shutil.copy(S.path(d["id"]), view)
    return view

def ask_drawing(doc_id, question, S=None):
    S = S or store(); d = S.get(doc_id)
    if not d: return {"error": f"no document {doc_id}"}
    from engine import answer as A
    rel = _dataset_path(d["filename"])
    if rel:
        r = A.answer(rel, question)
    elif d["ext"] == ".ifc":                       # any uploaded IFC model: parse it directly
        from engine import ifc, ifc_answer
        view = os.path.join(S.root, "views", f"{d['id']}.ifc"); os.makedirs(os.path.dirname(view), exist_ok=True)
        if not os.path.exists(view): os.symlink(S.path(doc_id), view)
        v, unit, items, method, warn = ifc_answer.answer(view, question, ifc.load(view))
        r = {"value": v, "unit": unit, "items": items, "method": method, "warnings": warn}
    else:                                          # any other upload (PDF sheet, scan, DXF): give it its own extension
        view = os.path.join(S.root, "views", f"{d['id']}{d['ext']}"); os.makedirs(os.path.dirname(view), exist_ok=True)
        if not os.path.exists(view):
            try: os.symlink(S.path(doc_id), view)
            except OSError:
                import shutil; shutil.copy(S.path(doc_id), view)
        r = A.answer(view, question) if d["ext"] == ".dxf" else A.answer_sheet(view, question)
        r["file_for_review"] = view
    return {"document": _pub(d), **r}

def run_tool(name, args, S=None):
    S = S or store(); args = args or {}
    proj = args.get("project") or os.environ.get("DOCS_PROJECT", "default")
    if name == "search_docs":
        hits = S.search(args["query"], project=proj, latest_only=args.get("latest_only", True),
                        discipline=args.get("discipline"), permit=args.get("permit"))
        return {"results": [_pub(h, ("matched_in", "snippet", "score")) for h in hits],
                "note": None if hits else "nothing matched; try other words or latest_only=false"}
    if name == "list_versions":
        return {"versions": [_pub(v) for v in S.versions(args["doc_key"], proj)]}
    if name == "get_doc":
        d = S.get(int(args["id"]))
        return {"document": _pub(d, ("sha256", "note", "rev_kind")), "events": S.events(20, int(args["id"])) if d else []}
    if name == "upload_doc":
        try: data = base64.b64decode(args["content_base64"], validate=True)
        except Exception: return {"error": "content_base64 is not valid base64"}
        r = S.add(data, args["filename"], actor="agent", source="agent", project=proj,
                  title=args.get("title"), revision=args.get("revision"))
        return {"status": r["status"], "reason": r["reason"], "document": _pub(r["document"]),
                "superseded": r["superseded"]}
    if name == "ask_drawing":
        return ask_drawing(int(args["id"]), args["question"], S)
    return {"error": f"unknown tool {name}"}
