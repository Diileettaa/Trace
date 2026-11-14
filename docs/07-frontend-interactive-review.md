# Frontend: interactive review of answers (for Diletta)

Stoa told us the hardest questions will be on **scanned drawings** and that the interface **may be interactive**.
Judges will use our UI to test a few drawings, and they also score the whole flow and its real-world impact.
So every answer shows its evidence on the drawing, and the user can fix it in a few clicks.

Backend: `engine/review.py`. HTTP routes are in `agent/docs_api.py`; start it with `python -m agent.docs_api --port 8765`, or mount it with `make_asgi()`.
Every route returns JSON. When `DOCS_TOKEN` is set, every request must send `Authorization: Bearer <token>`.

## 1. Ask

`POST /ask {"id": <document id>, "question": "How many doors are on this plan?"}`

or by path, without filing the drawing first:
`POST /ask {"path": "data/cubicasa5k/colorful-1077.png" | "uploads/<file>", "question": "..."}`.
Paths resolve under `JUNCTION_DATA` (`data/...`) and `CACHE_DIR/uploads` (`uploads/...`, or `JUNCTION_UPLOADS`);
anything else is refused (400). `/calibrate` and `/measure` accept `path` in the same way.

The document id comes from an upload: `POST /docs` (multipart) returns `{"document": {"id": ...}}`.

Response:
```json
{
  "answer_id": "8b7aa7918f8d",
  "value": 107, "unit": "count",
  "method": "sheet:count_doors",
  "items": [{"id": 0, "box": [383.6, 746.7, 396.0, 759.2], "type": "single"}, ...],
  "alternatives": [{"label": "door sets (a double door = 1)", "value": 107},
                   {"label": "door leaves (a double door = 2)", "value": 129}],
  "warnings": ["doors drawn without a swing arc (sliding, folding) are not counted"],
  "evidence": {"rule": "...", "scale": "1:200", "coords": "PDF points, origin top-left"},
  "interactive": {"can_remove": true, "can_add": true, "can_measure": true},
  "document": {...}, "sources": [{"file": "...", "page": 1}]
}
```

Item coordinates come in one of two forms:
- `box` is in **PDF points**, with the origin at the top-left. Vector PDF sheets use this. Page size: render the page with pdf.js at scale 1, and 1 unit = 1 point.
- `box_norm1000` is `[x0, y0, x1, y1]` on a **0–1000 scale of the image width and height**. Scans and PNG/JPG files use this. Convert to pixels with `x * imgWidth / 1000`.

## 2. Show

- Draw every item box on the drawing. Use one colour for model items and another for items the user added.
- Show `value` in large type, with `method` next to it, and the `warnings` underneath.
- If `alternatives` is not empty, show it as a toggle, e.g. *door sets 107 | door leaves 129*.
- If `method` contains `uncertain`, show a banner: "Two readings disagree — please review". The two readings are listed in `alternatives`, e.g. tile-by-tile count vs whole-sheet count.

## 3. Fix (review)

`POST /review {"answer_id": "...", "remove": [3, 7], "add": [[x0,y0,x1,y1]], "choose": 1, "user": "Xinran"}`

Every field is optional, so send only what changed:
- `remove`: ids of wrong boxes. The user clicks a box to toggle it off.
- `add`: boxes the user drew for missed items, in the **same coordinate system as the items**.
- `choose`: index into `alternatives`. The chosen reading becomes the base value, and box edits are applied on top of it.

The response is the updated answer. `value` is recomputed and `method` ends with `+reviewed`.
`review.removed`, `review.added` and `review.by` describe what changed. Show it as e.g. *"Model: 41 → reviewed by Xinran: 44"*.

`GET /answer?id=<answer_id>` returns the current state.
Every correction is also logged to `corrections.jsonl`, which gives us evaluation and training data later; this is the real-world-impact story.

## 4. Measure (areas, lengths, baseboards on scans)

- **Vector PDF:** the sheet scale is read automatically, so `/measure` works straight away.
- **Scan / image:** calibrate once per sheet first. The user clicks both ends of a known dimension or of the scale bar:

  `POST /calibrate {"id": <doc id>, "p1": [x,y], "p2": [x,y], "length_m": 5.5, "image_size": [w, h], "page": 0}`

  For images the points use the 0–1000 scale, so send the image size in pixels.

- Then measure:

  `POST /measure {"id": <doc id>, "points": [[x,y], ...], "kind": "area" | "length", "page": 0}`

  The response is `{"value": 49.781, "unit": "m2", "scale_from": "user calibration" | "scale printed on the sheet"}`.

UI idea: a "Measure" tool where clicks build a polygon (area) or a polyline (length, e.g. a baseboard run), and the result shows live.

## 5. Suggested screens

1. **Project → buildings → sheets.** Upload many PDFs or scans, or email them in (the document store already handles versions).
2. **Sheet viewer + chat.** Ask a question; the answer card shows value, method, warnings and alternatives, and the boxes are drawn on the sheet.
3. **Review mode:** click boxes to remove them, draw boxes to add, "Accept" saves. A small "reviewed" badge appears on the answer.
4. **Measure mode:** calibrate the scale, then draw an area or length.

Scans: area questions that cannot be read from the sheet return `value: null` and a warning that starts
"no room areas / lengths printed" -> show the "Set scale" button. If the area's side lengths are printed as
dimension strings, the answer is computed from them (`method: scan:vlm+dims`, items box the two dimensions).

## 6. Method strings you will see

| method | where the number comes from |
|---|---|
| `sheet:count_tags` / `count_marks` / `count_doors` / `count_windows` / `count_labels` | vector PDF geometry (code counts) |
| `sheet:rooms` | rooms traced from the walls (area / perimeter / baseboard) |
| `sheet:expr` | arithmetic over dimension strings on the sheet (items list the dimensions used) |
| `sheet:lookup` | text read from the sheet |
| `sheet:scanned+scan:vlm:tiled3x3` | scanned PDF counted tile by tile by the vision model |
| `scan:vlm`, `scan:vlm:tiledNxM` | image / scan read by the vision model; `:uncertain` = readings disagree |
| `scan:marks+vlm` / `scan:windows+vlm` / `scan:doors+vlm` | image analysis found the symbols (dots, window openings, door swings), the model confirmed |
| `scan:vlm+dims` | area from two printed dimension strings |
| `...+reviewed` | changed by a user in review |

## 7. Project flow (several buildings, many sheets)

A project has buildings, and a building has many sheets: up to ~8 floor plans plus piping, structural and schedule sheets.

- **Upload:** `POST /docs` (multipart) with fields `project` and `building` (e.g. `building=A`).
  You can also set or change the building later: `POST /project/building {"id": N, "building": "A"}`.
- **Sheet index:** `GET /project/sheets?project=P` returns every latest sheet with
  `class: {kind, level, sheet_no, title, scale, how}`. Kinds: `floor_plan | piping | structural | schedule | elevation | section | detail | site | other | model`.
  Each sheet is read from its title block once (vector PDF) or with one vision call (scan), then cached.
  Suggested UI: group the sheets by building, then by kind or level.
- **Project questions:** `POST /project/ask {"project": P, "question": "How many doors are on all floors of building A?"}`.
  The model only picks the sheets and the per-sheet question; each sheet is answered as in section 1, and the code adds the results.
  Response: `value` is the total, `method` is `project:sum|list|max|min|single`, and `items` is the per-sheet breakdown
  `{sheet, building, level, sheet_no, title, value, unit, method, answer_id, warnings}`.
  Every row has its own `answer_id`, so clicking a row opens that sheet in review mode (sections 2–3).
  The project answer has an `answer_id` too.
