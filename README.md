# Trace

Ask a construction drawing a question. Get the number, the numbered boxes it came from, and how it was computed.

Team **Montree** · Junction 2026 · Stoa challenge "Make Blueprints Talk"

**Live demo: https://trace-1078169683443.europe-north1.run.app** (redeployed after the event, Nov 2026; the first
request after an idle period takes ~30 s while the server starts). The original event URL no longer works because the
event cloud account was deleted. Final event version: tag [`junction2026-final`](../../tree/junction2026-final).

## What it does

- **Ask** – free-form questions about a floor plan (PDF, PNG, DXF) or BIM model (IFC), in any language.
  Every number in the answer comes from a tool result; a code check rejects any number that does not.
  Free-form wording is mapped to the engine's exact solvers by `engine/nlq.py` (en/zh/fi/sv/de/fr/it, room names
  matched against the drawing, e.g. kitchen → Küche): 1,198 paraphrased questions, 100% same answer as the canonical form.
- **Evidence** – each counted item is an orange numbered box on the drawing (or a highlighted GUID in 3D).
- **How I got this** – the source (geometry / detector / vision LLM / prior), the method, evidence count,
  engine and LLM time, tokens and cost, and a consistency badge from an independent second model.
- **Project** – a shared 3D model with trade layers, storey cut, furniture placement visible to everyone,
  a Room Board (status per room, notes per trade), photos and videos per room, and a file area.

## How answers are computed

| Drawing | Answer comes from | LLM tokens |
| --- | --- | ---: |
| Swiss DXF plans | exact geometry from DXF layers | 0 |
| IFC models | exact geometry / quantity sets, GUID per element | 0 |
| Raster plans: doors, windows, toilets, sinks, showers/tubs | YOLO11 detector trained on CubiCasa5k (Verda A100) | 0 |
| Raster plans: bedrooms (and, in zero-API mode, balconies, storeys, WC rooms, saunas) | YOLO11 room detector (Verda A100) | 0 |
| Raster plans: kitchens (and bathrooms in zero-API mode) | statistical prior (beats vision: 96% vs 93%) | 0 |
| Raster plans: balconies, storeys, WC rooms, saunas, bathrooms | Gemini vision, one cached call per plan | 1 call |
| Area answers (swiss, IFC) | formula + per-room breakdown + excluded rooms with reason, drawn as polygons | 0 |

When the engine answers exactly (geometry, our detectors, or a prior that beats every model) the app does not call an LLM
at all: the answer sentence is a template, 0 tokens, about 1 s. On the preview set that is **81% of all questions**
(all swiss and IFC, and every raster category except the five room types that need vision).
Otherwise Gemini (function calling) routes the question and writes the sentence; it never produces a number itself.
Nemotron 3.5 Super VL gives an independent second count on raster plans; it is shown as a badge
(agree / disagree) and never replaces the engine value, because on disagreement the detector is right 3–8× more often.

Zero-API mode (`JUNCTION_NO_VLM=1`) answers **every** question with local models only: 79.9% on held-out raster plans
vs 83.6% with Gemini, at zero LLM cost. On the preview set swiss, IFC and raster answers all ran at 0 tokens.

## Accuracy

Full dataset, engine only (cubicasa on the 20% held-out split never used for training; measurements within 2%):

| Source | Accuracy |
| --- | ---: |
| swiss_dwellings | 99.2% |
| ifc_models | 99.1% |
| cubicasa5k (held-out), with Gemini for 5 room types | 83.6% |
| cubicasa5k (held-out), zero-API | 79.9% |

Per-category numbers and a reproducible re-run on the preview set: [`docs/eval-results.md`](docs/eval-results.md).

## Run

Windows: double-click `start.bat` (backend on :8000, web on :5173).

Linux:

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r agent/requirements.txt
uvicorn agent.app:app --reload --port 8000      # terminal 1
cd web && npm install && npm run dev            # terminal 2
```

`.env` (see `.env.example`): `DATA_DIR` = unzipped dataset; `GEMINI_API_KEY`, `GEMINI_MODEL`;
optional `NVIDIA_API_KEY` + `NEMOTRON_MODEL` for the second count. Tests need no data and no keys: `python -m pytest -q`.

Deploy (one container, web + API): [`docs/deploy.md`](docs/deploy.md).

## Architecture

```
web/ (React, Vite, three.js / web-ifc)
  └─ /api ─ agent/app.py (FastAPI)
              ├─ agent/agent.py          Gemini function-calling loop + number check + trace
              ├─ agent/engine_adapter.py routes engine answers by method, boxes, badge, timings
              ├─ engine/                 exact DXF / IFC solvers, YOLO detector, structured query API
              ├─ agent/vision.py         Gemini / Nemotron vision for plans without vector data
              └─ agent/collab.py, media.py, files.py, scene.py   Room Board, media, files, shared 3D scene
```

## Tech challenges

### Gemini API
`agent/agent.py`: function calling picks the tool and writes the answer (temperature 0, max 5 steps); answers
whose numbers are not in any tool result are rewritten once, then flagged. `engine/cubicasa.py` + `agent/vision.py`:
Gemini vision for room questions on raster plans, cached on disk. Token use and cost are shown per answer.

### Nemotron
Nemotron 3.5 Super VL (NVIDIA Build) gives an independent count on raster plans, run in parallel with the engine.
The UI shows green "2 independent methods agree" or yellow "methods disagree – check boxes"; geometry answers skip it.

### Verda
The YOLO11 floor-plan symbol detector was trained on one Verda A100 80 GB (60 epochs, 3,604 CubiCasa5k plans, ~1 h).
On held-out plans it lifts exact door counts from 37% (vision LLM) to 73%, at ~7 ms per plan on GPU, with a box per item.
Process log: [`docs/verda-log.md`](docs/verda-log.md).

### Codex
The web app (Ask page, 3D viewer, provenance panel, Project page, room media) was built with OpenAI Codex;
its commits are prefixed `feat(codex):`.

### CRACI
`.github/workflows/ci.yml` runs backend tests and the web build on `craci` runners for every push (2/2 jobs green).

## Useful endpoints

| Endpoint | |
| --- | --- |
| `POST /ask` | question + drawing path + role → answer, evidence, trace, summary, usage |
| `GET /drawing?path=&page=` | drawing page as PNG |
| `GET /questions?source=` | dataset sample questions |
| `POST /upload` | your own drawing (PDF, PNG, JPG, DXF, IFC) |
| `GET/POST /collab/...` | Room Board, messages, people, bookings, room media |
| `GET /verify/status?path=&ids=` | on-site verification status, photo counts, and latest photo for elements |
| `POST /verify/item` | update verification status and note for an element without photo |
| `GET /element/info?path=&id=` | element specification, dimensions (L, B, H), and 3D clearances (mm) |
| `GET /plan/rooms?path=` | room outlines, dimensions (dims_m: L, B, H), area, and status |
| `GET /room/contents?path=&room=` | list fixtures, doors, windows, and equipment inside one room |
| `GET /catalog/projects?q=` | search and paginate all featured, auto, and uploaded projects |
| `GET/POST /files` | project file area |
| `GET /scene?model=&since_version=`, `POST /scene/placement` | shared 3D furniture, polled every 3 s |

## Data and attribution

Datasets stay out of git (`DATA_DIR`). Each drawing shown in the app carries its source licence
(e.g. CubiCasa5k © 2019 CubiCasa, CC BY-NC-SA 4.0, via the Stoa Junction 2026 dataset).
