"""Tests for construction workflow, ordering, change orders, budget, and project settings (Modules 3, 7, 9).

Verifies:
- Work sequence check and blocker detection (missing wall, plumber before tiling, electrician/tiler before painter).
- Orders creation with scene price resolution, status updates, unified calendar events, and trade notifications.
- Change order requests and strict owner-only approval/rejection (HTTP 403 on non-owner).
- Budget aggregation combining 3D scene furniture prices and approved change orders.
- Project settings update and client view configuration.
- Every endpoint has at least one normal case and one error case.
"""
from __future__ import annotations

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, collab, config, scene, workflow

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _setup_env(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", FIX.resolve())
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")


@pytest.fixture()
def client():
    return TestClient(app_module.app)


# =====================================================================
# 1. Work sequence rules (Module 3)
# =====================================================================

def test_workflow_check_normal_and_blocked(client):
    """Normal: compliant sequence passes; Blocked: missing wall blocks plumber/electrician."""
    # 1. Room is built: plumber allowed
    collab.set_status("Room_101", "built", author="Supervisor")
    r_ok = client.get("/workflow/check", params={"space_id": "Room_101", "trade": "plumber"})
    assert r_ok.status_code == 200
    assert r_ok.json()["ok"] is True
    assert len(r_ok.json()["blockers"]) == 0

    # 2. Room wall is broken/missing: plumber and electrician blocked
    collab.set_status("Room_102", "missing_wall", author="Inspector")
    r_blocked = client.get("/workflow/check", params={"space_id": "Room_102", "trade": "plumber"})
    assert r_blocked.status_code == 200
    res = r_blocked.json()
    assert res["ok"] is False
    assert len(res["blockers"]) == 1
    assert "Wall in Room_102 is not built yet" in res["blockers"][0]["reason"]
    assert res["blockers"][0]["needs_trade"] == "wall"


def test_workflow_check_tiler_and_painter_dependencies(client):
    """Tiler requires plumber completed; Painter requires electrician and tiler completed."""
    now = time.time()
    # Plumber scheduled in Room_201 from now to now + 3600
    collab.book("Room_201", "plumber", "Bob", now, now + 3600, "Rough-in plumbing")

    # Tiler attempts to start at now + 1800 (before plumber ends) -> blocked
    r_tiler = client.get("/workflow/check", params={"space_id": "Room_201", "trade": "tiler", "start": str(now + 1800)})
    assert r_tiler.status_code == 200
    assert r_tiler.json()["ok"] is False
    assert "Plumber work in Room_201 is not finished yet" in r_tiler.json()["blockers"][0]["reason"]

    # Tiler starts at now + 4000 (after plumber ends) -> ok
    r_tiler_ok = client.get("/workflow/check", params={"space_id": "Room_201", "trade": "tiler", "start": str(now + 4000)})
    assert r_tiler_ok.status_code == 200
    assert r_tiler_ok.json()["ok"] is True

    # Painter starts while electrician is still active -> blocked
    collab.book("Room_201", "electrician", "Charlie", now + 4000, now + 8000, "Wiring")
    r_painter = client.get("/workflow/check", params={"space_id": "Room_201", "trade": "painter", "start": str(now + 5000)})
    assert r_painter.json()["ok"] is False
    assert any(b["needs_trade"] == "electrician" for b in r_painter.json()["blockers"])


def test_workflow_blockers_endpoint(client):
    """GET /workflow/blockers scans all bookings and reports order violations."""
    now = time.time()
    collab.set_status("Room_303", "missing_wall", author="Inspector")
    # Book electrician in room with missing wall
    b = collab.book("Room_303", "electrician", "Charlie", now, now + 3600, "Conduit installation")

    res = client.get("/workflow/blockers")
    assert res.status_code == 200
    data = res.json()
    assert "blockers" in data
    violation = next((v for v in data["blockers"] if v.get("booking_id") == b["id"]), None)
    assert violation is not None
    assert violation["trade"] == "electrician"
    assert "Wall in Room_303 is not built yet" in violation["blockers"][0]["reason"]


# =====================================================================
# 2. Orders & delivery notifications (Module 7)
# =====================================================================

def test_orders_crud_and_status(client):
    """Normal: create order resolving 3D scene placement prices and update status; Error: missing fields & invalid status."""
    # Seed placement in scene
    model = "test-model.ifc"
    scene.save_placement(model, {
        "instanceId": "desk-101",
        "catalogId": "work-desk",
        "name": "Oak Work Desk",
        "width_mm": 1400.0,
        "depth_mm": 700.0,
        "height_mm": 750.0,
        "price_eur": 450.0,
        "space_id": "Office_1",
    })

    # Normal order creation
    payload = {
        "model": model,
        "items": ["desk-101"],
        "supplier": "Nordic Furnishings",
        "delivery_date": "2026-11-25",
        "deliver_to_space_id": "Office_1",
        "notify_trades": ["architect", "electrician"],
        "author": "Alice",
    }
    r_post = client.post("/orders", json=payload)
    assert r_post.status_code == 200
    order = r_post.json()
    assert order["supplier"] == "Nordic Furnishings"
    assert order["total_price_eur"] == 450.0
    assert order["status"] == "ordered"

    # Error case: missing supplier
    bad_payload = dict(payload, supplier="")
    assert client.post("/orders", json=bad_payload).status_code == 400

    # GET /orders
    r_list = client.get("/orders", params={"model": model})
    assert r_list.status_code == 200
    assert any(o["id"] == order["id"] for o in r_list.json()["orders"])

    # Update status normal
    r_st = client.post("/orders/status", json={"id": order["id"], "status": "shipped"})
    assert r_st.status_code == 200
    assert r_st.json()["status"] == "shipped"

    # Error cases: invalid status & non-existent ID
    assert client.post("/orders/status", json={"id": order["id"], "status": "lost"}).status_code == 400
    assert client.post("/orders/status", json={"id": "non-existent-id", "status": "delivered"}).status_code == 404


def test_calendar_and_notifications(client):
    """Normal: unified calendar with deliveries and work; notifications with day-before delivery alert."""
    now = time.time()
    # 1. Collab booking
    collab.book("Room_501", "plumber", "Bob", now, now + 3600, "Fix pipes")

    # 2. Create order
    client.post("/orders", json={
        "model": "m.ifc",
        "items": [],
        "supplier": "Tile World",
        "delivery_date": "2026-11-20",
        "deliver_to_space_id": "Room_501",
        "notify_trades": ["plumber"],
        "author": "Alice",
    })

    # Calendar check
    r_cal = client.get("/calendar")
    assert r_cal.status_code == 200
    events = r_cal.json()["events"]
    assert any(e["kind"] == "delivery" and "Tile World" in e["title"] for e in events)
    assert any(e["kind"] == "work" and "Plumber" in e["title"] for e in events)

    # Date filter on calendar
    r_cal_filtered = client.get("/calendar", params={"from": "2026-11-20", "to": "2026-11-20"})
    assert all(e["date"] == "2026-11-20" for e in r_cal_filtered.json()["events"])

    # Notifications check
    r_notifs = client.get("/notifications", params={"trade": "plumber"})
    assert r_notifs.status_code == 200
    notifs = r_notifs.json()["notifications"]
    assert len(notifs) >= 1
    nid = notifs[0]["id"]

    # Mark notification read
    r_read = client.post("/notifications/read", json={"id": nid})
    assert r_read.status_code == 200
    assert r_read.json()["ok"] is True

    # Error case: mark non-existent notification
    assert client.post("/notifications/read", json={"id": "ghost-id"}).status_code == 404


# =====================================================================
# 3. Change orders & budget (Module 9)
# =====================================================================

def test_change_orders_and_budget(client):
    """Normal: change order approval by owner updates budget; Error: non-owner 403, negative amount 400."""
    # Place furniture in scene to establish base furniture total
    scene.save_placement("model_a.ifc", {
        "instanceId": "chair-1",
        "catalogId": "sofa",
        "name": "Leather Sofa",
        "width_mm": 2000.0,
        "depth_mm": 900.0,
        "height_mm": 800.0,
        "price_eur": 1200.0,
    })

    # 1. Create change order
    co_data = {
        "space_id": "LivingRoom",
        "trade": "electrician",
        "author": "Charlie",
        "description": "Additional recessed ceiling LEDs",
        "amount_eur": 350.0,
    }
    r_co = client.post("/change-orders", json=co_data)
    assert r_co.status_code == 200
    co = r_co.json()
    assert co["status"] == "pending"
    assert co["amount_eur"] == 350.0

    # Error case: negative amount or missing description
    assert client.post("/change-orders", json=dict(co_data, amount_eur=-50.0)).status_code == 400
    assert client.post("/change-orders", json=dict(co_data, description="")).status_code == 400

    # 2. Check initial budget before approval
    b1 = client.get("/budget").json()
    assert b1["furniture_total"] == 1200.0
    assert b1["approved_change_orders"] == 0.0
    assert b1["pending_change_orders"] == 350.0
    assert b1["total"] == 1200.0

    # Error case: non-owner cannot decide change order -> 403 Forbidden!
    r_forbidden = client.post("/change-orders/decide", json={
        "id": co["id"],
        "decision": "approve",
        "by": "Contractor Bob",
        "role": "contractor",
    })
    assert r_forbidden.status_code == 403

    # Error case: invalid decision option
    r_bad_dec = client.post("/change-orders/decide", json={
        "id": co["id"],
        "decision": "undecided",
        "by": "Owner Dave",
        "role": "owner",
    })
    assert r_bad_dec.status_code == 400

    # Normal case: owner approves change order
    r_app = client.post("/change-orders/decide", json={
        "id": co["id"],
        "decision": "approve",
        "by": "Owner Dave",
        "role": "owner",
    })
    assert r_app.status_code == 200
    assert r_app.json()["status"] == "approved"
    assert r_app.json()["decision_by"] == "Owner Dave"

    # 3. Check updated budget after approval
    b2 = client.get("/budget").json()
    assert b2["approved_change_orders"] == 350.0
    assert b2["pending_change_orders"] == 0.0
    assert b2["total"] == 1550.0  # 1200 + 350


# =====================================================================
# 4. Project settings & client view (Module 9)
# =====================================================================

def test_project_settings_crud(client):
    """Normal: get and update project transparency settings; Error: invalid enum values."""
    # GET initial settings
    r_get = client.get("/project/settings")
    assert r_get.status_code == 200
    data = r_get.json()
    assert data["owner_view"] in ("everything", "final_and_questions")
    assert data["building_type"] in ("historic", "new", "renovation")

    # POST valid update
    update_payload = {
        "owner_view": "final_and_questions",
        "building_type": "renovation",
        "status_note": "Milestone 1 completed",
    }
    r_post = client.post("/project/settings", json=update_payload)
    assert r_post.status_code == 200
    assert r_post.json()["owner_view"] == "final_and_questions"
    assert r_post.json()["building_type"] == "renovation"
    assert r_post.json()["status_note"] == "Milestone 1 completed"

    # Verify persisted
    assert client.get("/project/settings").json()["status_note"] == "Milestone 1 completed"

    # Error cases: invalid owner_view or building_type
    assert client.post("/project/settings", json={"owner_view": "classified"}).status_code == 400
    assert client.post("/project/settings", json={"building_type": "space_station"}).status_code == 400
