from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from agent import app as app_module, catalog, config, plan_rooms, uploads
from scripts import check_dataset


def test_catalog_tree_shape(monkeypatch, tmp_path):
    catalog_cache = tmp_path / "cache" / "catalog.json"
    if catalog_cache.exists():
        catalog_cache.unlink()

    r = TestClient(app_module.app).get("/catalog").json()
    assert "featured" in r and isinstance(r["sources"], list)
    for s in r["sources"]:
        assert s["count"] == sum(g["count"] for g in s["groups"])
        for g in s["groups"]:
            assert g["count"] == len(g["items"])
            for i in g["items"]:
                assert i["path"].startswith("data/") or i["path"].startswith("uploads/")


def test_group_labels():
    from agent.catalog import _group_and_label

    assert _group_and_label("swiss_dwellings", "x.pdf", "site1000_bldg2082_floor9385", []) == ("Site 1000 · Building 2082", "Floor 9385")
    m = ["bsc-esplanades_1807-ep-ar-v18"]
    assert _group_and_label("ifc_models", "m.ifc", "bsc-esplanades_1807-ep-ar-v18", m) == ("bsc esplanades 1807 ep ar v18", "3D model")
    assert _group_and_label("ifc_models", "p.pdf", "bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus", m) == ("bsc esplanades 1807 ep ar v18", "Plan 04 4 korrus")
    assert _group_and_label("cubicasa5k", "x", "colorful-11397", []) == ("Colour plans", "Plan 11397")


def test_auto_projects_generation_on_new_dataset(monkeypatch, tmp_path):
    """Temporary dataset with renamed IFC and PDF files generates auto project cards."""
    mock_data = tmp_path / "mock_dataset"
    data_dir = mock_data / "data"
    ifc_dir = data_dir / "ifc_models"
    swiss_dir = data_dir / "swiss_dwellings"
    ifc_dir.mkdir(parents=True)
    swiss_dir.mkdir(parents=True)

    # 1. IFC Model + paired plan
    model_file = ifc_dir / "tallinn_office_center.ifc"
    model_file.write_text("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCSPACE('guid1',$,'Room 1',$,$,$,$,'Meeting Room',$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n")
    plan_file = ifc_dir / "tallinn_office_center_plan_01.pdf"
    plan_file.write_bytes(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")

    # 2. Swiss Dwelling building
    swiss_pdf = swiss_dir / "site7777_bldg8888_floor9999.pdf"
    swiss_pdf.write_bytes(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")

    monkeypatch.setattr(config, "DATA_DIR", mock_data)
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")

    client = TestClient(app_module.app)
    r = client.get("/catalog").json()

    projects = r["projects"]
    assert len(projects) >= 2

    # Check auto-generated IFC project
    p_ifc = next((p for p in projects if "tallinn" in p["id"].lower()), None)
    assert p_ifc is not None
    assert "Tallinn Office Center" in p_ifc["title"]
    assert p_ifc["demo_data"] is False
    assert p_ifc["model"] == "data/ifc_models/tallinn_office_center.ifc"
    assert p_ifc["plan"] == "data/ifc_models/tallinn_office_center_plan_01.pdf"

    # Check auto-generated Swiss project
    p_swiss = next((p for p in projects if "7777" in p["id"]), None)
    assert p_swiss is not None
    assert "Site 7777, Bldg 8888" in p_swiss["title"]
    assert p_swiss["demo_data"] is False
    assert p_swiss["plan"] == "data/swiss_dwellings/site7777_bldg8888_floor9999.pdf"

    # Test /catalog/projects search & pagination
    search_r = client.get("/catalog/projects", params={"q": "Tallinn", "offset": 0, "limit": 10}).json()
    assert search_r["total"] >= 1
    assert any("tallinn" in p["id"].lower() for p in search_r["projects"])


def test_uploaded_file_creates_project_and_source(monkeypatch, tmp_path):
    """Uploading an IFC or drawing adds 'uploaded' source and project card, and works with /plan/rooms."""
    mock_data = tmp_path / "mock_data"
    mock_data.mkdir()
    (mock_data / "data").mkdir()
    upload_cache = tmp_path / "cache" / "uploads"
    upload_cache.mkdir(parents=True)

    monkeypatch.setattr(config, "DATA_DIR", mock_data)
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")

    # Upload mock IFC
    ifc_bytes = b"ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCSPACE('upload_guid',$,'Uploaded Room',$,$,$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n"
    res = uploads.save("custom_tower.ifc", ifc_bytes)
    upload_path = res["path"]

    client = TestClient(app_module.app)
    cat = client.get("/catalog").json()

    # Source 'uploaded' present
    up_source = next((s for s in cat["sources"] if s["source"] == "uploaded"), None)
    assert up_source is not None
    assert any(i["path"] == upload_path for i in up_source["groups"][0]["items"])

    # Project card present
    up_proj = next((p for p in cat["projects"] if p.get("model") == upload_path), None)
    assert up_proj is not None
    assert "Custom Tower" in up_proj["title"]

    # Works with /plan/rooms
    rooms_r = client.get("/plan/rooms", params={"path": upload_path})
    assert rooms_r.status_code == 200
    r_data = rooms_r.json()
    assert isinstance(r_data["rooms"], list)
    assert len(r_data["rooms"]) == 1
    assert r_data["rooms"][0]["space_id"] == "upload_guid"


def test_check_dataset_script_runs_cleanly(monkeypatch, tmp_path):
    """scripts/check_dataset.py runs over mock dataset and generates markdown report without error."""
    mock_data = tmp_path / "mock_dataset"
    data_dir = mock_data / "data" / "ifc_bench"
    data_dir.mkdir(parents=True)

    # Mock IFC
    mock_ifc = data_dir / "bench_model.ifc"
    mock_ifc.write_text("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=IFCDOOR('door_g1',$,'Door 1',$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n")

    out_md = tmp_path / "dataset-check.md"
    report = check_dataset.run_check(mock_data, out_md)

    assert out_md.is_file()
    assert "Dataset Health & Readiness Report" in report
    assert "bench_model.ifc" in report
    assert "100.0%" in report
