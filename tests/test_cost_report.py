"""Tests for scripts/cost_report.py benchmark report generator.

Verifies:
- Metric calculations (accuracy, zero-LLM ratio, average tokens, latency, cost per 1k).
- Correctness evaluation: exact count matching and 2% relative error margin for areas.
- Value extraction from evidence and answer_text fallback.
- Dry-run mode without /ask execution.
- End-to-end mocked run using FastAPI TestClient and markdown report formatting.
"""
from __future__ import annotations

import json
import urllib.parse
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, ifc_plan, plan_rooms
import scripts.cost_report as cost_report

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


def test_is_answer_correct():
    """Verify exact count matching and 2% tolerance for area/measurement questions."""
    # Exact counts
    assert cost_report.is_answer_correct(2, 2, q_type="count") is True
    assert cost_report.is_answer_correct(3, 2, q_type="count") is False

    # Float equality
    assert cost_report.is_answer_correct(5.0, 5, q_type="count") is True

    # Area question within 2% margin
    # 100 vs 101.5 -> relative error 1.5% <= 2% -> True
    assert cost_report.is_answer_correct(101.5, 100.0, q_type="area", unit="m2") is True
    assert cost_report.is_answer_correct(98.5, 100.0, q_type="measurement", unit="m²") is True

    # Area question exceeding 2% margin
    # 100 vs 103.0 -> relative error 3.0% > 2% -> False
    assert cost_report.is_answer_correct(103.0, 100.0, q_type="area", unit="m2") is False

    # None cases
    assert cost_report.is_answer_correct(None, 10) is False
    assert cost_report.is_answer_correct(10, None) is False


def test_extract_actual_value():
    """Extracts value from answer_from_engine tool output or falls back to text."""
    # From tool output
    ev_tool = {
        "evidence": [
            {"tool": "answer_from_engine", "output": {"value": 4, "unit": "count"}},
        ],
        "answer_text": "There are 4 doors.",
    }
    assert cost_report.extract_actual_value(ev_tool) == 4

    # From direct output value
    ev_direct = {
        "evidence": [
            {"tool": "answer_from_engine", "output": 12},
        ],
        "answer_text": "12 items found",
    }
    assert cost_report.extract_actual_value(ev_direct) == 12

    # Fallback to answer_text when evidence tool is absent
    ev_fallback = {
        "evidence": [],
        "answer_text": "Based on inspection, exactly 7 windows are visible.",
    }
    assert cost_report.extract_actual_value(ev_fallback) == 7

    # Decimal fallback
    ev_decimal = {
        "evidence": [],
        "answer_text": "Net area is 45.75 m2.",
    }
    assert cost_report.extract_actual_value(ev_decimal) == 45.75


def test_compute_metrics():
    """Verify aggregated statistics and cost per 1k queries calculation."""
    records = [
        {"correct": True, "llm_used": False, "tokens": 0, "cost_usd": 0.0, "duration_ms": 10.0},
        {"correct": True, "llm_used": False, "tokens": 0, "cost_usd": 0.0, "duration_ms": 20.0},
        {"correct": True, "llm_used": True, "tokens": 1000, "cost_usd": 0.002, "duration_ms": 30.0},
        {"correct": False, "llm_used": True, "tokens": 1000, "cost_usd": 0.002, "duration_ms": 40.0},
    ]
    m = cost_report.compute_metrics(records)
    assert m["total"] == 4
    assert m["correct"] == 3
    assert m["accuracy_pct"] == 75.0
    assert m["zero_llm_pct"] == 50.0  # 2 of 4
    assert m["avg_tokens"] == 500.0   # 2000 / 4
    assert m["avg_latency_ms"] == 25.0
    assert m["median_latency_ms"] == 25.0
    assert m["total_cost_usd"] == 0.004
    # (0.004 / 4) * 1000 = $1.00
    assert m["cost_per_1k_usd"] == 1.0


def test_cost_report_dry_run(client):
    """Dry-run samples questions and exits without executing /ask."""
    def requester(method: str, url: str, headers: dict | None = None, body: bytes | None = None):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path
        if parsed.query:
            path += f"?{parsed.query}"
        resp = client.request(method, path, headers=headers, content=body)
        return resp.status_code, dict(resp.headers), resp.content

    res = cost_report.run_cost_report(
        base_url="http://localhost:8000",
        per_source=2,
        seed=42,
        dry_run=True,
        request_fn=requester,
    )
    assert res["dry_run"] is True
    assert "total_sampled" in res


def test_cost_report_mocked_run_and_markdown(client, monkeypatch, tmp_path):
    """End-to-end benchmark run with mocked agent.ask writes verified docs/cost-report.md."""
    from agent import agent

    # Controlled mock answers
    def mock_ask(question: str, path: str | None = None, role: str | None = None, **kwargs):
        if "toilet" in question.lower():
            # Correct count via geometry
            return {
                "answer_text": "There is 1 toilet.",
                "evidence": [{"tool": "answer_from_engine", "output": {"value": 1}}],
                "summary": {"source": "geometry", "llm_tokens": 0, "cost_usd": 0.0, "engine_ms": 5.0},
            }
        # Area question with 1.5% margin (within 2%)
        return {
            "answer_text": "The calculated area is 50.75 m2.",
            "evidence": [{"tool": "answer_from_engine", "output": {"value": 50.75}}],
            "summary": {"source": "detector", "llm_tokens": 0, "cost_usd": 0.0, "engine_ms": 12.0},
        }

    monkeypatch.setattr(agent, "ask", mock_ask)

    # Requester directing calls to TestClient
    def requester(method: str, url: str, headers: dict | None = None, body: bytes | None = None):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path
        if parsed.query:
            path += f"?{parsed.query}"
        resp = client.request(method, path, headers=headers, content=body)
        return resp.status_code, dict(resp.headers), resp.content

    report_out = tmp_path / "cost-report.md"
    result = cost_report.run_cost_report(
        base_url="http://localhost:8000",
        per_source=2,
        seed=1,
        dry_run=False,
        output_path=str(report_out),
        request_fn=requester,
    )

    metrics = result["metrics"]
    assert metrics["total"] > 0
    assert metrics["accuracy_pct"] == 100.0
    assert metrics["zero_llm_pct"] == 100.0

    # Verify generated markdown content
    assert report_out.is_file()
    text = report_out.read_text(encoding="utf-8")
    assert "# Inference Cost and Latency Report" in text
    assert "## Overall Summary" in text
    assert "## Breakdown by Dataset Source" in text
    assert "## Breakdown by Method (summary.source)" in text
    assert "## Top 5 Slowest Queries" in text
    assert "## Failed Queries" in text
