"""HTTP interface of the document store, framework-free so B side can mount it anywhere.

    handle(method, path, query, headers, body) -> (status, headers, body_bytes)

Routes (all JSON unless noted):
  POST /docs                 multipart/form-data upload (field 'file', optional 'title','revision','project','uploaded_by')
  GET  /docs?q=..            search (latest only unless all=1); without q: list (optional status=pending|conflict)
  GET  /docs/file?id=N       the file itself (download), by id only - no paths accepted
  GET  /docs/versions?doc_key=K
  GET  /docs/events?id=N     audit trail
  POST /docs/resolve         {"id":N,"action":"approve|make_latest|reject"}
  POST /docs/ingest          raw RFC 822 message (message/rfc822 or application/octet-stream)
  GET  /docs/mailbox         poll the live mailbox now (needs DOCS_IMAP_* env), returns receipts
  POST /docs/tool            {"name":..., "args":{...}}  agent tool call (see docs_tools.TOOLS)
  GET  /docs/tools           the tool declarations
  GET  /project/sheets?project=P   every sheet with its kind / level / sheet number / title / building (indexed once)
  POST /project/building     {"id": N, "building": "A"}   (or send field 'building' with the upload)
  POST /project/ask          {"project": P, "question": ".."} -> total + per-sheet breakdown (each with its answer_id)
  POST /ask                  {"id": N | "path": "data/..." | "uploads/...", "question": ".."}   (also /calibrate, /measure)
  POST /ask                  {"id": N, "question": ".."} -> answer with answer_id, item ids (boxes), alternatives
  GET  /answer?id=A          a stored answer (after reviews)
  POST /review               {"answer_id": A, "remove": [item ids], "add": [[x0,y0,x1,y1], ...], "choose": k, "user": ".."}
  POST /calibrate            {"id": N, "p1": [x,y], "p2": [x,y], "length_m": 5.5, "image_size": [w,h] (images), "page": 0}
  POST /measure              {"id": N, "points": [[x,y], ...], "kind": "area"|"length", "page": 0}
Auth: if DOCS_TOKEN is set, every request needs 'Authorization: Bearer <token>' or 'X-Docs-Token'.
Standalone: python -m agent.docs_api --port 8765   FastAPI: app.mount via make_asgi() (no FastAPI needed)."""
import os, json, hmac, email, mimetypes, urllib.parse
from email import policy
from .docs_store import DocsStore
from . import mail_ingest, docs_tools

MAX_BODY = int(os.environ.get("DOCS_MAX_BYTES", 200 * 1024 * 1024)) + 1024 * 1024

def _j(status, obj):
    return status, {"Content-Type": "application/json; charset=utf-8"}, json.dumps(obj, ensure_ascii=False, default=str).encode()

def _authorised(headers):
    tok = os.environ.get("DOCS_TOKEN")
    if not tok: return True
    h = {k.lower(): v for k, v in headers.items()}
    given = h.get("x-docs-token") or (h.get("authorization", "")[7:] if h.get("authorization", "").lower().startswith("bearer ") else "")
    return hmac.compare_digest(given.encode(), tok.encode())

def _multipart(headers, body):
    ctype = {k.lower(): v for k, v in headers.items()}.get("content-type", "")
    msg = email.message_from_bytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + body, policy=policy.HTTP)
    fields, files = {}, []
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        fn = part.get_filename()
        data = part.get_payload(decode=True) or b""
        if fn: files.append((name, fn, data))
        elif name: fields[name] = data.decode("utf-8", "replace")
    return fields, files

def _resolve_path(p):
    """'data/...' -> under JUNCTION_DATA, 'uploads/...' -> under CACHE_DIR/uploads (JUNCTION_UPLOADS overrides).
    -> (absolute file, path for engine.answer) or (None, None). Nothing outside those two folders is reachable."""
    p = p.replace("\\", "/").lstrip("/")
    data = os.path.realpath(os.environ.get("JUNCTION_DATA", os.path.expanduser("~/work/junction-dataset")))
    up = os.path.realpath(os.environ.get("JUNCTION_UPLOADS", os.path.join(os.environ.get("CACHE_DIR", os.path.expanduser("~/.cache/junction")), "uploads")))
    if p.startswith("data/"): base, rest, rel = data, p, None
    elif p.startswith("uploads/"): base, rest, rel = up, p[len("uploads/"):], None
    else: return None, None
    f = os.path.realpath(os.path.join(base, rest))
    if not (f == base or f.startswith(base + os.sep)) or not os.path.isfile(f): return None, None
    return f, (p if p.startswith("data/") else f)

def handle(method, path, query, headers, body, S=None):
    S = S or docs_tools.store()
    if not _authorised(headers): return _j(401, {"error": "missing or wrong token"})
    q = {k: v[-1] for k, v in urllib.parse.parse_qs(query or "").items()}
    path = path.rstrip("/") or "/"
    proj = q.get("project") or os.environ.get("DOCS_PROJECT", "default")
    try:
        if len(body or b"") > MAX_BODY: return _j(413, {"error": "request too large"})
        if path == "/docs" and method == "POST":
            fields, files = _multipart(headers, body)
            if not files: return _j(400, {"error": "no file field in the upload"})
            out = []
            for _, fn, data in files:
                r = S.add(data, fn, actor=fields.get("uploaded_by", "web"), source="web",
                          project=fields.get("project", proj), title=fields.get("title"), revision=fields.get("revision"))
                if fields.get("building") and r.get("document"): docs_tools.set_building(r["document"]["id"], fields["building"], S)
                out.append({"status": r["status"], "reason": r["reason"], "document": docs_tools._pub(r["document"]),
                            "superseded": r["superseded"]})
            return _j(200, {"results": out})
        if path == "/docs" and method == "GET":
            if q.get("q"):
                hits = S.search(q["q"], project=proj, latest_only=q.get("all") != "1",
                                discipline=q.get("discipline"), permit=q.get("permit"), limit=int(q.get("limit", 20)))
                return _j(200, {"results": [docs_tools._pub(h, ("matched_in", "snippet", "score")) for h in hits]})
            return _j(200, {"documents": [docs_tools._pub(d) for d in S.list(proj, q.get("status"), int(q.get("limit", 100)))]})
        if path == "/docs/file" and method == "GET":
            if not q.get("id", "").isdigit(): return _j(400, {"error": "id must be a number"})
            d = S.get(int(q["id"])); p = S.path(int(q["id"])) if d else None
            if not p: return _j(404, {"error": "not found"})
            ctype = mimetypes.guess_type(d["filename"])[0] or "application/octet-stream"
            fn = urllib.parse.quote(d["filename"])
            return 200, {"Content-Type": ctype, "Content-Disposition": f"attachment; filename*=UTF-8''{fn}",
                         "X-Content-Type-Options": "nosniff"}, open(p, "rb").read()
        if path == "/docs/versions" and method == "GET":
            return _j(200, {"versions": [docs_tools._pub(v) for v in S.versions(q.get("doc_key", ""), proj)]})
        if path == "/docs/events" and method == "GET":
            return _j(200, {"events": S.events(int(q.get("limit", 50)), int(q["id"]) if q.get("id", "").isdigit() else None)})
        if path == "/docs/resolve" and method == "POST":
            a = json.loads(body or b"{}")
            if a.get("action") not in ("approve", "make_latest", "reject"): return _j(400, {"error": "action must be approve|make_latest|reject"})
            d = S.resolve(int(a["id"]), a["action"], actor=a.get("actor", "web"))
            return _j(200 if d else 404, {"document": docs_tools._pub(d)})
        if path == "/docs/ingest" and method == "POST":
            r = mail_ingest.ingest_message(body, S, project=q.get("project"))
            return _j(200, r)
        if path == "/docs/mailbox" and method == "GET":
            try: return _j(200, {"receipts": mail_ingest.poll_imap(S)})
            except RuntimeError as e: return _j(503, {"error": str(e)})
        if path.startswith("/project/"):
            a = json.loads(body or b"{}") if method == "POST" else {}
            if path == "/project/building": return _j(200, docs_tools.set_building(int(a["id"]), str(a["building"]), S))
            pj = a.get("project") or proj
            if path == "/project/sheets": return _j(200, {"project": pj, "sheets": docs_tools.project_sheets(pj, S)})
            if path == "/project/ask": return _j(200, docs_tools.ask_project(pj, a.get("question", ""), S))
        if path in ("/ask", "/review", "/calibrate", "/measure", "/answer"):
            from engine import review as R
            a = json.loads(body or b"{}") if method == "POST" else {}
            if path == "/answer": r = R.get(q.get("id", "")); return _j(200 if r else 404, r or {"error": "no such answer"})
            if path == "/review":
                return _j(200, R.review(a.get("answer_id", ""), a.get("remove") or [], a.get("add") or [], a.get("choose"), a.get("user", "web")))
            if a.get("path") and not a.get("id"):            # dataset or upload path instead of a filed document
                f, rel = _resolve_path(str(a["path"]))
                if f is None: return _j(400, {"error": "path must be under data/ or uploads/ and exist"})
                if path == "/ask":
                    from engine import answer as A
                    r = A.answer(rel, a.get("question", ""))
                    return _j(200, R.register(r, f, a.get("question", "")))
                if path == "/calibrate":
                    return _j(200, R.calibrate(f, a["p1"], a["p2"], float(a["length_m"]), int(a.get("page", 0)), a.get("image_size")))
                return _j(200, R.measure(f, a.get("points") or [], a.get("kind", "area"), int(a.get("page", 0))))
            d = S.get(int(a.get("id", 0)))
            if not d: return _j(404, {"error": "no such document"})
            if path == "/ask":
                r = docs_tools.ask_drawing(d["id"], a.get("question", ""), S)
                f = r.pop("file_for_review", None) or S.path(d["id"])
                return _j(200, R.register(r, f, a.get("question", "")))
            f = docs_tools.view_path(d, S)
            if path == "/calibrate":
                return _j(200, R.calibrate(f, a["p1"], a["p2"], float(a["length_m"]), int(a.get("page", 0)), a.get("image_size")))
            return _j(200, R.measure(f, a.get("points") or [], a.get("kind", "area"), int(a.get("page", 0))))
        if path == "/docs/tools" and method == "GET":
            return _j(200, {"tools": docs_tools.TOOLS})
        if path == "/docs/tool" and method == "POST":
            a = json.loads(body or b"{}")
            return _j(200, docs_tools.run_tool(a.get("name"), a.get("args"), S))
        return _j(404, {"error": f"no route {method} {path}"})
    except (ValueError, KeyError) as e:
        return _j(400, {"error": f"bad request: {type(e).__name__}: {e}"})

def make_asgi(S=None):
    """Minimal ASGI app: FastAPI/Starlette users can app.mount('/', make_asgi()) or route /docs* to it."""
    async def app(scope, receive, send):
        if scope["type"] != "http": return
        body = b""
        while True:
            m = await receive(); body += m.get("body", b"")
            if not m.get("more_body"): break
        hdrs = {k.decode(): v.decode() for k, v in scope.get("headers", [])}
        st, h, b = handle(scope["method"], scope["path"], scope.get("query_string", b"").decode(), hdrs, body, S)
        await send({"type": "http.response.start", "status": st, "headers": [(k.lower().encode(), v.encode()) for k, v in h.items()]})
        await send({"type": "http.response.body", "body": b})
    return app

def serve(port=8765, host="127.0.0.1"):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    class H(BaseHTTPRequestHandler):
        def _go(self):
            u = urllib.parse.urlsplit(self.path); n = int(self.headers.get("Content-Length") or 0)
            if n > MAX_BODY: st, h, b = _j(413, {"error": "request too large"})
            else: st, h, b = handle(self.command, u.path, u.query, dict(self.headers), self.rfile.read(n) if n else b"")
            self.send_response(st)
            for k, v in h.items(): self.send_header(k, v)
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
        do_GET = do_POST = _go
        def log_message(self, *a): pass
    print(f"docs api on http://{host}:{port}/docs"); ThreadingHTTPServer((host, port), H).serve_forever()

if __name__ == "__main__":
    import argparse, sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=8765); ap.add_argument("--host", default="127.0.0.1")
    a = ap.parse_args(); serve(a.port, a.host)
