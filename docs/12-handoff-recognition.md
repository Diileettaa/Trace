# Handoff 12 — fixtures, walls and rooms from vector PDFs and scans (plan 11, first results), 15 Nov ~03:15

From Xinran (A side) to Diletta and the B side.

- **Pull:**
  ```
  git checkout xinran/main -- engine tools eval/scenes eval/sheets docs
  ```
- **No new dependencies:** OpenCV, pdfplumber and pypdfium2 are already in use.
- **The `/scene` route and the JSON schema are unchanged** (see `docs/10`). The JSON now simply has more content:
  - `objects` for vector PDFs;
  - `rooms` and `walls` for scans.

## Results

| stream | what | gate result | ships as |
|---|---|---|---|
| **W1 vector fixtures** | `engine/symbols.py`: CAD blocks repeat, so strokes of one colour (layer) are grouped into symbols, given a rotation- and mirror-invariant signature in metres, and clustered. Each cluster is named once: from a sidecar `<pdf>.pN.symbol_names.json` (a person's review), or by one Gemini call on the montage when a key is set. | School PDF: **11 WCs found**: the 3 cubicles plus the accessible toilet in "Toilets", the two other accessible toilets, the staff toilet, hygiene room, changing toilet and accessible changing. **No miss and no false WC** on the overlay check (`symbols_school_wc_check.png`). | `objects` with category `toilet` (also `chair` / `table` / `desk` from the same clusters). `position` is exact. `rotation_deg` is the symbol axis, 0–180° (front/back not resolved). `footprint` is in metres. `room_id` is filled when the WC lies in a traced room. `confidence` 0.9 when named, 0.4 when unnamed. |
| W1 washbasins | On this sheet the basins are drawn as plain small rectangles, which cannot be told apart from cabinets by shape alone. | not found | not exported. Stated in `warnings`. |
| **W2 vector walls (outline-drawn)** | Parallel line pairs. | **not built**: none of our test sheets draws walls as outlines; all three use solid fills, which are already exported. | — |
| **W3 scan walls + rooms** | `engine/scan_plan.py`: deskew; thick strokes → axis-aligned wall runs (centre line + thickness); openings sealed only along each wall's own direction; rooms = enclosed free space, area from the outer outline (furniture holes included). | School **scan** vs the same sheet's **vector** rooms: **38 / 50 within 10 % area**. 3 small rooms (< 6 m²) not separated. Merged or odd cases: one 'Group Room + Library' (a vector-side merge), corridors 13–15 % small. Details: `eval/scenes/scan_plan_check.md` and `.png`. | `walls` (`confidence` 0.7) and `rooms` (unnamed, `confidence` 0.7). Coordinates are in `norm1000` until the user calibrates (`/calibrate`); then metres and `quality: measured`. |
| **W4 CubiCasa5K official model** | `tools/cubiseg_run.py` (PyTorch, CPU, ~2 s per plan) writes `<image>.cubiseg.json`; `scene_scan` reads it automatically. | Same 40 official val/test plans, answers correct, ours vs official: **toilet 36 vs 29, sink 29 vs 22, window 20 vs 11** (`eval/cubiseg_eval.md`). Our detector stays the fixture source. On the Stoa school / dorm sheets the official model finds almost nothing (6 / 0 rooms). | Used where it adds something: **walls** on thin-wall residential plans (when it finds 3x more than the rule tracer), **openings** when ours find none, **room polygons with room types** (Bath, Kitchen, Bed Room, Storage...) when they cover more of the plan, and fixtures only as a fallback. See `eval/scenes/cubicasa_207_scan.png`: a hand-annotated Finnish scan with 13 named rooms, 61 walls, 39 openings, 2 WCs and 5 sinks. Known errors there: two bedrooms merged into one and one bedroom labelled Entry, so `confidence` is 0.6. |
| W5 CAD symbol spotting (SymPoint / DPSS weights are public) | Needs a CUDA build and FloorPlanCAD-style SVG input. | deferred: W1 already finds the WCs exactly on vector sheets | — |

## Samples (`eval/scenes/`)

- **`school_pdf_L00.json` / `.png`** — vector sheet, `quality: measured` (1:200):
  - 50 rooms;
  - 202 wall pieces;
  - 195 doors and windows;
  - 225 objects: **11 toilets**, 153 chairs, 55 tables, 6 desks.
- **`symbols_school_montage.png`** — the 23 symbol types found, which is what a reviewer or Gemini names.
- **`symbols_school_wc_check.png`** — the WCs boxed on the sheet.
- **`school_scan_illustrative.json` / `.png`** — the same school as a scan, not calibrated (unit `norm1000`):
  - 102 room regions;
  - 162 wall runs;
  - 178 door/window candidates.
- The IFC samples from `docs/10` are unchanged.

## Notes for the frontend

- Scan coordinates are `norm1000` (0–1000 of the image) until calibrated. Show `quality: illustrative` as such, never as metres.
- Rooms from scans are unnamed unless the CubiCasa model (W4) or a vision call names them. Show them as floor patches without labels.
- Furniture (`chair` / `table` / `desk`) is exported because it came for free with the symbol clusters. Filter by `category` if you only want sanitary fixtures.
