# 37 — Gemini (Pro model): read-only QA sweep of every project

RULES: Do NOT edit any file except the two outputs below. Do NOT commit. Do NOT deploy. Do NOT read .env.
If something fails, REPORT it — do not "fix" it, do not invent data.

Backend must be running on http://localhost:8000 (python -m uvicorn agent.app:app --port 8000 --reload).

1. GET http://localhost:8000/catalog -> list of projects (id, model, plan).
2. For each project, the paths to test = plan and model (skip null). Also GET /sheetset?project=<id> and add up to 3 sheet paths from it.
3. For each path, ask these questions with POST /ask {"question": q, "path": path} (timeout 120 s each):
   - How many doors are on this floor?
   - How many toilets are on this floor?
   - What is the total area of all rooms?
   - How many windows are there?
   - Which rooms are on this floor?
   plus the first 3 questions from GET /questions?path=<path>&limit=10 (if any).
4. For each answer record: project, path, question, seconds, HTTP status, the answer text (first 200 chars),
   the big number (if any), method/source from the evidence, number of items, and any error text.
5. Flag a row as PROBLEM if: HTTP error, > 30 s, empty answer, answer says "could not", answer contains a GUID-like
   string (22 chars of [0-9A-Za-z_$]), non-English room names, or a count that is obviously absurd (0 doors on a floor plan,
   > 500 of anything).

Write a Python script scripts/qa_sweep.py that does steps 1–5 (requests or urllib, no new dependencies) and writes:
- docs/status/qa_sweep.csv (all rows)
- docs/status/qa_sweep.md: summary table per project (asked / problems / avg seconds) + the list of PROBLEM rows with reason.

Run it, then tell Diletta: "QA sweep done: N questions, M problems" and the 10 worst problems.
