"""Construction workflow, ordering, change orders, budget, and project settings (Modules 3, 7, 9).

Features:
1. Work sequence rules (Module 3):
   - Plumber / electrician require room status != 'missing_wall'
   - Tiler requires plumber work in the room to have ended
   - Painter requires both electrician and tiler to have ended
   - GET /workflow/check & GET /workflow/blockers
2. Orders & delivery notifications (Module 7):
   - POST /orders & GET /orders & POST /orders/status
   - GET /calendar (unified deliveries + collab bookings)
   - GET /notifications & POST /notifications/read (with day-before delivery alerts)
3. Change orders & budget (Module 9):
   - POST /change-orders & POST /change-orders/decide (role=owner enforced, 403 otherwise)
   - GET /change-orders & GET /budget (furniture from scene + change orders)
4. Project settings & client view (Module 9):
   - GET /project/settings & POST /project/settings
"""
from __future__ import annotations

import datetime
import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from . import collab, config, scene

_lock = threading.RLock()

DEFAULT_PROJECT_SETTINGS: dict[str, str] = {
    "owner_view": "everything",
    "building_type": "historic",
    "status_note": "Demo: Historic building renovation",
}


def _file() -> Path:
    return config.CACHE_DIR / "workflow.json"


def load() -> dict[str, Any]:
    f = _file()
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            data.setdefault("orders", [])
            data.setdefault("notifications", [])
            data.setdefault("change_orders", [])
            data.setdefault("project_settings", DEFAULT_PROJECT_SETTINGS.copy())
            return data
        except (ValueError, OSError):
            pass
    return {
        "orders": [],
        "notifications": [],
        "change_orders": [],
        "project_settings": DEFAULT_PROJECT_SETTINGS.copy(),
    }


def _save(data: dict[str, Any]) -> None:
    f = _file()
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_time(val: Any) -> float:
    """Parse float timestamp or ISO date string into a UNIX timestamp."""
    if val is None or val == "":
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        pass

    try:
        # Date string like YYYY-MM-DD
        dt = datetime.datetime.fromisoformat(str(val))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


# =====================================================================
# 1. Work sequence rules (Module 3)
# =====================================================================

def check_workflow(
    space_id: str,
    trade: str,
    start: Any = None,
    end: Any = None,
) -> dict[str, Any]:
    """Check construction sequence constraints for a given trade in a space."""
    clean_trade = trade.strip().lower()
    start_ts = _parse_time(start)

    blockers: list[dict[str, str]] = []

    # Check room wall status in collab
    collab_data = collab.load()
    status_entry = collab_data.get("status", {}).get(space_id, {})
    current_status = status_entry.get("status") if isinstance(status_entry, dict) else None

    # Rule 1: Plumber and electrician require room status not missing_wall
    if clean_trade in ("plumber", "electrician"):
        if current_status == "missing_wall":
            blockers.append({
                "reason": f"Wall in {space_id} is not built yet – fix the wall before {clean_trade}",
                "needs_trade": "wall",
                "needs_status": "built",
            })

    # Relevant bookings in this room
    room_bookings = [b for b in collab_data.get("bookings", []) if b.get("space_id") == space_id]

    # Rule 2: Tiler requires plumber work in this room to be completed
    if clean_trade in ("tiler", "tiling"):
        ongoing_plumber = [
            b for b in room_bookings
            if b.get("trade") == "plumber" and float(b.get("end", 0.0)) > start_ts
        ]
        if ongoing_plumber:
            blockers.append({
                "reason": f"Plumber work in {space_id} is not finished yet – finish plumbing before tiling",
                "needs_trade": "plumber",
                "needs_status": "completed",
            })

    # Rule 3: Painter requires both electrician and tiler to have completed
    if clean_trade in ("painter", "painting"):
        ongoing_electrician = [
            b for b in room_bookings
            if b.get("trade") == "electrician" and float(b.get("end", 0.0)) > start_ts
        ]
        ongoing_tiler = [
            b for b in room_bookings
            if b.get("trade") in ("tiler", "tiling") and float(b.get("end", 0.0)) > start_ts
        ]
        if ongoing_electrician:
            blockers.append({
                "reason": f"Electrical work in {space_id} must be completed before painting",
                "needs_trade": "electrician",
                "needs_status": "completed",
            })
        if ongoing_tiler:
            blockers.append({
                "reason": f"Tiling work in {space_id} must be completed before painting",
                "needs_trade": "tiler",
                "needs_status": "completed",
            })

    return {
        "ok": len(blockers) == 0,
        "blockers": blockers,
    }


def get_all_blockers() -> list[dict[str, Any]]:
    """Scan all scheduled bookings across the project and return sequence violations."""
    collab_data = collab.load()
    bookings = collab_data.get("bookings", [])
    violations: list[dict[str, Any]] = []

    for b in bookings:
        res = check_workflow(
            space_id=b.get("space_id", ""),
            trade=b.get("trade", ""),
            start=b.get("start"),
            end=b.get("end"),
        )
        if not res["ok"]:
            violations.append({
                "booking_id": b.get("id"),
                "space_id": b.get("space_id"),
                "trade": b.get("trade"),
                "person": b.get("person"),
                "start": b.get("start"),
                "end": b.get("end"),
                "what": b.get("what"),
                "blockers": res["blockers"],
            })

    return violations


# =====================================================================
# 2. Orders & delivery notifications (Module 7)
# =====================================================================

def create_order(
    model: str,
    items: list[str] | str,
    supplier: str,
    delivery_date: str,
    deliver_to_space_id: str,
    notify_trades: list[str],
    author: str,
) -> dict[str, Any]:
    """Create a furniture order, resolve item prices from shared 3D scene,

    and post trade notifications.
    """
    if not supplier.strip():
        raise ValueError("Supplier name is required")
    if not delivery_date.strip():
        raise ValueError("Delivery date is required")

    # Resolve items from shared 3D scene
    all_scenes = scene.load_all_scenes()
    model_scene = all_scenes.get(model, {})
    placements = model_scene.get("placements", [])

    resolved_items = []
    if items == "all":
        resolved_items = [
            {
                "instanceId": p.get("instanceId"),
                "catalogId": p.get("catalogId"),
                "name": p.get("name"),
                "price_eur": float(p.get("price_eur", 0.0)),
                "space_id": p.get("space_id"),
            }
            for p in placements
        ]
    elif isinstance(items, list):
        target_ids = set(items)
        resolved_items = [
            {
                "instanceId": p.get("instanceId"),
                "catalogId": p.get("catalogId"),
                "name": p.get("name"),
                "price_eur": float(p.get("price_eur", 0.0)),
                "space_id": p.get("space_id"),
            }
            for p in placements
            if p.get("instanceId") in target_ids
        ]

    total_price = sum(item["price_eur"] for item in resolved_items)
    now = time.time()
    order_id = str(uuid.uuid4())

    order_record = {
        "id": order_id,
        "model": model,
        "items": resolved_items,
        "total_price_eur": round(total_price, 2),
        "supplier": supplier.strip(),
        "delivery_date": delivery_date.strip(),
        "deliver_to_space_id": deliver_to_space_id.strip(),
        "notify_trades": [t.strip().lower() for t in notify_trades],
        "author": author.strip(),
        "status": "ordered",  # ordered | shipped | delivered
        "created_at": now,
    }

    with _lock:
        data = load()
        data["orders"].append(order_record)

        # Generate notifications for each notified trade
        for t in order_record["notify_trades"]:
            notif = {
                "id": str(uuid.uuid4()),
                "trade": t,
                "text": f"Order {order_id[:8]} placed: delivery to {deliver_to_space_id} on {delivery_date} ({supplier})",
                "order_id": order_id,
                "created_at": now,
                "read": False,
            }
            data["notifications"].append(notif)

        _save(data)

    return order_record


def list_orders(model: str = "", status: str = "") -> list[dict[str, Any]]:
    data = load()
    orders = data.get("orders", [])
    if model:
        orders = [o for o in orders if o.get("model") == model]
    if status:
        orders = [o for o in orders if o.get("status") == status]
    return orders


def update_order_status(order_id: str, new_status: str) -> dict[str, Any]:
    valid_statuses = {"ordered", "shipped", "delivered"}
    clean_st = new_status.strip().lower()
    if clean_st not in valid_statuses:
        raise ValueError(f"Invalid order status '{new_status}'. Must be one of {valid_statuses}")

    with _lock:
        data = load()
        target = next((o for o in data["orders"] if o["id"] == order_id), None)
        if not target:
            raise KeyError(f"Order '{order_id}' not found")
        target["status"] = clean_st
        target["updated_at"] = time.time()
        _save(data)
        return target


def get_calendar(from_date: str = "", to_date: str = "") -> list[dict[str, Any]]:
    """Return unified schedule of order deliveries and contractor bookings."""
    events: list[dict[str, Any]] = []

    # 1. Deliveries from orders
    data = load()
    for o in data.get("orders", []):
        events.append({
            "date": o.get("delivery_date", ""),
            "kind": "delivery",
            "title": f"Delivery: {o.get('supplier')} ({len(o.get('items', []))} items)",
            "space_id": o.get("deliver_to_space_id", ""),
            "trades": o.get("notify_trades", []),
            "order_id": o.get("id"),
        })

    # 2. Work from collab bookings
    collab_data = collab.load()
    for b in collab_data.get("bookings", []):
        start_ts = float(b.get("start", 0.0))
        date_str = (
            datetime.datetime.fromtimestamp(start_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
            if start_ts > 0
            else ""
        )
        events.append({
            "date": date_str,
            "kind": "work",
            "title": f"Work: {b.get('trade', '').capitalize()} – {b.get('what', '')} ({b.get('person', '')})",
            "space_id": b.get("space_id", ""),
            "trades": [b.get("trade", "")],
            "booking_id": b.get("id"),
        })

    # Apply date filters
    if from_date:
        events = [e for e in events if e["date"] >= from_date]
    if to_date:
        events = [e for e in events if e["date"] <= to_date]

    events.sort(key=lambda e: (e.get("date", ""), e.get("kind", "")))
    return events


def list_notifications(trade: str = "") -> list[dict[str, Any]]:
    """Return notifications for a trade, computing day-before delivery reminders on the fly."""
    clean_trade = trade.strip().lower()
    data = load()
    notifs = [
        dict(n) for n in data.get("notifications", [])
        if not clean_trade or n.get("trade") == clean_trade
    ]

    # Calculate day-before delivery reminder on request
    today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    tomorrow = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    for o in data.get("orders", []):
        if o.get("status") in ("ordered", "shipped"):
            deliv = o.get("delivery_date", "")
            # If delivery is tomorrow (or today/within 24 hours)
            if deliv == tomorrow or deliv == today_str:
                for t in o.get("notify_trades", []):
                    if not clean_trade or t == clean_trade:
                        reminder_id = f"reminder-{o['id']}-{t}"
                        # Check if already added
                        if not any(n.get("id") == reminder_id for n in notifs):
                            notifs.insert(0, {
                                "id": reminder_id,
                                "trade": t,
                                "text": f"Delivery reminder: Order {o['id'][:8]} arrives on {deliv} at {o.get('deliver_to_space_id')}",
                                "created_at": time.time(),
                                "read": False,
                                "is_reminder": True,
                            })

    notifs.sort(key=lambda n: n.get("created_at", 0.0), reverse=True)
    return notifs


def mark_notification_read(notification_id: str) -> bool:
    with _lock:
        data = load()
        found = False
        for n in data.get("notifications", []):
            if n.get("id") == notification_id:
                n["read"] = True
                found = True
                break
        if found:
            _save(data)
        return found


# =====================================================================
# 3. Change orders & budget (Module 9)
# =====================================================================

def create_change_order(
    space_id: str,
    trade: str,
    author: str,
    description: str,
    amount_eur: float,
) -> dict[str, Any]:
    """Create a client change order requiring owner approval."""
    if not description.strip():
        raise ValueError("Description is required")
    if amount_eur < 0:
        raise ValueError("Amount in EUR cannot be negative")

    record = {
        "id": str(uuid.uuid4()),
        "space_id": space_id.strip(),
        "trade": trade.strip().lower(),
        "author": author.strip(),
        "description": description.strip(),
        "amount_eur": round(float(amount_eur), 2),
        "status": "pending",  # pending | approved | rejected
        "decision_by": None,
        "decision_at": None,
        "created_at": time.time(),
    }

    with _lock:
        data = load()
        data["change_orders"].append(record)
        _save(data)

    return record


def decide_change_order(
    order_id: str,
    decision: str,
    by: str,
    role: str,
) -> dict[str, Any]:
    """Approve or reject a change order. Strictly requires role='owner'."""
    clean_role = role.strip().lower()
    if clean_role != "owner":
        raise PermissionError("Only the owner can approve or reject change orders")

    clean_dec = decision.strip().lower()
    if clean_dec not in ("approve", "reject"):
        raise ValueError("Decision must be 'approve' or 'reject'")

    new_status = "approved" if clean_dec == "approve" else "rejected"

    with _lock:
        data = load()
        target = next((c for c in data.get("change_orders", []) if c["id"] == order_id), None)
        if not target:
            raise KeyError(f"Change order '{order_id}' not found")

        target["status"] = new_status
        target["decision_by"] = by.strip()
        target["decision_at"] = time.time()
        _save(data)
        return target


def list_change_orders(space_id: str = "", status: str = "") -> list[dict[str, Any]]:
    data = load()
    cos = data.get("change_orders", [])
    if space_id:
        cos = [c for c in cos if c.get("space_id") == space_id]
    if status:
        cos = [c for c in cos if c.get("status") == status]
    return cos


def get_budget() -> dict[str, float]:
    """Compute overall budget breakdown across 3D furniture and change orders."""
    # 1. Furniture total from all 3D placements
    all_scenes = scene.load_all_scenes()
    furniture_total = 0.0
    for s in all_scenes.values():
        for p in s.get("placements", []):
            furniture_total += float(p.get("price_eur", 0.0))

    # 2. Approved & pending change orders
    data = load()
    cos = data.get("change_orders", [])
    approved_cos = sum(c["amount_eur"] for c in cos if c.get("status") == "approved")
    pending_cos = sum(c["amount_eur"] for c in cos if c.get("status") == "pending")

    return {
        "furniture_total": round(furniture_total, 2),
        "approved_change_orders": round(approved_cos, 2),
        "pending_change_orders": round(pending_cos, 2),
        "total": round(furniture_total + approved_cos, 2),
    }


# =====================================================================
# 4. Project settings & client transparency (Module 9)
# =====================================================================

def get_project_settings() -> dict[str, str]:
    data = load()
    return data.get("project_settings", DEFAULT_PROJECT_SETTINGS.copy())


def update_project_settings(settings: dict[str, Any]) -> dict[str, str]:
    owner_view = settings.get("owner_view", "everything")
    if owner_view not in ("everything", "final_and_questions"):
        raise ValueError("owner_view must be 'everything' or 'final_and_questions'")

    building_type = settings.get("building_type", "historic")
    if building_type not in ("historic", "new", "renovation"):
        raise ValueError("building_type must be 'historic', 'new', or 'renovation'")

    status_note = str(settings.get("status_note", "")).strip()

    updated = {
        "owner_view": owner_view,
        "building_type": building_type,
        "status_note": status_note,
    }

    with _lock:
        data = load()
        data["project_settings"] = updated
        _save(data)

    return updated
