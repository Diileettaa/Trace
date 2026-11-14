"""Tests for room contents endpoint and agent tool (GET /room/contents).

Verifies:
- Swiss DXF point-in-polygon containment, on_boundary tolerance (0.3m), and png_bbox pixel conversion.
- Multilingual room synonym and number matching (Bad/Küche/Zimmer/etc.).
- IFC spatial containment and bounding box matching with CACHE_DIR persistence.
- Graceful fallback when ifcopenshell is absent.
- Gemini tool declaration in tools.declarations() and dispatch in tools.call().
- FastAPI endpoint GET /room/contents.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, ifc_plan, plan_rooms, room_contents, tools

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    plan_rooms.get_plan_rooms.cache_clear()
    ifc_plan._boxes.cache_clear()


@pytest.fixture()
def client():
    return TestClient(app_module.app)


def test_swiss_room_contents_polygon_and_boundary(monkeypatch):
    """Items inside room polygon and within 0.3m of wall boundary are collected and converted to pixels."""
    import engine.swiss as eswiss
    import engine.swiss_view as eswiss_view

    # Define a 4m x 3m room at (0,0) -> (4,3)
    mock_room = {
        "number": "1.01",
        "name": "Küche",
        "area": 12.0,
        "poly": [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0), (0.0, 3.0)],
        "bbox": (0.0, 0.0, 4.0, 3.0),
    }
    # Fixture inside room
    fix_inside = {"kind": "stove", "bbox": (1.0, 1.0, 1.6, 1.6)}
    # Door on boundary (center at x=2.0, y=-0.1 -> dist 0.1m < 0.3m)
    door_boundary = {"bbox": (1.6, -0.2, 2.4, 0.0)}
    # Fixture far outside (dist > 0.3m)
    fix_outside = {"kind": "wc", "bbox": (10.0, 10.0, 10.6, 10.6)}

    monkeypatch.setattr(eswiss, "parse", lambda p: {
        "rooms": [mock_room],
        "fixtures": [fix_inside, fix_outside],
        "doors": [door_boundary],
        "windows": [],
    })
    monkeypatch.setattr(eswiss_view, "to_png", lambda p, bb: [int(bb[0] * 100), int(bb[1] * 100), int(bb[2] * 100), int(bb[3] * 100)])
    monkeypatch.setattr(room_contents, "_find_dxf", lambda p: Path("fake.dxf"))

    res = room_contents.get_room_contents("fake.pdf", "1.01")
    assert res["value"] == 2
    assert res["unit"] == "count"
    assert res["summary"] == {"stove": 1, "door": 1}
    assert res["method"] == "room_contents:swiss"
    assert res["room"]["name"] == "Küche"
    assert res["room"]["number"] == "1.01"

    items = res["items"]
    assert len(items) == 2

    stove_it = next(it for it in items if it["category"] == "stove")
    assert stove_it["on_boundary"] is False
    assert stove_it["png_bbox"] == [100, 100, 160, 160]

    door_it = next(it for it in items if it["category"] == "door")
    assert door_it["on_boundary"] is True


def test_swiss_room_synonym_lookup(monkeypatch):
    """Room search matches by number, name, or multilingual synonym."""
    import engine.swiss as eswiss
    import engine.swiss_view as eswiss_view

    rooms = [
        {"number": "2.01", "name": "Zimmer", "area": 14.5, "poly": [(0,0),(2,0),(2,2),(0,2)], "bbox": (0,0,2,2)},
        {"number": "2.02", "name": "Bad", "area": 5.0, "poly": [(3,0),(5,0),(5,2),(3,2)], "bbox": (3,0,5,2)},
        {"number": "2.03", "name": "Cucina", "area": 10.0, "poly": [(6,0),(8,0),(8,2),(6,2)], "bbox": (6,0,8,2)},
    ]

    monkeypatch.setattr(eswiss, "parse", lambda p: {"rooms": rooms, "fixtures": [], "doors": [], "windows": []})
    monkeypatch.setattr(eswiss_view, "to_png", lambda p, bb: [0, 0, 10, 10])
    monkeypatch.setattr(room_contents, "_find_dxf", lambda p: Path("fake.dxf"))

    # By number
    r_num = room_contents.get_room_contents("fake.pdf", "2.01")
    assert r_num["room"]["name"] == "Zimmer"

    # By synonym: "bathroom" matches "Bad"
    r_bath = room_contents.get_room_contents("fake.pdf", "bathroom")
    assert r_bath["room"]["name"] == "Bad"

    # By synonym: "kitchen" matches Italian "Cucina"
    r_kitch = room_contents.get_room_contents("fake.pdf", "kitchen")
    assert r_kitch["room"]["name"] == "Cucina"


def test_ifc_room_contents_cached_geometry(monkeypatch, tmp_path):
    """IFC spatial index matches elements inside space bounding box and caches results."""
    mock_index = {
        "spaces": [
            {"guid": "SPACE_BED_1", "name": "301", "long": "Bedroom 3", "area_m2": 16.0, "bbox": [0, 0, 0, 4, 4, 3]},
        ],
        "elements_by_space": {
            "SPACE_BED_1": [
                {"category": "door", "name": "Interior Door", "guid": "DOOR_G1", "on_boundary": True},
                {"category": "window", "name": "Casement Window", "guid": "WIN_G1", "on_boundary": True},
                {"category": "flowterminal", "name": "Power Socket", "guid": "SOCK_G1", "on_boundary": False},
            ]
        },
        "method": "room_contents:ifc[geometry]",
    }
    monkeypatch.setattr(room_contents, "_find_dxf", lambda p: None)
    monkeypatch.setattr(room_contents, "_find_ifc", lambda p: Path("fake.ifc"))
    monkeypatch.setattr(room_contents, "_build_ifc_spatial_index", lambda p: mock_index)

    res = room_contents.get_room_contents("fake.ifc", "Bedroom 3")
    assert res["value"] == 3
    assert res["unit"] == "count"
    assert res["summary"] == {"door": 1, "window": 1, "flowterminal": 1}
    assert res["room"]["name"] == "Bedroom 3"
    assert res["room"]["number"] == "301"
    assert res["method"] == "room_contents:ifc[geometry]"


def test_ifcopenshell_missing_fallback(monkeypatch):
    """If ifcopenshell cannot be imported, returns value=None and explicit warning."""
    import builtins
    orig_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "ifcopenshell" or name.startswith("ifcopenshell."):
            raise ImportError("No module named 'ifcopenshell'")
        return orig_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    monkeypatch.setattr(room_contents, "_find_dxf", lambda p: None)
    monkeypatch.setattr(room_contents, "_find_ifc", lambda p: Path("fake.ifc"))

    res = room_contents.get_room_contents("fake.ifc", "Room 101")
    assert res["value"] is None
    assert "ifcopenshell is not installed" in res["warnings"]


def test_api_endpoint_room_contents(client, monkeypatch):
    """GET /room/contents returns HTTP 200 with unified schema."""
    fake_result = {
        "value": 3,
        "unit": "count",
        "items": [
            {"category": "toilet", "name": "WC 1", "on_boundary": False},
            {"category": "sink", "name": "Sink 1", "on_boundary": False},
            {"category": "door", "name": "Door 1", "on_boundary": True},
        ],
        "summary": {"toilet": 1, "sink": 1, "door": 1},
        "room": {"name": "Bad", "number": "1.04", "area_m2": 4.5},
        "method": "room_contents:swiss",
        "warnings": [],
    }
    monkeypatch.setattr(room_contents, "get_room_contents", lambda path, room: fake_result)

    r = client.get("/room/contents", params={"path": "data/swiss_dwellings/floor.pdf", "room": "bathroom"})
    assert r.status_code == 200
    data = r.json()
    assert data["value"] == 3
    assert data["summary"]["toilet"] == 1
    assert data["room"]["number"] == "1.04"


def test_tools_declaration_and_dispatch(monkeypatch):
    """room_contents tool is declared for Gemini and dispatched via tools.call."""
    decls = tools.declarations()
    rc_decl = next((d for d in decls if d["name"] == "room_contents"), None)
    assert rc_decl is not None
    assert "bathroom" in rc_decl["description"]
    assert "path" in rc_decl["parameters"]["required"]
    assert "room" in rc_decl["parameters"]["required"]

    fake_result = {
        "value": 1,
        "unit": "count",
        "items": [{"category": "door"}],
        "summary": {"door": 1},
        "room": {"name": "Küche", "number": "2.02"},
        "method": "room_contents:swiss",
        "warnings": [],
    }
    monkeypatch.setattr(room_contents, "get_room_contents", lambda path, room: fake_result)

    called = tools.call("room_contents", {"path": "test.pdf", "room": "kitchen"})
    assert called["value"] == 1
    assert called["method"] == "room_contents:swiss"
