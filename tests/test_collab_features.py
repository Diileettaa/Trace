from fastapi.testclient import TestClient

from agent import collab
from agent.app import app


def test_contact_registration_persists_and_validates(tmp_path, monkeypatch):
    monkeypatch.setattr(collab, "_file", lambda: tmp_path / "collab.json")
    client = TestClient(app)
    response = client.post("/collab/people", json={"name": "Alex", "trade": "wall", "email": "ALEX@example.test", "phone": "+1 555"})
    assert response.status_code == 200
    assert response.json()["id"] == "alex@example.test"
    assert client.get("/collab/people").json()[0]["name"] == "Alex"
    assert client.post("/collab/people", json={"name": "A", "trade": "robot", "email": "a@b.test", "phone": "1"}).status_code == 400
