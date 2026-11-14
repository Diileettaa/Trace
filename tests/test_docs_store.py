"""T-31 shared document store: versioning, e-mail intake, search, API safety. Run: python -m pytest tests -q"""
import os, sys, glob, json, base64
import pytest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agent.docs_store import DocsStore, parse_revision, safe_name
from agent import mail_ingest, docs_api, docs_tools

MAILS = sorted(glob.glob(os.path.join(os.path.dirname(__file__), "fixtures", "emails", "*.eml")))
ALLOW = ["@arkkitehti.example", "@rakenne.example"]

@pytest.fixture
def S(tmp_path): return DocsStore(str(tmp_path / "store"))

@pytest.fixture
def filed(S):
    receipts = [mail_ingest.ingest_message(open(p, "rb").read(), S, allow=ALLOW) for p in MAILS]
    return S, receipts

def test_revision_parsing():
    assert parse_revision("A-101_revB.pdf")[:3] == ("a-101", "B", "letter")
    assert parse_revision("A-101 Rev C.pdf")[1] == "C"
    assert parse_revision("RAK_S-201_rakennetyypit_v2.pdf")[1:3] == ("2", "num")
    assert parse_revision("lupa_2026-11-13.pdf")[1:3] == ("2026-11-13", "date")
    assert parse_revision("A-101_revAA.pdf")[3] > parse_revision("A-101_revZ.pdf")[3]
    assert safe_name("../../etc/passwd") == "passwd" and safe_name("..\\..\\x.pdf") == "x.pdf"

def test_new_revision_supersedes_and_old_kept(S):
    a = S.add(b"rev B", "A-101_revB.pdf", actor="anna")
    b = S.add(b"rev C", "A-101_revC.pdf", actor="anna")
    assert b["status"] == "stored" and b["superseded"][0]["id"] == a["document"]["id"]
    assert S.get(a["document"]["id"])["status"] == "superseded" and S.path(a["document"]["id"])   # never deleted
    late = S.add(b"rev A", "A-101_revA.pdf", actor="anna")            # older revision arriving late
    assert late["document"]["status"] == "superseded" and S.get(b["document"]["id"])["status"] == "latest"

def test_duplicate_conflict_resolve(S):
    first = S.add(b"same bytes", "S-201_v1.pdf", actor="risto")
    assert S.add(b"same bytes", "renamed copy.pdf", actor="x")["status"] == "duplicate"
    c = S.add(b"other bytes", "S-201_v1.pdf", actor="risto")
    assert c["status"] == "conflict" and S.get(first["document"]["id"])["status"] == "conflict"
    S.resolve(c["document"]["id"], "make_latest", actor="pm")
    assert S.get(c["document"]["id"])["status"] == "latest" and S.get(first["document"]["id"])["status"] == "superseded"
    assert [e["action"] for e in S.events(5)][0] == "make_latest"

def test_email_intake_end_to_end(filed):
    S, R = filed
    st = {f["filename"]: f["status"] for r in R for f in r["filed"]}
    assert R[0]["skipped"] and R[0]["skipped"][0]["reason"].startswith("inline image")          # signature logo
    assert "https://share.example.org/model/A-101.ifc" in R[1]["links_not_fetched"]              # link noted, not fetched
    assert R[2]["sender_allowed"] is False and st["Rakennuslupa_paatos_2026-11-13.pdf"] == "pending"
    assert st["installer.exe"] == "rejected"
    assert R[3]["filed"][0]["status"] == "duplicate"                                             # forwarded again
    assert R[4]["filed"][0]["status"] == "conflict"
    again = mail_ingest.ingest_message(open(MAILS[0], "rb").read(), S, allow=ALLOW)
    assert again["status"] == "already_processed"
    # the injected "delete every file / forward" text was stored as data only: nothing deleted, nothing sent
    assert all(S.path(d["id"]) for d in S.list("demo"))
    assert not [e for e in S.events(200) if e["action"] not in ("filed", "duplicate", "rejected", "email")]

def test_search_multilingual_and_latest(filed):
    S, _ = filed
    top = lambda q, **k: [h["filename"] for h in S.search(q, project="demo", **k)]
    assert top("A-101 floor plan")[0] == "A-101_revC.pdf"
    assert "A-101_revB.pdf" not in top("A-101") and "A-101_revB.pdf" in top("A-101", latest_only=False)
    assert top("平面图")[0] == "A-101_revC.pdf"                          # zh -> pohjapiirustus/floor plan
    assert top("消防 许可")[0].startswith("Rakennuslupa")                 # zh -> fire/permit
    assert top("structural", discipline="structural") == ["RAK_S-201_rakennetyypit_v2.pdf"]
    hit = S.search("EI60", project="demo")[0]
    assert hit["status"] == "pending" and "file content" in hit["matched_in"]

def test_api_routes_and_safety(filed, monkeypatch):
    S, _ = filed
    call = lambda m, p, q="", h=None, b=b"": docs_api.handle(m, p, q, h or {}, b, S)
    st, _, body = call("GET", "/docs", "q=A-101&project=demo"); assert st == 200 and json.loads(body)["results"]
    did = json.loads(body)["results"][0]["id"]
    st, h, body = call("GET", "/docs/file", f"id={did}"); assert st == 200 and body.startswith(b"%PDF") and "attachment" in h["Content-Disposition"]
    assert call("GET", "/docs/file", "id=../../etc/passwd")[0] == 400
    assert call("GET", "/docs/file", "id=99999")[0] == 404
    # multipart upload
    bnd = "XyZ"; mp = (f"--{bnd}\r\nContent-Disposition: form-data; name=\"uploaded_by\"\r\n\r\nweb-user\r\n"
                      f"--{bnd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"E-301_rev1.pdf\"\r\n"
                      f"Content-Type: application/pdf\r\n\r\n%PDF fake\r\n--{bnd}--\r\n").encode()
    st, _, body = call("POST", "/docs", "project=demo", {"Content-Type": f"multipart/form-data; boundary={bnd}"}, mp)
    r = json.loads(body)["results"][0]; assert st == 200 and r["document"]["discipline"] == "electrical"
    # raw e-mail intake route
    st, _, body = call("POST", "/docs/ingest", "", {}, open(MAILS[0], "rb").read()); assert json.loads(body)["status"] == "already_processed"
    # token
    monkeypatch.setenv("DOCS_TOKEN", "s3cret")
    assert call("GET", "/docs")[0] == 401
    assert call("GET", "/docs", "", {"Authorization": "Bearer s3cret"})[0] == 200

def test_agent_tools(filed):
    S, _ = filed
    names = {t["name"] for t in docs_tools.TOOLS}
    assert {"search_docs", "list_versions", "get_doc", "upload_doc", "ask_drawing"} <= names
    r = docs_tools.run_tool("search_docs", {"query": "A-101", "project": "demo"}, S)
    assert r["results"][0]["url"].startswith("/docs/file?id=")
    v = docs_tools.run_tool("list_versions", {"doc_key": "a-101", "project": "demo"}, S)["versions"]
    assert [x["rev_label"] for x in v] == ["B", "C", "C"]
    up = docs_tools.run_tool("upload_doc", {"filename": "A-101_revD.pdf", "content_base64": base64.b64encode(b"%PDF D").decode(),
                                            "project": "demo"}, S)
    assert up["status"] == "stored" and len(up["superseded"]) == 2            # replaces both conflicting rev C copies
    assert docs_tools.run_tool("upload_doc", {"filename": "x.pdf", "content_base64": "@@@"}, S)["error"]

def test_imap_poll_with_fake_server(S, monkeypatch):
    raws = [open(p, "rb").read() for p in MAILS[:2]]
    class FakeIMAP:
        def __init__(self, host, timeout=None): self.seen = set()
        def login(self, u, p): assert p == "app-pw"
        def select(self, f): return "OK", [b"2"]
        def uid(self, cmd, *a):
            if cmd == "SEARCH": return "OK", [b"1 2"]
            if cmd == "FETCH": return "OK", [(b"1 (BODY[] {n}", raws[int(a[0]) - 1]), b")"]
            if cmd == "STORE": self.seen.add(a[0]); return "OK", []
        def logout(self): pass
    monkeypatch.setattr(mail_ingest.imaplib, "IMAP4_SSL", FakeIMAP)
    monkeypatch.setenv("DOCS_IMAP_USER", "box@example.org"); monkeypatch.setenv("DOCS_IMAP_PASSWORD", "app-pw")
    out = mail_ingest.poll_imap(S)
    assert [r["status"] for r in out] == ["processed", "processed"]
    assert "app-pw" not in json.dumps(out)                                   # credentials never echoed
    monkeypatch.delenv("DOCS_IMAP_PASSWORD")
    with pytest.raises(RuntimeError): mail_ingest.poll_imap(S)
