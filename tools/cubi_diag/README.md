# CubiCasa door/window diagnostics (needs cubicasa5k.zip from Zenodo next to the dataset)

1. `match.py SECONDS`   – which CubiCasa image each Junction PNG is. Result: all 4,787 = `F1_original.png`, pixel-identical,
   no rotation/flip. Our detector was trained and cached on `F1_scaled.png` (1.5–3x larger), so reported cubicasa
   detector accuracy is on sharper images than the Junction PNGs.
2. `gt.py SECONDS`      – SVG ground-truth boxes per Junction image, 0–1000 normalised (same frame for both image sizes).
   GT counts equal the Junction answers for 933/933 test plans (windows) and 688/688 (doors).
3. `inst.py`            – per-instance comparison of cached detections with GT (test split, IoU ≥ 0.3).
4. `montage.py`         – crops of missed / merged / correct windows → `train/report_windows/`.

Findings (test split, current 1280 model, thresholds door 0.30 / window 0.45):

| class  | recall | precision | main errors |
|--------|--------|-----------|-------------|
| window | 85.3%  | 92.8%     | 805 missed (thin 3–5 px strips, very long or diagonal windows, faint scans); 419 adjacent windows merged into one box; 289 boxes covering only part of a window; 264 false boxes |
| door   | 97.3%  | 95.7%     | 242 false boxes; 149 missed |

An exact count needs every instance right: a plan has ~9 windows on average, so 85–93% per window becomes 45.6% per plan.
The GT annotations are used for training and diagnosis only, never to answer questions.
