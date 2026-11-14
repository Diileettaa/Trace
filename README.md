# Trace

Ask a construction drawing a question and inspect the evidence behind the answer.

Team **Montree** · Junction 2026 · Stoa challenge “Make Blueprints Talk”

## Run

Windows: double-click `start.bat`. It starts the FastAPI backend on port 8000 and the Vite frontend on port 5173.

Linux (run these in separate terminals):

```bash
uvicorn agent.app:app --reload --port 8000
cd web && npm run dev
```

Set `DATA_DIR` to the unzipped dataset location. `GEMINI_API_KEY` enables the Gemini agent and vision calls. Nemotron review also requires `NVIDIA_API_KEY` and `NEMOTRON_MODEL`. Tests use fixtures and mocked model clients; they do not need dataset files or API keys.

## Architecture

Trace has four layers:

1. **Data indexing** — `agent/tools.py` dispatches drawing/model questions to the available tool functions. The planned `engine.tools` data index and exact DXF/IFC solvers are not present in this checkout; until then, available mock results are used for those tools.
2. **Query tools** — drawing rendering and raster counts are implemented in `agent/drawings.py` and `agent/vision.py`. Tool results carry sources and pixel bounding boxes. The other model query tools are planned pending the data engine.
3. **Gemini agent** — `agent/agent.py` uses Gemini function calling with a five-step limit, then checks that answer numbers occur in tool results or the question. `agent/vision.py` uses Gemini to find and box instances on raster drawings. Calls are cached on disk.
4. **Web page** — `web/` is a React/Vite interface for asking questions and viewing answers and drawing evidence. A 3D IFC viewer is planned.

## Tech challenges

### Gemini API

Implemented in `agent/agent.py` for tool selection and answer generation, and in `agent/vision.py` for raster drawing detection and inventory. The model uses temperature zero and at most five tool steps. Disk caching avoids repeating identical vision calls.

### Nemotron

`agent/vision.py` runs `_nemotron_count` as an independent second count for raster vision answers when `NVIDIA_API_KEY` and `NEMOTRON_MODEL` are configured. A mismatch is returned as a warning. It is skipped when configuration is missing.

### Verda

`scripts/verda_batch_warmup.py` locally pre-renders selected dataset drawings through `agent.drawings.page_png` and records per-drawing timings in `docs/verda-benchmark.md`. It makes no online API calls. This is a local preprocessing benchmark, not a Verda deployment or cloud-compute run; using Verda infrastructure is planned. The process log structure is in [`docs/verda-log.md`](docs/verda-log.md).

### Codex

This repository update was made with Codex. The commit for this work is listed below under **Built with OpenAI Codex**.

### CRACI

`.github/workflows/ci.yml` configures backend tests and the web build on runners labelled `craci`, on pushes and pull requests. Actual execution depends on a configured CRACI runner.

### Gemma

Planned; no Gemma integration is present in this checkout.

## Useful endpoints

- `GET /health` — backend health and data directory status.
- `GET /models` — Gemini model names available to the configured key.
- `POST /ask` — ask a question, optionally with a dataset-relative drawing path and role.
- `GET /drawing?path=&page=` — render or return a drawing page as PNG.
- `GET /questions?source=&limit=` — sample dataset questions.

## Data and attribution

Keep datasets out of git. `DATA_DIR` points to the unzipped dataset directory. Preserve each source's attribution and license when displaying its drawings.

## Built with OpenAI Codex

- `feat(codex): add Verda warmup and document Trace challenges` — this change.
- `feat(codex): add offline engine evaluation` — T-18 sample results and evaluator.

## Engine evaluation

Run `python scripts/eval_engine.py` to sample up to 50 questions from each of `swiss_dwellings`, `ifc_models`, and `cubicasa5k` and write `docs/eval-results.md`. Use `--n N` to change the per-source sample size and `--seed N` to make sampling repeatable. The evaluator calls the local `agent.engine_adapter.answer(path, question)` only and makes no online API calls. Counts are correct only when they match exactly; area, length, and volume answers pass when their relative error is at most 2%. The report also shows the share of results with at least one four-coordinate evidence bounding box and up to five failed examples per source.
