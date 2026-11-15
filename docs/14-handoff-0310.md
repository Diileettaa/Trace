# Handoff 14 — since handoff 12 (15 Nov, 03:10)

- **Pull:**
  ```
  git checkout xinran/main -- engine tools eval docs
  ```
- The schema is unchanged; only new optional fields were added.

## New behaviour

1. **Scans get a scale automatically.**
   - How it works: Gemini reads the printed ratio (1:N) and the paper size from the title block. If the image aspect matches the paper, `/scene` returns metres with `quality: measured` and a warning: "scale read from the sheet … calibrate to confirm".
   - A user calibration always wins.
   - Checked on the school scan: 1:200 on A2 gives 25.20 mm/px against 25.25 measured (−0.2 %).
   - Dorm sheet: no paper size printed, so it stays `illustrative`.
   - Module: `engine/scan_scale.py`.
2. **Vector fixtures are named by Gemini when no reviewer names exist.**
   - On the school sheet, all 11 WCs were named `toilet` by Gemini, the same as the reviewed names.
   - 16 of 23 symbol types agree overall; the misses are furniture (chair vs desk).
3. **Area answers that combine dimensions (`sheet:expr`) are read 3 times.**
   - When readings agree: the majority value, with the warning "n of 3 independent readings agree".
   - When all differ: `method` ends with `:uncertain` and every reading is listed in `alternatives`, so the review panel can let the user pick.
4. **CubiCasa5K official model (W4)** is integrated where it helps:
   - walls on thin-wall residential scans;
   - room types (Bath, Kitchen, Bed Room…);
   - openings as a fallback.
   - Our detector stays the fixture source (it wins 36 vs 29 toilets, 29 vs 22 sinks on the same 40 plans).

## Current numbers

| set | result |
|---|---|
| CubiCasa test | 85.98 % (unchanged) |
| IFC test | 98.41 % (unchanged) |
| Swiss test | 99.97 % (unchanged) |
| Stoa vector sheet set (`tools/sheet_run.py`) | 22/25 with a known answer. The 3 misses: (a) two slab areas where our own hand reading disagrees with the model's choice of dimensions — see below; (b) the dorm count on a scan, flagged `uncertain` |
| Stoa samples (scans) | slab area 61.69 m² now right; doors 126 vs 129 (−2 %); group rooms 13 vs 10, flagged `uncertain` |

**Open question for Stoa (booth):** on sheet AW 078-24-33 p56, is the 300 mm slab-on-grade with D16 @ 300 17100 × 12000 mm (205.2 m², the model's reading, 3 of 3 runs) or 19500 × 11000 mm (214.5 m², our hand reading)? The same question applies to the 150 mm slab: 6200 × 4975 or 6200 × 9950. Our "expected" values are our own readings, not Stoa's.

## What the frontend should show

- **`alternatives`** on any answer with `:uncertain`: let the user pick one. `/review` with `choose` already handles it.
- **Scan scene `quality`:** `measured` with an "auto scale" warning should look different from a calibrated one, e.g. a small "scale read from sheet" badge.

## Deployment checklist (A side + B side)

- **Server Python packages:** `pdfplumber`, `pypdfium2`, `opencv-python-headless`, `numpy`, `Pillow`.
  - **`ultralytics`** is needed for fixtures on scans (our detector). Without it, scans get no WC / sink unless a CubiCasa5K sidecar exists.
  - **`torch`** only if you want the CubiCasa5K model live. Otherwise we ship its sidecar JSONs for the demo images.
- **Weights:**
  - `models/*.pt` (committed);
  - `rtdetr_l_cubi.pt` via `tools/get_models.sh`;
  - CubiCasa5K `model_best_val_loss_var.pkl`, only if torch is used.
- **Environment:** `GEMINI_API_KEY` via the environment only.
- **Before 05:00:** run `python eval/run.py --source swiss_dwellings --split test` on the server as a smoke test. Expect 99.97 %.
