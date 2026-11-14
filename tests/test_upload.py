"""T-28: uploading your own drawing (PDF, PNG, JPG, DXF, IFC)."""
import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, drawings, engine_adapter

PNG = fitz.Pixmap(fitz.csRGB, (0, 0, 10, 10), False).tobytes("png")
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
DXF = b"0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nDOOR\n90\n2\n10\n0.0\n20\n0.0\n10\n1.0\n20\n0.0\n0\nENDSEC\n0\nEOF\n"
IFC = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCDOOR('guid1',$,'D1',$,$,$,$,$,$,$,$);\nENDSEC;\nEND-OF-ISO-10303-21;\n"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    return TestClient(app_module.app)


def _pdf_bytes(pages=2):
    doc = fitz.open()
    for _ in range(pages):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def test_upload_pdf_returns_path_and_pages(client, tmp_path):
    pdf = _pdf_bytes(3)
    r = client.post("/upload?filename=My%20Plan.PDF", content=pdf)
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["path"].startswith("uploads/") or out["path"].startswith("upload/")) and out["path"].endswith(".pdf")
    assert out["kind"] == "pdf" and out["pages"] == 3 and out["name"] == "My Plan.PDF"
    assert drawings.resolve(out["path"]).parent == (tmp_path / "uploads").resolve()
    # same content -> same path (content hash), no duplicate file
    assert client.post("/upload?filename=other.pdf", content=pdf).json()["path"] == out["path"]


def test_upload_dxf_returns_path_and_kind(client):
    r = client.post("/upload?filename=layout.dxf", content=DXF)
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["path"].startswith("uploads/") or out["path"].startswith("upload/")) and out["path"].endswith(".dxf")
    assert out["kind"] == "dxf" and out["pages"] == 1


def test_upload_multipart_form(client):
    r = client.post("/upload", files={"file": ("plan.png", PNG, "image/png")})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["path"].startswith("uploads/") or out["path"].startswith("upload/")) and out["path"].endswith(".png")
    assert out["kind"] == "image" and out["pages"] == 1


def test_upload_jpg(client):
    r = client.post("/upload?filename=photo.jpg", content=JPG)
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["path"].startswith("uploads/") or out["path"].startswith("upload/")) and out["path"].endswith(".jpg")
    assert out["kind"] == "image" and out["pages"] == 1


def test_uploaded_drawing_is_served(client):
    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    assert client.get("/file", params={"path": path}).content == PNG


def test_uploaded_pdf_drawing_page(client):
    pdf = _pdf_bytes(2)
    path = client.post("/upload?filename=plan.pdf", content=pdf).json()["path"]
    r = client.get("/drawing", params={"path": path, "page": 1})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"


@pytest.mark.parametrize("name,data,msg", [
    ("x.exe", b"MZ", "unsupported"),
    ("x.dwg", b"AC1027", "unsupported"),
    ("x.pdf", b"not a pdf", "does not look like PDF"),
    ("x.png", b"", "empty"),
    ("x.dxf", b"not dxf content", "does not look like DXF"),
])
def test_upload_rejects_bad_files(client, name, data, msg):
    r = client.post(f"/upload?filename={name}", content=data)
    assert r.status_code == 400 and msg in r.json()["detail"]


def test_upload_rejects_too_large(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    r = client.post("/upload?filename=x.png", content=PNG)
    assert r.status_code in (400, 413)


@pytest.mark.parametrize("path", [
    "uploads/../../etc/passwd",
    "uploads/../answers/x.json",
    "upload/../../etc/passwd",
    "uploads/missing.png",
])
def test_upload_paths_cannot_escape(client, path):
    with pytest.raises(drawings.DrawingError):
        drawings.resolve(path)


def test_ask_endpoint_blocks_path_traversal(client):
    r = client.post("/ask", json={"question": "How many doors?", "path": "uploads/../../secret"})
    assert r.status_code == 404


def test_uploaded_image_tells_agent_to_use_vision(client):
    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    r = engine_adapter.answer(path, "How many doors?")
    assert r["value"] is None and "count_in_drawing" in r["warnings"][0]


def test_uploaded_ifc_goes_to_ifc_solver(client, monkeypatch):
    import engine.ifc as eifc
    import engine.ifc_answer as eia

    path = client.post("/upload?filename=house.ifc", content=b"ISO-10303-21;\nHEADER;\nENDSEC;\n").json()["path"]
    seen = {}
    monkeypatch.setattr(eifc, "load", lambda p: seen.setdefault("model", p))
    monkeypatch.setattr(eia, "answer", lambda p, q, m: (2, "count", [{"guid": "g1", "category": "door"},
                                                                    {"guid": "g2", "category": "door"}],
                                                       "ifc:count_door", []))
    r = engine_adapter.answer(path, "How many doors?")
    assert seen["model"].endswith(".ifc")
    assert r["value"] == 2 and r["model_file"] == path
    assert [i["guid"] for i in r["items"]] == ["g1", "g2"]


def test_uploaded_dxf_goes_to_dxf_solver(client, monkeypatch):
    import engine.swiss as eswiss

    path = client.post("/upload?filename=house.dxf", content=DXF).json()["path"]
    seen = {}

    def mock_parse(p):
        seen["dxf"] = p
        return {"doors": [{"bbox": [0, 0, 1, 1]}], "rooms": []}

    monkeypatch.setattr(eswiss, "parse", mock_parse)
    r = engine_adapter.answer(path, "How many doors?")
    assert seen["dxf"].endswith(".dxf")
    assert r["value"] == 1
    assert "dxf" in r["method"] or "swiss" in r["method"]


def test_uploaded_image_uses_count_in_drawing(client, monkeypatch):
    from agent import vision

    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [{"box_2d": [100, 100, 200, 200], "label": "toilet"}])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: 1)
    r = vision.count_in_drawing(path, "toilet")
    assert r["value"] == 1
    assert r["sources"][0]["file"] == path


def test_uploaded_image_uses_scan_inventory(client, monkeypatch):
    from agent import vision

    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    monkeypatch.setattr(vision.config, "GEMINI_API_KEY", "test_key")
    monkeypatch.setattr(vision, "_gemini_inventory", lambda png, prompt: [{"category": "toilet", "box_2d": [50, 50, 150, 150]}])
    r = vision.scan_drawing_inventory(path)
    assert r["value"] == 1
    assert r["items"][0]["category"] == "toilet"
    assert r["sources"][0]["file"] == path


def test_ask_endpoint_accepts_uploaded_drawing(client, monkeypatch):
    from agent import agent

    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    fake_ans = {
        "answer_text": "There is 1 toilet.",
        "evidence": [{"tool": "count_in_drawing", "value": 1, "items": [], "sources": []}],
        "tool_calls": [{"name": "count_in_drawing", "args": {"path": path, "target": "toilet"}}],
    }
    monkeypatch.setattr(agent, "ask", lambda q, p, role: fake_ans)
    r = client.post("/ask", json={"question": "How many toilets?", "path": path})
    assert r.status_code == 200
    assert r.json()["answer_text"] == "There is 1 toilet."

