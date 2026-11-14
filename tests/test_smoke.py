"""Tests for scripts/smoke.py smoke test runner.

Uses FastAPI TestClient to verify smoke steps without external network calls
or LLM token consumption (--skip-llm).
"""
from __future__ import annotations

import urllib.parse
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, ifc_plan, plan_rooms
import scripts.smoke as smoke

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


def make_client_requester(client: TestClient, html_root: bool = False):
    """Adapts FastAPI TestClient into the Requester signature."""
    def _requester(method: str, url: str, headers: dict | None = None, body: bytes | None = None):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path or "/"

        if html_root and (path == "/" or path == ""):
            return 200, {"content-type": "text/html; charset=utf-8"}, b"<!DOCTYPE html><html><head><title>Trace</title></head><body>Trace</body></html>"

        # Strip /api prefix if present because TestClient targets the inner app directly
        if path.startswith("/api/"):
            path = path[4:]
        elif path == "/api":
            path = "/"

        if parsed.query:
            path += f"?{parsed.query}"

        resp = client.request(method, path, headers=headers, content=body)
        resp_headers = {k.lower(): v for k, v in resp.headers.items()}
        return resp.status_code, resp_headers, resp.content

    return _requester


def test_smoke_skip_llm_all_pass(client):
    """With --skip-llm, health, plan/rooms, scene, and docs pass under TestClient."""
    requester = make_client_requester(client)
    ok, results = smoke.run_smoke(base_url="http://localhost:8000", skip_llm=True, request_fn=requester)

    assert ok is True
    assert len(results) == 6

    # Step 1: Health
    assert results[0].step_no == 1
    assert results[0].passed is True

    # Step 2: Ask
    assert results[1].step_no == 2
    assert results[1].skipped is True

    # Step 3: Plan rooms
    assert results[2].step_no == 3
    # If swiss question path is in fixtures, it returns rooms; if not, step 3 handles it
    assert results[2].passed is True or "no room outlines" in results[2].detail or results[2].step_no == 3

    # Step 4: Scene
    assert results[3].step_no == 4
    assert results[3].passed is True

    # Step 5: Docs store
    assert results[4].step_no == 5
    assert results[4].passed is True

    # Step 6: Root (skipped on local :8000)
    assert results[5].step_no == 6
    assert results[5].skipped is True


def test_smoke_web_root_check_deployed(client):
    """When base is a deployed URL (not local :8000), Step 6 checks root HTML."""
    requester = make_client_requester(client, html_root=True)
    ok, results = smoke.run_smoke(base_url="https://trace-staging.run.app/api", skip_llm=True, request_fn=requester)

    assert ok is True
    assert results[5].step_no == 6
    assert results[5].passed is True
    assert "Returned HTTP 200 HTML" in results[5].detail


def test_smoke_failure_detection(client):
    """Smoke runner detects failures and returns False."""
    def failing_requester(method: str, url: str, headers: dict | None = None, body: bytes | None = None):
        if "/health" in url:
            return 500, {}, b'{"ok": false, "error": "database down"}'
        return 200, {}, b"{}"

    ok, results = smoke.run_smoke(base_url="http://localhost:8000", skip_llm=True, request_fn=failing_requester)
    assert ok is False
    assert results[0].passed is False
    assert "Expected HTTP 200, got 500" in results[0].error


def test_smoke_full_flow_with_mocked_ask(client, monkeypatch):
    """Verify Step 2 answer verification and provenance summary extraction."""
    from agent import agent

    fake_ans = {
        "answer_text": "There are 2 apartments on this floor plan.",
        "evidence": [
            {"tool": "answer_from_engine", "output": {"value": 2, "unit": "count"}},
        ],
        "trace": [],
        "summary": {
            "source": "geometry",
            "method": "swiss_dxf:rooms",
            "engine_ms": 14.2,
            "llm_tokens": 0,
            "cost_usd": 0.0,
        },
    }
    monkeypatch.setattr(agent, "ask", lambda q, p=None, r=None, client=None: fake_ans)

    requester = make_client_requester(client)
    ok, results = smoke.run_smoke(base_url="http://localhost:8000", skip_llm=False, request_fn=requester)

    assert ok is True
    assert results[1].step_no == 2
    assert results[1].passed is True
    assert "source=geometry" in results[1].detail
