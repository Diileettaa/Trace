"""Dataset drawings and models as a folder tree, so people pick a drawing by browsing instead of typing a path.

Tree: source folder -> group (building / model / project / style) -> files. Each file: path (dataset-relative),
label, kind ("3d" for IFC, "plan" for PDF/PNG/JPG/SVG), number of dataset questions about it."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from functools import lru_cache

from . import config

VIEWABLE = {".ifc": "3d", ".pdf": "plan", ".png": "plan", ".jpg": "plan", ".jpeg": "plan", ".svg": "plan"}
FEATURED = ["data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
            "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf",
            "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf",
            "data/ifc_bench/ac20_arc.ifc"]
# Start screen of the Project page: a few ready-made projects, one click each (the demo data is written for them).
PROJECTS = [
    {"id": "esplanades", "title": "Apartment building, Tallinn", "subtitle": "BIM model + floor plan · demo team data",
     "description": "Six-storey residential building. Room status, notes, photos and furniture are already filled in.",
     "model": "data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
     "plan": "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf", "demo_data": True},
    {"id": "swiss", "title": "Swiss apartment floor", "subtitle": "Vector floor plan · exact areas",
     "description": "Two apartments on one floor: rooms, areas and fixtures computed from the drawing.",
     "model": None, "plan": "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf", "demo_data": True},
    {"id": "fzk", "title": "Family house (FZK-Haus)", "subtitle": "Small BIM model · good for walking through",
     "description": "Two-storey house with basement and attic: try the floors, rooms and walk mode.",
     "model": "data/ifc_bench/ac20_arc.ifc", "plan": None, "demo_data": False},
    {"id": "clinic", "title": "Clinic – plumbing", "subtitle": "BIM model · one trade only",
     "description": "Pipes and sanitary fixtures of a medical clinic: what a plumber sees.",
     "model": "data/ifc_models/bsc-clinic_clinic-plumbing.ifc", "plan": None, "demo_data": False},
]

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
CUBI_STYLE = {"colorful": "Colour plans", "high_quality": "High-quality plans",
              "high_quality_architectural": "Architectural-style plans"}


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
        if model is None:  # a plan sheet whose IFC model is not in this copy of the dataset
            model = stem.split("_plan-")[0]
        return _pretty(model), "Plan " + _pretty(stem[len(model):].removeprefix("_plan-") or stem)
    if source == "cubicasa5k":
        style = stem.rsplit("-", 1)[0]
        return CUBI_STYLE.get(style, _pretty(style)), "Plan " + stem.rsplit("-", 1)[-1]
    if source == "opening_design":
        parts = rel.split("/")
        return _pretty(parts[0]), " / ".join(_pretty(p) for p in parts[1:-1] + [stem]) or _pretty(stem)
    return "All", _pretty(stem)[:60]


@lru_cache(maxsize=1)
def tree() -> dict:
    root = config.DATA_DIR
    qcount: Counter = Counter()
    qf = root / "questions.jsonl"
    if qf.exists():
        for line in qf.open(encoding="utf-8"):
            try:
                qcount[json.loads(line)["path"]] += 1
            except (ValueError, KeyError):
                pass
    data = root / "data"
    out = []
    for d in sorted((p for p in data.iterdir() if p.is_dir()), key=lambda p: (SOURCES.get(p.name, ("", "", 99))[2], p.name)) \
            if data.is_dir() else []:
        files = [f for f in d.rglob("*") if f.is_file() and f.suffix.lower() in VIEWABLE]
        if d.name == "swiss_dwellings":  # one sheet per floor: keep the PDF, drop the PNG/DXF twins
            files = [f for f in files if f.suffix.lower() == ".pdf"]
        if d.name == "ifc_models":  # SVGs are machine overlays of the plan PDFs
            files = [f for f in files if f.suffix.lower() != ".svg"]
        models = [f.stem for f in files if f.suffix.lower() == ".ifc"]
        groups: dict[str, list] = defaultdict(list)
        for f in sorted(files):
            rel = f.relative_to(d).as_posix()
            path = f"data/{d.name}/{rel}"
            g, label = _group_and_label(d.name, rel, f.stem, models)
            groups[g].append({"path": path, "label": label, "kind": VIEWABLE[f.suffix.lower()],
                              "size_kb": round(f.stat().st_size / 1024), "questions": qcount.get(path, 0)})
        if not groups:
            continue
        lic = d / "LICENSE.md"
        label, desc, _ = SOURCES.get(d.name, (_pretty(d.name), "", 99))
        out.append({"source": d.name, "label": label, "description": desc,
                    "license": next((ln.strip() for ln in lic.read_text(encoding="utf-8").splitlines()
                                     if ln.strip() and not ln.startswith("#")), "") if lic.exists() else "",
                    "count": sum(len(v) for v in groups.values()),
                    "groups": [{"name": k, "count": len(v),
                                "items": sorted(v, key=lambda i: (i["kind"] != "3d", i["label"]))}
                               for k, v in sorted(groups.items())]})
    paths = {i["path"] for s in out for g in s["groups"] for i in g["items"]}
    projects = [p for p in PROJECTS if all(x is None or x in paths for x in (p["model"], p["plan"]))]
    return {"featured": [p for p in FEATURED if p in paths], "projects": projects, "sources": out}


def catalog(kind: str | None = None) -> dict:
    t = tree()
    if not kind:
        return t
    sources = []
    for s in t["sources"]:
        groups = [{**g, "items": [i for i in g["items"] if i["kind"] == kind]} for g in s["groups"]]
        groups = [{**g, "count": len(g["items"])} for g in groups if g["items"]]
        if groups:
            sources.append({**s, "groups": groups, "count": sum(g["count"] for g in groups)})
    return {"featured": [p for p in t["featured"] if p.endswith(".ifc") == (kind == "3d")], "projects": t["projects"],
            "sources": sources}
