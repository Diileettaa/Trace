"""Cost and latency benchmark report generator.

Samples questions per dataset source (swiss_dwellings, ifc_models, cubicasa5k),
executes POST /ask?fresh=true, evaluates accuracy, tokens, cost, and latency,
and outputs docs/cost-report.md.

Only uses the standard library. Supports --dry-run and injectable requesters.
"""
from __future__ import annotations

import argparse
import datetime
import json
import random
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Callable

Requester = Callable[[str, str, dict[str, str] | None, bytes | None], tuple[int, dict[str, str], bytes]]

DEFAULT_SOURCES = ["swiss_dwellings", "ifc_models", "cubicasa5k"]


def default_requester(
    method: str,
    url: str,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
) -> tuple[int, dict[str, str], bytes]:
    """Default HTTP requester using standard library urllib."""
    hdrs = headers.copy() if headers else {}
    if "User-Agent" not in hdrs:
        hdrs["User-Agent"] = "Trace-CostReport/1.0"

    req = urllib.request.Request(url, data=body, headers=hdrs, method=method.upper())
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp_headers = {k.lower(): v for k, v in resp.headers.items()}
            return resp.status, resp_headers, resp.read()
    except urllib.error.HTTPError as e:
        resp_headers = {k.lower(): v for k, v in e.headers.items()}
        return e.code, resp_headers, e.read()


def extract_actual_value(resp_data: dict[str, Any]) -> Any:
    """Extract answer value: from answer_from_engine tool output first,

    falling back to the first number in answer_text.
    """
    for ev in resp_data.get("evidence", []):
        if ev.get("tool") == "answer_from_engine":
            out = ev.get("output")
            if isinstance(out, dict):
                v = out.get("value")
                if v is not None:
                    return v
            elif out is not None:
                return out

    # Fallback to first numeric token in answer_text
    txt = resp_data.get("answer_text", "")
    m = re.search(r"[-+]?(?:\d*\.\d+|\d+)", str(txt))
    if m:
        try:
            val = float(m.group(0))
            return int(val) if val.is_integer() else val
        except ValueError:
            pass
    return None


def is_answer_correct(actual: Any, expected: Any, q_type: str = "", unit: str = "") -> bool:
    """Evaluate correctness: exact match for counts, within 2% margin for area/measurements."""
    if actual is None or expected is None:
        return False
    if actual == expected:
        return True

    try:
        act_f = float(actual)
        exp_f = float(expected)
        if act_f == exp_f:
            return True

        is_area = (
            q_type in ("area", "measurement")
            or any(u in str(unit).lower() for u in ("m2", "m²", "sqm", "meter", "metre"))
            or isinstance(expected, float)
        )
        if is_area and exp_f != 0.0:
            rel_error = abs(act_f - exp_f) / abs(exp_f)
            # Within 2% margin
            if rel_error <= 0.02001:
                return True
    except (ValueError, TypeError):
        pass

    return False


def compute_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    """Calculate aggregated accuracy, tokens, latency, and cost statistics."""
    total = len(records)
    if total == 0:
        return {
            "total": 0,
            "correct": 0,
            "accuracy_pct": 0.0,
            "zero_llm_pct": 0.0,
            "avg_tokens": 0.0,
            "avg_latency_ms": 0.0,
            "median_latency_ms": 0.0,
            "total_cost_usd": 0.0,
            "cost_per_1k_usd": 0.0,
        }

    correct_count = sum(1 for r in records if r["correct"])
    zero_llm_count = sum(1 for r in records if not r["llm_used"])
    total_tokens = sum(r["tokens"] for r in records)
    total_cost = sum(r["cost_usd"] for r in records)
    latencies = [r["duration_ms"] for r in records]

    return {
        "total": total,
        "correct": correct_count,
        "accuracy_pct": round((correct_count / total) * 100.0, 1),
        "zero_llm_pct": round((zero_llm_count / total) * 100.0, 1),
        "avg_tokens": round(total_tokens / total, 1),
        "avg_latency_ms": round(statistics.mean(latencies), 1),
        "median_latency_ms": round(statistics.median(latencies), 1),
        "total_cost_usd": round(total_cost, 6),
        "cost_per_1k_usd": round((total_cost / total) * 1000.0, 4),
    }


def generate_markdown_report(
    base_url: str,
    timestamp: str,
    per_source: int,
    seed: int,
    records: list[dict[str, Any]],
) -> str:
    """Format evaluation records into the final docs/cost-report.md document."""
    overall = compute_metrics(records)

    lines: list[str] = [
        "# Inference Cost and Latency Report",
        "",
        f"- **Target URL**: `{base_url}`",
        f"- **Evaluated At**: `{timestamp}`",
        f"- **Sampling**: `{per_source}` questions sampled per source (Random Seed = `{seed}`)",
        f"- **Total Questions Evaluated**: `{overall['total']}`",
        "",
        "## Overall Summary",
        "",
        "| Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |",
        "| ---: | :---: | :---: | ---: | ---: | ---: | ---: |",
        (
            f"| {overall['total']} | **{overall['accuracy_pct']}%** | **{overall['zero_llm_pct']}%** | "
            f"{overall['avg_tokens']} | {overall['avg_latency_ms']} ms | {overall['median_latency_ms']} ms | "
            f"**${overall['cost_per_1k_usd']:.4f}** |"
        ),
        "",
        "## Breakdown by Dataset Source",
        "",
        "| Source | Questions | Accuracy | Zero-LLM Ratio | Avg Tokens | Avg Latency | Median Latency | Cost / 1k Queries |",
        "| --- | ---: | :---: | :---: | ---: | ---: | ---: | ---: |",
    ]

    # Source breakdown
    sources = sorted(list({r["dataset_source"] for r in records}))
    for src in sources:
        src_records = [r for r in records if r["dataset_source"] == src]
        m = compute_metrics(src_records)
        lines.append(
            f"| `{src}` | {m['total']} | {m['accuracy_pct']}% | {m['zero_llm_pct']}% | "
            f"{m['avg_tokens']} | {m['avg_latency_ms']} ms | {m['median_latency_ms']} ms | ${m['cost_per_1k_usd']:.4f} |"
        )

    lines.extend([
        "",
        "## Breakdown by Method (summary.source)",
        "",
        "| Engine / Method | Questions | Accuracy | Avg Tokens | Avg Latency | Cost / 1k Queries |",
        "| --- | ---: | :---: | ---: | ---: | ---: |",
    ])

    # Method breakdown
    methods = sorted(list({r["summary_source"] for r in records}))
    for meth in methods:
        meth_records = [r for r in records if r["summary_source"] == meth]
        m = compute_metrics(meth_records)
        lines.append(
            f"| `{meth}` | {m['total']} | {m['accuracy_pct']}% | "
            f"{m['avg_tokens']} | {m['avg_latency_ms']} ms | ${m['cost_per_1k_usd']:.4f} |"
        )

    # Top 5 slowest queries
    lines.extend([
        "",
        "## Top 5 Slowest Queries",
        "",
        "| # | Latency | Source | Method | Status | Question | Path |",
        "| ---: | ---: | --- | --- | :---: | --- | --- |",
    ])
    slowest = sorted(records, key=lambda r: r["duration_ms"], reverse=True)[:5]
    for i, s in enumerate(slowest, 1):
        status_icon = "✓" if s["correct"] else "✗"
        clean_q = s["question"].replace("|", "\\|")
        lines.append(
            f"| {i} | {s['duration_ms']:.1f} ms | `{s['dataset_source']}` | `{s['summary_source']}` | "
            f"{status_icon} | {clean_q} | `{s['path']}` |"
        )

    # Failed queries (up to 10)
    failed = [r for r in records if not r["correct"]][:10]
    lines.extend([
        "",
        f"## Failed Queries (Showing up to 10, total {overall['total'] - overall['correct']})",
        "",
        "| # | Source | Method | Expected | Actual | Question | Path |",
        "| ---: | --- | --- | --- | --- | --- | --- |",
    ])
    if failed:
        for i, f in enumerate(failed, 1):
            clean_q = f["question"].replace("|", "\\|")
            lines.append(
                f"| {i} | `{f['dataset_source']}` | `{f['summary_source']}` | "
                f"`{f['expected_answer']}` | `{f['actual_value']}` | {clean_q} | `{f['path']}` |"
            )
    else:
        lines.append("| - | - | - | - | - | *(None - all queries matched)* | - |")

    lines.append("")
    return "\n".join(lines)


def run_cost_report(
    base_url: str = "http://localhost:8000",
    per_source: int = 20,
    seed: int = 1,
    dry_run: bool = False,
    output_path: str = "docs/cost-report.md",
    request_fn: Requester | None = None,
) -> dict[str, Any]:
    """Execute the benchmark run, sample questions, evaluate metrics, and save report."""
    req = request_fn or default_requester
    base = base_url.rstrip("/")
    rng = random.Random(seed)

    print(f"=== Trace Cost & Latency Benchmark ===")
    print(f"Target: {base}")
    print(f"Per-source: {per_source}, Seed: {seed}, Dry-run: {dry_run}\n")

    # 1. Fetch questions per source
    sampled_questions: list[tuple[str, dict[str, Any]]] = []
    for src in DEFAULT_SOURCES:
        url = f"{base}/questions?source={urllib.parse.quote(src)}&limit=500"
        st, _, body = req("GET", url, None, None)
        if st != 200:
            print(f"Warning: Failed to fetch questions for {src} (HTTP {st})")
            continue
        try:
            pool = json.loads(body.decode("utf-8"))
        except Exception as e:
            print(f"Warning: Failed to parse questions JSON for {src}: {e}")
            continue

        if not pool:
            # Fallback to general questions if source is not present (e.g. test fixtures)
            fb_url = f"{base}/questions?limit=500"
            fb_st, _, fb_body = req("GET", fb_url, None, None)
            if fb_st == 200:
                try:
                    pool = json.loads(fb_body.decode("utf-8"))
                except Exception:
                    pool = []

        if not pool:
            print(f"Warning: No questions available for {src}")
            continue

        sample_k = min(per_source, len(pool))
        chosen = rng.sample(pool, sample_k)
        for q in chosen:
            sampled_questions.append((src, q))

    print(f"Total sampled questions across {len(DEFAULT_SOURCES)} sources: {len(sampled_questions)}\n")

    # 2. Dry-run mode
    if dry_run:
        print("--- Dry-Run: Sampled Questions ---")
        for i, (src, q) in enumerate(sampled_questions, 1):
            print(f"[{i:02d}] [{src}] {q.get('question')} (expected: {q.get('answer')}) -> {q.get('path')}")
        return {"dry_run": True, "total_sampled": len(sampled_questions)}

    # 3. Execute /ask?fresh=true for each sampled question
    records: list[dict[str, Any]] = []
    t_start_all = time.perf_counter()

    for i, (src, q) in enumerate(sampled_questions, 1):
        ask_payload = {
            "question": q["question"],
            "path": q.get("path"),
            "role": "",
        }
        body_bytes = json.dumps(ask_payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        ask_url = f"{base}/ask?fresh=true"

        t0 = time.perf_counter()
        st, _, resp_body = req("POST", ask_url, headers, body_bytes)
        duration_ms = (time.perf_counter() - t0) * 1000.0

        if st != 200:
            print(f"[{i:02d}/{len(sampled_questions):02d}] ✗ HTTP {st} for: {q['question'][:50]}")
            continue

        try:
            ans = json.loads(resp_body.decode("utf-8"))
        except Exception:
            ans = {}

        summary = ans.get("summary") or {}
        summary_source = str(summary.get("source") or "unknown")
        llm_tokens = int(summary.get("llm_tokens") or 0)
        cost_usd = float(summary.get("cost_usd") or 0.0)
        llm_used = (llm_tokens > 0) or (summary_source == "vision")

        actual_val = extract_actual_value(ans)
        expected_val = q.get("answer")
        correct = is_answer_correct(actual_val, expected_val, q_type=q.get("type", ""), unit=q.get("unit", ""))

        status_sym = "✓" if correct else "✗"
        print(
            f"[{i:02d}/{len(sampled_questions):02d}] {status_sym} [{src}] {duration_ms:5.0f} ms | "
            f"exp={expected_val}, got={actual_val} | src={summary_source}, tok={llm_tokens}, cost=${cost_usd:.6f}"
        )

        records.append({
            "dataset_source": src,
            "path": q.get("path", ""),
            "question": q["question"],
            "expected_answer": expected_val,
            "actual_value": actual_val,
            "correct": correct,
            "llm_used": llm_used,
            "tokens": llm_tokens,
            "cost_usd": cost_usd,
            "duration_ms": duration_ms,
            "summary_source": summary_source,
        })

    total_wall_s = time.perf_counter() - t_start_all
    print(f"\nExecution finished in {total_wall_s:.2f} s. Calculating metrics...\n")

    # 4. Generate report
    timestamp_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    markdown_content = generate_markdown_report(
        base_url=base,
        timestamp=timestamp_str,
        per_source=per_source,
        seed=seed,
        records=records,
    )

    out_file = Path(output_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(markdown_content, encoding="utf-8")
    print(f"Report written to: {out_file.resolve()}")

    overall_metrics = compute_metrics(records)
    print(
        f"Summary: {overall_metrics['total']} questions | Accuracy: {overall_metrics['accuracy_pct']}% | "
        f"Zero-LLM: {overall_metrics['zero_llm_pct']}% | Cost/1k: ${overall_metrics['cost_per_1k_usd']:.4f}"
    )

    return {
        "metrics": overall_metrics,
        "records": records,
        "output_path": str(out_file),
    }


def main():
    parser = argparse.ArgumentParser(description="Generate cost and latency benchmark report.")
    parser.add_argument("--base", default="http://localhost:8000", help="API base URL (e.g. http://localhost:8000)")
    parser.add_argument("--per-source", type=int, default=20, help="Number of questions to sample per dataset source")
    parser.add_argument("--seed", type=int, default=1, help="Random seed for deterministic question sampling")
    parser.add_argument("--dry-run", action="store_true", help="Print sampled questions without calling /ask")
    parser.add_argument("--output", default="docs/cost-report.md", help="Destination path for markdown report")
    args = parser.parse_args()

    run_cost_report(
        base_url=args.base,
        per_source=args.per_source,
        seed=args.seed,
        dry_run=args.dry_run,
        output_path=args.output,
    )


if __name__ == "__main__":
    main()
