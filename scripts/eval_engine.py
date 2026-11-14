"""Evaluate the local data engine against sampled questions, without online APIs."""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ["GEMINI_API_KEY"] = ""
os.environ["NVIDIA_API_KEY"] = ""
os.environ["NVIDIA_VLM_MODEL"] = ""

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from agent import config, engine_adapter  # noqa: E402

SOURCES = ("swiss_dwellings", "ifc_models", "cubicasa5k")
CONTINUOUS_TYPES = {"area", "length", "volume"}
CONTINUOUS_UNITS = {"m2", "m^2", "m²", "m", "m3", "m^3", "m³", "ft2", "ft^2", "ft²"}
REPORT_PATH = REPO_ROOT / "docs" / "eval-results.md"


def source_for_path(path: str) -> str | None:
    parts = path.replace("\\", "/").split("/")
    if "data" in parts:
        index = parts.index("data") + 1
        if index < len(parts):
            return parts[index]
    return parts[0] if parts else None


def load_questions(path: Path) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"Skipping invalid JSON at {path}:{line_number}: {exc}", file=sys.stderr)
                continue
            if not isinstance(row, dict):
                continue
            source = source_for_path(str(row.get("path", "")))
            if source in SOURCES and "question" in row and "answer" in row:
                row["_line"] = line_number
                grouped[source].append(row)
    return grouped


def numeric(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def grade(question: dict[str, Any], result: dict[str, Any]) -> tuple[bool, str]:
    expected = numeric(question.get("answer"))
    actual = numeric(result.get("value"))
    if expected is None:
        return False, "unsupported non-numeric expected answer"
    if actual is None:
        return False, "engine returned no numeric value"

    kind = str(question.get("type", "")).lower()
    unit = str(question.get("unit", "")).lower()
    if kind == "count" or unit == "count":
        return actual == expected, "exact count" if actual == expected else "count mismatch"
    if kind in CONTINUOUS_TYPES or unit in CONTINUOUS_UNITS:
        within_tolerance = (actual == expected) if expected == 0 else abs(actual - expected) / abs(expected) <= 0.02
        return within_tolerance, "within 2%" if within_tolerance else "measurement error exceeds 2%"
    return False, f"unsupported answer type/unit ({kind or 'unknown'}/{unit or 'unknown'})"


def has_bbox(result: dict[str, Any]) -> bool:
    for source in result.get("sources") or []:
        if not isinstance(source, dict):
            continue
        box = source.get("bbox")
        if isinstance(box, (list, tuple)) and len(box) == 4:
            return True
    return False


def evaluate(groups: dict[str, list[dict[str, Any]]], n: int, seed: int | None) -> dict[str, dict[str, Any]]:
    rng = random.Random(seed)
    report: dict[str, dict[str, Any]] = {}
    for source in SOURCES:
        selected = rng.sample(groups.get(source, []), min(n, len(groups.get(source, []))))
        correct = 0
        boxed = 0
        failures: list[dict[str, Any]] = []
        for question_index, question in enumerate(selected, start=1):
            print(f"[{source}] {question_index}/{len(selected)}", flush=True)
            result: dict[str, Any] = {}
            error = ""
            try:
                result = engine_adapter.answer(str(question["path"]), str(question["question"]))
                if not isinstance(result, dict):
                    result = {}
                    error = "engine returned a non-object result"
            except Exception as exc:  # Keep evaluating other samples when one file/question fails.
                error = f"{type(exc).__name__}: {exc}"
            is_boxed = has_bbox(result)
            boxed += int(is_boxed)
            passed, reason = grade(question, result) if not error else (False, error)
            correct += int(passed)
            if not passed and len(failures) < 5:
                failures.append({
                    "path": question.get("path"),
                    "question": question.get("question"),
                    "expected": question.get("answer"),
                    "predicted": result.get("value"),
                    "reason": reason,
                    "has_bbox": is_boxed,
                })
        report[source] = {
            "sampled": len(selected),
            "available": len(groups.get(source, [])),
            "correct": correct,
            "boxed": boxed,
            "failures": failures,
        }
    return report


def markdown_report(results: dict[str, dict[str, Any]], n: int, seed: int | None, data_dir: Path) -> str:
    lines = [
        "# Engine Evaluation Results",
        "",
        f"- Generated (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"- Dataset directory: `{data_dir.name}` (path omitted)",
        f"- Sample size: up to {n} questions per source; sampling is random.",
        f"- Random seed: `{seed}`" if seed is not None else "- Random seed: not fixed",
        "- Scoring: counts must match exactly; area, length, and volume must be within 2% relative error. A zero expected measurement passes only on an exact zero.",
        "- Network use: none; Gemini and NVIDIA vision credentials are disabled. Each sample calls the local `agent.engine_adapter.answer(path, question)` only.",
        "- Bounding box: a result counts as boxed when at least one `sources` entry has a four-coordinate `bbox`.",
        "",
        "## Results by source",
        "",
        "| Source | Correct | Accuracy | With bbox | Bbox rate | Sampled / available |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for source in SOURCES:
        item = results[source]
        sampled = item["sampled"]
        accuracy = item["correct"] / sampled * 100 if sampled else 0.0
        bbox_rate = item["boxed"] / sampled * 100 if sampled else 0.0
        lines.append(
            f"| `{source}` | {item['correct']}/{sampled} | {accuracy:.1f}% | "
            f"{item['boxed']}/{sampled} | {bbox_rate:.1f}% | {sampled}/{item['available']} |"
        )
    lines.extend(["", "## Failed examples (up to five per source)", ""])
    for source in SOURCES:
        lines.extend([f"### {source}", ""])
        failures = results[source]["failures"]
        if not failures:
            lines.extend(["No failures in this sample.", ""])
            continue
        for index, failure in enumerate(failures, start=1):
            question = str(failure["question"]).replace("\n", " ")
            lines.append(
                f"{index}. `{failure['path']}` — {question} "
                f"Expected `{failure['expected']}`, got `{failure['predicted']}`. "
                f"Reason: {failure['reason']}. Bbox: {'yes' if failure['has_bbox'] else 'no'}."
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=50, help="random questions per source (default: 50)")
    parser.add_argument("--seed", type=int, default=None, help="optional random seed for repeatable samples")
    parser.add_argument("--questions", type=Path, default=config.DATA_DIR / "questions.jsonl",
                        help="questions.jsonl path (default: DATA_DIR/questions.jsonl)")
    args = parser.parse_args()
    if args.n < 1:
        parser.error("--n must be at least 1")
    if not args.questions.is_file():
        parser.error(f"questions file not found: {args.questions}")

    groups = load_questions(args.questions)
    results = evaluate(groups, args.n, args.seed)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(markdown_report(results, args.n, args.seed, config.DATA_DIR), encoding="utf-8")
    for source in SOURCES:
        item = results[source]
        print(f"{source}: {item['correct']}/{item['sampled']} correct; {item['boxed']}/{item['sampled']} with bbox")
    print(f"Wrote {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
