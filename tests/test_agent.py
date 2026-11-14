"""Tests that run without any API key: Gemini and the vision model are faked."""
from pathlib import Path

import pytest
from google.genai import types

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _data_dir(monkeypatch, tmp_path):
    from agent import config

    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")


class _Resp:
    def __init__(self, calls=None, text=""):
        self.function_calls = calls or []
        self.text = text
        parts = [types.Part(function_call=c) for c in self.function_calls] or [types.Part.from_text(text=text)]
        self.candidates = [types.Candidate(content=types.Content(role="model", parts=parts))]


class FakeClient:
    """Plays back a fixed list of responses."""

    def __init__(self, responses):
        self._r = list(responses)
        self.models = self

    def generate_content(self, **kw):
        return self._r.pop(0)


def test_drawings_resolve_and_render():
    from agent import drawings

    assert drawings.page_png("data/demo/plan.png").name == "plan.png"
    png = drawings.page_png("data/demo/plan.pdf", 1)
    assert png.exists() and drawings.image_size(png)[0] > 0
    with pytest.raises(drawings.DrawingError):
        drawings.resolve("../../etc/passwd")


def test_tool_dispatch_uses_mock_until_engine_exists():
    from agent import tools

    r = tools.call("count_elements", {"path": "x.ifc", "category": "toilet"})
    assert r["value"] == 2 and any("MOCK" in w for w in r["warnings"])


def test_ask_loop_uses_tool_value(monkeypatch):
    from agent import agent, vision

    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [{"box_2d": [100, 100, 200, 200], "label": "WC"}])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: 1)
    call = types.FunctionCall(name="count_in_drawing", args={"path": "data/demo/plan.png", "target": "toilet bowls"})
    client = FakeClient([_Resp(calls=[call]), _Resp(text="1 toilet bowl is drawn on this plan.")])

    out = agent.ask("How many toilet bowls are drawn?", "data/demo/plan.png", client=client)

    assert out["answer_text"].startswith("1 toilet")
    ev = out["evidence"][0]
    assert ev["value"] == 1 and ev["sources"][0]["bbox"] == [40, 30, 80, 60]
    assert ev["warnings"] == []


def test_number_check_flags_invented_numbers(monkeypatch):
    from agent import agent, vision

    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: 0)
    call = types.FunctionCall(name="count_in_drawing", args={"path": "data/demo/plan.png", "target": "sauna"})
    client = FakeClient([_Resp(calls=[call]), _Resp(text="There are 3 saunas."), _Resp(text="There are 7 saunas.")])

    out = agent.ask("How many saunas?", "data/demo/plan.png", client=client)

    assert out["evidence"][-1]["tool"] == "number_check"


def test_nemotron_disagreement_is_warned(monkeypatch):
    from agent import vision

    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [{"box_2d": [0, 0, 10, 10]}] * 2)
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: 3)
    r = vision.count_in_drawing("data/demo/plan.png", "toilet")
    assert r["value"] == 2 and "Nemotron counted 3" in r["warnings"][0]


def test_api_health_and_drawing():
    from fastapi.testclient import TestClient

    from agent.app import app

    c = TestClient(app)
    assert c.get("/health").json()["ok"]
    assert c.get("/drawing", params={"path": "data/demo/plan.pdf"}).headers["content-type"] == "image/png"
    assert c.get("/questions").json()[0]["answer"] == 1


def test_raw_file_endpoint():
    from fastapi.testclient import TestClient

    from agent.app import app

    c = TestClient(app)
    assert c.get("/file", params={"path": "data/demo/plan.pdf"}).status_code == 200
    assert c.get("/file", params={"path": "../secret"}).status_code == 404


def test_answer_has_trace_and_usage(monkeypatch):
    from agent import agent, vision

    monkeypatch.setattr(vision, "_gemini_detect", lambda png, t: [{"box_2d": [100, 100, 200, 200]}])
    monkeypatch.setattr(vision, "_nemotron_count", lambda png, t: 1)
    monkeypatch.setattr(vision.config, "NEMOTRON_MODEL", "nemo")
    call = types.FunctionCall(name="count_in_drawing", args={"path": "data/demo/plan.png", "target": "toilets"})
    out = agent.ask("How many toilets?", "data/demo/plan.png",
                    client=FakeClient([_Resp(calls=[call]), _Resp(text="1 toilet.")]))
    kinds = [s["kind"] for s in out["trace"]]
    assert kinds[0] == "question" and kinds[-1] == "answer" and "tool" in kinds
    assert any(s["kind"] == "check" and "Nemotron" in s["title"] and s["ok"] for s in out["trace"])
    assert out["usage"]["gemini_calls"] == 2 and out["usage"]["nemotron_calls"] == 1


def test_summary_for_reasoning_panel(monkeypatch):
    import engine.answer as ea

    from agent import agent

    monkeypatch.setattr(ea, "answer", lambda p, q: {
        "value": 2, "unit": "count", "method": "swiss_dxf:doors", "warnings": [],
        "items": [{"category": "door", "png_bbox": [1, 2, 3, 4]}, {"category": "door", "png_bbox": [5, 6, 7, 8]}],
        "sources": []})
    call = types.FunctionCall(name="answer_from_engine", args={"path": "data/demo/plan.png", "question": "doors?"})
    out = agent.ask("How many doors?", "data/demo/plan.png",
                    client=FakeClient([_Resp(calls=[call]), _Resp(text="2 doors.")]))
    s = out["summary"]
    assert s["source"] == "geometry" and s["method"] == "engine:swiss_dxf:doors" and s["evidence_count"] == 2
    assert s["engine_tokens"] == 0 and s["badge"]["color"] == "grey" and isinstance(s["cost_usd"], float)
    step = next(t for t in out["trace"] if t["kind"] == "tool")
    assert step["source"] == "geometry" and step["tokens"] == 0 and step["engine_ms"] is not None


def test_engine_answer_needs_no_llm(monkeypatch):
    import engine.answer as ea

    from agent import agent

    monkeypatch.setattr(ea, "answer", lambda p, q: {
        "value": 21, "unit": "count", "method": "swiss_dxf:doors", "warnings": [], "sources": [],
        "items": [{"category": "door", "png_bbox": [1, 2, 3, 4]}],
        "interpreted": {"intent": "count", "category": "door", "scope": "whole drawing"}})

    class NoClient:
        @property
        def models(self):
            raise AssertionError("Gemini must not be called")

    out = agent.ask("一共有几扇门", "data/demo/plan.png", client=NoClient())
    assert out["llm_used"] is False and out["usage"]["cost_usd"] == 0.0 and "21" in out["answer_text"]
    assert out["answer_text"].startswith("答案") and "count, door, whole drawing" in out["answer_text"]
    assert out["trace"][-1]["title"].startswith("Answer written from the engine result")
    assert agent.unsupported_numbers(out["answer_text"], "q", out["evidence"]) == []


def test_vision_answer_still_uses_llm(monkeypatch):
    import engine.answer as ea

    from agent import agent

    monkeypatch.setattr(ea, "answer", lambda p, q: {"value": 3, "unit": "count", "method": "cubicasa:vlm[gemini:x]:sauna",
                                                    "warnings": [], "sources": [], "items": []})
    assert agent._direct("How many saunas?", "data/demo/plan.png") is None


def test_docs_tools_offered_and_dispatched(tmp_path, monkeypatch):
    monkeypatch.setenv("DOCS_ROOT", str(tmp_path))
    from agent import docs_tools, tools

    docs_tools._STORE = None
    names = [d["name"] for d in tools.declarations()]
    assert "search_docs" in names and "upload_doc" not in names
    r = tools.call("search_docs", {"query": "floor plan"})
    assert r["method"] == "docs:search_docs" and "result" in r
    docs_tools._STORE = None


def test_follow_ups_are_offered(monkeypatch):
    import engine.answer as ea

    from agent import agent

    monkeypatch.setattr(ea, "answer", lambda p, q: {
        "value": 3, "unit": "count", "method": "swiss_dxf:wc", "warnings": [], "sources": [],
        "items": [{"category": "wc", "png_bbox": [1, 2, 3, 4]}] * 3,
        "interpreted": {"intent": "count", "category": "toilet", "scope": "whole drawing"}})
    out = agent.ask("How many toilets?", "data/demo/plan.png", client=object())
    assert 1 <= len(out["follow_ups"]) <= 3 and all(isinstance(q, str) for q in out["follow_ups"])
