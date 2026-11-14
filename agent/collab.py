"""Small file-backed collaboration store for the demo deployment."""
from __future__ import annotations

import json
import threading
import time
import uuid
from . import config

STATUSES = ["built", "missing_wall", "pending"]
TRADES = ["architect", "electrician", "plumber", "floor", "wall", "owner"]
_lock = threading.Lock()

def _file():
    return config.CACHE_DIR / "collab.json"

def load() -> dict:
    f = _file()
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            for key, default in (("status", {}), ("messages", []), ("people", {}), ("bookings", [])):
                data.setdefault(key, default)
            return data
        except (ValueError, OSError):
            pass
    return {"status": {}, "messages": [], "people": {}, "bookings": []}

def _save(data: dict) -> None:
    f = _file(); f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

def register_person(name: str, trade: str, email: str, phone: str) -> dict:
    name, email = name.strip(), email.strip().lower()
    if not name or "@" not in email or not phone.strip(): raise ValueError("Name, valid email and phone are required")
    if trade not in TRADES: raise ValueError(f"trade must be one of {TRADES}")
    with _lock:
        data = load(); person = {"id": email, "name": name, "trade": trade, "email": email, "phone": phone.strip()}
        data["people"][email] = person; _save(data)
    return person

def people() -> list[dict]: return list(load()["people"].values())

def set_status(space_id: str, status: str, author: str = "") -> dict:
    if status not in STATUSES: raise ValueError(f"status must be one of {STATUSES}")
    with _lock:
        data = load(); data["status"][space_id] = {"status": status, "author": author, "ts": time.time()}
        data["messages"].append({"space_id": space_id, "author": author, "role": "system", "ts": time.time(), "text": f"Status changed to {status}", "changed": True})
        _save(data)
    return data

def post_message(space_id: str, text: str, author: str = "", role: str = "", notify: list[str] | None = None, attachment: str = "") -> dict:
    if not text.strip() and not attachment: raise ValueError("message text or image attachment is required")
    if attachment and len(attachment) > 12_000_000: raise ValueError("image attachment is too large")
    with _lock:
        data = load(); data["messages"].append({"space_id": space_id, "author": author, "role": role, "text": text.strip(), "notify": notify or [], "attachment": attachment or None, "ts": time.time(), "changed": True})
        _save(data)
    return data

def post_direct(recipient: str, text: str, author: str = "", attachment: str = "") -> dict:
    if not recipient or recipient == author: raise ValueError("Choose another recipient")
    if not text.strip() and not attachment: raise ValueError("message text or image attachment is required")
    if attachment and len(attachment) > 12_000_000: raise ValueError("image attachment is too large")
    with _lock:
        data = load(); data["messages"].append({"id": uuid.uuid4().hex, "thread": "direct", "author": author, "recipient": recipient, "text": text.strip(), "attachment": attachment or None, "ts": time.time()})
        _save(data)
    return data

def book(space_id: str, trade: str, person: str, start: float, end: float, what: str) -> dict:
    if trade not in TRADES or not what.strip() or end <= start: raise ValueError("A valid trade, activity and end after start are required")
    with _lock:
        data = load(); overlaps = [b for b in data["bookings"] if b["space_id"] == space_id and start < b["end"] and end > b["start"]]
        winner = min(overlaps, key=lambda b: b["created_at"]) if overlaps else None
        booking = {"id": uuid.uuid4().hex, "space_id": space_id, "trade": trade, "person": person, "start": start, "end": end, "what": what.strip(), "created_at": time.time(), "demo": False, "conflict_with": winner["id"] if winner else None}
        if winner: booking["winner"] = winner
        data["bookings"].append(booking); _save(data)
    return booking

def for_space(space_id: str | None, viewer: str | None = None) -> dict:
    data = load()
    messages = data["messages"]
    if viewer:
        messages = [m for m in messages if m.get("thread") != "direct" or viewer in (m.get("author"), m.get("recipient"))]
    if space_id:
        messages = [m for m in messages if m.get("space_id") == space_id or (m.get("thread") == "direct" and viewer in (m.get("author"), m.get("recipient")))]
    return {"status": {k:v for k,v in data["status"].items() if not space_id or k == space_id}, "messages": messages, "people": list(data["people"].values()), "bookings": [b for b in data["bookings"] if not space_id or b["space_id"] == space_id]}
