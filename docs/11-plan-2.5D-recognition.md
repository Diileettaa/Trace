# Plan 11 — recognising fixtures, walls and rooms for the 2.5D scene (15 Nov, 01:40 → freeze ~07:30)

Goal: fill `objects` (WC, sink), `walls` and `rooms` of `/scene` for **vector PDFs** and **scans**, not only IFC.
Every new source goes through a validation gate before it enters `scene_pdf` / `scene_scan`. A source that fails its
gate is not shipped; we say so in `warnings` instead.

## Constraints that shape the plan

- **Our sandbox:** 2 CPU, 3 GB RAM, no torch. It is fine for rule-based vector/raster work.
  - PyTorch models run on Xinran's laptop or a teammate's machine (CPU is enough for inference).
  - Verda (GPU) is available if a model needs it.
- **Licences:** non-commercial demo, so CubiCasa5K and FloorPlanCAD models are allowed. They are credited in the methods doc.
- **Rules:** no Stoa sample image is used for training or tuning; samples are only for the final check.
- **Heights:** not on a plan. Storey 2.7 m, door 2.1 m and window sill 0.9 m / head 2.1 m are defaults, marked `assumed: true`.

## Work streams

| # | stream | method | runs on | time | gate (must pass to ship) |
|---|---|---|---|---|---|
| W1 | **Vector fixtures** | Repeated-symbol clustering: CAD exports draw each WC or sink as the same group of curves, moved and rotated. (1) Group the page's curves/lines into connected symbols. (2) Make a rotation-invariant signature for each (sorted segment lengths, angles, bbox ratio). (3) Cluster identical signatures. (4) Name each cluster once: nearby text (`WC`, `Toilet`, `Basin`) or one Gemini crop call. (5) Every instance gets an exact position and rotation (the transform from the cluster template) plus a footprint in metres from the scale. | sandbox | 01:45–02:45 | V1: on the school PDF, WCs and basins in the toilet rooms found with no false labels outside wet rooms (manual check on overlay) |
| W2 | **Vector walls** | Keep the solid-fill walls already exported. Add parallel line pairs 0.08–0.6 m apart with ≥ 0.5 m overlap, nothing between them, as wall pieces; centre line = mid line; thickness = gap. Snap ends and join collinear pieces; split at openings (door arcs / window symbols). | sandbox | 02:45–03:30 | V3: overlay shows ≥ 90 % of drawn walls covered, no walls through rooms |
| W3 | **Scan walls + rooms** | Wall mask = dark pixels kept after morphological opening with a kernel ≈ minimum wall thickness, which removes text, hatches, furniture and thin lines. Vectorise with contours + Hough / skeleton. Rooms = the free space of the wall mask with doors and windows closed (same algorithm as vector `sheet.rooms`), labelled by OCR / Gemini text. Scale from user calibration or printed dimension strings. | sandbox | 03:30–04:30 | V2: school scan vs school vector, room areas within 10 % for ≥ 80 % of rooms, wall overlay aligned |
| W4 | **CubiCasa5K official multi-task model** (walls, rooms, icons incl. toilet, sink, bathtub) as second opinion and fallback for scans | `github.com/CubiCasa/CubiCasa5k` pretrained `model_best_val_loss_var.pkl`, PyTorch CPU inference. Polygonise with the repo's post-processing (or `rbg-research/Floor-Plan-Detection`). Wrapped as `engine/cubi_seg.py`, optional: used only if torch and the weights are present. | Xinran's laptop / teammate (needs torch, ≥ 8 GB RAM) | 02:00–04:30 in parallel | On 20 CubiCasa test plans (never the Stoa samples): wall IoU and toilet/sink recall printed; ships only if better than W3 on the same plans |
| W5 | **CAD symbol spotting** (stretch) | FloorPlanCAD models: VecFormer / SymPoint / CADTransformer read vector primitives directly (classes include sink, toilet, door, window, wall). Convert the PDF page to SVG (`pdftocairo -svg`), run the released checkpoint. | Verda GPU | time-boxed 1 h, 03:00–04:00 | Only if a checkpoint is actually released and runs; then compare with W1 on the school PDF. Otherwise dropped and noted. |
| W6 | **Integration** | Put W1–W4 into `scene_pdf` / `scene_scan`. Each element carries `method`, `confidence` and `source` (bbox in PDF points and norm1000). Rerun `tools/scene_check.py`, overlays, handoff doc 12. | sandbox | 04:30–05:45 | all gates rechecked; overlays sent to B side |
| W7 | **Frontend (B side)** | Extrude `walls` (centre line + thickness, default height flagged). Place standard low-poly icons (GLTF, three.js loaders) by `position` / `rotation_deg` / `footprint`. Show `quality` and `assumed` heights. npm packages are allowed on their side. | B side | from now | they validate on `eval/scenes/*.json` already delivered |

## Order and fallbacks

1. W1 first: it is the biggest gap (fixtures on vector sheets) and the most exact method.
2. W2, then W3, in the sandbox. W4 starts at the same time on a machine with torch, so it does not block.
3. W5 only if a checkpoint is public. Otherwise its hour goes to W3 quality.
4. Fallback for fixtures on scans and on vectors without repeated blocks: Gemini tile boxes (already in `scanqa`) plus our CubiCasa YOLO (toilet 94 % on CubiCasa test). `confidence` follows the measured numbers.
5. 05:45–07:30: buffer, full regression (`eval/run.py`, `sheet_run`, `stoa_samples_run`), methods doc update, submission text.

## What Xinran / teammates need to do

- **W4:** on a machine with Python ≥ 3.9 and ≥ 8 GB RAM, run `pip install torch torchvision opencv-python` and download the CubiCasa5K weights (Google Drive link in that repo's README). We send the run script; they send back the output JSON.
- **W5:** decide whether to start Verda for one hour (only after we confirm a public checkpoint).
- **B side:** confirm the default heights and the `assumed` flag; tell us the icon set (WC, sink, door, window, shower, bathtub).
