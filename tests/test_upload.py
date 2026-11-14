"""T-28: uploading your own drawing."""
import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, drawings, engine_adapter

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


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
    assert out["path"].startswith("upload/") and out["path"].endswith(".pdf")
    assert out["kind"] == "pdf" and out["pages"] == 3 and out["name"] == "My Plan.PDF"
    assert drawings.resolve(out["path"]).parent == (tmp_path / "uploads").resolve()
    # same content -> same path (content hash), no duplicate file
    assert client.post("/upload?filename=other.pdf", content=pdf).json()["path"] == out["path"]


def test_uploaded_drawing_is_served(client):
    path = client.post("/upload?filename=plan.png", content=PNG).json()["path"]
    assert client.get("/file", params={"path": path}).content == PNG


@pytest.mark.parametrize("name,data,msg", [
    ("x.exe", b"MZ", "unsupported"),
    ("x.dwg", b"AC1027", "unsupported"),
    ("x.pdf", b"not a pdf", "does not look like PDF"),
    ("x.png", b"", "empty"),
])
def test_upload_rejects_bad_files(client, name, data, msg):
    r = client.post(f"/upload?filename={name}", content=data)
    assert r.status_code == 400 and msg in r.json()["detail"]


def test_upload_rejects_too_large(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 10)
    r = client.post("/upload?filename=x.png", content=PNG)
    assert r.status_code in (400, 413)


@pytest.mark.parametrize("path", ["upload/../../etc/passwd", "upload/../answers/x.json", "upload/missing.png"])
def test_upload_paths_cannot_escape(client, path):
    with pytest.raises(drawings.DrawingError):
        drawings.resolve(path)


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
