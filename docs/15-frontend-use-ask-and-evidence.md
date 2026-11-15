# 15 — Route questions through the engine, show confidence and evidence (for the B side)

**Why:** the current UI answers "How many doors are on this floor?" by sending the sheet image straight to a vision LLM. The answer card says "vision LLM · 40 s, secondary verification not run". In the Sports Complex case this went wrong twice:
- **Wrong sheet.** The 2015 archive *site plan* was used (A-100.A, scale 3/64" = 1'-0", which is about 1:256 — not 1:100).
- **Wrong method.** A site plan draws no doors. The engine finds 0 door swings on it and now flags the question as asked on a site plan, with low confidence. The floor plan is `Models/2D/Sports Complex - Sheet - A-101 - First Floor Plan.pdf`, and the complete door list is the door schedule on `A-801 - Door and Finish Schedules & Wall Types.pdf`.

**Fix:**
- Every question goes to `/ask` (one sheet) or `/project/ask` (a set of sheets).
- The UI shows `confidence`, `warnings` and the evidence image that come back.
- No direct LLM calls from the frontend or backend for answers.

## 1. Run the engine API

```
set GEMINI_API_KEY=...            (environment only, never in code)
set JUNCTION_DATA=C:\path\to\junction-dataset      (folder that contains data\)
python -m agent.docs_api --port 8765
```

- If `DOCS_TOKEN` is set, send `Authorization: Bearer <token>`.
- FastAPI apps can mount `agent.docs_api.make_asgi()` instead.

## 2. One sheet: `POST /ask`

```json
{"path": "data/opening_design/Sports_Complex/Models/2D/Sports Complex - Sheet - A-101 - First Floor Plan.pdf",
 "page": 1, "question": "How many doors are on this floor?"}
```

`path` must be under `data/` (dataset) or `uploads/`. For a document uploaded via `POST /docs`, send `{"id": <document id>, "question": ...}` instead.

Response (fields to use):

| field | use in the UI |
|---|---|
| `answer_id` | key for `/evidence`, `/review`, `/answer` |
| `value`, `unit` | the big number; `null` means "not on this drawing" (show `warnings[0]`) |
| `confidence` (`high` / `medium` / `low` / `none`), `confidence_reason` | colour chip plus tooltip; sort review lists low first |
| `warnings` | show them all under the answer. Some matter a lot, e.g. "this sheet is a SITE PLAN…", "scale read from the sheet… calibrate to confirm", "outline… not closed: not measured" |
| `items` | the counted / measured things. Each has an `id` and geometry: `box` (PDF points), `box_norm1000` (0–1000 of the page image), `polygon` / `polygon_norm1000`, or `guid` (IFC) |
| `alternatives` | other readings (door sets vs leaves, the three counts of a scan, the three area readings). Offer them as choices |
| `method`, `sources` | the "How I got this" line: file and page |

## 3. A building with many sheets: `POST /project/ask`

1. Upload the sheets with `POST /docs` (multipart: `file`, `project`, `building`).
2. List them with `GET /project/sheets?project=<p>`. Sheets are classified by title block: sheet number, discipline, level, kind (floor plan, site plan, schedule…).
3. Ask with `POST /project/ask {"project": "<p>", "question": "How many doors are on the first floor?"}`.
   - The engine picks the floor plan(s), never the site plan, for floor questions.
   - It returns `items` = one entry per sheet used, each with its own `answer_id`, plus `evidence.rule` explaining why those sheets were picked.

## 4. Evidence: `GET /evidence?answer_id=<id>`

- **JSON:** `locations` gives every item with `page`, `bbox_norm1000` and `bbox_pt`, so you can draw your own boxes or jump to them.
- **Images:**
  - `GET /evidence?answer_id=<id>&view=zoom` → PNG of the region around the items, re-rendered sharp on vector sheets, with numbered boxes, room outlines with their areas, and dimension lines with values;
  - `&view=full` → PNG of the whole page with the same marks.
- Each image has a header: question, answer, confidence, source file and page.

```js
const r = await fetch(`${API}/ask`, {method: "POST", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({path, page, question})}).then(r => r.json());
card.value = r.value; card.unit = r.unit; card.chip = r.confidence; card.tooltip = r.confidence_reason;
card.warnings = r.warnings; card.alternatives = r.alternatives;
evidenceImg.src = `${API}/evidence?answer_id=${r.answer_id}&view=zoom`;
const ev = await fetch(`${API}/evidence?answer_id=${r.answer_id}`).then(r => r.json());   // ev.locations -> boxes on your canvas
```

## 5. Review and measuring (unchanged)

| route | body | effect |
|---|---|---|
| `POST /review` | `{"answer_id", "remove": [item ids], "add": [[x0,y0,x1,y1] in norm1000], "choose": <alternative index>}` | the value updates, `confidence` becomes high, and the correction is logged |
| `POST /calibrate` | `{"path", "p1": [x,y], "p2": [x,y], "length_m", "image_size": [w,h]}` | — |
| `POST /measure` | `{"path", "points": [[x,y],…], "kind": "area" \| "length"}` | — |

## 6. What the screenshot should have looked like

| case | expected result |
|---|---|
| A-100.A asked "How many doors are on this floor?" | value 0, **confidence low**, warning: "this sheet is a SITE PLAN … ask the floor-plan sheet (or the door schedule)". Better: the UI never sends floor questions to a site plan; it uses `/project/ask`. |
| A-101 First Floor Plan | The plan is pasted into this PDF as images (raster fraction 1.0), so the engine reads it as a scan: door-swing candidates plus vision, tile by tile, three readings when they disagree, with boxes. |
| A-801 door schedule | Asking "how many doors are listed in the door schedule?" is answered from the schedule rows. This is exact; the rows are the evidence. |
