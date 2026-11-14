"""Project sheet sets (Xinran's engine.sheetset): every drawing of a project sorted by discipline and level,
and "which sheet answers this question" (rules only, no model calls)."""
from __future__ import annotations
import os, re, threading
from pathlib import Path
from . import config

DISC_LABEL = {"architecture": "Architecture", "structural": "Structural", "plumbing": "Plumbing", "hvac": "HVAC",
              "electrical": "Electrical", "fire": "Fire safety", "landscape": "Site & landscape", "other": "Other documents"}
ORDER = list(DISC_LABEL)
SKIP = (".dwg", ".rvt", ".skp", ".blend", ".svg", ".json", ".md", ".txt", ".csv", ".zip", ".db", ".log")
_cache: dict[str, dict] = {}
_lock = threading.Lock()


def _project(pid: str) -> dict | None:
    from . import catalog
    for p in catalog.tree().get("projects", []):
        if p.get("id") == pid:
            return p
    return None


def _rel(p: Path) -> str:
    return p.resolve().relative_to(config.DATA_DIR).as_posix()


def project_files(p: dict) -> list[Path]:
    """All drawings that belong to the project: the whole project folder for opening_design-style sets,
    otherwise the files next to the model/plan that share its name stem."""
    paths = [x for x in (p.get("model"), p.get("plan")) if x]
    if not paths:
        return []
    first = (config.DATA_DIR / paths[0]).resolve()
    parts = first.relative_to(config.DATA_DIR).parts
    if "opening_design" in parts:
        i = parts.index("opening_design")
        root = config.DATA_DIR.joinpath(*parts[: i + 2])
        files = [Path(d) / f for d, _, fs in os.walk(root) for f in sorted(fs)]
    else:
        stems = {re.sub(r"_plan-.*$", "", Path(x).stem) for x in paths}
        files = [f for f in first.parent.iterdir() if f.is_file() and any(f.name.startswith(s) for s in stems)]
    files = [f for f in files if not f.name.startswith(".") and f.suffix.lower() not in SKIP and f.name.upper() != "LICENSE.MD"]
    return sorted(set(files))[:300]


def _scan(pid: str) -> tuple[dict | None, dict]:
    from engine import sheetset as S
    with _lock:
        if pid in _cache:
            return _cache[pid]["project"], _cache[pid]["ss"]
    p = _project(pid)
    if not p:
        return None, {"projects": []}
    files = project_files(p)
    ss = S.scan([str(f) for f in files], max_pages=60) if files else {"projects": []}
    with _lock:
        _cache[pid] = {"project": p, "ss": ss}
    return p, ss


def _sheet(s: dict) -> dict:
    lvl = s.get("level")
    level = None if lvl is None else ("Basement %s" % lvl[1:] if str(lvl).startswith("B") else "Level %s" % lvl)
    return {"path": _rel(Path(s["path"])), "page": int(s.get("page") or 0) + 1, "kind": s.get("kind"),
            "discipline": s.get("discipline") or "other", "level": level, "title": s.get("title"),
            "sheet_no": s.get("sheet_no"), "scale": s.get("scale"), "why": s.get("reasons") or []}


def catalogue(pid: str) -> dict:
    p, ss = _scan(pid)
    if p is None:
        return {"project": pid, "count": 0, "groups": [], "error": "unknown project"}
    from engine import sheetset as S
    sheets = [_sheet(s) for _, _, s in S._sheets(ss)]
    groups = []
    for d in ORDER:
        g = [s for s in sheets if s["discipline"] == d]
        if g:
            g.sort(key=lambda s: (s["level"] is None, s["level"] or "", s["kind"] or "", s["path"], s["page"]))
            groups.append({"discipline": d, "label": DISC_LABEL[d], "sheets": g})
    try:
        import pypdfium2, sys
        diag = f"pypdfium2 {getattr(getattr(pypdfium2, 'version', None), 'PYPDFIUM_INFO', '?')} / {sys.platform}"
    except Exception as e:
        diag = f"pypdfium2 unavailable: {e}"
    return {"project": pid, "count": len(sheets), "groups": groups, "reader": diag}


def pick(pid: str, question: str, current: str | None = None, n: int = 3) -> dict:
    p, ss = _scan(pid)
    if p is None:
        return {"picks": [], "error": "unknown project"}
    from engine import sheetset as S
    cur = str((config.DATA_DIR / current).resolve()) if current else None
    out = []
    for x in S.pick(question, ss, current=cur, n=n):
        s = _sheet({**x, "reasons": x.get("why")})
        s["score"] = x.get("score")
        out.append(s)
    return {"picks": out}
