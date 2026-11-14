"""Dataset drawings and models as a folder tree and project cards (T-27).

Tree: source folder -> group (building / model / project / style) -> files.
Supports:
1. Featured project cards (when present in dataset).
2. Auto-generation of project cards for all IFC models (paired with 2D plan PDFs) and Swiss buildings.
3. User-uploaded files (from CACHE_DIR/uploads) as 'uploaded' source and project cards.
4. Caching to CACHE_DIR/catalog.json for sub-second responses on large datasets (10GB+).
5. Search & pagination via search_projects(q, offset, limit).
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from . import config

logger = logging.getLogger("trace.catalog")

VIEWABLE = {".ifc": "3d", ".pdf": "plan", ".png": "plan", ".jpg": "plan", ".jpeg": "plan", ".svg": "plan"}
FEATURED = [
    "data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
    "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf",
    "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf",
    "data/ifc_bench/ac20_arc.ifc",
]

# Start screen of the Project page: featured projects (the demo data is written for them).
FEATURED_PROJECTS = [
    {
        "id": "esplanades",
        "title": "Apartment building, Tallinn",
        "subtitle": "BIM model + floor plan · demo team data",
        "description": "Six-storey residential building. Room status, notes, photos and furniture are already filled in.",
        "model": "data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
        "plan": "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf",
        "demo_data": True,
    },
    {
        "id": "swiss",
        "title": "Swiss apartment floor",
        "subtitle": "Vector floor plan · exact areas",
        "description": "Two apartments on one floor: rooms, areas and fixtures computed from the drawing.",
        "model": None,
        "plan": "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf",
        "demo_data": True,
    },
    {
        "id": "fzk",
        "title": "Family house (FZK-Haus)",
        "subtitle": "Small BIM model · good for walking through",
        "description": "Two-storey house with basement and attic: try the floors, rooms and walk mode.",
        "model": "data/ifc_bench/ac20_arc.ifc",
        "plan": None,
        "demo_data": False,
    },
    {
        "id": "clinic",
        "title": "Clinic – plumbing",
        "subtitle": "BIM model · one trade only",
        "description": "Pipes and sanitary fixtures of a medical clinic: what a plumber sees.",
        "model": "data/ifc_models/bsc-clinic_clinic-plumbing.ifc",
        "plan": None,
        "demo_data": False,
    },
]

PROJECTS = FEATURED_PROJECTS  # backwards compatibility

SOURCES = {  # folder -> (label, description, order)
    "ifc_models": ("BIM models", "3D building models (IFC) with their floor-plan sheets", 0),
    "ifc_bench": ("BIM models – benchmark", "More 3D building models (IFC)", 1),
    "swiss_dwellings": ("Swiss apartments", "Vector floor plans of Swiss apartment buildings, one sheet per floor", 2),
    "cubicasa5k": ("Scanned floor plans", "Finnish apartment floor plans as images (no vector data)", 3),
    "opening_design": ("Architecture projects", "Real project drawing sets (PDF) and models", 4),
    "habs": ("Historic drawings – USA (HABS)", "Historic American Buildings Survey sheets", 5),
    "finna": ("Historic drawings – Finland", "Archive drawings from Finna", 6),
    "europeana": ("Historic drawings – Europe", "Archive drawings from Europeana", 7),
    "wikimedia": ("Drawings – Wikimedia", "Floor plans and sections from Wikimedia Commons", 8),
}
SWISS = re.compile(r"site(\d+)_bldg(\d+)_floor(\d+)")
CUBI_STYLE = {
    "colorful": "Colour plans",
    "high_quality": "High-quality plans",
    "high_quality_architectural": "Architectural-style plans",
}


def _pretty(stem: str) -> str:
    return re.sub(r"[_\-]+", " ", stem).strip()


def _group_and_label(source: str, rel: str, stem: str, models: list[str]) -> tuple[str, str]:
    if source == "swiss_dwellings":
        m = SWISS.match(stem)
        if m:
            return f"Site {m[1]} · Building {m[2]}", f"Floor {m[3]}"
    if source in ("ifc_models", "ifc_bench"):
        model = next((x for x in sorted(models, key=len, reverse=True) if stem == x or stem.startswith(x + "_")), None)
        if rel.lower().endswith(".ifc"):
            return _pretty(stem), "3D model"
        if model is None:
            model = stem.split("_plan-")[0]
        return _pretty(model), "Plan " + _pretty(stem[len(model):].removeprefix("_plan-") or stem)
    if source == "cubicasa5k":
        style = stem.rsplit("-", 1)[0]
        return CUBI_STYLE.get(style, _pretty(style)), "Plan " + stem.rsplit("-", 1)[-1]
    if source == "opening_design":
        parts = rel.split("/")
        return _pretty(parts[0]), " / ".join(_pretty(p) for p in parts[1:-1] + [stem]) or _pretty(stem)
    return "All", _pretty(stem)[:60]


def _get_uploads_source_and_projects() -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """Scan CACHE_DIR/uploads for user-uploaded drawings and 3D models."""
    upload_dir = config.CACHE_DIR / "uploads"
    if not upload_dir.is_dir():
        return None, []

    manifest: dict[str, dict] = {}
    manifest_file = upload_dir / "manifest.json"
    if manifest_file.is_file():
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except Exception:
            manifest = {}

    items = []
    projects = []

    for f in sorted(upload_dir.iterdir()):
        if not f.is_file() or f.name == "manifest.json":
            continue
        ext = f.suffix.lower()
        if ext not in VIEWABLE:
            continue

        rel_path = f"uploads/{f.name}"
        kind = VIEWABLE[ext]
        size_kb = round(f.stat().st_size / 1024)
        orig_name = manifest.get(f.name, {}).get("filename") or f.name
        clean_title = _pretty(Path(orig_name).stem).title()

        items.append({
            "path": rel_path,
            "label": orig_name,
            "kind": kind,
            "size_kb": size_kb,
            "questions": 0,
        })

        if kind == "3d":
            projects.append({
                "id": f"uploaded-{f.stem[:12]}",
                "title": f"Upload: {clean_title}",
                "subtitle": "User-uploaded 3D BIM model",
                "description": f"Uploaded model file {orig_name} ({size_kb} KB).",
                "model": rel_path,
                "plan": None,
                "demo_data": False,
                "source": "uploaded",
            })
        else:
            projects.append({
                "id": f"uploaded-{f.stem[:12]}",
                "title": f"Upload: {clean_title}",
                "subtitle": "User-uploaded plan drawing",
                "description": f"Uploaded drawing file {orig_name} ({size_kb} KB).",
                "model": None,
                "plan": rel_path,
                "demo_data": False,
                "source": "uploaded",
            })

    if not items:
        return None, []

    source_obj = {
        "source": "uploaded",
        "label": "Uploaded files",
        "description": "User-uploaded drawings and 3D models",
        "license": "User data",
        "count": len(items),
        "groups": [{
            "name": "Uploaded files",
            "count": len(items),
            "items": sorted(items, key=lambda x: (x["kind"] != "3d", x["label"])),
        }],
    }
    return source_obj, projects


def _auto_generate_projects(paths: set[str], data_root: Path) -> list[dict[str, Any]]:
    """Generate projects for every IFC model and Swiss building in DATA_DIR."""
    auto_projects: list[dict[str, Any]] = []
    seen_pairs: set[tuple[str | None, str | None]] = set()

    # 1. IFC Models (exclude uploads which are handled separately)
    ifc_paths = [
        p for p in paths
        if p.lower().endswith(".ifc") and not p.startswith("uploads/") and not p.startswith("upload/")
    ]
    for ifc_p in sorted(ifc_paths):
        # Exclude empty autopsy / test fragment models in opening_design
        if "opening_design" in ifc_p.lower():
            if any(bad in ifc_p.lower() for bad in ("stairs.blend", "colored_shapes", "detail_yorik", "bad ifc", "autopsy")):
                continue

        model_name = Path(ifc_p).stem

        # Try to pair with a matching 2D floor plan PDF
        matched_plan = None
        plan_prefix = model_name
        for p in paths:
            if p.lower().endswith(".pdf") and (
                p.startswith(ifc_p[:-4]) or plan_prefix in Path(p).stem
            ):
                matched_plan = p
                break

        pair = (ifc_p, matched_plan)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        title = _pretty(model_name).title()
        subtitle = "BIM 3D model" + (" · floor plan" if matched_plan else "")
        parent_name = Path(ifc_p).parent.name
        auto_projects.append({
            "id": f"auto-ifc-{model_name[:24]}",
            "title": title,
            "subtitle": subtitle,
            "description": f"3D building model from {parent_name} ({Path(ifc_p).name}).",
            "model": ifc_p,
            "plan": matched_plan,
            "demo_data": False,
        })

    # 2. Swiss Dwellings buildings
    swiss_pdfs = [p for p in paths if "swiss_dwellings" in p and p.lower().endswith(".pdf")]
    buildings_seen: set[tuple[str, str]] = set()

    for pdf_p in sorted(swiss_pdfs):
        stem = Path(pdf_p).stem
        m = SWISS.match(stem)
        if m:
            site, bldg = m.group(1), m.group(2)
            if (site, bldg) not in buildings_seen:
                buildings_seen.add((site, bldg))
                pair = (None, pdf_p)
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    auto_projects.append({
                        "id": f"auto-swiss-s{site}-b{bldg}",
                        "title": f"Swiss Dwellings (Site {site}, Bldg {bldg})",
                        "subtitle": "Vector floor plan · exact areas",
                        "description": f"Swiss residential building {site}-{bldg} with vector geometry and fixture counts.",
                        "model": None,
                        "plan": pdf_p,
                        "demo_data": False,
                    })

    return auto_projects


def _drawing_sets(paths: set[str], taken: set[str]) -> list[dict[str, Any]]:
    """Real multi-sheet PDF sets (opening_design/<Project>/...) without an IFC project: one card each, so the
    sheet set (engine.sheetset) can sort their drawings and pick the sheet that answers a question."""
    by: dict[str, list[str]] = defaultdict(list)
    for p in paths:
        parts = p.split("/")
        if "opening_design" in parts and p.lower().endswith(".pdf"):
            i = parts.index("opening_design")
            if len(parts) > i + 2:
                by[parts[i + 1]].append(p)
    out = []
    for folder, pdfs in sorted(by.items(), key=lambda kv: -len(kv[1])):
        if folder in taken or len(pdfs) < 2:
            continue
        pdfs.sort(key=lambda x: (0 if re.search(r"floor|level|1st|2nd", Path(x).name, re.I) else 1 if re.search(r"plan", Path(x).name, re.I) and not re.search(r"site", x, re.I) else 2, x))
        out.append({
            "id": f"set-{folder}"[:40],
            "title": _pretty(folder).title(),
            "subtitle": f"Drawing set · {len(pdfs)} PDF files",
            "description": f"Real project drawing set ({folder}); the sheet menu sorts it by discipline and level.",
            "model": None,
            "plan": pdfs[0],
            "demo_data": False,
        })
    return out


def _get_dataset_mtime(data_dir: Path) -> float:
    """Calculate directory mtime for cache invalidation."""
    mtimes = []
    if data_dir.is_dir():
        mtimes.append(data_dir.stat().st_mtime)
        data_subdir = data_dir / "data"
        if data_subdir.is_dir():
            mtimes.append(data_subdir.stat().st_mtime)
            for d in data_subdir.iterdir():
                if d.is_dir():
                    mtimes.append(d.stat().st_mtime)
    uploads_dir = config.CACHE_DIR / "uploads"
    if uploads_dir.is_dir():
        mtimes.append(uploads_dir.stat().st_mtime)
    return max(mtimes, default=0.0)


def tree() -> dict[str, Any]:
    """Scan dataset drawings, auto-generate projects, and cache results to CACHE_DIR/catalog.json."""
    root = config.DATA_DIR
    data = root / "data"

    cache_dir = config.CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / "catalog.json"
    current_mtime = _get_dataset_mtime(root)

    # Check cache validity
    if cache_file.is_file():
        try:
            cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached_data.get("_mtime") == current_mtime:
                # Cache hit!
                cached_data.pop("_mtime", None)
                return cached_data
        except Exception as e:
            logger.debug("Catalog cache miss or parse error: %s", e)

    qcount: Counter = Counter()
    qf = root / "questions.jsonl"
    if qf.exists():
        try:
            for line in qf.open(encoding="utf-8"):
                try:
                    qcount[json.loads(line)["path"]] += 1
                except (ValueError, KeyError):
                    pass
        except Exception:
            pass

    out = []
    subdirs = (
        sorted((p for p in data.iterdir() if p.is_dir()), key=lambda p: (SOURCES.get(p.name, ("", "", 99))[2], p.name))
        if data.is_dir()
        else []
    )

    for d in subdirs:
        files = [f for f in d.rglob("*") if f.is_file() and f.suffix.lower() in VIEWABLE]
        if d.name == "swiss_dwellings":
            files = [f for f in files if f.suffix.lower() == ".pdf"]
        if d.name == "ifc_models":
            files = [f for f in files if f.suffix.lower() != ".svg"]

        models = [f.stem for f in files if f.suffix.lower() == ".ifc"]
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

        for f in sorted(files):
            rel = f.relative_to(d).as_posix()
            path = f"data/{d.name}/{rel}"
            g, label = _group_and_label(d.name, rel, f.stem, models)
            groups[g].append({
                "path": path,
                "label": label,
                "kind": VIEWABLE[f.suffix.lower()],
                "size_kb": round(f.stat().st_size / 1024),
                "questions": qcount.get(path, 0),
            })

        if not groups:
            continue

        lic = d / "LICENSE.md"
        label, desc, _ = SOURCES.get(d.name, (_pretty(d.name), "", 99))
        out.append({
            "source": d.name,
            "label": label,
            "description": desc,
            "license": next(
                (ln.strip() for ln in lic.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")),
                "",
            ) if lic.exists() else "",
            "count": sum(len(v) for v in groups.values()),
            "groups": [
                {
                    "name": k,
                    "count": len(v),
                    "items": sorted(v, key=lambda i: (i["kind"] != "3d", i["label"])),
                }
                for k, v in sorted(groups.items())
            ],
        })

    # Uploaded files
    upload_source, uploaded_projects = _get_uploads_source_and_projects()
    if upload_source:
        out.insert(0, upload_source)

    paths = {i["path"] for s in out for g in s["groups"] for i in g["items"]}

    # Featured projects (kept when model or plan exists)
    featured_projects = [
        p for p in FEATURED_PROJECTS
        if (p["model"] is None or p["model"] in paths) and (p["plan"] is None or p["plan"] in paths)
    ]
    featured_pairs = {(p["model"], p["plan"]) for p in featured_projects}

    # Auto-generate projects for all IFC models and Swiss buildings
    auto_projects = _auto_generate_projects(paths, data)
    auto_projects = [p for p in auto_projects if (p["model"], p["plan"]) not in featured_pairs]
    taken = {x.split("/")[x.split("/").index("opening_design") + 1] for p in featured_projects + auto_projects
             for x in (p.get("model"), p.get("plan")) if x and "opening_design" in x.split("/")}
    set_projects = _drawing_sets(paths, taken)

    # Combine all projects
    all_projects = featured_projects + set_projects[:3] + auto_projects + set_projects[3:] + uploaded_projects

    # /catalog top-level returns at most 12 projects
    top_projects = all_projects[:15]

    result = {
        "featured": [p for p in FEATURED if p in paths],
        "projects": top_projects,
        "all_projects_count": len(all_projects),
        "sources": out,
    }

    # Write cache
    try:
        cache_data = dict(result)
        cache_data["_all_projects"] = all_projects
        cache_data["_mtime"] = current_mtime
        cache_file.write_text(json.dumps(cache_data, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        logger.debug("Failed to write catalog cache: %s", e)

    return result


def get_all_projects() -> list[dict[str, Any]]:
    """Retrieve full un-truncated list of projects (for search & pagination)."""
    t = tree()
    cache_file = config.CACHE_DIR / "catalog.json"
    if cache_file.is_file():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if "_all_projects" in cached:
                return cached["_all_projects"]
        except Exception:
            pass
    return t.get("projects", [])


def search_projects(q: str = "", offset: int = 0, limit: int = 20) -> dict[str, Any]:
    """Search and paginate across all project cards (featured, auto, and uploaded)."""
    projects = get_all_projects()
    clean_q = q.strip().lower()

    if clean_q:
        matches = [
            p for p in projects
            if clean_q in p.get("title", "").lower()
            or clean_q in p.get("id", "").lower()
            or clean_q in p.get("subtitle", "").lower()
            or clean_q in p.get("description", "").lower()
            or clean_q in (p.get("model") or "").lower()
            or clean_q in (p.get("plan") or "").lower()
        ]
    else:
        matches = projects

    total = len(matches)
    paginated = matches[offset:offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "projects": paginated,
    }


def catalog(kind: str | None = None) -> dict[str, Any]:
    t = tree()
    if not kind:
        return t
    sources = []
    for s in t["sources"]:
        groups = [{**g, "items": [i for i in g["items"] if i["kind"] == kind]} for g in s["groups"]]
        groups = [{**g, "count": len(g["items"])} for g in groups if g["items"]]
        if groups:
            sources.append({**s, "groups": groups, "count": sum(g["count"] for g in groups)})
    return {
        "featured": [p for p in t["featured"] if p.endswith(".ifc") == (kind == "3d")],
        "projects": t["projects"],
        "all_projects_count": t.get("all_projects_count", len(t["projects"])),
        "sources": sources,
    }
