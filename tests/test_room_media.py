"""Tests for T-30: Room media backend (upload, list, filter by space_id, path traversal rejection, deduplication)."""
from datetime import datetime
import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, media

SAMPLE_JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00" + b"\x00" * 32
SAMPLE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
SAMPLE_MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 32
SAMPLE_MOV = b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 32
SAMPLE_PDF = b"%PDF-1.4\n%trace\n" + b"\x00" * 32


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    return TestClient(app_module.app)


def test_media_upload_and_list(client, tmp_path):
    r = client.post(
        "/collab/media?space_id=living_room&author=Alice&role=architect&note=site%20inspection&filename=photo.jpg",
        content=SAMPLE_JPG,
    )
    assert r.status_code == 200, r.text
    record = r.json()
    assert {"id", "space_id", "author", "role", "note", "file", "kind", "created_at"}.issubset(set(record.keys()))
    assert record["space_id"] == "living_room"
    assert record["author"] == "Alice"
    assert record["role"] == "architect"
    assert record["note"] == "site inspection"
    assert record["kind"] == "image"
    assert record["file"].endswith(".jpg")
    # Verify ISO timestamp
    assert datetime.fromisoformat(record["created_at"]) is not None

    # Check listing returns the record
    list_res = client.get("/collab/media")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == record["id"]

    # Serve by record id
    file_res = client.get(f"/collab/media/file?id={record['id']}")
    assert file_res.status_code == 200
    assert file_res.content == SAMPLE_JPG
    assert "image/jpeg" in file_res.headers.get("content-type", "")

    # Serve by file name
    file_res2 = client.get(f"/collab/media/file?id={record['file']}")
    assert file_res2.status_code == 200
    assert file_res2.content == SAMPLE_JPG


def test_media_filter_by_space_id(client):
    # Upload 3 items across 2 spaces
    r1 = client.post(
        "/collab/media?space_id=R101&author=A&note=first&filename=one.png",
        content=SAMPLE_PNG + b"1",
    )
    assert r1.status_code == 200
    rec1 = r1.json()

    r2 = client.post(
        "/collab/media?space_id=R102&author=B&note=second&filename=two.png",
        content=SAMPLE_PNG + b"2",
    )
    assert r2.status_code == 200
    rec2 = r2.json()

    r3 = client.post(
        "/collab/media?space_id=R101&author=C&note=third&filename=three.png",
        content=SAMPLE_PNG + b"3",
    )
    assert r3.status_code == 200
    rec3 = r3.json()

    # Filter R101 (should return rec3 then rec1: newest first)
    res_r101 = client.get("/collab/media?space_id=R101")
    assert res_r101.status_code == 200
    items_r101 = res_r101.json()
    assert len(items_r101) == 2
    assert items_r101[0]["id"] == rec3["id"]
    assert items_r101[1]["id"] == rec1["id"]
    assert all(it["space_id"] == "R101" for it in items_r101)

    # Filter R102
    res_r102 = client.get("/collab/media?space_id=R102")
    assert res_r102.status_code == 200
    items_r102 = res_r102.json()
    assert len(items_r102) == 1
    assert items_r102[0]["id"] == rec2["id"]

    # All items newest first
    res_all = client.get("/collab/media")
    assert res_all.status_code == 200
    items_all = res_all.json()
    assert len(items_all) == 3
    assert [it["id"] for it in items_all] == [rec3["id"], rec2["id"], rec1["id"]]


def test_media_path_traversal_rejected(client, tmp_path):
    # Seed one valid file
    client.post("/collab/media?filename=photo.jpg", content=SAMPLE_JPG)

    # Reject escaping paths
    for bad_id in [
        "../../etc/passwd",
        "../collab.json",
        "..\\..\\windows\\win.ini",
        ".",
        "media/../../secret.txt",
        "/etc/passwd",
        "C:/Windows/win.ini",
    ]:
        res = client.get(f"/collab/media/file?id={bad_id}")
        assert res.status_code in (400, 403, 404), f"bad_id {bad_id} got {res.status_code}"

    # Direct unit check on media.resolve_file
    with pytest.raises(media.MediaSecurityError):
        media.resolve_file("../../etc/passwd")

    with pytest.raises(media.MediaSecurityError):
        media.resolve_file("..\\..\\secret")

    # Missing file returns 404
    missing_res = client.get("/collab/media/file?id=nonexistent_file.jpg")
    assert missing_res.status_code == 404

    # Empty id returns 400
    empty_res = client.get("/collab/media/file?id=")
    assert empty_res.status_code == 400


def test_media_duplicate_file_stored_once(client, tmp_path):
    content = SAMPLE_JPG + b"_unique_duplicate_content_check"

    r1 = client.post(
        "/collab/media?space_id=room-1&author=Alice&filename=first.jpg&note=note1",
        content=content,
    )
    assert r1.status_code == 200
    rec1 = r1.json()

    r2 = client.post(
        "/collab/media?space_id=room-2&author=Bob&filename=second.jpg&note=note2",
        content=content,
    )
    assert r2.status_code == 200
    rec2 = r2.json()

    # Different records, different IDs, but identical content-hash filename
    assert rec1["id"] != rec2["id"]
    assert rec1["space_id"] == "room-1" and rec2["space_id"] == "room-2"
    assert rec1["file"] == rec2["file"]

    # Verify physical file stored on disk under CACHE_DIR/media
    media_dir = tmp_path / "media"
    assert (media_dir / rec1["file"]).is_file()
    # Exactly one file stored on disk for this content
    files_on_disk = [f for f in media_dir.iterdir() if f.is_file()]
    assert len(files_on_disk) == 1

    # Both records serve the identical content
    assert client.get(f"/collab/media/file?id={rec1['id']}").content == content
    assert client.get(f"/collab/media/file?id={rec2['id']}").content == content


def test_media_kinds_and_types(client):
    cases = [
        ("video.mp4", SAMPLE_MP4, "video", "video/mp4"),
        ("clip.mov", SAMPLE_MOV, "video", "video/quicktime"),
        ("plan.pdf", SAMPLE_PDF, "pdf", "application/pdf"),
        ("photo.png", SAMPLE_PNG, "image", "image/png"),
    ]
    for filename, payload, expected_kind, expected_mime in cases:
        r = client.post(f"/collab/media?filename={filename}", content=payload)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["kind"] == expected_kind
        file_res = client.get(f"/collab/media/file?id={rec['id']}")
        assert file_res.status_code == 200
        assert expected_mime in file_res.headers.get("content-type", "")


def test_media_rejects_unsupported_and_empty(client):
    r_unsupported = client.post("/collab/media?filename=script.exe", content=b"binary")
    assert r_unsupported.status_code == 400
    assert "unsupported" in r_unsupported.json()["detail"]

    r_empty = client.post("/collab/media?filename=photo.jpg", content=b"")
    assert r_empty.status_code == 400
    assert "empty file" in r_empty.json()["detail"]

    r_no_name = client.post("/collab/media", content=SAMPLE_JPG)
    assert r_no_name.status_code == 400


def test_media_rejects_too_large(client, monkeypatch):
    monkeypatch.setattr(media, "MAX_MEDIA_BYTES", 10)
    r = client.post("/collab/media?filename=photo.jpg", content=SAMPLE_JPG)
    assert r.status_code in (400, 413)


def test_verify_status_flow(client):
    # Check initial status for item_1 and item_2: unverified defaults to "In Progress"
    r0 = client.get("/verify/status?ids=item_1,item_2").json()
    assert r0["total"] == 2
    assert r0["verified"] == 0
    assert r0["ids"]["item_1"]["verified"] is False
    assert r0["ids"]["item_1"]["status"] == "In Progress"
    assert r0["ids"]["item_1"]["photos"] == 0
    assert r0["ids"]["item_1"]["latest"] is None

    # POST a photo attached to item_1 with status="Installed"
    r_post = client.post(
        "/collab/media?item_id=item_1&status=Installed&author=Bob&filename=toilet_verified.jpg",
        content=SAMPLE_JPG,
    )
    assert r_post.status_code == 200
    assert r_post.json()["item_id"] == "item_1"
    assert r_post.json()["status"] == "Installed"

    # Status after upload: verified increases from 0 to 1, item_1 is verified
    r1 = client.get("/verify/status?ids=item_1,item_2").json()
    assert r1["total"] == 2
    assert r1["verified"] == 1
    assert r1["ids"]["item_1"]["verified"] is True
    assert r1["ids"]["item_1"]["status"] == "Installed"
    assert r1["ids"]["item_1"]["photos"] == 1
    assert r1["ids"]["item_1"]["latest"]["author"] == "Bob"
    assert "/collab/media/file" in r1["ids"]["item_1"]["latest"]["url"]
    assert r1["ids"]["item_2"]["verified"] is False


def test_verify_item_status_without_photo(client):
    # Change status without uploading photo via POST /verify/item
    r = client.post("/verify/item", json={
        "item_id": "elem_X",
        "status": "Issue Reported",
        "author": "K. Korhonen",
        "note": "transfer zone 865 mm, 35 mm short",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["item_id"] == "elem_X"
    assert data["status"] == "Issue Reported"

    # GET /verify/status reflects the new status and verified=True
    r_st = client.get("/verify/status?ids=elem_X").json()
    assert r_st["verified"] == 1
    info = r_st["ids"]["elem_X"]
    assert info["verified"] is True
    assert info["status"] == "Issue Reported"
    assert info["author"] == "K. Korhonen"
    assert info["note"] == "transfer zone 865 mm, 35 mm short"
    assert info["photos"] == 0
    assert info["latest"] is None


