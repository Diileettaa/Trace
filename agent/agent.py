"""The question-answering loop: Gemini picks tools, code computes, every number is checked."""
from __future__ import annotations

import json
import re
from typing import Any

from . import config, drawings, tools

SYSTEM_PROMPT = """You answer questions about construction drawings and building models for site engineers.

Hard rules:
1. Never estimate or calculate numbers yourself. Every number in your answer must come from a tool result.
2. If answer_from_engine is available and the file is under swiss_dwellings, ifc_models, ifc_bench or cubicasa5k,
   call it FIRST with the user's question unchanged and trust its value. Only if it returns no value or
   "question not recognised" fall back to the tools below.
   Otherwise choose tools by file type: IFC models -> list_spaces / count_elements / elements_in_space / space_area /
   locate_elements / element_status. PNG, JPG or scanned PDF drawings -> count_in_drawing.
   Vector PDF text, room names and schedules -> search_drawings.
   "What is on this plan / list everything" on an image drawing -> scan_drawing_inventory.
   Files under upload/ are the user's own drawings: for upload/*.ifc call answer_from_engine first; for uploaded
   PDF/PNG/JPG use count_in_drawing (counts) or scan_drawing_inventory (everything on the plan).
3. If a question names a room loosely ("bathroom", "WC", "KPH", "Bad"), call list_spaces first to find the exact rooms.
4. If a tool result has warnings, mention them briefly. If the data does not contain the answer, say so plainly.
5. To total several numbers from tools (e.g. combined area of several rooms), call sum_values; never add them yourself.
   For "what is built / missing / notes for a trade" questions, call room_status.
6. Answer in the language of the question. Lead with the answer (number + unit), then one short sentence on where it comes from.
{role_hint}"""

ROLE_HINTS = {
    "architect": "The person asking is an architect: emphasise position, type and appearance.",
    "electrician": "The person asking is an electrician: emphasise quantities, power/voltage and circuits if available.",
    "plumber": "The person asking is a plumber: emphasise sanitary fixtures, water supply and drainage points, and which rooms they are in.",
    "owner": "The person asking is the building owner/client: keep it plain-language, short, no jargon.",
}

_NUM = re.compile(r"-?\d+(?:[.,]\d+)?")


def _numbers(text: str) -> list[float]:
    out = []
    for n in _NUM.findall(text):
        try:
            out.append(float(n.replace(",", ".")))
        except ValueError:
            pass
    return out


def _collect_numbers(obj: Any, acc: set[float]) -> None:
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        acc.add(round(float(obj), 3))
    elif isinstance(obj, dict):
        for v in obj.values():
            _collect_numbers(v, acc)
    elif isinstance(obj, list):
        acc.add(float(len(obj)))
        for v in obj:
            _collect_numbers(v, acc)
    elif isinstance(obj, str):
        for n in _numbers(obj):
            acc.add(round(n, 3))


def unsupported_numbers(answer: str, question: str, evidence: list[dict]) -> list[float]:
    """Numbers in the answer that appear neither in the question nor in any tool result."""
    allowed: set[float] = set()
    _collect_numbers(evidence, allowed)
    for n in _numbers(question):
        allowed.add(round(n, 3))
    bad = []
    for n in _numbers(answer):
        if not any(abs(n - a) <= max(0.01, abs(a) * 0.001) for a in allowed):
            bad.append(n)
    return bad


def _client():
    from google import genai

    return genai.Client(api_key=config.GEMINI_API_KEY)


def ask(question: str, path: str | None = None, role: str | None = None, client=None) -> dict:
    from google.genai import types

    client = client or _client()
    role_hint = ROLE_HINTS.get(role or "", "")
    user_text = question if not path else f"Drawing/model file: {path} (type: {drawings.kind(path)})\n\nQuestion: {question}"
    gen_config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT.format(role_hint=role_hint),
        temperature=config.TEMPERATURE,
        tools=[types.Tool(function_declarations=tools.declarations())],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )
    contents: list = [types.Content(role="user", parts=[types.Part.from_text(text=user_text)])]
    evidence: list[dict] = []
    tool_calls: list[dict] = []
    answer = ""

    import time

    t_start = time.perf_counter()
    model_s: list[float] = []
    usage = {"input": 0, "output": 0, "thinking": 0, "gemini_calls": 0}
    for attempt in range(2):  # second attempt only if the number check fails
        for _ in range(config.MAX_TOOL_STEPS):
            t0 = time.perf_counter()
            resp = client.models.generate_content(model=config.GEMINI_MODEL, contents=contents, config=gen_config)
            model_s.append(round(time.perf_counter() - t0, 2))
            um = getattr(resp, "usage_metadata", None)
            for k, attr in (("input", "prompt_token_count"), ("output", "candidates_token_count"),
                            ("thinking", "thoughts_token_count")):
                usage[k] += int(getattr(um, attr, 0) or 0) if um else 0
            usage["gemini_calls"] += 1
            calls = resp.function_calls or []
            if not calls:
                answer = resp.text or ""
                break
            contents.append(resp.candidates[0].content)
            parts = []
            for fc in calls:
                args = dict(fc.args or {})
                result = tools.call(fc.name, args)
                tool_calls.append({"name": fc.name, "args": args})
                evidence.append({"tool": fc.name, **result})
                parts.append(types.Part.from_function_response(name=fc.name, response={"result": result}))
            contents.append(types.Content(role="user", parts=parts))
        else:
            answer = "I could not finish within the allowed number of steps."

        bad = unsupported_numbers(answer, question, evidence)
        if not bad:
            break
        if attempt == 0:
            contents.append(types.Content(role="model", parts=[types.Part.from_text(text=answer)]))
            contents.append(types.Content(role="user", parts=[types.Part.from_text(
                text=f"Your answer contains numbers that are not in any tool result: {bad}. "
                     "Rewrite the answer using only numbers returned by tools.")]))
        else:
            evidence.append({"tool": "number_check", "value": None, "items": [], "sources": [], "method": "check",
                             "warnings": [f"Unverified numbers in answer: {bad}"]})

    timing = {"total_s": round(time.perf_counter() - t_start, 2), "gemini_calls_s": model_s,
              "tools_s": [e.get("elapsed_s") for e in evidence if "elapsed_s" in e]}
    usage["vision_calls"] = sum(1 for e in evidence if e.get("tool") in ("count_in_drawing", "scan_drawing_inventory")
                                and not e.get("cached"))
    usage["nemotron_calls"] = sum(1 for e in evidence if (e.get("verified_by") or {}).get("nemotron_count") is not None)
    return {"answer_text": answer, "evidence": evidence, "tool_calls": tool_calls, "timing": timing,
            "usage": usage, "trace": build_trace(question, tool_calls, evidence, answer)}


def build_trace(question: str, tool_calls: list[dict], evidence: list[dict], answer: str) -> list[dict]:
    """Human-readable steps behind an answer, so a person can check where each number came from."""
    steps = [{"kind": "question", "title": "Question received", "detail": question}]
    calls = iter(tool_calls)
    for e in evidence:
        if e.get("tool") == "number_check":
            steps.append({"kind": "check", "ok": False, "title": "Number check failed",
                          "detail": "; ".join(e.get("warnings") or [])})
            continue
        call = next(calls, {"name": e.get("tool"), "args": {}})
        args = {k: v for k, v in (call.get("args") or {}).items() if k != "path"}
        unit = e.get("unit") or ""
        steps.append({
            "kind": "tool", "title": f"Gemini called {call.get('name')}", "args": args,
            "detail": f"result: {e.get('value')} {unit}".strip(),
            "method": e.get("method"), "boxes": len(e.get("sources") or []),
            "items": len(e.get("items") or []), "elapsed_s": e.get("elapsed_s"), "cached": bool(e.get("cached")),
            "warnings": e.get("warnings") or [],
        })
        v = e.get("verified_by")
        if v and v.get("nemotron_count") is not None:
            steps.append({"kind": "check", "ok": bool(v.get("agreement")),
                          "title": "Independent second count (Nemotron 3.5 Super VL)",
                          "detail": f"Nemotron counted {v['nemotron_count']}, first count {e.get('value')}"})
    if not any(s["kind"] == "check" and s["title"].startswith("Number check") for s in steps):
        steps.append({"kind": "check", "ok": True, "title": "Number check passed",
                      "detail": "Every number in the answer appears in a tool result or in the question"})
    steps.append({"kind": "answer", "title": "Answer written by Gemini from the tool results", "detail": answer})
    return steps


def list_models() -> None:
    for m in _client().models.list():
        print(m.name)


if __name__ == "__main__":
    print(json.dumps(ask(input("Question: ")), indent=2, ensure_ascii=False))
