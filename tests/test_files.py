"""Tests for B4: Project files area (upload, list, filter by tag and q, download, author-only delete, deduplication)."""
from datetime import datetime
import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, files

SAMPLE_PDF = b"%PDF-1.4\n%trace project file\n" + b"\x00" * 32
SAMPLE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
SAMPLE_JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 32
SAMPLE_DXF = b"0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"
SAMPLE_IFC = b"ISO-10303-21;\nHEADER;\nENDSEC;\n"
SAMPLE_DOCX = b"PK\x03\x04" + b"\x00" * 30  # zip header typical for docx
SAMPLE_XLSX = b"PK\x03\x04" + b"\x01" * 30  # zip header typical for xlsx
SAMPLE_CSV = b"id,name,role\n1,Alice,architect\n"
SAMPLE_TXT = b"Construction site safety regulations\n"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    return TestClient(app_module.app)


def test_empty_files_returns_empty_list(client):
    r = client.get("/files")
    assert r.status_code == 200
    assert r.json() == []


def test_file_upload_and_list(client, tmp_path):
    r = client.post(
        "/files?author=Alice&role=architect&title=Main%20Contract&tags=contract,legal&filename=agreement.pdf",
        content=SAMPLE_PDF,
    )
    assert r.status_code == 200, r.text
    record = r.json()
    expected_fields = {"id", "title", "filename", "author", "role", "tags", "size", "kind", "created_at"}
    assert expected_fields.issubset(set(record.keys()))
    assert record["title"] == "Main Contract"
    assert record["filename"] == "agreement.pdf"
    assert record["author"] == "Alice"
    assert record["role"] == "architect"
    assert record["tags"] == ["contract", "legal"]
    assert record["size"] == len(SAMPLE_PDF)
    assert record["kind"] == "pdf"
    assert datetime.fromisoformat(record["created_at"]) is not None

    # Check listing
    list_res = client.get("/files")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == record["id"]

    # Download by record id
    dl = client.get(f"/files/file?id={record['id']}")
    assert dl.status_code == 200
    assert dl.content == SAMPLE_PDF
    assert "application/pdf" in dl.headers.get("content-type", "")
    assert "agreement.pdf" in dl.headers.get("content-disposition", "")


def test_filter_by_tag(client):
    client.post("/files?author=A&filename=a.pdf&tags=contract,urgent", content=SAMPLE_PDF + b"1")
    client.post("/files?author=B&filename=b.xlsx&tags=finance,budget", content=SAMPLE_XLSX + b"2")
    client.post("/files?author=C&filename=c.png&tags=contract,site", content=SAMPLE_PNG + b"3")

    r_contract = client.get("/files?tag=contract")
    assert r_contract.status_code == 200
    items_contract = r_contract.json()
    assert len(items_contract) == 2
    assert {it["filename"] for it in items_contract} == {"a.pdf", "c.png"}

    r_finance = client.get("/files?tag=finance")
    assert r_finance.status_code == 200
    items_finance = r_finance.json()
    assert len(items_finance) == 1
    assert items_finance[0]["filename"] == "b.xlsx"

    r_none = client.get("/files?tag=nonexistent")
    assert r_none.status_code == 200
    assert r_none.json() == []


def test_filter_by_q_fuzzy(client):
    client.post("/files?author=A&title=Structural%20Calculation&filename=calc_v1.xlsx", content=SAMPLE_XLSX + b"1")
    client.post("/files?author=B&title=Site%20Overview&filename=site_photo_roof.jpg", content=SAMPLE_JPG + b"2")
    client.post("/files?author=C&title=Floor%20Layout&filename=level_01.dxf", content=SAMPLE_DXF + b"3")

    # Match by title
    r1 = client.get("/files?q=Structural")
    assert r1.status_code == 200
    assert len(r1.json()) == 1 and r1.json()[0]["title"] == "Structural Calculation"

    # Match by filename
    r2 = client.get("/files?q=roof")
    assert r2.status_code == 200
    assert len(r2.json()) == 1 and r2.json()[0]["filename"] == "site_photo_roof.jpg"

    # Case-insensitive substring match
    r3 = client.get("/files?q=01")
    assert r3.status_code == 200
    assert len(r3.json()) == 1 and r3.json()[0]["filename"] == "level_01.dxf"

    # Both tag and q combined
    r4 = client.get("/files?tag=roof&q=photo")
    assert r4.status_code == 200


def test_files_ordering_newest_first(client):
    r1 = client.post("/files?filename=first.pdf", content=SAMPLE_PDF + b"1").json()
    r2 = client.post("/files?filename=second.pdf", content=SAMPLE_PDF + b"2").json()
    r3 = client.post("/files?filename=third.pdf", content=SAMPLE_PDF + b"3").json()

    res = client.get("/files")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 3
    assert [it["id"] for it in items] == [r3["id"], r2["id"], r1["id"]]


def test_path_traversal_rejected(client):
    # Seed one file
    client.post("/files?filename=test.pdf", content=SAMPLE_PDF)

    bad_ids = [
        "../../etc/passwd",
        "../files.json",
        "..\\..\\windows\\win.ini",
        ".",
        "files/../../secret.txt",
        "/etc/passwd",
        "C:/Windows/win.ini",
    ]
    for bad in bad_ids:
        res = client.get(f"/files/file?id={bad}")
        assert res.status_code in (400, 404), f"bad id {bad} got {res.status_code}"

    with pytest.raises(files.FileSecurityError):
        files.resolve_file("../../etc/passwd")

    with pytest.raises(files.FileSecurityError):
        files.resolve_file("..\\..\\secret")

    # Missing file returns 404
    assert client.get("/files/file?id=nonexistent.pdf").status_code == 404
    # Empty id returns 400
    assert client.get("/files/file?id=").status_code == 400


def test_duplicate_file_stored_once(client, tmp_path):
    content = SAMPLE_PDF + b"_duplicate_content_test"
    r1 = client.post("/files?author=A&title=Doc1&filename=doc1.pdf", content=content)
    assert r1.status_code == 200
    rec1 = r1.json()

    r2 = client.post("/files?author=B&title=Doc2&filename=doc2.pdf", content=content)
    assert r2.status_code == 200
    rec2 = r2.json()

    assert rec1["id"] != rec2["id"]
    assert rec1["file"] == rec2["file"]

    # On disk only one file in CACHE_DIR/files
    files_dir = tmp_path / "files"
    disk_files = [f for f in files_dir.iterdir() if f.is_file()]
    assert len(disk_files) == 1

    assert client.get(f"/files/file?id={rec1['id']}").content == content
    assert client.get(f"/files/file?id={rec2['id']}").content == content


def test_delete_file_author_permissions(client):
    r = client.post("/files?author=Alice&filename=secret.pdf", content=SAMPLE_PDF)
    rec = r.json()
    file_id = rec["id"]

    # Unauthorized delete attempt -> 403
    r_unauth = client.delete(f"/files?id={file_id}&author=Bob")
    assert r_unauth.status_code == 403
    assert "only author" in r_unauth.json()["detail"].lower()

    # Still present in list
    assert any(f["id"] == file_id for f in client.get("/files").json())

    # Authorized delete -> 200
    r_auth = client.delete(f"/files?id={file_id}&author=Alice")
    assert r_auth.status_code == 200
    assert r_auth.json()["ok"] is True

    # Gone from list
    assert not any(f["id"] == file_id for f in client.get("/files").json())

    # Deleting again -> 404
    r_again = client.delete(f"/files?id={file_id}&author=Alice")
    assert r_again.status_code == 404


def test_supported_file_types(client):
    test_cases = [
        ("plan.pdf", SAMPLE_PDF, "pdf", "application/pdf"),
        ("photo.png", SAMPLE_PNG, "image", "image/png"),
        ("drawing.jpg", SAMPLE_JPG, "image", "image/jpeg"),
        ("render.jpeg", SAMPLE_JPG, "image", "image/jpeg"),
        ("model.dxf", SAMPLE_DXF, "dxf", "application/dxf"),
        ("building.ifc", SAMPLE_IFC, "ifc", "application/x-step"),
        ("brief.docx", SAMPLE_DOCX, "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("schedule.xlsx", SAMPLE_XLSX, "sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        ("bom.csv", SAMPLE_CSV, "sheet", "text/csv"),
        ("notes.txt", SAMPLE_TXT, "doc", "text/plain"),
    ]
    for fname, data, expected_kind, expected_mime in test_cases:
        res = client.post(f"/files?filename={fname}", content=data)
        assert res.status_code == 200, f"failed for {fname}: {res.text}"
        rec = res.json()
        assert rec["kind"] == expected_kind, f"kind mismatch for {fname}"

        dl = client.get(f"/files/file?id={rec['id']}")
        assert dl.status_code == 200
        assert expected_mime in dl.headers.get("content-type", "")


def test_reject_unsupported_and_oversized(client, monkeypatch):
    r_unsupported = client.post("/files?filename=malware.exe", content=b"MZ\x00")
    assert r_unsupported.status_code == 400
    assert "unsupported" in r_unsupported.json()["detail"]

    r_empty = client.post("/files?filename=empty.pdf", content=b"")
    assert r_empty.status_code == 400
    assert "empty file" in r_empty.json()["detail"]

    r_no_name = client.post("/files", content=SAMPLE_PDF)
    assert r_no_name.status_code == 400

    monkeypatch.setattr(files, "MAX_FILE_BYTES", 10)
    r_large = client.post("/files?filename=large.pdf", content=SAMPLE_PDF)
    assert r_large.status_code in (400, 413)
