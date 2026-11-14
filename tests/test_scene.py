"""Tests for 3D shared scene backend (add, update, delete, version polling, history, validations, concurrency)."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient

from agent import app as app_module, config, scene

SAMPLE_MODEL = "data/ifc_models/sample_building.ifc"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path)
    return TestClient(app_module.app)


def test_empty_scene_initial_state(client):
    r = client.get(f"/scene?model={SAMPLE_MODEL}")
    assert r.status_code == 200
    data = r.json()
    assert data["model"] == SAMPLE_MODEL
    assert data["version"] == 0
    assert data["placements"] == []


def test_add_placement_and_version_increment(client):
    payload = {
        "model": SAMPLE_MODEL,
        "instanceId": "chair-1",
        "catalogId": "office-chair",
        "name": "Ergonomic Chair",
        "width_mm": 600,
        "depth_mm": 600,
        "height_mm": 950,
        "price_eur": 180,
        "material": "fabric",
        "color_hex": "#333333",
        "mount": "floor",
        "rotationDeg": 45,
        "author": "Alice",
        "role": "architect",
        "space_id": "Room_101",
        "position": [1.0, 0.0, 2.0],
    }
    r = client.post("/scene/placement", json=payload)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["version"] == 1
    assert res["instanceId"] == "chair-1"
    assert res["name"] == "Ergonomic Chair"
    assert res["mount"] == "floor"
    assert res["position"] == [1.0, 0.0, 2.0]
    assert res["author"] == "Alice"

    # Query scene
    scene_res = client.get(f"/scene?model={SAMPLE_MODEL}")
    assert scene_res.status_code == 200
    scene_data = scene_res.json()
    assert scene_data["version"] == 1
    assert len(scene_data["placements"]) == 1
    assert scene_data["placements"][0]["instanceId"] == "chair-1"


def test_update_placement_same_instanceId(client):
    # Add initial placement
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "table-1",
        "name": "Small Table",
        "width_mm": 800,
        "depth_mm": 800,
        "height_mm": 720,
        "mount": "floor",
        "rotationDeg": 0,
        "position": [0.0, 0.0, 0.0],
    })

    # Update (move and rotate)
    r_up = client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "table-1",
        "name": "Small Table Updated",
        "width_mm": 800,
        "depth_mm": 800,
        "height_mm": 720,
        "mount": "floor",
        "rotationDeg": 90,
        "position": [2.5, 0.0, 3.5],
        "author": "Bob",
    })
    assert r_up.status_code == 200
    res_up = r_up.json()
    assert res_up["version"] == 2
    assert res_up["rotationDeg"] == 90
    assert res_up["position"] == [2.5, 0.0, 3.5]
    assert res_up["author"] == "Bob"

    # Verify single placement with updated fields
    scene_res = client.get(f"/scene?model={SAMPLE_MODEL}").json()
    assert scene_res["version"] == 2
    assert len(scene_res["placements"]) == 1
    assert scene_res["placements"][0]["name"] == "Small Table Updated"
    assert scene_res["placements"][0]["position"] == [2.5, 0.0, 3.5]


def test_delete_placement(client):
    # Add item
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "lamp-1",
        "name": "Floor Lamp",
        "width_mm": 400,
        "depth_mm": 400,
        "height_mm": 1500,
        "mount": "floor",
        "position": [1.0, 0.0, 1.0],
    })

    # Anyone can delete
    del_res = client.delete(f"/scene/placement?model={SAMPLE_MODEL}&instanceId=lamp-1&author=Charlie")
    assert del_res.status_code == 200
    del_data = del_res.json()
    assert del_data["ok"] is True
    assert del_data["instanceId"] == "lamp-1"
    assert del_data["version"] == 2

    # Scene is now empty, version is 2
    scene_data = client.get(f"/scene?model={SAMPLE_MODEL}").json()
    assert scene_data["version"] == 2
    assert len(scene_data["placements"]) == 0

    # Deleting missing item -> 404
    del_missing = client.delete(f"/scene/placement?model={SAMPLE_MODEL}&instanceId=lamp-1")
    assert del_missing.status_code == 404


def test_since_version_polling(client):
    # Create item (v1)
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "v-1",
        "name": "Item 1",
        "width_mm": 500,
        "depth_mm": 500,
        "height_mm": 500,
        "position": [0, 0, 0],
    })

    # Poll with since_version=1 -> no change
    poll_res = client.get(f"/scene?model={SAMPLE_MODEL}&since_version=1")
    assert poll_res.status_code == 200
    assert poll_res.json() == {"changed": False, "version": 1}

    # Poll with future version -> no change
    poll_future = client.get(f"/scene?model={SAMPLE_MODEL}&since_version=5")
    assert poll_future.status_code == 200
    assert poll_future.json() == {"changed": False, "version": 1}

    # Add second item (v2)
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "v-2",
        "name": "Item 2",
        "width_mm": 500,
        "depth_mm": 500,
        "height_mm": 500,
        "position": [1, 0, 0],
    })

    # Poll with since_version=1 -> changed!
    poll_changed = client.get(f"/scene?model={SAMPLE_MODEL}&since_version=1")
    assert poll_changed.status_code == 200
    res_changed = poll_changed.json()
    assert res_changed["changed"] is True
    assert res_changed["version"] == 2
    assert len(res_changed["placements"]) == 2


def test_history_ordering_and_actions(client):
    # 1. Add
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "hist-1",
        "name": "Sofa",
        "width_mm": 2000,
        "depth_mm": 900,
        "height_mm": 800,
        "author": "Alice",
        "position": [0, 0, 0],
    })

    # 2. Update
    client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "hist-1",
        "name": "Sofa Moved",
        "width_mm": 2000,
        "depth_mm": 900,
        "height_mm": 800,
        "author": "Bob",
        "position": [1, 0, 0],
    })

    # 3. Delete
    client.delete(f"/scene/placement?model={SAMPLE_MODEL}&instanceId=hist-1&author=Charlie")

    # Fetch history
    h_res = client.get(f"/scene/history?model={SAMPLE_MODEL}")
    assert h_res.status_code == 200
    history = h_res.json()
    assert len(history) == 3

    # Check newest first order
    assert [h["action"] for h in history] == ["delete", "update", "add"]
    assert [h["version"] for h in history] == [3, 2, 1]
    assert history[0]["author"] == "Charlie"
    assert history[1]["author"] == "Bob"
    assert history[2]["author"] == "Alice"
    for item in history:
        assert set(item.keys()) == {"version", "action", "instanceId", "name", "author", "at"}

    # Limit test
    h_limit = client.get(f"/scene/history?model={SAMPLE_MODEL}&limit=2").json()
    assert len(h_limit) == 2
    assert [h["action"] for h in h_limit] == ["delete", "update"]


def test_validations_and_rejections(client):
    # Illegal mount
    r_mount = client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "x-1",
        "width_mm": 100,
        "depth_mm": 100,
        "height_mm": 100,
        "mount": "hovering",
    })
    assert r_mount.status_code == 400
    assert "mount" in r_mount.json()["detail"].lower()

    # Negative/zero dimensions
    for bad_dim in [-10, 0]:
        r_dim = client.post("/scene/placement", json={
            "model": SAMPLE_MODEL,
            "instanceId": "x-1",
            "width_mm": bad_dim,
            "depth_mm": 100,
            "height_mm": 100,
            "mount": "floor",
        })
        assert r_dim.status_code == 400
        assert "positive" in r_dim.json()["detail"].lower()

    # Path traversal in model
    for bad_model in ["../secret.ifc", "models/../../etc/passwd"]:
        assert client.get(f"/scene?model={bad_model}").status_code == 400
        assert client.post("/scene/placement", json={"model": bad_model, "width_mm": 100, "depth_mm": 100, "height_mm": 100}).status_code == 400
        assert client.delete(f"/scene/placement?model={bad_model}&instanceId=x").status_code == 400
        assert client.get(f"/scene/history?model={bad_model}").status_code == 400


def test_max_placements_limit(client, monkeypatch):
    monkeypatch.setattr(scene, "MAX_PLACEMENTS_PER_MODEL", 3)

    for i in range(3):
        r = client.post("/scene/placement", json={
            "model": SAMPLE_MODEL,
            "instanceId": f"p-{i}",
            "width_mm": 100,
            "depth_mm": 100,
            "height_mm": 100,
        })
        assert r.status_code == 200

    # 4th addition rejected
    r_exceed = client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "p-extra",
        "width_mm": 100,
        "depth_mm": 100,
        "height_mm": 100,
    })
    assert r_exceed.status_code == 400
    assert "maximum" in r_exceed.json()["detail"].lower()

    # Updating one of the existing 3 items is still allowed
    r_update = client.post("/scene/placement", json={
        "model": SAMPLE_MODEL,
        "instanceId": "p-0",
        "width_mm": 150,
        "depth_mm": 150,
        "height_mm": 150,
    })
    assert r_update.status_code == 200


def test_concurrent_writes_20_threads(client):
    def post_worker(idx: int):
        payload = {
            "model": SAMPLE_MODEL,
            "instanceId": f"concurrent-{idx}",
            "name": f"Desk {idx}",
            "width_mm": 1200 + idx,
            "depth_mm": 700,
            "height_mm": 750,
            "mount": "floor",
            "position": [float(idx), 0.0, 1.0],
            "author": f"user-{idx}",
        }
        res = client.post("/scene/placement", json=payload)
        return res.status_code, res.json()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(post_worker, range(20)))

    # All 20 succeeded
    for status_code, _ in results:
        assert status_code == 200

    # Check scene has exactly 20 placements and version is 20
    scene_data = client.get(f"/scene?model={SAMPLE_MODEL}").json()
    assert scene_data["version"] == 20
    assert len(scene_data["placements"]) == 20
    ids = {p["instanceId"] for p in scene_data["placements"]}
    assert ids == {f"concurrent-{i}" for i in range(20)}
