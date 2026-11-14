"""Seed demo collaboration, 3D scene, and document store data for presentation models.

Fills demo data for:
1. IFC model and Swiss Dwellings plan:
   - 3 room statuses (built / missing_wall / pending)
   - 1-2 messages per room from different trades (architect, plumber, electrician)
   - 2 shared furniture placements in 3D scene (via agent.scene.save_placement)
   - All text and names start with "Demo: "
2. Shared document store:
   - Ingests tests/fixtures/emails/*.eml (5 sample emails: two revisions, unknown sender permit,
     forwarded duplicate, same revision conflict)
   - Yields document statuses: Current (latest), Replaced (superseded), Needs a decision (conflict),
     and Waiting for approval (pending)
   - Target project is named "Demo project"
   - Idempotent: only imported when not already present; cleaned on --reset
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

# Ensure trace project root is in sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import collab, scene  # noqa: E402

logger = logging.getLogger("trace.seed")

DEMO_PREFIX = "Demo: "
DEMO_DOCS_PROJECT = "Demo project"

DEMO_IFC_MODEL = "data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc"
DEMO_IFC_PLAN = "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf"
DEMO_IFC_ROOMS = [
    {
        "space_id": "1mz8vdH3SNWu6rQ3uwkLXL",
        "name": "ESIK (57-2)",
        "status": "built",
        "messages": [
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Entryway wall finishes and electrical fittings signed off.",
            },
            {
                "author": "Demo: Charlie Electrician",
                "role": "electrician",
                "text": "Demo: Sub-panel junction box tested and labeled according to diagram.",
            },
        ],
    },
    {
        "space_id": "3nzbtvC0UUFkkrjEvNjcXt",
        "name": "ELUTUBA+KÖÖK (57-1)",
        "status": "missing_wall",
        "messages": [
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Drywall partition frame missing between kitchen and living zone.",
            },
            {
                "author": "Demo: Bob Plumber",
                "role": "plumber",
                "text": "Demo: Sink water supply rough-in complete; do not close wall before inspection.",
            },
        ],
    },
    {
        "space_id": "1hRdD63Mo$FJyGECMZH6V_",
        "name": "MAGAMISTUBA (57-3)",
        "status": "pending",
        "messages": [
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Bedroom acoustic insulation review pending site inspector approval.",
            },
            {
                "author": "Demo: Charlie Electrician",
                "role": "electrician",
                "text": "Demo: Dual wall sconce conduits laid; switch box awaiting drywall mount.",
            },
        ],
    },
]

DEMO_SWISS_PLAN = "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf"
DEMO_SWISS_ROOMS = [
    {
        "space_id": "2.01",
        "name": "Zimmer 2.01",
        "status": "built",
        "messages": [
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Bedroom oak parquet flooring and baseboards installed and protected.",
            },
            {
                "author": "Demo: Charlie Electrician",
                "role": "electrician",
                "text": "Demo: All bedroom wall sockets energized and tested for polarity.",
            },
        ],
    },
    {
        "space_id": "2.02",
        "name": "Küche 2.02",
        "status": "missing_wall",
        "messages": [
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Kitchen service shaft partition wall unbuilt; structural check required.",
            },
            {
                "author": "Demo: Bob Plumber",
                "role": "plumber",
                "text": "Demo: Drainage stack connected; pending wall framing inspection before seal.",
            },
        ],
    },
    {
        "space_id": "2.03",
        "name": "Bad 2.03",
        "status": "pending",
        "messages": [
            {
                "author": "Demo: Bob Plumber",
                "role": "plumber",
                "text": "Demo: Shower basin waterproofing membrane inspection scheduled for tomorrow.",
            },
            {
                "author": "Demo: Alice Architect",
                "role": "architect",
                "text": "Demo: Ceramic tile delivery confirmed; tiling commences once waterproofing passes.",
            },
        ],
    },
]

DEMO_PLACEMENTS = [
    {
        "instanceId": "demo-placement-desk",
        "catalogId": "work-desk",
        "name": "Demo: Birch work desk",
        "width_mm": 1400.0,
        "depth_mm": 700.0,
        "height_mm": 750.0,
        "price_eur": 499.0,
        "material": "birch plywood",
        "color_hex": "#d0b78f",
        "mount": "floor",
        "rotationDeg": 0.0,
        "author": "Demo: Alice Architect",
        "role": "architect",
        "space_id": "1hRdD63Mo$FJyGECMZH6V_",
        "position": [1700.0, 900.0, 0.0],
    },
    {
        "instanceId": "demo-placement-table",
        "catalogId": "dining-table",
        "name": "Demo: Oak dining table",
        "width_mm": 1600.0,
        "depth_mm": 900.0,
        "height_mm": 750.0,
        "price_eur": 549.0,
        "material": "oak veneer",
        "color_hex": "#9a6b43",
        "mount": "floor",
        "rotationDeg": 90.0,
        "author": "Demo: Alice Architect",
        "role": "architect",
        "space_id": "3nzbtvC0UUFkkrjEvNjcXt",
        "position": [1650.0, 700.0, 0.0],
    },
]


def clear_demo_data() -> dict[str, int]:
    """Clean out all Demo data (statuses, messages, people, placements, demo docs)."""
    # 1. Collab store
    all_demo_sids = {r["space_id"] for r in DEMO_IFC_ROOMS + DEMO_SWISS_ROOMS}
    data = collab.load()

    orig_status_count = len(data.get("status", {}))
    new_status = {
        sid: s
        for sid, s in data.get("status", {}).items()
        if not str(s.get("author", "")).startswith(DEMO_PREFIX) and sid not in all_demo_sids
    }
    data["status"] = new_status
    status_cleared = orig_status_count - len(new_status)

    orig_msg_count = len(data.get("messages", []))
    new_msgs = [
        m
        for m in data.get("messages", [])
        if not str(m.get("text", "")).startswith(DEMO_PREFIX)
        and not str(m.get("author", "")).startswith(DEMO_PREFIX)
        and m.get("space_id") not in all_demo_sids
    ]
    data["messages"] = new_msgs
    msgs_cleared = orig_msg_count - len(new_msgs)

    orig_people_count = len(data.get("people", {}))
    new_people = {
        email: p
        for email, p in data.get("people", {}).items()
        if not str(p.get("name", "")).startswith(DEMO_PREFIX)
    }
    data["people"] = new_people
    people_cleared = orig_people_count - len(new_people)

    orig_bookings_count = len(data.get("bookings", []))
    new_bookings = [
        b
        for b in data.get("bookings", [])
        if not str(b.get("what", "")).startswith(DEMO_PREFIX)
        and not str(b.get("person", "")).startswith(DEMO_PREFIX)
        and b.get("space_id") not in all_demo_sids
    ]
    data["bookings"] = new_bookings
    bookings_cleared = orig_bookings_count - len(new_bookings)

    collab._save(data)

    # 2. Scene store
    all_scenes = scene.load_all_scenes()
    placements_cleared = 0
    for s in all_scenes.values():
        orig_p_count = len(s.get("placements", []))
        s["placements"] = [
            p
            for p in s.get("placements", [])
            if not str(p.get("name", "")).startswith(DEMO_PREFIX)
            and not str(p.get("author", "")).startswith(DEMO_PREFIX)
            and not str(p.get("instanceId", "")).startswith("demo-")
        ]
        placements_cleared += orig_p_count - len(s["placements"])

        s["history"] = [
            h
            for h in s.get("history", [])
            if not str(h.get("name", "")).startswith(DEMO_PREFIX)
            and not str(h.get("author", "")).startswith(DEMO_PREFIX)
            and not str(h.get("instanceId", "")).startswith("demo-")
        ]

    scene._save_all_scenes(all_scenes)

    # 3. Document store (Demo project)
    docs_cleared = 0
    try:
        from agent import docs_tools

        store = docs_tools.store()
        with store.lock:
            rows = store.db.execute(
                "SELECT id, message_id FROM documents WHERE project=?",
                (DEMO_DOCS_PROJECT,),
            ).fetchall()
            doc_ids = [r["id"] for r in rows]
            mids = [r["message_id"] for r in rows if r["message_id"]]
            docs_cleared = len(doc_ids)

            if doc_ids:
                q_marks = ",".join("?" for _ in doc_ids)
                store.db.execute(f"DELETE FROM documents WHERE id IN ({q_marks})", doc_ids)
                store.db.execute(f"DELETE FROM events WHERE doc_id IN ({q_marks})", doc_ids)
                store.db.execute(f"DELETE FROM docs_fts WHERE rowid IN ({q_marks})", doc_ids)

            has_mail_seen = store.db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_seen'").fetchone()
            if has_mail_seen:
                if mids:
                    m_marks = ",".join("?" for _ in mids)
                    store.db.execute(f"DELETE FROM mail_seen WHERE message_id IN ({m_marks})", mids)
                store.db.execute("DELETE FROM mail_seen WHERE subject LIKE '%[project:demo]%'")
            store.db.commit()
    except Exception as e:
        logger.warning("Failed to clear demo docs store: %s", e)

    # 4. Workflow store (orders, change orders, notifications, settings)
    orders_cleared = 0
    cos_cleared = 0
    try:
        from agent import workflow

        wdata = workflow.load()
        orig_o = len(wdata.get("orders", []))
        wdata["orders"] = [
            o for o in wdata.get("orders", [])
            if not str(o.get("supplier", "")).startswith(DEMO_PREFIX)
            and not str(o.get("author", "")).startswith(DEMO_PREFIX)
        ]
        orders_cleared = orig_o - len(wdata["orders"])

        orig_co = len(wdata.get("change_orders", []))
        wdata["change_orders"] = [
            c for c in wdata.get("change_orders", [])
            if not str(c.get("description", "")).startswith(DEMO_PREFIX)
            and not str(c.get("author", "")).startswith(DEMO_PREFIX)
        ]
        cos_cleared = orig_co - len(wdata["change_orders"])

        wdata["notifications"] = [
            n for n in wdata.get("notifications", [])
            if not str(n.get("text", "")).startswith(DEMO_PREFIX)
            and "Demo:" not in str(n.get("text", ""))
        ]
        wdata["project_settings"] = workflow.DEFAULT_PROJECT_SETTINGS.copy()
        workflow._save(wdata)
    except Exception as e:
        logger.warning("Failed to clear demo workflow store: %s", e)

    # 5. Media & item verification statuses
    media_cleared = 0
    try:
        from agent import media

        records = media.load_records()
        new_records = [
            r for r in records
            if not str(r.get("author", "")).endswith("· Demo")
            and not str(r.get("author", "")).startswith(DEMO_PREFIX)
        ]
        media_cleared = len(records) - len(new_records)
        media._save_records(new_records)

        statuses = media.load_item_statuses()
        new_statuses = {
            k: v for k, v in statuses.items()
            if not str(v.get("author", "")).endswith("· Demo")
            and not str(v.get("author", "")).startswith(DEMO_PREFIX)
        }
        media._save_item_statuses(new_statuses)
    except Exception as e:
        logger.warning("Failed to clear demo media: %s", e)

    return {
        "status_cleared": status_cleared,
        "messages_cleared": msgs_cleared,
        "people_cleared": people_cleared,
        "placements_cleared": placements_cleared,
        "docs_cleared": docs_cleared,
        "orders_cleared": orders_cleared,
        "change_orders_cleared": cos_cleared,
    }


def seed_demo_data(reset: bool = False, seed_docs: bool = True) -> dict[str, Any]:
    """Seed collaboration rooms, messages, trades, 3D furniture, and document store."""
    if reset:
        clear_demo_data()

    # Register demo trade personas
    collab.register_person("Demo: Alice Architect", "architect", "alice@demo.trace.local", "+358 40 1000001")
    collab.register_person("Demo: Bob Plumber", "plumber", "bob@demo.trace.local", "+358 40 1000002")
    collab.register_person("Demo: Charlie Electrician", "electrician", "charlie@demo.trace.local", "+358 40 1000003")
    collab.register_person("Demo: Dave Electrician", "electrician", "dave@demo.trace.local", "+358 40 1000004")
    collab.register_person("Demo: Frank Plumber", "plumber", "frank@demo.trace.local", "+358 40 1000005")
    collab.register_person("Demo: Grace Floor", "floor", "grace@demo.trace.local", "+358 40 1000006")

    now = time.time()

    # Seed demo past and active bookings for contractor recommendation
    collab_check = collab.load()
    existing_b = collab_check.get("bookings", [])
    if not any(str(b.get("person", "")).startswith("Demo:") for b in existing_b) or reset:
        collab.book("2.03", "plumber", "Demo: Bob Plumber", now - 86400 * 5, now - 86400 * 5 + 7200, "Demo: Rough-in sanitary pipes")
        collab.book("3nzbtvC0UUFkkrjEvNjcXt", "plumber", "Demo: Bob Plumber", now - 86400 * 2, now - 86400 * 2 + 7200, "Demo: Install sink supply valves")
        collab.book("2.01", "plumber", "Demo: Frank Plumber", now - 86400 * 10, now - 86400 * 10 + 3600, "Demo: Radiator valve check")

        collab.book("1mz8vdH3SNWu6rQ3uwkLXL", "electrician", "Demo: Charlie Electrician", now - 86400 * 3, now - 86400 * 3 + 7200, "Demo: Sub-panel wiring")
        collab.book("2.01", "electrician", "Demo: Charlie Electrician", now - 86400, now - 86400 + 7200, "Demo: Power outlet installation")
        collab.book("1hRdD63Mo$FJyGECMZH6V_", "electrician", "Demo: Dave Electrician", now - 86400 * 4, now - 86400 * 4 + 3600, "Demo: Conduits")
        # Active booking right now for Dave (making Dave currently busy)
        collab.book("3nzbtvC0UUFkkrjEvNjcXt", "electrician", "Demo: Dave Electrician", now - 1800, now + 1800, "Demo: Urgent circuit breaker replacement")

        collab.book("2.01", "floor", "Demo: Grace Floor", now - 86400 * 1, now - 86400 * 1 + 14400, "Demo: Parquet floor leveling")
    room_count = 0
    msg_count = 0

    # Seed rooms and messages for IFC & Swiss plans
    all_room_specs = DEMO_IFC_ROOMS + DEMO_SWISS_ROOMS
    existing_collab = collab.load()
    existing_statuses = existing_collab.get("status", {})

    for spec in all_room_specs:
        sid = spec["space_id"]
        stat = spec["status"]
        first_author = spec["messages"][0]["author"]

        # Only update status if not already set or resetting
        if sid not in existing_statuses or reset:
            data = collab.load()
            data["status"][sid] = {"status": stat, "author": first_author, "ts": now}
            data["messages"].append({
                "space_id": sid,
                "author": first_author,
                "role": "system",
                "ts": now,
                "text": f"Demo: Status recorded as {stat}",
                "changed": True,
            })
            collab._save(data)
            room_count += 1

            # Post trade messages
            for msg in spec["messages"]:
                collab.post_message(
                    space_id=sid,
                    text=msg["text"],
                    author=msg["author"],
                    role=msg["role"],
                )
                msg_count += 1
        else:
            room_count += 1
            msg_count += len(spec["messages"])

    # Seed 2 shared 3D furniture placements
    placement_count = 0
    current_scene = scene.load_all_scenes().get(DEMO_IFC_MODEL, {})
    existing_p_ids = {p.get("instanceId") for p in current_scene.get("placements", [])}

    for p_spec in DEMO_PLACEMENTS:
        if p_spec["instanceId"] not in existing_p_ids or reset:
            scene.save_placement(DEMO_IFC_MODEL, p_spec)
        placement_count += 1

    # Seed document store from tests/fixtures/emails/*.eml
    docs_seeded = 0
    if seed_docs:
        try:
            from agent import docs_tools, mail_ingest

            store = docs_tools.store()
            existing_docs = store.list(project=DEMO_DOCS_PROJECT)
            if not existing_docs:
                emails_dir = _ROOT / "tests" / "fixtures" / "emails"
                email_files = sorted(emails_dir.glob("*.eml"))
                demo_allow = ["@arkkitehti.example", "@rakenne.example"]
                for eml in email_files:
                    raw = eml.read_bytes()
                    mail_ingest.ingest_message(raw, store, project=DEMO_DOCS_PROJECT, allow=demo_allow)
                docs_seeded = len(store.list(project=DEMO_DOCS_PROJECT))
            else:
                docs_seeded = len(existing_docs)
        except Exception as e:
            logger.warning("Failed to seed document store: %s", e)

    # Seed workflow data (orders, change orders, project settings)
    orders_seeded = 0
    cos_seeded = 0
    try:
        from agent import workflow

        wdata = workflow.load()
        existing_cos = wdata.get("change_orders", [])
        if not existing_cos or reset:
            co1 = workflow.create_change_order(
                space_id="1hRdD63Mo$FJyGECMZH6V_",
                trade="architect",
                author="Demo: Alice Architect",
                description="Demo: Custom oak built-in wardrobe",
                amount_eur=1250.0,
            )
            workflow.decide_change_order(
                order_id=co1["id"],
                decision="approve",
                by="Demo: Owner",
                role="owner",
            )
            workflow.create_change_order(
                space_id="3nzbtvC0UUFkkrjEvNjcXt",
                trade="plumber",
                author="Demo: Bob Plumber",
                description="Demo: Concealed pipe routing and valve upgrade",
                amount_eur=480.0,
            )
            cos_seeded = 2
        else:
            cos_seeded = len(existing_cos)

        existing_orders = wdata.get("orders", [])
        if not existing_orders or reset:
            workflow.create_order(
                model=DEMO_IFC_MODEL,
                items=["demo-placement-desk"],
                supplier="Demo: Nordic Furniture AB",
                delivery_date="2026-11-20",
                deliver_to_space_id="1hRdD63Mo$FJyGECMZH6V_",
                notify_trades=["architect", "electrician"],
                author="Demo: Alice Architect",
            )
            orders_seeded = 1
        else:
            orders_seeded = len(existing_orders)

        workflow.update_project_settings({
            "owner_view": "everything",
            "building_type": "historic",
            "status_note": "Demo: Historic building renovation",
        })
    except Exception as e:
        logger.warning("Failed to seed workflow data: %s", e)

    # Seed Gigi workbench on-site verification photos & item statuses (Brief 31 item 4)
    media_seeded = 0
    try:
        from agent import engine_adapter, media

        img_dir = _ROOT / "design" / "gigi" / "src" / "assets" / "images"
        if img_dir.is_dir():
            wc_std_f = img_dir / "wc_installed_standard_1794668063424.jpg"
            wc_acc_f = img_dir / "wc_installed_accessible_1794668064308.jpg"
            wc_rough_f = img_dir / "wc_rough_in_pipes_1794668065164.jpg"
            door_f = img_dir / "site_photo_fire_damper_1794662438641.jpg"  # Gigi uses it for the fire door frame
            duct_f = img_dir / "site_photo_hvac_duct_1794662437069.jpg"
            damper_f = img_dir / "site_photo_fire_damper_1794662438641.jpg"

            wc_std = wc_std_f.read_bytes() if wc_std_f.is_file() else b""
            wc_acc = wc_acc_f.read_bytes() if wc_acc_f.is_file() else b""
            wc_rough = wc_rough_f.read_bytes() if wc_rough_f.is_file() else b""
            door_ph = door_f.read_bytes() if door_f.is_file() else b""
            duct_img = duct_f.read_bytes() if duct_f.is_file() else b""
            damper_img = damper_f.read_bytes() if damper_f.is_file() else b""

            # 1. Tallinn (esplanades plan PDF)
            ans_t = engine_adapter.answer(DEMO_IFC_PLAN, "How many doors are on this floor?")  # the Tallinn IFC is architecture only: no toilets modelled
            t_items = ans_t.get("items", [])
            if len(t_items) >= 3:
                id1 = t_items[0]["id"]
                id2 = t_items[1]["id"]
                id3 = t_items[2]["id"]

                # 1st door: Installed + wc_installed_standard (M. Lindqvist · Demo)
                if door_ph:
                    media.save_media("door_installed.jpg", door_ph, space_id=t_items[0].get("space_id") or "", item_id=id1, status="Installed", author="M. Lindqvist · Demo", role="plumber", note="Door installed, frame grouted, smoke seals checked")
                    media_seeded += 1

                # 2nd door: In Progress (no photo)
                media.update_item_status(item_id=id2, status="In Progress", path=DEMO_IFC_PLAN, space_id=t_items[1].get("space_id") or "", author="Demo inspector · Demo", note="Unverified: no site photo yet.")

                # 3rd door: Issue Reported + wc_installed_accessible (K. Korhonen · Demo)
                if door_ph:
                    media.save_media("door_issue.jpg", door_ph, space_id=t_items[2].get("space_id") or "", item_id=id3, status="Issue Reported", author="K. Korhonen · Demo", role="inspector", note="Clear opening 865 mm, 35 mm short of the 900 mm accessible minimum")
                    media_seeded += 1

            # 2. Swiss site1000
            ans_s = engine_adapter.answer(DEMO_SWISS_PLAN, "How many toilets?")
            s_items = ans_s.get("items", [])
            if len(s_items) >= 2:
                if wc_std:
                    media.save_media("wc_installed_standard_swiss.jpg", wc_std, space_id=s_items[0].get("space_id") or "", item_id=s_items[0]["id"], status="Installed", author="M. Lindqvist · Demo", role="plumber", note="Standard Wall-Hung WC installed on tiled pre-wall")
                    media_seeded += 1
                if wc_rough:
                    media.save_media("wc_rough_in_pipes_swiss.jpg", wc_rough, space_id=s_items[1].get("space_id") or "", item_id=s_items[1]["id"], status="In Progress", author="Bob Plumber · Demo", role="plumber", note="Rough-in connections only (pre-wall open)")
                    media_seeded += 1

            # 3. 2 Duct photos
            if duct_img:
                media.save_media("site_photo_hvac_duct.jpg", duct_img, space_id="1hRdD63Mo$FJyGECMZH6V_", item_id="hvac-duct-demo", status="Installed", author="Mikko Lindqvist · Demo", role="MEP Lead", note="Supply duct SD-204 installed")
                media_seeded += 1
            if damper_img:
                media.save_media("site_photo_fire_damper.jpg", damper_img, space_id="1hRdD63Mo$FJyGECMZH6V_", item_id="hvac-damper-demo", status="Installed", author="Mikko Lindqvist · Demo", role="MEP Lead", note="Motorized fire damper installed")
                media_seeded += 1
    except Exception as e:
        logger.warning("Failed to seed Gigi workbench demo media: %s", e)

    return {
        "rooms_seeded": room_count,
        "messages_seeded": msg_count,
        "placements_seeded": placement_count,
        "docs_seeded": docs_seeded,
        "orders_seeded": orders_seeded,
        "change_orders_seeded": cos_seeded,
        "media_seeded": media_seeded,
        "ifc_model": DEMO_IFC_MODEL,
        "ifc_plan": DEMO_IFC_PLAN,
        "swiss_plan": DEMO_SWISS_PLAN,
        "docs_project": DEMO_DOCS_PROJECT,
    }


def main():
    parser = argparse.ArgumentParser(description="Seed demo room collaboration, 3D scene, and document store data.")
    parser.add_argument("--reset", action="store_true", help="Clear all Demo data before seeding")
    parser.add_argument("--clear-only", action="store_true", help="Clear all Demo data without re-seeding")
    args = parser.parse_args()

    if args.clear_only:
        cleared = clear_demo_data()
        print(f"Cleared demo data: {cleared}")
        return

    res = seed_demo_data(reset=args.reset)
    print("Demo seed complete:")
    print(f"  - Rooms with status: {res['rooms_seeded']}")
    print(f"  - Messages recorded: {res['messages_seeded']}")
    print(f"  - 3D placements:     {res['placements_seeded']}")
    print(f"  - Docs filed:        {res.get('docs_seeded', 0)} in project '{res.get('docs_project')}'")
    print(f"  - Orders created:    {res.get('orders_seeded', 0)}")
    print(f"  - Change orders:     {res.get('change_orders_seeded', 0)}")
    print(f"  - Target IFC model:  {res['ifc_model']}")
    print(f"  - Target Swiss plan: {res['swiss_plan']}")


if __name__ == "__main__":
    main()
