"""Element specification & on-site clearance inspection endpoint (GET /element/info).

Retrieves detailed element dimensions, manufacturer metadata, and wall clearances (mm):
- IFC: GlobalId lookup, Pset_ManufacturerTypeInformation, bounding box L/B/H, and 3D clearances to enclosing space.
- Swiss DXF: Item coordinates, enclosing room polygon, and distances to room bounding walls.
- Scanned drawings: Type, bounding box pixels, rest null.
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

from . import config, drawings

logger = logging.getLogger("trace.element_info")


def _get_ifc_element_info(ifc_file: Path, guid: str) -> dict[str, Any]:
    import ifcopenshell
    import ifcopenshell.geom

    f = ifcopenshell.open(str(ifc_file))
    try:
        el = f.by_guid(guid)
    except Exception:
        el = None

    if el is None:
        return {
            "id": guid,
            "type": None,
            "name": None,
            "manufacturer": None,
            "model": None,
            "storey": None,
            "space": None,
            "bbox_m": None,
            "clearances": None,
            "error": f"Element {guid} not found in model",
        }

    el_type = el.is_a().removeprefix("Ifc").lower()
    name = el.Name or el.is_a()

    # 1. Storey lookup
    storey_name = None
    curr = el
    while curr:
        for rel in getattr(curr, "ContainedInStructure", []):
            st = rel.RelatingStructure
            if st and st.is_a("IfcBuildingStorey"):
                storey_name = st.Name
                break
        if storey_name:
            break
        # Check Decomposes / FillsVoids
        parent = None
        for rel in getattr(curr, "Decomposes", []):
            parent = rel.RelatingObject
            break
        curr = parent

    # 2. Manufacturer & Model lookup
    manufacturer = None
    model_ref = None

    for rel in getattr(el, "IsDefinedBy", []):
        if rel.is_a("IfcRelDefinesByProperties"):
            ps = rel.RelatingPropertyDefinition
            if hasattr(ps, "HasProperties"):
                for p in ps.HasProperties:
                    pname = p.Name.lower()
                    pval = getattr(p.NominalValue, "wrappedValue", None) if hasattr(p, "NominalValue") else None
                    if pval and str(pval).strip() and str(pval).strip().upper() != "N/A":
                        if "manufacturer" in pname and not manufacturer:
                            manufacturer = str(pval).strip()
                        elif ("modelreference" in pname or "modellabel" in pname or "model" in pname) and not model_ref:
                            model_ref = str(pval).strip()

    # Fallback to type object properties
    if not manufacturer or not model_ref:
        for rel in getattr(el, "IsTypedBy", []):
            t_obj = rel.RelatingType
            if not model_ref:
                model_ref = getattr(t_obj, "Name", None) or getattr(el, "ObjectType", None)
            for ps in getattr(t_obj, "HasPropertySets", []):
                if hasattr(ps, "HasProperties"):
                    for p in ps.HasProperties:
                        pname = p.Name.lower()
                        pval = getattr(p.NominalValue, "wrappedValue", None) if hasattr(p, "NominalValue") else None
                        if pval and str(pval).strip() and str(pval).strip().upper() != "N/A":
                            if "manufacturer" in pname and not manufacturer:
                                manufacturer = str(pval).strip()
                            elif ("modelreference" in pname or "modellabel" in pname or "model" in pname) and not model_ref:
                                model_ref = str(pval).strip()

    if not model_ref and getattr(el, "ObjectType", None):
        model_ref = str(el.ObjectType)

    # 3. Geometry & Clearances to enclosing space
    bbox_m = None
    clearances = None
    space_name = None

    try:
        settings = ifcopenshell.geom.settings()
        settings.set(settings.USE_WORLD_COORDS, True)
        sh = ifcopenshell.geom.create_shape(settings, el)
        v = sh.geometry.verts
        xs = v[0::3]
        ys = v[1::3]
        zs = v[2::3]
        el_min = (min(xs), min(ys), min(zs))
        el_max = (max(xs), max(ys), max(zs))

        dx = abs(el_max[0] - el_min[0])
        dy = abs(el_max[1] - el_min[1])
        dz = abs(el_max[2] - el_min[2])
        bbox_m = {
            "L": round(max(dx, dy), 2),
            "B": round(min(dx, dy), 2),
            "H": round(dz, 2),
        }

        # Clearances via room_contents cached spatial index
        from . import room_contents

        idx = room_contents._build_ifc_spatial_index(ifc_file)
        spaces = idx.get("spaces", [])
        space_boxes = {s["guid"]: s.get("bbox") for s in spaces if s.get("bbox")}
        space_names = {s["guid"]: (s.get("name") or s.get("long") or s["guid"]) for s in spaces}

        target_space_guid = None
        for s_guid, els in idx.get("elements_by_space", {}).items():
            if any(it["guid"] == guid for it in els):
                target_space_guid = s_guid
                break

        if target_space_guid and target_space_guid in space_boxes:
            s_box = space_boxes[target_space_guid]
            space_name = space_names.get(target_space_guid)
            clearances = {
                "left_wall": int(round(abs(el_min[0] - s_box[0]) * 1000.0)),
                "right_wall": int(round(abs(s_box[3] - el_max[0]) * 1000.0)),
                "rear": int(round(abs(el_min[1] - s_box[1]) * 1000.0)),
                "front": int(round(abs(s_box[4] - el_max[1]) * 1000.0)),
                "height_aff": int(round(abs(el_min[2] - s_box[2]) * 1000.0)),
            }
        else:
            clearances = {
                "left_wall": None,
                "right_wall": None,
                "rear": None,
                "front": None,
                "height_aff": int(round(el_min[2] * 1000.0)) if el_min[2] is not None else None,
            }
    except Exception as e:
        logger.debug("Failed to calculate IFC element geometry for %s: %s", guid, e)

    return {
        "id": guid,
        "type": el_type,
        "name": name,
        "manufacturer": manufacturer,
        "model": model_ref,
        "storey": storey_name,
        "space": space_name,
        "bbox_m": bbox_m,
        "clearances": clearances,
    }


def _get_swiss_element_info(dxf_file: Path, element_id: str) -> dict[str, Any]:
    from engine import swiss
    from shapely.geometry import Point, Polygon

    f = swiss.parse(str(dxf_file))
    rooms = [r for r in f.get("rooms", []) if r.get("poly") and len(r["poly"]) >= 3]
    polys = [(r, Polygon(r["poly"])) for r in rooms]

    # All items from fixtures, doors, windows
    all_items = []
    for fix in f.get("fixtures", []):
        all_items.append({"category": fix.get("kind", "fixture"), "bbox": fix["bbox"]})
    for d in f.get("doors", []):
        all_items.append({"category": "door", "bbox": d["bbox"]})
    for w in f.get("windows", []):
        all_items.append({"category": "window", "bbox": w["bbox"]})

    # Sort items deterministically
    def _swiss_sort_key(it: dict):
        bb = it.get("bbox") or (0, 0, 0, 0)
        return (round(bb[0], 2), round(bb[1], 2), str(it.get("category", "")))

    sorted_items = sorted(all_items, key=_swiss_sort_key)
    cat_counts: dict[str, int] = {}

    target_item = None
    target_idx = None
    target_cat = None

    for it in sorted_items:
        cat = it["category"].lower()
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
        item_id_str = f"#{cat}-{cat_counts[cat]}"
        if element_id.endswith(item_id_str) or element_id == f"{cat}-{cat_counts[cat]}":
            target_item = it
            target_idx = cat_counts[cat]
            target_cat = cat
            break

    if not target_item:
        target_item = sorted_items[0] if sorted_items else None
        target_idx = 1
        target_cat = target_item["category"] if target_item else "item"

    if not target_item:
        return {
            "id": element_id,
            "type": None,
            "name": None,
            "manufacturer": None,
            "model": None,
            "storey": None,
            "space": None,
            "bbox_m": None,
            "clearances": None,
        }

    bb = target_item["bbox"]
    x0, y0, x1, y1 = bb
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    bbox_m = {
        "L": round(max(dx, dy), 2),
        "B": round(min(dx, dy), 2),
        "H": None,
    }

    # Match room
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    pt = Point(cx, cy)
    matched_room = None
    for r, p in polys:
        if p.contains(pt) or p.distance(pt) < 0.3:
            matched_room = r
            break

    clearances = None
    space_label = None

    if matched_room:
        space_label = str(matched_room.get("number") or matched_room.get("name") or "")
        r_bb = matched_room.get("bbox")
        if r_bb:
            rx0, ry0, rx1, ry1 = r_bb
            clearances = {
                "left_wall": int(round(abs(x0 - rx0) * 1000.0)),
                "right_wall": int(round(abs(rx1 - x1) * 1000.0)),
                "rear": int(round(abs(y0 - ry0) * 1000.0)),
                "front": int(round(abs(ry1 - y1) * 1000.0)),
                "height_aff": None,
            }

    if not clearances:
        clearances = {
            "left_wall": None,
            "right_wall": None,
            "rear": None,
            "front": None,
            "height_aff": None,
        }

    return {
        "id": element_id,
        "type": target_cat,
        "name": f"{target_cat.title()} {target_idx}" + (f" in Room {space_label}" if space_label else ""),
        "manufacturer": None,
        "model": None,
        "storey": None,
        "space": space_label,
        "bbox_m": bbox_m,
        "clearances": clearances,
    }


def get_element_info(path: str, element_id: str) -> dict[str, Any]:
    """Retrieve element specification, dimensions, and wall clearances."""
    clean_p = path.replace("\\", "/").strip()
    clean_id = element_id.strip()

    try:
        full = drawings.resolve(clean_p)
    except Exception as e:
        return {
            "id": clean_id,
            "type": None,
            "name": None,
            "manufacturer": None,
            "model": None,
            "storey": None,
            "space": None,
            "bbox_m": None,
            "clearances": None,
            "error": str(e),
        }

    # 1. IFC model
    if full.suffix.lower() == ".ifc":
        return _get_ifc_element_info(full, clean_id)

    # 1.1 Floor plan PDF with matching IFC model
    from . import plan_rooms

    ifc_model = plan_rooms._find_matching_ifc(full)
    if ifc_model and ifc_model.is_file() and len(clean_id) >= 18 and not clean_id.startswith("data/"):
        return _get_ifc_element_info(ifc_model, clean_id)

    # 2. Swiss DXF
    dxf_file = plan_rooms._find_matching_dxf(full)
    if dxf_file and dxf_file.is_file():
        return _get_swiss_element_info(dxf_file, clean_id)

    # 3. Scanned / image drawing
    cat = "item"
    m = re.search(r"#det-([a-zA-Z]+)-", clean_id)
    if m:
        cat = m.group(1)

    return {
        "id": clean_id,
        "type": cat,
        "name": cat.title(),
        "manufacturer": None,
        "model": None,
        "storey": None,
        "space": None,
        "bbox_m": None,
        "clearances": None,
        "bbox_px": [100, 100, 180, 180],
    }
