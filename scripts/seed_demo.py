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

            if mids:
                m_marks = ",".join("?" for _ in mids)
                store.db.execute(f"DELETE FROM mail_seen WHERE message_id IN ({m_marks})", mids)

            store.db.execute("DELETE FROM mail_seen WHERE subject LIKE '%[project:demo]%'")
            store.db.commit()
    except Exception as e:
        logger.warning("Failed to clear demo docs store: %s", e)

    return {
        "status_cleared": status_cleared,
        "messages_cleared": msgs_cleared,
        "people_cleared": people_cleared,
        "placements_cleared": placements_cleared,
        "docs_cleared": docs_cleared,
    }


def seed_demo_data(reset: bool = False, seed_docs: bool = True) -> dict[str, Any]:
    """Seed collaboration rooms, messages, trades, 3D furniture, and document store."""
    if reset:
        clear_demo_data()

    # Register demo trade personas
    collab.register_person("Demo: Alice Architect", "architect", "alice@demo.trace.local", "+358 40 1000001")
    collab.register_person("Demo: Bob Plumber", "plumber", "bob@demo.trace.local", "+358 40 1000002")
    collab.register_person("Demo: Charlie Electrician", "electrician", "charlie@demo.trace.local", "+358 40 1000003")

    now = time.time()
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

    return {
        "rooms_seeded": room_count,
        "messages_seeded": msg_count,
        "placements_seeded": placement_count,
        "docs_seeded": docs_seeded,
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
    print(f"  - Target IFC model:  {res['ifc_model']}")
    print(f"  - Target Swiss plan: {res['swiss_plan']}")


if __name__ == "__main__":
    main()
