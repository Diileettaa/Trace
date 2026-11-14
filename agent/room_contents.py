"""Room contents / inventory endpoint and tool (GET /room/contents).

Answers: "What is in the bathroom?", "How many sockets/fixtures in bedroom 3?".
1. Swiss Dwellings (DXF):
   - Uses engine.swiss.parse for rooms, fixtures, doors, windows (with bbox in metres).
   - Point-in-polygon containment; doors/windows within 0.3m of boundary marked on_boundary=True.
   - Converts metres to PNG pixel coordinates via engine.swiss_view.to_png for frontend drawing.
   - Multilingual room synonym matching (Bad/Bagno/Bain/Salle de bain, Küche/Cuisine, Zimmer/Chambre).
2. IFC models:
   - Uses IfcRelContainedInSpatialStructure or spatial geometry bounding box containment via ifcopenshell.
   - Caches precomputed model spatial hierarchy in CACHE_DIR.
   - Returns value=None with warnings if ifcopenshell is absent.
"""
from __future__ import annotations

import collections
import hashlib
import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from . import config, drawings

logger = logging.getLogger("trace.room_contents")

# Synonyms for multilingual architectural room names
SYNONYMS: dict[str, list[str]] = {
    "bathroom": ["bad", "badezimmer", "bagno", "bain", "salle de bain", "wc", "toilette", "toilet", "du", "reduit", "reduit/wc", "kph", "pesuhuone", "kylpyhuone", "tualettruum", "vannituba"],
    "toilet": ["wc", "toilet", "toilette", "toilets", "wc_room", "reduit/wc", "tualettruum"],
    "kitchen": ["küche", "kuche", "kueche", "cucina", "cuisine", "kitchen", "keittiö", "köök", "avokeittiö"],
    "bedroom": ["zimmer", "stanza", "chambre", "schlafzimmer", "camera", "makuuhuone", "bedroom", "magamistuba", "mh"],
    "living": ["wohnen", "wohnen/essen", "wohnzimmer", "soggiorno", "salon", "olohuone", "living", "elutuba"],
    "balcony": ["balkon", "balcone", "balcon", "balcony", "parveke", "rõdu"],
    "corridor": ["korridor", "hall", "flur", "gang", "corridor", "eteinen", "esik", "käytävä"],
}


def _find_dxf(path_str: str) -> Path | None:
    try:
        resolved = drawings.resolve(path_str)
        if resolved.suffix.lower() == ".dxf" and resolved.is_file():
            return resolved
        cand = resolved.with_suffix(".dxf")
        if cand.is_file():
            return cand
    except Exception:
        pass

    stem = Path(path_str).stem
    cand2 = config.DATA_DIR / "data" / "swiss_dwellings" / f"{stem}.dxf"
    if cand2.is_file():
        return cand2
    return None


def _find_ifc(path_str: str) -> Path | None:
    try:
        resolved = drawings.resolve(path_str)
        if resolved.suffix.lower() == ".ifc" and resolved.is_file():
            return resolved
        cand = resolved.with_suffix(".ifc")
        if cand.is_file():
            return cand
        # Check prefix matching
        for f in resolved.parent.glob("*.ifc"):
            if resolved.name.startswith(f.stem):
                return f
    except Exception:
        pass

    stem = Path(path_str).stem
    ifc_dir = config.DATA_DIR / "data" / "ifc_models"
    if ifc_dir.is_dir():
        for f in ifc_dir.glob("*.ifc"):
            if stem.startswith(f.stem) or f.stem.startswith(stem):
                return f
    return None


def _match_room_names(target: str, name: str, number: str) -> bool:
    """Check if a room's name or number matches the target search query."""
    t = target.strip().lower()
    nm = (name or "").strip().lower()
    num = (number or "").strip().lower()

    # Direct match on number or name
    if t == num or t == nm:
        return True
    if num and t in num:
        return True
    if nm and t in nm:
        return True

    # Check synonyms
    for syn_key, variants in SYNONYMS.items():
        # User asked for synonym category or variant
        if t == syn_key or t in variants:
            if any(v in nm for v in variants):
                return True

    return False


# =====================================================================
# 1. Swiss DXF room contents
# =====================================================================

def _get_swiss_room_contents(dxf_path: Path, room_query: str) -> dict[str, Any]:
    from engine import swiss, swiss_view
    from shapely.geometry import Point, Polygon

    f = swiss.parse(str(dxf_path))
    rooms = f.get("rooms", [])

    matched_rooms = [r for r in rooms if _match_room_names(room_query, r.get("name", ""), r.get("number", ""))]

    # Fallback for bathroom queries matching rooms with sanitary fixtures if names are blank
    if not matched_rooms and any(k in room_query.lower() for k in ("bath", "toilet", "wc", "bad")):
        for r in rooms:
            if r.get("poly"):
                poly_test = Polygon(r["poly"])
                has_sanitary = any(
                    fix["kind"] in ("wc", "washbasin", "bathtub", "shower")
                    and poly_test.contains(Point((fix["bbox"][0] + fix["bbox"][2]) / 2.0, (fix["bbox"][1] + fix["bbox"][3]) / 2.0))
                    for fix in f.get("fixtures", [])
                )
                if has_sanitary:
                    matched_rooms.append(r)

    if not matched_rooms:
        return {
            "value": 0,
            "unit": "count",
            "items": [],
            "summary": {},
            "room": {"name": room_query, "number": room_query, "area_m2": None},
            "method": "room_contents:swiss",
            "warnings": [f"Room '{room_query}' not found on drawing"],
        }

    # Extract all elements within matched rooms
    items = []
    category_counter: collections.Counter[str] = collections.Counter()

    for r in matched_rooms:
        poly_pts = r.get("poly")
        if not poly_pts or len(poly_pts) < 3:
            continue
        room_poly = Polygon(poly_pts)

        # 1. Fixtures
        for fix in f.get("fixtures", []):
            bb = fix["bbox"]
            cx, cy = (bb[0] + bb[2]) / 2.0, (bb[1] + bb[3]) / 2.0
            pt = Point(cx, cy)

            in_room = False
            on_boundary = False
            if room_poly.contains(pt):
                in_room = True
            elif room_poly.distance(pt) < 0.3:
                in_room = True
                on_boundary = True

            if in_room:
                kind = fix.get("kind", "fixture")
                png_box = swiss_view.to_png(str(dxf_path), bb)
                count = category_counter[kind] + 1
                category_counter[kind] = count
                items.append({
                    "category": kind,
                    "name": f"{kind} {count}",
                    "bbox_m": list(bb),
                    "png_bbox": png_box,
                    "on_boundary": on_boundary,
                    "room_number": r.get("number"),
                })

        # 2. Doors
        for d in f.get("doors", []):
            bb = d["bbox"]
            cx, cy = (bb[0] + bb[2]) / 2.0, (bb[1] + bb[3]) / 2.0
            pt = Point(cx, cy)

            in_room = False
            on_boundary = False
            if room_poly.contains(pt):
                in_room = True
            elif room_poly.distance(pt) < 0.3:
                in_room = True
                on_boundary = True

            if in_room:
                png_box = swiss_view.to_png(str(dxf_path), bb)
                count = category_counter["door"] + 1
                category_counter["door"] = count
                items.append({
                    "category": "door",
                    "name": f"door {count}",
                    "bbox_m": list(bb),
                    "png_bbox": png_box,
                    "on_boundary": on_boundary,
                    "room_number": r.get("number"),
                })

        # 3. Windows
        for w in f.get("windows", []):
            bb = w["bbox"]
            cx, cy = (bb[0] + bb[2]) / 2.0, (bb[1] + bb[3]) / 2.0
            pt = Point(cx, cy)

            in_room = False
            on_boundary = False
            if room_poly.contains(pt):
                in_room = True
            elif room_poly.distance(pt) < 0.3:
                in_room = True
                on_boundary = True

            if in_room:
                png_box = swiss_view.to_png(str(dxf_path), bb)
                count = category_counter["window"] + 1
                category_counter["window"] = count
                items.append({
                    "category": "window",
                    "name": f"window {count}",
                    "bbox_m": list(bb),
                    "png_bbox": png_box,
                    "on_boundary": on_boundary,
                    "room_number": r.get("number"),
                })

    primary_room = matched_rooms[0]
    room_meta = {
        "name": primary_room.get("name"),
        "number": primary_room.get("number"),
        "area_m2": primary_room.get("area"),
    }
    if len(matched_rooms) > 1:
        room_meta["matched_count"] = len(matched_rooms)
        room_meta["all_numbers"] = [r.get("number") for r in matched_rooms]

    return {
        "value": len(items),
        "unit": "count",
        "items": items,
        "summary": dict(category_counter),
        "room": room_meta,
        "method": "room_contents:swiss",
        "warnings": [],
    }


# =====================================================================
# 2. IFC model room contents
# =====================================================================

_PROC_POOL = None


def _ifc_index_cache_file(ifc_path: Path) -> Path:
    cache_dir = config.CACHE_DIR / "ifc_rooms"
    cache_dir.mkdir(parents=True, exist_ok=True)
    st = ifc_path.stat()
    return cache_dir / (hashlib.md5(f"{ifc_path}|{st.st_size}|{st.st_mtime}".encode()).hexdigest() + ".json")


def _build_ifc_spatial_index(ifc_path: Path) -> dict[str, Any]:
    """Cached spatial index. A cache miss is built in a separate process: ifcopenshell geometry holds the GIL for
    minutes on big models and froze every other request (even /health) on the 2-CPU Cloud Run instance."""
    global _PROC_POOL
    cf = _ifc_index_cache_file(ifc_path)
    if cf.is_file():
        try:
            return json.loads(cf.read_text(encoding="utf-8"))
        except Exception:
            pass
    try:
        import multiprocessing as mp
        from concurrent.futures import ProcessPoolExecutor
        if _PROC_POOL is None:
            _PROC_POOL = ProcessPoolExecutor(max_workers=1, mp_context=mp.get_context("spawn"))
        return _PROC_POOL.submit(_build_ifc_spatial_index_local, ifc_path).result(timeout=600)
    except Exception as e:
        logger.warning("subprocess IFC index failed for %s (%s), building in-process", ifc_path, e)
        return _build_ifc_spatial_index_local(ifc_path)


def prewarm_ifc_indexes(max_mb: int = 120) -> None:
    """Build every IFC index once after startup (in the worker process) so demo questions hit the cache."""
    for sub in ("data/ifc_models", "data/ifc_bench"):
        d = config.DATA_DIR / sub
        if not d.is_dir():
            continue
        for f in sorted(d.glob("*.ifc"), key=lambda x: x.stat().st_size):
            if f.stat().st_size > max_mb * 1_000_000:
                continue
            try:
                _build_ifc_spatial_index(f)
            except Exception as e:
                logger.warning("prewarm %s failed: %s", f.name, e)


def _build_ifc_spatial_index_local(ifc_path: Path) -> dict[str, Any]:
    """Parse IFC building spaces and spatial containment, cached to CACHE_DIR."""
    cache_dir = config.CACHE_DIR / "ifc_rooms"
    cache_dir.mkdir(parents=True, exist_ok=True)
    st = ifc_path.stat()
    cache_key = hashlib.md5(f"{ifc_path}|{st.st_size}|{st.st_mtime}".encode()).hexdigest()
    cache_file = cache_dir / f"{cache_key}.json"

    if cache_file.is_file():
        try:
            return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception:
            pass

    import ifcopenshell
    import ifcopenshell.geom

    f = ifcopenshell.open(str(ifc_path))
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)

    spaces = []
    space_boxes: dict[str, tuple[float, float, float, float, float, float]] = {}

    for s in f.by_type("IfcSpace"):
        guid = s.GlobalId
        name = s.Name or ""
        long_name = getattr(s, "LongName", None) or ""
        area_m2 = None

        try:
            shape = ifcopenshell.geom.create_shape(settings, s)
            verts = shape.geometry.verts
            xs = verts[0::3]
            ys = verts[1::3]
            zs = verts[2::3]
            s_box = (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))
            space_boxes[guid] = s_box
        except Exception:
            s_box = None

        spaces.append({
            "guid": guid,
            "name": name,
            "long": long_name,
            "area_m2": area_m2,
            "bbox": list(s_box) if s_box else None,
        })

    # Elements to index (doors, windows, flow terminals, lights, equipment)
    elements_by_space: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)

    # First check explicit IfcRelContainedInSpatialStructure
    has_rel_space = False
    for rel in f.by_type("IfcRelContainedInSpatialStructure"):
        struct = rel.RelatingStructure
        if struct and struct.is_a("IfcSpace"):
            has_rel_space = True
            sg = struct.GlobalId
            for el in rel.RelatedElements:
                elements_by_space[sg].append({
                    "category": el.is_a().replace("Ifc", "").lower(),
                    "name": el.Name or el.is_a(),
                    "guid": el.GlobalId,
                    "on_boundary": False,
                })

    # Geometric fallback if no explicit space containment
    if not has_rel_space:
        candidate_elements = []
        for el in f.by_type("IfcElement"):
            if el.is_a("IfcWall") or el.is_a("IfcWallStandardCase") or el.is_a("IfcSlab") or el.is_a("IfcOpeningElement"):
                continue
            candidate_elements.append(el)

        for el in candidate_elements:
            try:
                sh = ifcopenshell.geom.create_shape(settings, el)
                v = sh.geometry.verts
                xs = v[0::3]
                ys = v[1::3]
                zs = v[2::3]
                cx = (min(xs) + max(xs)) / 2.0
                cy = (min(ys) + max(ys)) / 2.0
                cz = (min(zs) + max(zs)) / 2.0

                for sg, s_box in space_boxes.items():
                    # Check XY bounding box with 0.3m boundary tolerance and Z elevation tolerance
                    if (s_box[0] - 0.3 <= cx <= s_box[3] + 0.3
                            and s_box[1] - 0.3 <= cy <= s_box[4] + 0.3
                            and s_box[2] - 0.2 <= cz <= s_box[5] + 0.2):
                        on_boundary = not (s_box[0] <= cx <= s_box[3] and s_box[1] <= cy <= s_box[4])
                        elements_by_space[sg].append({
                            "category": el.is_a().replace("Ifc", "").lower(),
                            "name": el.Name or el.is_a(),
                            "guid": el.GlobalId,
                            "on_boundary": on_boundary,
                        })
                        break
            except Exception:
                pass

    cached_obj = {
        "spaces": spaces,
        "elements_by_space": dict(elements_by_space),
        "method": "room_contents:ifc[contained]" if has_rel_space else "room_contents:ifc[geometry]",
    }
    try:
        cache_file.write_text(json.dumps(cached_obj, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

    return cached_obj


def _get_ifc_room_contents(ifc_path: Path, room_query: str) -> dict[str, Any]:
    try:
        import ifcopenshell  # noqa: F401
    except ImportError:
        return {
            "value": None,
            "unit": "count",
            "items": [],
            "summary": {},
            "room": {"name": room_query, "number": room_query, "area_m2": None},
            "method": "room_contents:ifc",
            "warnings": ["ifcopenshell is not installed"],
        }

    try:
        idx = _build_ifc_spatial_index(ifc_path)
    except Exception as e:
        return {
            "value": None,
            "unit": "count",
            "items": [],
            "summary": {},
            "room": {"name": room_query, "number": room_query, "area_m2": None},
            "method": "room_contents:ifc",
            "warnings": [f"Failed to parse IFC geometry: {e}"],
        }

    spaces = idx.get("spaces", [])
    matched = [s for s in spaces if s.get("guid") == room_query or _match_room_names(room_query, s.get("long", ""), s.get("name", ""))]

    if not matched:
        return {
            "value": 0,
            "unit": "count",
            "items": [],
            "summary": {},
            "room": {"name": room_query, "number": room_query, "area_m2": None},
            "method": idx.get("method", "room_contents:ifc"),
            "warnings": [f"Room '{room_query}' not found in IFC model"],
        }

    primary = matched[0]
    guid = primary["guid"]
    items = idx.get("elements_by_space", {}).get(guid, [])
    counter: collections.Counter[str] = collections.Counter(it["category"] for it in items)

    return {
        "value": len(items),
        "unit": "count",
        "items": items,
        "summary": dict(counter),
        "room": {
            "name": primary.get("long") or primary.get("name"),
            "number": primary.get("name"),
            "area_m2": primary.get("area_m2"),
            "guid": guid,
        },
        "method": idx.get("method", "room_contents:ifc[geometry]"),
        "warnings": [],
    }


def get_room_contents(path: str, room: str) -> dict[str, Any]:
    """List everything inside one room (fixtures, doors, windows, equipment...) with evidence."""
    clean_p = path.replace("\\", "/").strip()
    clean_r = room.strip()

    # 1. Swiss DXF plan
    dxf_file = _find_dxf(clean_p)
    if dxf_file:
        return _get_swiss_room_contents(dxf_file, clean_r)

    # 2. IFC Model
    ifc_file = _find_ifc(clean_p)
    if ifc_file:
        return _get_ifc_room_contents(ifc_file, clean_r)

    # 3. Raster or unknown
    return {
        "value": None,
        "unit": "count",
        "items": [],
        "summary": {},
        "room": {"name": clean_r, "number": clean_r, "area_m2": None},
        "method": "room_contents:unsupported",
        "warnings": ["room_contents requires vector DXF or IFC model with spatial geometry"],
    }
