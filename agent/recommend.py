"""AI-assisted product and contractor recommendation service (Architect Modules 7, 9).

Endpoints:
1. GET /recommend/products:
   - Matches products from web/src/catalog.json via keywords or fallback Gemini model.
   - Evaluates room area fit (from IFC model via engine.query or plan_rooms).
   - Filters by budget and room footprint (footprint < 25% of room area).
   - Ranks by material/color consistency with existing 3D placements and price.
   - Returns top 5 recommendations with human-readable reasons and source/tokens metadata.
2. GET /recommend/people:
   - Recommends previously partnered tradespeople from collab people and booking history.
   - Ranks by availability, room experience, job count, and recency.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from . import collab, config, scene

logger = logging.getLogger("trace.recommend")

_ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = _ROOT / "web" / "src" / "catalog.json"

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "living": ["living", "sofa", "couch", "armchair", "lounge", "coffee", "tv", "bench", "bookcase", "bookshelf", "table", "chair"],
    "bedroom": ["bedroom", "bed", "nightstand", "wardrobe", "closet", "dresser", "mirror", "sleep"],
    "kitchen": ["kitchen", "island", "counter", "cook", "bar", "stool", "pantry", "hood", "sink", "cabinet"],
    "bathroom": ["bathroom", "bath", "toilet", "wc", "washbasin", "basin", "vanity", "shower", "tub", "bathtub", "radiator", "towel"],
    "lighting": ["light", "lighting", "lamp", "pendant", "sconce", "track", "downlight", "spotlight", "chandelier"],
    "office": ["office", "desk", "work", "swivel", "pedestal", "study", "standing", "ergonomic", "bookcase"],
}


def load_catalog() -> list[dict[str, Any]]:
    """Load products from catalog.json."""
    if CATALOG_PATH.is_file():
        try:
            return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("Failed to load catalog.json: %s", e)
    return []


def get_room_area(model: str, space_id: str) -> float | None:
    """Query room net floor area in m2 from the model using engine.query or plan_rooms."""
    if not space_id:
        return None

    # 1. Try engine.query if available
    if model:
        try:
            from engine.query import query

            res = query(path=model, intent="area", category="room", scope={"room": space_id})
            val = res.get("value")
            if val is not None and isinstance(val, (int, float)) and val > 0:
                return float(val)
        except Exception:
            pass

    # 2. Try agent.plan_rooms if model has floor plan
    try:
        from . import plan_rooms

        geom = plan_rooms.get_plan_rooms(model)
        for r in geom.get("rooms", []):
            if r.get("space_id") == space_id or r.get("number") == space_id:
                if r.get("area_m2"):
                    return float(r["area_m2"])
    except Exception:
        pass

    return None


def match_catalog_by_rules(need: str, catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Match products using keyword and synonym rules."""
    tokens = [t.lower() for t in re.findall(r"\w+", need)]
    if not tokens:
        return []

    stop = {"for", "the", "a", "an", "in", "and", "or", "with", "of", "to"}
    clean_tokens = [t for t in tokens if t not in stop]
    if not clean_tokens:
        clean_tokens = tokens

    matched: list[tuple[int, bool, dict[str, Any]]] = []
    for item in catalog:
        cat = item.get("category", "").lower()
        name = item.get("name", "").lower()
        item_id = item.get("id", "").lower()
        mat = item.get("material", "").lower()

        score = 0
        direct_match = False
        for t in clean_tokens:
            if t in name or t in item_id:
                score += 10
                direct_match = True
            elif t == cat:
                score += 8
                direct_match = True
            elif t in mat:
                score += 2
            elif t in CATEGORY_KEYWORDS.get(cat, []):
                score += 1

        if score > 0:
            matched.append((score, direct_match, item))

    if not matched:
        return []

    # If direct matches exist, prioritize them over broad category synonym matches
    has_direct = any(m[1] for m in matched)
    if has_direct:
        matched = [m for m in matched if m[1]]

    matched.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, _, item in matched]


def match_catalog_by_gemini(
    need: str,
    catalog: list[dict[str, Any]],
    client: Any = None,
) -> tuple[list[dict[str, Any]], int]:
    """Fallback: Ask Gemini to choose relevant product IDs from the catalog without inventing new ones."""
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    catalog_summary = [{"id": p["id"], "name": p["name"], "category": p["category"]} for p in catalog]

    prompt = (
        f"You are a furniture specification assistant. A user has this need: '{need}'.\n"
        f"Select the top matching product IDs from this existing catalog ONLY. Do not invent new IDs:\n"
        f"{json.dumps(catalog_summary, ensure_ascii=False)}\n\n"
        "Return ONLY a JSON object: {\"ids\": [\"<id1>\", \"<id2>\", ...]}"
    )

    token_count = 0
    chosen_ids = []

    try:
        if client is None:
            from google import genai

            client = genai.Client()

        resp = client.models.generate_content(
            model=model_name,
            contents=[prompt],
            config={"temperature": 0.0},
        )
        usage = getattr(resp, "usage_metadata", None)
        if usage:
            token_count = getattr(usage, "total_token_count", 0)

        text = getattr(resp, "text", "") or ""
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            data = json.loads(m.group(0))
            chosen_ids = data.get("ids", [])
    except Exception as e:
        logger.warning("Gemini product recommendation failed: %s", e)

    id_to_product = {p["id"]: p for p in catalog}
    matched = [id_to_product[cid] for cid in chosen_ids if cid in id_to_product]
    return matched, token_count


def generate_product_reason(
    item: dict[str, Any],
    room_area_m2: float | None,
    budget_eur: float | None,
    matched_material: str | None,
) -> str:
    """Generate a concise human-readable justification for the recommended product."""
    parts = []
    w = item.get("width_mm", 0)
    d = item.get("depth_mm", 0)
    footprint = round((w / 1000.0) * (d / 1000.0), 2)

    if room_area_m2:
        pct = int(round((footprint / room_area_m2) * 100))
        parts.append(f"Fits nicely in a {room_area_m2:.1f} m² space (footprint {footprint} m², ~{pct}% of floor)")
    else:
        parts.append(f"Compact {footprint} m² footprint ({w}×{d} mm)")

    if matched_material:
        parts.append(f"matches the {matched_material} finish already placed in the room")

    if budget_eur:
        parts.append(f"well within your €{int(budget_eur)} budget at €{int(item['price_eur'])}")

    return "; ".join(parts).capitalize() + "."


def recommend_products(
    need: str,
    space_id: str = "",
    model: str = "",
    budget_eur: float | None = None,
    client: Any = None,
) -> dict[str, Any]:
    """Recommend up to 5 catalog products for a room and user need."""
    catalog = load_catalog()
    if not catalog:
        return {"products": [], "source": "rules", "tokens": 0, "room_area_m2": None, "budget_eur": budget_eur}

    # 1. Match candidates: rules first, then Gemini
    source = "rules"
    tokens = 0
    candidates = match_catalog_by_rules(need, catalog)

    if not candidates and need.strip():
        gemini_candidates, tokens = match_catalog_by_gemini(need, catalog, client=client)
        if gemini_candidates:
            candidates = gemini_candidates
            source = "gemini"

    # If still no candidates, fallback to entire catalog
    if not candidates:
        candidates = catalog

    # 2. Room area filter (footprint < 25% of room area)
    room_area_m2 = get_room_area(model, space_id)
    if room_area_m2 and room_area_m2 > 0:
        max_footprint = room_area_m2 * 0.25
        candidates = [
            p for p in candidates
            if ((p.get("width_mm", 0) / 1000.0) * (p.get("depth_mm", 0) / 1000.0)) < max_footprint
        ]

    # 3. Budget filter
    if budget_eur is not None and budget_eur > 0:
        candidates = [p for p in candidates if float(p.get("price_eur", 0.0)) <= budget_eur]

    # 4. Consistency scoring with existing placements in 3D scene
    all_scenes = scene.load_all_scenes()
    model_scene = all_scenes.get(model, {}) if model else {}
    room_placements = [
        p for p in model_scene.get("placements", [])
        if not space_id or p.get("space_id") == space_id
    ]

    placed_materials = {str(p.get("material", "")).lower() for p in room_placements if p.get("material")}
    placed_colors = {str(p.get("color_hex", "")).lower() for p in room_placements if p.get("color_hex")}

    scored_items: list[tuple[float, str | None, dict[str, Any]]] = []
    for item in candidates:
        item_mat = str(item.get("material", "")).lower()
        item_col = str(item.get("color_hex", "")).lower()
        score = 0.0
        matched_mat = None

        for pm in placed_materials:
            if pm in item_mat or any(w in item_mat for w in pm.split()):
                score += 3.0
                matched_mat = pm
                break

        if item_col in placed_colors:
            score += 1.5

        scored_items.append((score, matched_mat, item))

    # Rank by consistency score desc, then price asc
    scored_items.sort(key=lambda x: (-x[0], float(x[2].get("price_eur", 0.0))))

    # Return top 5
    top_5 = []
    for _, matched_mat, item in scored_items[:5]:
        reason = generate_product_reason(
            item=item,
            room_area_m2=room_area_m2,
            budget_eur=budget_eur,
            matched_material=matched_mat,
        )
        top_5.append({
            "id": item["id"],
            "name": item["name"],
            "category": item.get("category", ""),
            "price_eur": item.get("price_eur", 0),
            "image": item.get("image", f"/catalog/{item['id']}.png"),
            "reason": reason,
        })

    return {
        "products": top_5,
        "source": source,
        "tokens": tokens,
        "room_area_m2": room_area_m2,
        "budget_eur": budget_eur,
    }


# =====================================================================
# 2. People recommendation (Partnered tradespeople)
# =====================================================================

def recommend_people(trade: str = "", space_id: str = "") -> list[dict[str, Any]]:
    """Recommend previously partnered tradespeople ranked by availability,

    room history, job count, and recency.
    """
    clean_trade = trade.strip().lower()
    collab_data = collab.load()
    people_map = collab_data.get("people", {})
    bookings = collab_data.get("bookings", [])
    now = time.time()

    candidates = [
        p for p in people_map.values()
        if not clean_trade or p.get("trade", "").strip().lower() == clean_trade
    ]

    ranked: list[dict[str, Any]] = []

    for person in candidates:
        p_name = person.get("name", "")
        p_email = person.get("email", "")

        # Find bookings belonging to this person
        p_bookings = [
            b for b in bookings
            if b.get("person") == p_name or b.get("person") == p_email
        ]

        past_bookings = [b for b in p_bookings if float(b.get("end", 0.0)) <= now]
        active_bookings = [
            b for b in p_bookings
            if float(b.get("start", 0.0)) <= now <= float(b.get("end", 0.0))
        ]

        jobs_done = len(past_bookings)
        available_now = (len(active_bookings) == 0)

        # Recency
        last_job_ts = max([float(b.get("end", 0.0)) for b in past_bookings], default=0.0)
        last_job_str = (
            datetime.datetime.fromtimestamp(last_job_ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d")
            if last_job_ts > 0
            else None
        )

        # Experience in requested space
        space_jobs = [b for b in past_bookings if space_id and b.get("space_id") == space_id]
        has_space_exp = len(space_jobs) > 0

        # Construct human reason
        reason_parts = []
        if jobs_done > 0:
            reason_parts.append(f"Partnered on {jobs_done} previous job{'s' if jobs_done != 1 else ''}")
            if last_job_str:
                reason_parts.append(f"last on {last_job_str}")
        else:
            reason_parts.append("Registered contractor")

        if has_space_exp:
            reason_parts.append(f"familiar with {space_id}")

        if available_now:
            reason_parts.append("currently available")
        else:
            reason_parts.append("currently busy on site")

        reason = "; ".join(reason_parts) + "."

        ranked.append({
            "name": p_name,
            "trade": person.get("trade", ""),
            "email": p_email,
            "phone": person.get("phone", ""),
            "jobs_done": jobs_done,
            "last_job": last_job_str,
            "available_now": available_now,
            "has_space_exp": has_space_exp,
            "last_job_ts": last_job_ts,
            "reason": reason,
        })

    # Ranking rules:
    # 1. available_now (True first)
    # 2. has_space_exp (True first)
    # 3. jobs_done (most jobs first)
    # 4. last_job_ts (most recent first)
    ranked.sort(
        key=lambda r: (
            -int(r["available_now"]),
            -int(r["has_space_exp"]),
            -r["jobs_done"],
            -r["last_job_ts"],
        )
    )

    # Clean up internal sorting fields
    for r in ranked:
        r.pop("has_space_exp", None)
        r.pop("last_job_ts", None)

    return ranked
