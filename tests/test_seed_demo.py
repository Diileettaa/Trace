"""Tests for scripts/seed_demo.py and agent/serve.py SEED_DEMO startup hook.

Verifies:
- Seeding room statuses, messages, 3D furniture, and document store samples from tests/fixtures/emails/*.eml.
- Document store contains documents with distinct statuses (latest, superseded, conflict, pending).
- Idempotent runs: re-running without reset does not duplicate entries.
- --reset cleanly purges demo items before seeding.
- agent/serve.py triggers demo seed on startup when SEED_DEMO=1, enabling GET /api/docs to return demo files.
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent import collab, config, docs_tools, ifc_plan, plan_rooms, scene, serve
import scripts.seed_demo as seed_demo

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setenv("DOCS_ROOT", str(tmp_path / "docs_store"))
    # Clear cached singleton store if already initialized
    docs_tools._STORE = None
    plan_rooms.get_plan_rooms.cache_clear()
    ifc_plan._boxes.cache_clear()


def test_seed_demo_full_flow():
    """Verify seed_demo populates collab, scene, and docs store with multiple statuses."""
    res = seed_demo.seed_demo_data(reset=True, seed_docs=True)
    assert res["rooms_seeded"] == 6
    assert res["messages_seeded"] >= 12
    assert res["placements_seeded"] == 2
    assert res["docs_seeded"] >= 4

    # 1. Collab verification
    data = collab.load()
    demo_statuses = {
        sid: s for sid, s in data["status"].items() if s.get("author", "").startswith(seed_demo.DEMO_PREFIX)
    }
    assert len(demo_statuses) == 6
    assert {"built", "missing_wall", "pending"}.issubset(set(s["status"] for s in demo_statuses.values()))

    # 2. Scene verification
    all_scenes = scene.load_all_scenes()
    demo_placements = [
        p
        for s in all_scenes.values()
        for p in s.get("placements", [])
        if p.get("name", "").startswith(seed_demo.DEMO_PREFIX)
    ]
    assert len(demo_placements) == 2

    # 3. Document store verification
    store = docs_tools.store()
    docs = store.list(project=seed_demo.DEMO_DOCS_PROJECT)
    assert len(docs) >= 4

    statuses = {d["status"] for d in docs}
    # Must have varied statuses: latest, superseded, conflict, pending
    assert "latest" in statuses
    assert "superseded" in statuses
    assert "conflict" in statuses
    assert "pending" in statuses


def test_seed_demo_idempotency_and_reset():
    """Re-running without reset is idempotent; --reset clears and re-seeds."""
    # First run
    r1 = seed_demo.seed_demo_data(reset=True, seed_docs=True)
    store = docs_tools.store()
    docs_first = len(store.list(project=seed_demo.DEMO_DOCS_PROJECT))

    # Second run without reset
    r2 = seed_demo.seed_demo_data(reset=False, seed_docs=True)
    docs_second = len(store.list(project=seed_demo.DEMO_DOCS_PROJECT))
    assert docs_first == docs_second
    assert r2["rooms_seeded"] == r1["rooms_seeded"]

    # Test clear_demo_data
    cleared = seed_demo.clear_demo_data()
    assert cleared["status_cleared"] == 6
    assert cleared["placements_cleared"] == 2
    assert cleared["docs_cleared"] == docs_first
    assert len(store.list(project=seed_demo.DEMO_DOCS_PROJECT)) == 0


def test_serve_startup_seed_demo(monkeypatch, tmp_path):
    """When SEED_DEMO=1, agent/serve.py seeds demo data on startup and /api/docs returns files."""
    monkeypatch.setenv("SEED_DEMO", "1")
    monkeypatch.setenv("DOCS_PROJECT", "Demo project")
    monkeypatch.setenv("DOCS_ROOT", str(tmp_path / "serve_docs_store"))
    docs_tools._STORE = None

    # Context manager triggers the FastAPI startup event
    with TestClient(serve.app) as client:
        resp = client.get("/api/docs")
        assert resp.status_code == 200
        docs_data = resp.json()
        doc_list = docs_data.get("documents", [])
        assert len(doc_list) >= 4

        statuses = {d["status"] for d in doc_list}
        assert "latest" in statuses
        assert "superseded" in statuses
        assert "conflict" in statuses
        assert "pending" in statuses


def test_serve_startup_error_resilience(monkeypatch):
    """Errors during SEED_DEMO startup do not prevent the server from starting."""
    monkeypatch.setenv("SEED_DEMO", "1")

    def failing_seed(*args, **kwargs):
        raise RuntimeError("Simulated seed failure")

    monkeypatch.setattr(seed_demo, "seed_demo_data", failing_seed)

    with TestClient(serve.app) as client:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
