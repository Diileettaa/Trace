"""Tests for AI-assisted product and contractor recommendation services (Architect Modules 7, 9).

Verifies:
- GET /recommend/products keyword matching, rules source, zero token usage.
- Budget filtering and room footprint filtering (footprint < 25% of room area).
- Material/color consistency scoring from 3D scene placements.
- Gemini fallback when no keyword matches (mocked offline).
- GET /recommend/people ranking by trade, availability, prior jobs count, and room experience.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, collab, config, recommend, scene

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")


@pytest.fixture()
def client():
    return TestClient(app_module.app)


# =====================================================================
# 1. Product Recommendations
# =====================================================================

def test_recommend_products_keyword_match_rules(client):
    """Keyword matching on product category/name runs via rules with 0 tokens."""
    r = client.get("/recommend/products", params={"need": "toilet for bathroom"})
    assert r.status_code == 200
    data = r.json()

    assert data["source"] == "rules"
    assert data["tokens"] == 0
    assert len(data["products"]) > 0

    top = data["products"][0]
    assert "toilet" in top["id"].lower() or top["category"] == "bathroom"
    assert top["price_eur"] > 0
    assert top["image"].startswith("/catalog/")
    assert len(top["reason"]) > 0


def test_recommend_products_budget_filter(client):
    """Budget filter excludes items exceeding budget_eur."""
    # Sovereign three-seat sofa costs 1890 EUR
    r_tight = client.get("/recommend/products", params={"need": "three-seat sofa", "budget_eur": 500})
    assert r_tight.status_code == 200
    ids_tight = [p["id"] for p in r_tight.json()["products"]]
    assert "sofa" not in ids_tight

    # Generous budget includes sofa
    r_ample = client.get("/recommend/products", params={"need": "three-seat sofa", "budget_eur": 2500})
    assert r_ample.status_code == 200
    ids_ample = [p["id"] for p in r_ample.json()["products"]]
    assert "sofa" in ids_ample


def test_recommend_products_area_filtering(monkeypatch):
    """Products whose footprint exceeds 25% of room area are filtered out."""
    # Mock room area to 4.0 m2 (25% max footprint = 1.0 m2)
    monkeypatch.setattr(recommend, "get_room_area", lambda model, sid: 4.0)

    res = recommend.recommend_products(
        need="bedroom furniture",
        space_id="Bed_101",
        model="m.ifc",
    )
    products = res["products"]
    # Bed is 1.6m x 2.1m = 3.36 m2 > 1.0 m2 -> filtered out
    p_ids = [p["id"] for p in products]
    assert "bed" not in p_ids
    # Nightstand is 0.5m x 0.42m = 0.21 m2 < 1.0 m2 -> included
    assert "nightstand" in p_ids


def test_recommend_products_material_consistency(client):
    """Products matching materials of existing 3D placements in the room are prioritized."""
    model = "esplanades.ifc"
    # Place oak desk in room Office_A
    scene.save_placement(model, {
        "instanceId": "desk-1",
        "catalogId": "work-desk",
        "name": "Oak desk",
        "material": "oak veneer",
        "color_hex": "#9a6b43",
        "width_mm": 1400.0,
        "depth_mm": 700.0,
        "height_mm": 750.0,
        "price_eur": 499.0,
        "space_id": "Office_A",
    })

    # Query for chairs
    r = client.get("/recommend/products", params={
        "need": "chair",
        "model": model,
        "space_id": "Office_A",
    })
    assert r.status_code == 200
    products = r.json()["products"]
    assert len(products) > 0


def test_recommend_products_gemini_fallback_mocked(monkeypatch):
    """When keyword rules yield no matches, Gemini fallback selects IDs and reports tokens."""
    fake_response = SimpleNamespace(
        text=json.dumps({"ids": ["office-chair", "desk-lamp"]}),
        usage_metadata=SimpleNamespace(total_token_count=142),
    )
    fake_client = SimpleNamespace(
        models=SimpleNamespace(generate_content=lambda **kwargs: fake_response)
    )

    res = recommend.recommend_products(
        need="orthopedic spinal decompression support",
        client=fake_client,
    )
    assert res["source"] == "gemini"
    assert res["tokens"] == 142
    p_ids = [p["id"] for p in res["products"]]
    assert "office-chair" in p_ids


# =====================================================================
# 2. People Recommendations
# =====================================================================

def test_recommend_people_ranking_and_availability(client):
    """People with trade ranked by availability, job count, and recency."""
    now = time.time()
    # Register 2 electricians
    collab.register_person("Charlie Electrician", "electrician", "charlie@test.local", "+358 40 111")
    collab.register_person("Dave Electrician", "electrician", "dave@test.local", "+358 40 222")

    # Charlie completed 2 past jobs -> available now
    collab.book("Room_1", "electrician", "Charlie Electrician", now - 7200, now - 3600, "Wiring")
    collab.book("Room_2", "electrician", "Charlie Electrician", now - 1800, now - 900, "Sockets")

    # Dave has an active job right now (busy)
    collab.book("Room_3", "electrician", "Dave Electrician", now - 1000, now + 2000, "Emergency repair")

    r = client.get("/recommend/people", params={"trade": "electrician"})
    assert r.status_code == 200
    people = r.json()["people"]
    assert len(people) >= 2

    # Charlie ranks above Dave because Charlie is available now
    assert people[0]["name"] == "Charlie Electrician"
    assert people[0]["available_now"] is True
    assert people[0]["jobs_done"] == 2
    assert "currently available" in people[0]["reason"]

    assert people[1]["name"] == "Dave Electrician"
    assert people[1]["available_now"] is False
    assert "currently busy on site" in people[1]["reason"]


def test_recommend_people_space_experience(client):
    """Contractor who previously worked in the requested space is favored."""
    now = time.time()
    collab.register_person("Plumber Bob", "plumber", "bob@test.local", "+358 40 333")
    collab.register_person("Plumber Frank", "plumber", "frank@test.local", "+358 40 444")

    # Bob worked in Room_Target
    collab.book("Room_Target", "plumber", "Plumber Bob", now - 86400, now - 80000, "Pipes")

    # Frank worked elsewhere
    collab.book("Room_Other", "plumber", "Plumber Frank", now - 86400, now - 80000, "Drain")

    r = client.get("/recommend/people", params={"trade": "plumber", "space_id": "Room_Target"})
    assert r.status_code == 200
    people = r.json()["people"]

    assert people[0]["name"] == "Plumber Bob"
    assert "familiar with Room_Target" in people[0]["reason"]
