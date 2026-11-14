"""Tests for 2D room outlines endpoint (GET /plan/rooms) and demo data seeder (scripts/seed_demo.py).

Verifies:
- Extraction of rooms from IFC SVG plans with pixel coordinates (bbox_px, polygon_px).
- Dynamic enrichment with room status (collab.py) and media count (media.py).
- Raster plan handling with warning and empty room list.
- Swiss DXF parsing with calibration to PNG pixel coordinates.
- In-memory LRU caching of geometry results.
- 404 on missing drawing path.
- Idempotent demo data seeding and resetting via scripts/seed_demo.py.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, collab, config, ifc_plan, media, plan_rooms, scene
import scripts.seed_demo as seed_demo

FIX = Path(__file__).parent / "fixtures"
SAMPLE_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    plan_rooms.get_plan_rooms.cache_clear()
    ifc_plan._boxes.cache_clear()


@pytest.fixture()
def client():
    return TestClient(app_module.app)


def test_ifc_svg_room_outlines(client):
    """IFC model plan PDF extracts room bounding box and polygon from matching SVG."""
    res = client.get("/plan/rooms", params={"path": "data/ifc_models/m_plan.pdf"})
    assert res.status_code == 200
    data = res.json()

    assert data["path"] == "data/ifc_models/m_plan.pdf"
    assert isinstance(data["image_size"], list) and len(data["image_size"]) == 2
    assert len(data["rooms"]) == 1

    room = data["rooms"][0]
    assert room["space_id"] == "SPACE1"
    assert room["name"] in ("SPACE1", "Space", None)
    assert room["status"] is None
    assert room["media_count"] == 0

    # From m_plan.svg: viewBox="10 20 100 50", path M10,20 L60,20 L60,70 L10,70 Z
    # px_per_mm = 150 / 25.4 ~= 5.9055
    # (10-10)*px = 0, (60-10)*px = 295
    assert room["bbox_px"] == [0, 0, 295, 295]
    assert len(room["polygon_px"]) == 4
    assert room["polygon_px"] == [[0, 0], [295, 0], [295, 295], [0, 295]]


def test_status_and_media_enrichment(client):
    """Rooms are enriched with construction status from collab and media counts."""
    # 1. Initially status is null and media count is 0
    res1 = client.get("/plan/rooms", params={"path": "data/ifc_models/m_plan.pdf"}).json()
    assert res1["rooms"][0]["status"] is None
    assert res1["rooms"][0]["media_count"] == 0

    # 2. Add status in collab
    collab.set_status("SPACE1", "built", author="Alice")

    # 3. Add media in media store
    media.save_media(
        filename="inspection.png",
        data=SAMPLE_PNG,
        space_id="SPACE1",
        author="Bob",
        role="architect",
        note="Inspected wall finish",
    )

    # 4. GET /plan/rooms reflects new status and media_count
    res2 = client.get("/plan/rooms", params={"path": "data/ifc_models/m_plan.pdf"}).json()
    assert res2["rooms"][0]["status"] == "built"
    assert res2["rooms"][0]["media_count"] == 1


def test_raster_plan_returns_warning(client):
    """Raster drawings (PNG/PDF without vector room definitions) return warning."""
    res_png = client.get("/plan/rooms", params={"path": "data/demo/plan.png"}).json()
    assert res_png["rooms"] == []
    assert any("no room outlines for raster plans" in w for w in res_png.get("warnings", []))

    res_pdf = client.get("/plan/rooms", params={"path": "data/demo/plan.pdf"}).json()
    assert res_pdf["rooms"] == []
    assert any("no room outlines for raster plans" in w for w in res_pdf.get("warnings", []))


def test_swiss_dwellings_parsing(monkeypatch, tmp_path):
    """Swiss Dwellings DXF parses rooms, bboxes, and polygons via swiss_view calibration."""
    import engine.swiss as eswiss
    import engine.swiss_view as eswiss_view
    from agent import drawings

    # Create dummy drawing file inside tmp_path
    fake_path = "data/swiss_dwellings/fake_floor.pdf"
    fake_pdf = tmp_path / "fake_floor.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4\n")
    fake_dxf = fake_pdf.with_suffix(".dxf")
    fake_dxf.write_text("0\nSECTION\n0\nENDSEC\n0\nEOF\n", encoding="utf-8")

    monkeypatch.setattr(drawings, "resolve", lambda p: fake_pdf)
    monkeypatch.setattr(drawings, "page_png", lambda p, page=1: fake_pdf)
    monkeypatch.setattr(drawings, "image_size", lambda p: (1000, 800))

    mock_rooms = [
        {
            "number": "1.01",
            "name": "Küche",
            "area": 12.3,
            "bbox": (0.0, 0.0, 4.0, 3.0),
            "poly": [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)],
        },
        {
            "number": "1.02",
            "name": "Bad",
            "area": 6.5,
            "bbox": (4.0, 0.0, 6.0, 3.0),
            "poly": None,
        },
    ]

    mock_calib = {
        "scale_px_per_m": 30.0,
        "dxf_min": (0.0, 3.0),
        "png_min": (100, 200),
        "png_size": (1000, 800),
    }

    monkeypatch.setattr(eswiss, "parse", lambda p: {"rooms": mock_rooms})
    monkeypatch.setattr(eswiss_view, "calibration", lambda p: mock_calib)
    monkeypatch.setattr(eswiss_view, "to_png", lambda p, bb: [100, 200, 220, 290])

    data = plan_rooms.get_plan_rooms(fake_path)
    assert data["path"] == fake_path
    assert len(data["rooms"]) == 2

    r1 = data["rooms"][0]
    assert r1["space_id"] == "1.01"
    assert r1["name"] == "Küche"
    assert r1["number"] == "1.01"
    assert r1["area_m2"] == 12.3
    assert r1["bbox_px"] == [100, 200, 220, 290]
    assert r1["polygon_px"] is not None
    assert len(r1["polygon_px"]) == 4

    r2 = data["rooms"][1]
    assert r2["space_id"] == "1.02"
    assert r2["name"] == "Bad"
    assert r2["polygon_px"] is None


def test_plan_rooms_caching():
    """Geometry calculation is cached by path via lru_cache."""
    plan_rooms.get_plan_rooms.cache_clear()
    info_start = plan_rooms.get_plan_rooms.cache_info()

    path = "data/ifc_models/m_plan.pdf"
    plan_rooms.get_plan_rooms(path)
    info_first = plan_rooms.get_plan_rooms.cache_info()
    assert info_first.misses == info_start.misses + 1

    plan_rooms.get_plan_rooms(path)
    info_second = plan_rooms.get_plan_rooms.cache_info()
    assert info_second.hits == info_first.hits + 1

    plan_rooms.get_plan_rooms.cache_clear()
    assert plan_rooms.get_plan_rooms.cache_info().hits == 0


def test_missing_drawing_404(client):
    """Non-existent drawing returns HTTP 404."""
    res = client.get("/plan/rooms", params={"path": "data/missing_folder/no_such_file.pdf"})
    assert res.status_code == 404


def test_seed_demo_script():
    """seed_demo_data creates demo collaboration records and 3D placements starting with 'Demo: '."""
    # Run seed
    summary = seed_demo.seed_demo_data(reset=True)
    assert summary["rooms_seeded"] == 6
    assert summary["messages_seeded"] >= 12
    assert summary["placements_seeded"] == 2

    # Check collab store
    data = collab.load()
    # 6 rooms have status
    demo_statuses = {
        sid: s for sid, s in data["status"].items() if s.get("author", "").startswith(seed_demo.DEMO_PREFIX)
    }
    assert len(demo_statuses) == 6
    assert set(s["status"] for s in demo_statuses.values()) == {"built", "missing_wall", "pending"}

    # All demo messages start with "Demo: "
    demo_msgs = [m for m in data["messages"] if m.get("author", "").startswith(seed_demo.DEMO_PREFIX)]
    assert len(demo_msgs) >= 12
    assert all(m["text"].startswith("Demo: ") for m in demo_msgs)
    assert all(m["author"].startswith("Demo: ") for m in demo_msgs)
    roles = {m["role"] for m in demo_msgs}
    assert {"architect", "plumber", "electrician"}.issubset(roles)

    # Check scene store
    all_scenes = scene.load_all_scenes()
    demo_placements: list[dict[str, Any]] = []
    for s in all_scenes.values():
        for p in s.get("placements", []):
            if p.get("name", "").startswith("Demo: "):
                demo_placements.append(p)
    assert len(demo_placements) == 2
    assert all(p["name"].startswith("Demo: ") for p in demo_placements)
    assert all(p["author"].startswith("Demo: ") for p in demo_placements)

    # Test clear_demo_data
    cleared = seed_demo.clear_demo_data()
    assert cleared["status_cleared"] == 6
    assert cleared["placements_cleared"] == 2

    # Verify no demo records remain
    data_after = collab.load()
    assert not any(s.get("author", "").startswith("Demo: ") for s in data_after["status"].values())
    assert not any(m.get("text", "").startswith("Demo: ") for m in data_after["messages"])

    # Test re-running with reset=True is idempotent
    summary2 = seed_demo.seed_demo_data(reset=True)
    assert summary2["rooms_seeded"] == 6
