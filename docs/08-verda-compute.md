# Verda Compute: what we trained and what it bought us

All training ran on one Verda A100 80 GB instance. Weights are in `models/`, training code in `train/`, and evaluation in `eval/run.py` and `train/r2_eval.py`.

## Models

| model | data | training | used for |
|---|---|---|---|
| `cubicasa_yolo11m_1280.pt` (round 1) | CubiCasa5K SVG annotations → YOLO boxes: door, window, toilet, sink, shower, bathtub | YOLO11m, 1280 px | fixtures and openings on raster plans |
| `cubicasa_rooms_yolo11m.pt` | CubiCasa5K room polygons + WC/SS text labels | YOLO11m, 40 epochs, 1280 px | bedrooms, kitchens, balconies, storeys, WC; zero-API mode |
| `cubicasa_r2std_1536.pt` (round 2) | original-size images (what users upload) + scaled images, `door_none` class | YOLO11m, 20 epochs, 1536 px, continued from round 1 | door and window ensembles |

We also evaluated an `r2runs` variant (window runs + joints) and a public RT-DETR-L checkpoint on the same split.
The RT-DETR weights are not redistributed because their repository states no license; `tools/get_models.sh` downloads them.

## What it changed (held-out test plans; thresholds chosen on validation plans only)

| | before | after |
|---|---|---|
| CubiCasa questions, engine end to end | 83.57 % with VLM / 79.90 % zero-API (round 1 + room model) | **85.02 %** (85.98 % with nested-box suppression, 15 Nov) with VLM / **80.84 %** zero-API (+ round 2, VLM × room-detector rules) |
| windows (exact count per plan) | 45.6 % | 53.8 % (r2std + RT-DETR ensemble; fair subset 51.5 → 57.4); 57.2 % with nested-box suppression |
| doors | 72.8 % | 73.1 % (r1 + r2std ensemble; fair subset 70.6 → 71.3) |
| sauna / bedroom / kitchen (VLM × room detector) | 91.8 / 86.7 / 95.0 % | 95.1 / 87.8 / 95.6 % |
| room counts without any API (zero-API mode) | priors only | bedroom 87.5, balcony 88.5, floors 92.8, kitchen 89.7, WC 82.0 % |

- "Fair subset" means the official CubiCasa val/test plans, which no model trained on; the public RT-DETR model was trained on the official train split.
- The live detector path was checked on Verda before shutdown: on 975 plans it matched the offline evaluation (window 53.6 %, fair 57.4 %; door 66.4 %) at 122 ms per plan.

## Cost

- Round 1 and the room model: about €12 in total (≈2.2 GPU hours).
- Round 2 training and evaluation: **TODO: fill in from Verda billing**.
- Inference needs no GPU: `models/` runs on CPU, and the engine falls back to cached detections or priors when ultralytics is missing.

## Why it matters for the challenge

- Own models give a **zero-API mode** (80.84 % on CubiCasa questions): drawings never leave the machine. This matters for confidential construction documents.
- Every detector answer comes with boxes, so a user can review and correct it in the UI (`/review`); the corrections are logged.
