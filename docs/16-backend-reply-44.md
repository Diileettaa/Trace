# Reply to handoff 44 — Trace engine integration materials

All samples below are real responses captured in-process from `agent/docs_api.py`
by `tools/integration_samples.py` (same code path as HTTP). Files: `eval/integration/`.

### API status
- Base URL: `http://localhost:8765` (local). Deploy URL: same app, port of your choice.
- Auth: none by default. If env `DOCS_TOKEN` is set, every request needs
  `Authorization: Bearer <DOCS_TOKEN>`; (or `X-Docs-Token: <DOCS_TOKEN>`); missing / wrong → `401 {"error": "missing or wrong token"}`.
- Start command: `python -m agent.docs_api --port 8765`
- Env (names only; values stay in local `.env` / deploy env, never in Git or chat):
  `GEMINI_API_KEY` (vision model; without it PDF/scan answers return `value: null`),
  `JUNCTION_DATA` (dataset root, contains `data/`), `JUNCTION_UPLOADS` (upload dir),
  optional `DOCS_TOKEN`, `JUNCTION_CACHE`.
- Paths in requests are relative: `data/...` (dataset) or `uploads/...` (uploaded). Responses
  no longer contain server absolute paths.

| Endpoint | Method | Status |
|---|---|---|
| `/ask` | POST `{path, question, page?}` | ready |
| `/evidence?answer_id=…[&view=zoom\|full]` | GET | ready (JSON; `view=` returns PNG) |
| `/docs` | POST multipart (`file`, `project`) | ready |
| `/project/sheets?project=…` | GET | ready |
| `/project/ask` | POST `{project, question}` | ready (needs `GEMINI_API_KEY`) |
| `/review`, `/calibrate`, `/measure` | POST | ready (see `docs/15`) |
| `/api/geometry/scene?path=…[&page=][&storey=][&room=][&space_model=]` | GET | **new**, ready |
| `/scene` | GET | alias of the above |
| `/api/scene` | — | **not used by us** (B side owns it) |

### Ask + evidence
- `ask_ifc.json` — Duplex IFC, "How many doors…" → `14`, `confidence: high`, 14 items with GUIDs.
  `evidence_ifc.json` → 14 locations. `view=zoom` → `404 {"error":"no drawing image for this answer"}`
  (IFC has no sheet; use the scene / GUIDs to highlight in 3D).
- `ask_pdf_vector.json` — UK special school level 00 (vector PDF).
- `ask_scan.json` — the same sheet as a scan (`school_L00_scan.jpg`).
  Both were captured **without** a key → `value: null`, `method: sheet:needs_vision_model`,
  `confidence: none`. That is the real zero-key behaviour. With a key, re-run
  `python tools/integration_samples.py --dataset <junction-dataset>`; the files are overwritten.
- Every answer has `answer_id` and `evidence_url` (`/evidence?answer_id=…`).
  Evidence JSON: `locations[]` with `page`, `bbox_pdf_pt` or `png_bbox` / polygons, `label`;
  PNGs: `view=full` (whole sheet, numbered boxes) and `view=zoom` (cropped, high-res re-render).
- Project (Sports Complex, 3 sheets uploaded as project `xsc`): `project_sheets.json` classifies
  A-100.A as `site`, A-101 as `floor_plan` level 1, A-801 as `schedule`. `/project/ask` never
  picks a `site` sheet for counting; the door question resolves to the A-801 schedule (38, high)
  when the key is set. Without the key: `project:needs_model` (`project_ask.json`).

### 2.5D scene
Every element in `storeys / rooms / walls / openings / objects / systems` carries
`id`, `storey_id` (and `room_id` where known), `source`, `method`, `confidence` (0..1), `assumed`.

| Sample | File | Counts |
|---|---|---|
| Duplex bathroom (IFC, `room=Bathroom 1`, plumbing + arch model) | `scene_ifc_bathroom.json` | 1 storey, 1 room, 4 walls, 1 opening, 3 fixtures, 73 pipe segments |
| School level 00 (vector PDF) | `scene_pdf_vector_school.json` | 50 rooms, 202 walls, 195 openings, 225 fixtures |
| School level 00 (scan, illustrative) | `scene_scan_school.json` | 102 rooms, 162 walls, 178 openings, 0 fixtures |

- Units: IFC and PDF in metres; scan in `norm1000` (0–1000 image units) until calibrated.
- Frame: web-ifc world, no COORDINATE_TO_ORIGIN (offset 0); plan `[X, Z]`, plan-up = −Z.
  `north_vector` from IfcTrueNorth when present, else plan-up with `north_basis: project_north`.
- Please run your `node scripts/check_geometry_scene.mjs` on the three files (it lives in your
  repo, we don't have it) and send us any failures.

### Errors
Always JSON `{"error": "<message>", ...context}`.
- `400` bad input: `error_bad_path.json` (path outside `data/`/`uploads/` or missing),
  `error_no_room.json` (unknown room; includes the list of `rooms`).
- `404` unknown id: `error_unknown_answer.json`; also zoom PNG for an IFC answer.
- `401` token required/wrong (only when `DOCS_TOKEN` set). `413` upload too large.

### Not ready / risks
- PDF / scan / project samples here are zero-key captures. Real values need `GEMINI_API_KEY`.
- Scan scene: no fixtures unless `ultralytics` + our detector weights are installed on the server
  (weights are not redistributed); positions not metric until calibrated; small rooms (< 6 m²) can merge.
- Vector PDF: walls only from solid cut fills; fixtures only from symbols drawn ≥ 2 times; no heights.
- IFC: some walls lack base quantities (fields left empty); no true north in the Duplex model.
- Sports Complex A-101 is a raster-in-PDF floor plan: door count there is `uncertain` (28 vs 38 in the schedule).
