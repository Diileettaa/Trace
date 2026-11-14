"""2D room outlines and click interface (GET /plan/rooms).

Extracts pixel-accurate room boundaries (bbox and polygon) from:
- Swiss Dwellings DXF files (metres -> PNG pixel coordinates via swiss_view)
- IFC model plan PDFs (matching SVG IfcSpace elements via ifc_plan)
- Raster / uploaded plans (returns empty rooms with warnings)

Enriches rooms with site status from agent/collab.py and media count from agent/media.py.
Results are cached in memory by path using lru_cache.
"""
from __future__ import annotations

import collections
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from . import collab, config, drawings, ifc_plan, media

_VIEWBOX = re.compile(r'viewBox="([-\d.\s]+)"')
_G_GUID = re.compile(r'<g\b([^>]*\bdata-guid="([^"]+)"[^>]*)>(.*?)</g>', re.S)


def _find_matching_ifc(pdf_path: Path) -> Path | None:
    """Find the IFC model file corresponding to a plan PDF."""
    if pdf_path.with_suffix(".ifc").is_file():
        return pdf_path.with_suffix(".ifc")
    try:
        parent = pdf_path.parent
        for candidate in parent.glob("*.ifc"):
            if pdf_path.name.startswith(candidate.stem):
                return candidate
    except Exception:
        pass
    models_dir = config.DATA_DIR / "data" / "ifc_models"
    if models_dir.is_dir():
        for candidate in models_dir.glob("*.ifc"):
            if pdf_path.name.startswith(candidate.stem):
                return candidate
    return None


def _find_matching_dxf(path_obj: Path) -> Path | None:
    """Find the DXF file for a Swiss Dwellings drawing."""
    if path_obj.suffix.lower() == ".dxf" and path_obj.is_file():
        return path_obj
    dxf_sibling = path_obj.with_suffix(".dxf")
    if dxf_sibling.is_file():
        return dxf_sibling
    stem = path_obj.stem
    swiss_dir = config.DATA_DIR / "data" / "swiss_dwellings"
    cand = swiss_dir / f"{stem}.dxf"
    if cand.is_file():
        return cand
    return None


@lru_cache(maxsize=128)
def _rooms_geometry(path: str, page: int = 1) -> dict[str, Any]:
    """Parse the static room geometry and pixel coordinates from the drawing source."""
    full = drawings.resolve(path)
    try:
        png_path = drawings.page_png(path, page=page)
        w, h = drawings.image_size(png_path)
        image_size: list[int] | None = [int(w), int(h)]
    except Exception:
        image_size = None

    clean_lower = path.replace("\\", "/").lower()

    # 1. Swiss Dwellings (DXF)
    is_swiss = "swiss_dwellings" in clean_lower or full.suffix.lower() == ".dxf"
    dxf_file = _find_matching_dxf(full)
    if dxf_file and (is_swiss or "swiss" in str(dxf_file).lower()):
        from engine import swiss, swiss_view

        try:
            f = swiss.parse(str(dxf_file))
            raw_rooms = f.get("rooms", [])
            c = swiss_view.calibration(str(dxf_file))
            s = float(c["scale_px_per_m"]) if c else 1.0
            x0, ytop = c["dxf_min"] if c else (0.0, 0.0)
            px0, py0 = c["png_min"] if c else (0, 0)
            if image_size is None and c:
                image_size = [int(c["png_size"][0]), int(c["png_size"][1])]

            rooms = []
            for r in raw_rooms:
                bb = r.get("bbox")
                poly = r.get("poly")
                if c and bb:
                    raw_b = swiss_view.to_png(str(dxf_file), bb)
                    if raw_b:
                        bbox_px = [
                            int(min(raw_b[0], raw_b[2])),
                            int(min(raw_b[1], raw_b[3])),
                            int(max(raw_b[0], raw_b[2])),
                            int(max(raw_b[1], raw_b[3])),
                        ]
                    else:
                        bbox_px = [0, 0, 0, 0]
                else:
                    bbox_px = [0, 0, 0, 0]

                if c and poly:
                    polygon_px = [
                        [int(round(px0 + (x - x0) * s)), int(round(py0 + (ytop - y) * s))]
                        for x, y in poly
                    ]
                else:
                    polygon_px = None

                room_number = str(r.get("number")).strip() if r.get("number") else None
                room_name = str(r.get("name")).strip() if r.get("name") else None
                space_id = room_number or room_name or f"room_{len(rooms) + 1}"

                dims_m = None
                if bb:
                    dx = abs(bb[2] - bb[0])
                    dy = abs(bb[3] - bb[1])
                    dims_m = {
                        "L": round(max(dx, dy), 2),
                        "B": round(min(dx, dy), 2),
                        "H": None,
                    }

                rooms.append({
                    "space_id": space_id,
                    "name": room_name,
                    "number": room_number,
                    "area_m2": float(r["area"]) if r.get("area") is not None else None,
                    "dims_m": dims_m,
                    "bbox_px": bbox_px,
                    "polygon_px": polygon_px,
                })

            return {"path": path, "image_size": image_size, "rooms": rooms}
        except Exception:
            pass

    # 2. IFC Models (Floor plan PDF with matching SVG)
    svg_candidate = full.with_suffix(".svg")
    if not svg_candidate.is_file():
        svg_candidate = config.DATA_DIR / "data" / "ifc_models" / f"{full.stem}.svg"

    if full.suffix.lower() == ".pdf" and svg_candidate.is_file():
        svg_text = svg_candidate.read_text(encoding="utf-8", errors="ignore")
        vb = _VIEWBOX.search(svg_text[:2000])
        vx, vy = (float(v) for v in vb.group(1).split()[:2]) if vb else (0.0, 0.0)
        px_per_mm = drawings.PDF_RENDER_DPI / 25.4

        # IFC metadata lookup if model is available
        space_map: dict[str, Any] = {}
        space_box_map: dict[str, Any] = {}
        ifc_model = _find_matching_ifc(full)
        if ifc_model and ifc_model.is_file():
            try:
                from engine import ifc

                M = ifc.load(str(ifc_model))
                space_map = {s["guid"]: s for s in M.get("spaces", []) if "guid" in s}
                from . import room_contents

                cf = room_contents._ifc_index_cache_file(ifc_model)
                if cf.is_file():
                    idx = json.loads(cf.read_text(encoding="utf-8"))
                    space_box_map = {sp["guid"]: sp.get("bbox") for sp in idx.get("spaces", []) if sp.get("bbox")}
            except Exception:
                pass

        rooms = []
        for attrs, guid, body in _G_GUID.findall(svg_text):
            if "IfcSpace" not in attrs:
                continue

            name_m = re.search(r'data-name="([^"]+)"', attrs)
            data_name = name_m.group(1) if name_m else None

            pts: list[tuple[float, float]] = []
            for d in re.findall(r'\sd="([^"]+)"', body):
                for x, y in ifc_plan._points(d):
                    pts.append((x, y))

            if pts:
                poly_px = [
                    [int(round((x - vx) * px_per_mm)), int(round((y - vy) * px_per_mm))]
                    for x, y in pts
                ]
                xs = [p[0] for p in poly_px]
                ys = [p[1] for p in poly_px]
                bbox_px = [min(xs), min(ys), max(xs), max(ys)]
            else:
                poly_px = None
                bbox_px = [0, 0, 0, 0]

            s = space_map.get(guid)
            if s:
                from engine import ifc_answer

                v, _ = ifc_answer.space_area(s)
                area_m2 = round(float(v), 2) if v is not None else None
                name = s.get("long") or s.get("name") or data_name or guid
                number = s.get("name") or data_name
            else:
                name = data_name or guid
                number = data_name
                area_m2 = None

            dims_m = None
            bbox_3d = space_box_map.get(guid)
            if bbox_3d and len(bbox_3d) == 6:
                dx = abs(bbox_3d[3] - bbox_3d[0])
                dy = abs(bbox_3d[4] - bbox_3d[1])
                dz = abs(bbox_3d[5] - bbox_3d[2])
                dims_m = {
                    "L": round(max(dx, dy), 2),
                    "B": round(min(dx, dy), 2),
                    "H": round(dz, 2) if dz > 0 else None,
                }
            elif s and isinstance(s, dict):
                h_cand = s.get("height") or s.get("quantities", {}).get("Height")
                h_val = round(float(h_cand), 2) if isinstance(h_cand, (int, float)) and h_cand > 0 else None
                if area_m2:
                    approx = round(area_m2 ** 0.5, 2)
                    dims_m = {"L": approx, "B": approx, "H": h_val}

            rooms.append({
                "space_id": guid,
                "name": str(name) if name is not None else None,
                "number": str(number) if number is not None else None,
                "area_m2": area_m2,
                "dims_m": dims_m,
                "bbox_px": bbox_px,
                "polygon_px": poly_px,
            })

        return {"path": path, "image_size": image_size, "rooms": rooms}

    # 3. Direct IFC Model (3D spaces)
    if full.suffix.lower() == ".ifc":
        try:
            from engine import ifc

            M = ifc.load(str(full))
            space_box_map = {}
            try:
                from . import room_contents

                cf = room_contents._ifc_index_cache_file(full)
                if cf.is_file():
                    idx = json.loads(cf.read_text(encoding="utf-8"))
                    space_box_map = {sp["guid"]: sp.get("bbox") for sp in idx.get("spaces", []) if sp.get("bbox")}
            except Exception:
                pass

            rooms = []
            for s in M.get("spaces", []):
                guid = s.get("guid") or str(s.get("id"))
                name = s.get("long") or s.get("name") or "Space"
                num = s.get("name")
                bbox = space_box_map.get(guid)
                dims_m = None
                if bbox and len(bbox) == 6:
                    dx = abs(bbox[3] - bbox[0])
                    dy = abs(bbox[4] - bbox[1])
                    dz = abs(bbox[5] - bbox[2])
                    dims_m = {
                        "L": round(max(dx, dy), 2),
                        "B": round(min(dx, dy), 2),
                        "H": round(dz, 2) if dz > 0 else None,
                    }

                rooms.append({
                    "space_id": guid,
                    "name": name,
                    "number": num,
                    "area_m2": s.get("area_m2"),
                    "dims_m": dims_m,
                    "bbox_px": [0, 0, 0, 0],
                    "polygon_px": None,
                })
            return {
                "path": path,
                "image_size": image_size,
                "rooms": rooms,
                "warnings": ["3D model spaces list (2D plan overlay not available)"] if not rooms else [],
            }
        except Exception as e:
            return {
                "path": path,
                "image_size": image_size,
                "rooms": [],
                "warnings": [f"Failed to read IFC spaces: {e}"],
            }

    # 4. CubiCasa5k and user uploaded raster plans
    return {
        "path": path,
        "image_size": image_size,
        "rooms": [],
        "warnings": ["no room outlines for raster plans"],
    }


def get_plan_rooms(path: str, page: int = 1) -> dict[str, Any]:
    """Return all rooms on this 2D plan, in image pixel coordinates,

    enriched with site status (collab.py) and media count (media.py).
    """
    clean_p = path.replace("\\", "/").strip()
    raw = _rooms_geometry(clean_p, page=page)

    # Dynamic status from collab.py
    collab_data = collab.load()
    statuses = collab_data.get("status", {})

    # Dynamic media count from media.py
    all_media = media.list_media()
    media_counts: dict[str, int] = collections.Counter(
        m.get("space_id") for m in all_media if m.get("space_id")
    )

    enriched_rooms = []
    for r in raw.get("rooms", []):
        sid = r["space_id"]
        status_entry = statuses.get(sid)
        st = status_entry.get("status") if isinstance(status_entry, dict) else None
        mc = media_counts.get(sid, 0)
        enriched_rooms.append({
            **r,
            "status": st,
            "media_count": mc,
        })

    out: dict[str, Any] = {
        "path": raw["path"],
        "image_size": raw["image_size"],
        "rooms": enriched_rooms,
    }
    if "warnings" in raw:
        out["warnings"] = raw["warnings"]
    return out


# Expose cache methods and alias
get_plan_rooms.cache_clear = _rooms_geometry.cache_clear  # type: ignore[attr-defined]
get_plan_rooms.cache_info = _rooms_geometry.cache_info  # type: ignore[attr-defined]
plan_rooms = get_plan_rooms
