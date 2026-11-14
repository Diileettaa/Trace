"""List the drawings and models in the dataset so the UI can offer a picker instead of a typed path."""
from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache

from . import config

KINDS = {".ifc": "3d", ".pdf": "plan", ".png": "plan", ".jpg": "plan", ".jpeg": "plan"}
# The models the demo data (scripts/seed_demo.py) is written for: shown first.
FEATURED = ["data/ifc_models/bsc-esplanades_1807-ep-ar-v18.ifc",
            "data/ifc_models/bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus.pdf",
            "data/swiss_dwellings/site1000_bldg2082_floor9385.pdf",
            "data/ifc_bench/ac20_arc.ifc"]
LABELS = {"swiss_dwellings": "Swiss apartment plans (vector)", "ifc_models": "BIM models (IFC) and their floor plans",
          "ifc_bench": "BIM models (IFC)", "cubicasa5k": "Scanned floor plans (raster)"}


@lru_cache(maxsize=1)
def catalog() -> dict:
    root = config.DATA_DIR
    qcount: Counter = Counter()
    qf = root / "questions.jsonl"
    if qf.exists():
        for line in qf.open(encoding="utf-8"):
            try:
                qcount[json.loads(line)["path"]] += 1
            except (ValueError, KeyError):
                pass
    sources = []
    data = root / "data"
    for d in sorted(p for p in data.iterdir() if p.is_dir()) if data.is_dir() else []:
        items = []
        for f in sorted(d.iterdir()):
            kind = KINDS.get(f.suffix.lower())
            if not kind:
                continue
            path = f"data/{d.name}/{f.name}"
            items.append({"path": path, "name": f.stem, "kind": kind, "size_kb": round(f.stat().st_size / 1024),
                          "questions": qcount.get(path, 0)})
        if items:
            sources.append({"source": d.name, "label": LABELS.get(d.name, d.name.replace("_", " ")),
                            "count": len(items), "items": items})
    all_paths = {i["path"] for s in sources for i in s["items"]}
    return {"featured": [p for p in FEATURED if p in all_paths], "sources": sources}
