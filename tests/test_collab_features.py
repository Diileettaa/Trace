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


def test_room_chat_and_direct_messages_are_threaded(tmp_path, monkeypatch):
    monkeypatch.setattr(collab, "_file", lambda: tmp_path / "collab.json")
    client = TestClient(app)
    client.post("/collab/message", json={"space_id": "R1", "text": "Room note", "author": "a@example.test", "role": "wall"})
    sent = client.post("/collab/direct", json={"recipient": "b@example.test", "author": "a@example.test", "text": "Private"})
    assert sent.status_code == 200
    assert all(m.get("thread") != "direct" or "a@example.test" in (m.get("author"), m.get("recipient")) for m in sent.json()["messages"])
    thread = client.get("/collab/direct", params={"person": "a@example.test", "with_person": "b@example.test"}).json()
    assert [message["text"] for message in thread] == ["Private"]
    room = client.get("/collab", params={"space_id": "R1"}).json()
    assert room["messages"][0]["text"] == "Room note"


def test_overlapping_bookings_keep_first_booking_and_expose_winner_contact(tmp_path, monkeypatch):
    monkeypatch.setattr(collab, "_file", lambda: tmp_path / "collab.json")
    client = TestClient(app)
    client.post("/collab/people", json={"name": "First", "trade": "wall", "email": "first@example.test", "phone": "123"})
    first = client.post("/collab/bookings", json={"space_id": "A1", "trade": "wall", "person": "first@example.test", "start": 100, "end": 200, "what": "Repair wall"})
    later = client.post("/collab/bookings", json={"space_id": "A1", "trade": "plumber", "person": "later@example.test", "start": 150, "end": 250, "what": "Install toilet"})
    assert first.status_code == later.status_code == 200
    booking = later.json()["bookings"][1]
    assert booking["conflict_with"] == later.json()["bookings"][0]["id"]
    assert booking["winner"]["person"] == "first@example.test"
