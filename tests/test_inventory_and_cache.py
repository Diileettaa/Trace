"""Cache, inventory, collab and contract tests. No API keys, no dataset needed."""
from pathlib import Path

import pytest

FIX = Path(__file__).parent / "fixtures"
CONTRACT = {"value", "unit", "items", "sources", "method", "warnings"}


@pytest.fixture(autouse=True)
def _env(monkeypatch, tmp_path):
    from agent import config

    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(config, "GEMINI_API_KEY", "test")


def test_vision_cache_second_call_skips_api(monkeypatch):
    from agent import vision

    calls = {"g": 0, "n": 0}

    def g(png, t):
        calls["g"] += 1
        return [{"box_2d": [100, 100, 200, 200]}]

    def n(png, t):
        calls["n"] += 1
        return 1

    monkeypatch.setattr(vision, "_gemini_detect", g)
    monkeypatch.setattr(vision, "_nemotron_count", n)
    monkeypatch.setattr(vision.config, "NEMOTRON_MODEL", "nemotron-test")
    a = vision.count_in_drawing("data/demo/plan.png", "toilet")
    b = vision.count_in_drawing("data/demo/plan.png", "toilet")
    assert calls == {"g": 1, "n": 1}
    assert a["cached"] is False and b["cached"] is True
    assert a["value"] == b["value"] == 1 and b["verified_by"]["agreement"] is True


def test_cache_key_depends_on_prompt(monkeypatch):
    from agent import vision

    calls = []
    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: calls.append(t) or [])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: None)
    vision.count_in_drawing("data/demo/plan.png", "toilet")
    vision.count_in_drawing("data/demo/plan.png", "door")
    assert calls == ["toilet", "door"]


def test_none_results_are_not_cached(monkeypatch):
    from agent import vision

    calls = []
    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: calls.append(1))
    vision.count_in_drawing("data/demo/plan.png", "toilet")
    vision.count_in_drawing("data/demo/plan.png", "toilet")
    assert len(calls) == 2


def test_inventory_numbers_per_category(monkeypatch):
    from agent import vision

    dets = [{"category": "toilet", "box_2d": [0, 0, 10, 10]}, {"category": "door", "box_2d": [0, 0, 10, 10]},
            {"category": "toilet", "box_2d": [20, 20, 30, 30]}, {"category": "unicorn", "box_2d": [0, 0, 1, 1]}]
    monkeypatch.setattr(vision, "_gemini_inventory", lambda png, p: dets)
    r = vision.scan_drawing_inventory("data/demo/plan.png")
    assert CONTRACT <= r.keys()
    assert [i["name"] for i in r["items"]] == ["WC 1", "Door 1", "WC 2"]
    assert r["by_category"] == {"toilet": 2, "door": 1} and r["value"] == 3
    assert len(r["sources"]) == 3 and all(len(s["bbox"]) == 4 for s in r["sources"])


def test_inventory_without_key_is_marked_mock(monkeypatch):
    from agent import vision

    monkeypatch.setattr(vision.config, "GEMINI_API_KEY", "")
    r = vision.scan_drawing_inventory("data/demo/plan.png")
    assert CONTRACT <= r.keys() and any("MOCK DATA" in w for w in r["warnings"])


@pytest.mark.parametrize("tool", ["list_spaces", "count_elements", "elements_in_space", "space_area",
                                  "locate_elements", "element_status", "search_drawings"])
def test_every_engine_tool_returns_contract_with_mock_flag(tool):
    from agent import tools

    r = tools.call(tool, {"path": "x.ifc"})
    assert CONTRACT <= r.keys() and any("MOCK DATA" in w for w in r["warnings"])


def test_unsupported_numbers_detects_invented_values():
    from agent import agent

    ev = [{"value": 2, "items": [{}, {}]}]
    assert agent.unsupported_numbers("There are 2 toilets.", "How many?", ev) == []
    assert agent.unsupported_numbers("There are 5 toilets.", "How many?", ev) == [5.0]


def test_path_traversal_rejected_on_inventory():
    from fastapi.testclient import TestClient

    from agent.app import app

    assert TestClient(app).get("/inventory", params={"path": "../../etc/passwd"}).status_code == 404


def test_collab_status_and_messages():
    from fastapi.testclient import TestClient

    from agent.app import app

    c = TestClient(app)
    assert c.post("/collab/status", json={"space_id": "B204", "status": "missing_wall"}).status_code == 200
    assert c.post("/collab/status", json={"space_id": "B204", "status": "bogus"}).status_code == 400
    c.post("/collab/message", json={"space_id": "B204", "text": "Wall broken, fix before WC", "role": "architect",
                                    "notify": ["plumber"]})
    c.post("/collab/message", json={"space_id": "B999", "text": "other room"})
    r = c.get("/collab", params={"space_id": "B204"}).json()
    assert r["status"]["B204"]["status"] == "missing_wall"
    assert [m["text"] for m in r["messages"]][-1] == "Wall broken, fix before WC"
    assert all(m["space_id"] == "B204" for m in r["messages"])


def test_role_hints_cover_all_trades():
    from agent import agent

    assert {"architect", "electrician", "plumber", "owner"} <= agent.ROLE_HINTS.keys()


def test_engine_adapter_converts_boxes_and_guids(monkeypatch):
    import engine.answer as ea

    from agent import engine_adapter, tools

    fake = {"value": 2, "unit": "count", "method": "swiss_dxf:wc", "warnings": [],
            "items": [{"category": "wc", "bbox_m": [0, 0, 1, 1], "png_bbox": [10, 20, 30, 40], "pdf_bbox_pt": [72, 72, 144, 144]},
                      {"category": "wc", "bbox_m": [1, 1, 2, 2], "png_bbox": [50, 60, 70, 80], "pdf_bbox_pt": [0, 0, 72, 72]}],
            "sources": [{"file": "data/swiss_dwellings/a.dxf"}]}
    monkeypatch.setattr(ea, "answer", lambda p, q: fake)
    png = tools.call("answer_from_engine", {"path": "data/swiss_dwellings/a.png", "question": "How many WC?"})
    assert CONTRACT <= png.keys() and png["value"] == 2
    assert [s["bbox"] for s in png["sources"]] == [[10, 20, 30, 40], [50, 60, 70, 80]]
    assert [i["name"] for i in png["items"]] == ["WC 1", "WC 2"]
    pdf = engine_adapter.answer("data/swiss_dwellings/a.pdf", "How many WC?")
    assert pdf["sources"][0]["bbox"] == [150, 150, 300, 300]


def test_engine_adapter_keeps_ifc_guid_and_model(monkeypatch):
    import engine.answer as ea

    from agent import engine_adapter

    fake = {"value": 1, "unit": "count", "method": "ifc:count_door", "warnings": [],
            "items": [{"guid": "abc", "category": "IFCDOOR", "name": "D01", "storey": "1"}],
            "sources": [{"file": "data/ifc_models/m.ifc"}, {"file": "data/ifc_models/m_L1.pdf"}]}
    monkeypatch.setattr(ea, "answer", lambda p, q: fake)
    r = engine_adapter.answer("data/ifc_models/m_L1.pdf", "How many doors?")
    assert r["items"][0]["guid"] == "abc" and r["items"][0]["name"] == "Door 1 (D01)"
    assert r["model_file"] == "data/ifc_models/m.ifc"


def test_engine_present_hides_mock_tools():
    from agent import tools

    names = [d["name"] for d in tools.declarations()]
    assert names[0] == "answer_from_engine" and "count_elements" not in names


def test_engine_prior_is_not_presented_as_answer(monkeypatch):
    import engine.answer as ea

    from agent import engine_adapter

    monkeypatch.setattr(ea, "answer", lambda p, q: {"value": 1, "unit": "count", "items": [], "sources": [],
                                                    "method": "cubicasa:prior:toilet", "warnings": []})
    r = engine_adapter.answer("data/cubicasa5k/x.png", "How many toilets?")
    assert r["value"] is None and "count_in_drawing" in r["warnings"][0]


def test_sum_values_makes_totals_checkable(monkeypatch):
    from agent import agent, tools

    r = tools.call("sum_values", {"values": [4.2, 1.8], "unit": "m2"})
    assert r["value"] == 6.0 and CONTRACT <= r.keys()
    ev = [{"value": 4.2}, {"value": 1.8}]
    assert agent.unsupported_numbers("Total 6.0 m2", "q", ev) == [6.0]
    assert agent.unsupported_numbers("Total 6.0 m2", "q", ev + [r]) == []


def test_room_status_reads_room_board():
    from agent import collab, tools

    assert tools.call("room_status", {})["warnings"]
    collab.set_status("B204", "missing_wall", "architect")
    collab.post_message("B204", "Fix wall before WC", role="architect", notify=["plumber"])
    r = tools.call("room_status", {"space_id": "B204"})
    assert r["items"][0]["status"] == "missing_wall" and r["messages"][0]["notify"] == ["plumber"]


def test_ifc_plan_boxes_from_svg_guid_groups(monkeypatch):
    import engine.answer as ea

    from agent import engine_adapter, ifc_plan

    ifc_plan._boxes.cache_clear()
    px = 150 / 25.4
    b = ifc_plan.boxes_for("data/ifc_models/m_plan.pdf", ["DOOR1", "SPACE1", "MISSING"])
    assert b["DOOR1"] == [round(10 * px), round(10 * px), round(20 * px), round(20 * px)]  # arc end point included
    assert "MISSING" not in b
    fake = {"value": 2, "unit": "count", "method": "ifc:count_door", "warnings": [],
            "items": [{"guid": "DOOR1", "category": "IFCDOOR"}, {"guid": "MISSING", "category": "IFCDOOR"}],
            "sources": [{"file": "data/ifc_models/m.ifc"}]}
    monkeypatch.setattr(ea, "answer", lambda p, q: fake)
    r = engine_adapter.answer("data/ifc_models/m_plan.pdf", "How many doors?")
    assert len(r["sources"]) == 1 and r["sources"][0]["label"] == "Door 1"
    assert any("not on this floor plan" in w for w in r["warnings"])
