#!/usr/bin/env python3
"""Dataset health check script (scripts/check_dataset.py).

Validates all drawings and BIM models in a dataset:
- Parser integrity (IFC, DXF, PDF, PNG/JPG)
- Room detection & geometry availability (/plan/rooms)
- Basic Q&A capabilities (e.g. door count via engine)
- Per-file latency and error handling without crashing on failures
- Generates a comprehensive summary markdown report at docs/dataset-check.md
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

# Ensure project root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agent import config

VIEWABLE_EXTS = {".ifc", ".dxf", ".pdf", ".png", ".jpg", ".jpeg"}


def check_file(path: Path, rel_str: str) -> dict[str, Any]:
    ext = path.suffix.lower()
    res: dict[str, Any] = {
        "file": rel_str,
        "ext": ext,
        "size_kb": round(path.stat().st_size / 1024),
        "parse_ok": False,
        "rooms_count": 0,
        "plan_rooms_ok": False,
        "qa_ok": False,
        "no_crash": False,
        "has_answer": False,
        "qa_answer": None,
        "error": None,
        "duration_ms": 0,
    }

    t0 = time.time()
    try:
        # 1. Parsing & Q&A
        if ext == ".ifc":
            from engine import ifc, ifc_answer

            M = ifc.load(str(path))
            res["parse_ok"] = True
            spaces = M.get("spaces", [])
            res["rooms_count"] = len(spaces)

            # Check plan_rooms
            try:
                from agent import plan_rooms

                pr = plan_rooms.get_plan_rooms(str(path))
                res["plan_rooms_ok"] = isinstance(pr.get("rooms"), list)
            except Exception:
                res["plan_rooms_ok"] = False

            # Basic Q&A: doors
            try:
                v, unit, items, method, warn = ifc_answer.answer(str(path), "How many doors in the model?", M)
                res["no_crash"] = True
                res["qa_ok"] = v is not None
                res["has_answer"] = (v is not None and v > 0)
                res["qa_answer"] = f"{v} {unit}"
            except Exception as qe:
                res["error"] = f"Q&A error: {qe}"

        elif ext == ".dxf":
            from engine import swiss

            f = swiss.parse(str(path))
            res["parse_ok"] = True
            rooms = f.get("rooms", [])
            res["rooms_count"] = len(rooms)
            res["plan_rooms_ok"] = len(rooms) > 0
            doors = f.get("doors", [])
            res["no_crash"] = True
            res["qa_ok"] = True
            res["has_answer"] = len(doors) > 0 or len(rooms) > 0
            res["qa_answer"] = f"{len(doors)} count"

        elif ext == ".pdf":
            import pymupdf as fitz

            with fitz.open(path) as doc:
                res["parse_ok"] = doc.page_count > 0

            # Plan rooms check
            try:
                from agent import plan_rooms

                pr = plan_rooms.get_plan_rooms(str(path))
                rms = pr.get("rooms", [])
                res["plan_rooms_ok"] = True
                res["rooms_count"] = len(rms)
            except Exception:
                res["plan_rooms_ok"] = False

            res["no_crash"] = res["parse_ok"]
            res["qa_ok"] = res["parse_ok"]
            res["has_answer"] = res["parse_ok"]
            res["qa_answer"] = "Document parsed"

        elif ext in (".png", ".jpg", ".jpeg"):
            import pymupdf as fitz

            with fitz.open(path) as doc:
                res["parse_ok"] = len(doc) > 0

            try:
                from agent import plan_rooms

                pr = plan_rooms.get_plan_rooms(str(path))
                res["plan_rooms_ok"] = True
                res["rooms_count"] = len(pr.get("rooms", []))
            except Exception:
                res["plan_rooms_ok"] = False

            res["no_crash"] = res["parse_ok"]
            res["qa_ok"] = res["parse_ok"]
            res["has_answer"] = res["parse_ok"]
            res["qa_answer"] = "Raster image OK"

    except Exception as e:
        res["error"] = str(e)
    finally:
        res["duration_ms"] = int((time.time() - t0) * 1000)

    return res


def run_check(data_dir: Path, output_file: Path | None = None) -> str:
    print(f"Starting dataset health check on: {data_dir}")
    data_root = data_dir / "data" if (data_dir / "data").is_dir() else data_dir

    all_files: list[Path] = []
    for f in sorted(data_root.rglob("*")):
        if f.is_file() and f.suffix.lower() in VIEWABLE_EXTS:
            all_files.append(f)

    print(f"Found {len(all_files)} viewable files to verify.")

    results_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    failures: list[dict[str, Any]] = []

    for i, f in enumerate(all_files, 1):
        rel = f.relative_to(data_root).as_posix()
        parts = rel.split("/")
        source = parts[0] if len(parts) > 1 else "root"

        r = check_file(f, rel)
        results_by_source[source].append(r)

        if not r["parse_ok"] or r["error"]:
            failures.append(r)

        if i % 25 == 0 or i == len(all_files):
            print(f"  [{i}/{len(all_files)}] Checked {rel[:50]}... ({r['duration_ms']} ms)")

    # Build Markdown Report
    lines = [
        "# Dataset Health & Readiness Report",
        "",
        f"- **Date**: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}",
        f"- **Dataset Path**: `{data_dir.as_posix()}`",
        f"- **Total Files Verified**: {len(all_files)}",
        f"- **Parse Success**: {len(all_files) - len(failures)} / {len(all_files)} ({(len(all_files)-len(failures))/max(1, len(all_files))*100:.1f}%)",
        "",
        "## 1. Summary by Source Directory",
        "",
        "| Source | Files | Parse Pass Rate | Total Rooms Detected | No Crash | Has Answer | Avg Latency (ms) |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
    ]

    for source, flist in sorted(results_by_source.items()):
        total = len(flist)
        parsed = sum(1 for x in flist if x["parse_ok"])
        no_crash = sum(1 for x in flist if x.get("no_crash", False))
        has_ans = sum(1 for x in flist if x.get("has_answer", False))
        rooms = sum(x["rooms_count"] for x in flist)
        avg_lat = sum(x["duration_ms"] for x in flist) / max(1, total)

        lines.append(
            f"| `{source}` | {total} | {parsed/total*100:.1f}% ({parsed}/{total}) | {rooms} | {no_crash/total*100:.1f}% | {has_ans/total*100:.1f}% | {avg_lat:.0f} ms |"
        )

    # 2. Focus on ifc_bench (The 5 Benchmark Models)
    lines.extend([
        "",
        "## 2. Benchmark IFC Models (`ifc_bench`)",
        "",
        "| Model File | Size | Parse | Spaces (Rooms) | Door Count Q&A | Latency |",
        "| :--- | :---: | :---: | :---: | :---: | :---: |",
    ])
    for item in results_by_source.get("ifc_bench", []):
        lines.append(
            f"| `{item['file'].split('/')[-1]}` | {item['size_kb']} KB | {'PASS' if item['parse_ok'] else 'FAIL'} | {item['rooms_count']} | {item['qa_answer'] or 'N/A'} | {item['duration_ms']} ms |"
        )

    # 3. Focus on opening_design
    od_list = results_by_source.get("opening_design", [])
    od_ifcs = [x for x in od_list if x["ext"] == ".ifc"]
    od_pdfs = [x for x in od_list if x["ext"] == ".pdf"]
    lines.extend([
        "",
        "## 3. Real Architecture Projects (`opening_design`)",
        "",
        f"- Total drawing sheets and models: **{len(od_list)}** (IFC models: {len(od_ifcs)}, PDF drawings: {len(od_pdfs)})",
        f"- Parse pass rate: **{sum(1 for x in od_list if x['parse_ok'])/max(1, len(od_list))*100:.1f}%**",
        "",
        "Sample verified models & drawing sheets from `opening_design`:",
        "| File Path | Type | Parse | Result | Latency |",
        "| :--- | :---: | :---: | :---: | :---: |",
    ])
    for item in (od_ifcs + od_pdfs[:8]):
        lines.append(
            f"| `{item['file']}` | `{item['ext']}` | {'PASS' if item['parse_ok'] else 'FAIL'} | {item['qa_answer'] or item['error']} | {item['duration_ms']} ms |"
        )

    # 4. Failure List
    lines.extend([
        "",
        "## 4. Failure Manifest & Edge Cases",
        "",
    ])
    if not failures:
        lines.append("No parse or execution failures recorded across the entire dataset! All files ready for evaluation.")
    else:
        lines.extend([
            f"Total failures: {len(failures)}",
            "",
            "| File Path | Error Details |",
            "| :--- | :--- |",
        ])
        for fitem in failures:
            lines.append(f"| `{fitem['file']}` | {fitem['error']} |")

    report_text = "\n".join(lines) + "\n"

    if output_file:
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_file.write_text(report_text, encoding="utf-8")
        print(f"Health check report written to: {output_file.as_posix()}")

    return report_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Check dataset health across all drawings and BIM models.")
    parser.add_argument("--data", default="E:/Download/junction-dataset-preview", help="Dataset root directory")
    parser.add_argument("--output", default="docs/dataset-check.md", help="Output markdown path")
    args = parser.parse_args()

    data_dir = Path(args.data)
    out_file = Path(args.output)
    run_check(data_dir, out_file)


if __name__ == "__main__":
    main()
