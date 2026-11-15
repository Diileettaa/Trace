# Scan box quality: live detector on CubiCasa test plans

Detector = models/detector.json (fused ensemble). Match = IoU >= 0.5, one-to-one. 933 test plans; fair subset (official val/test plans no model trained on) = 130.

## all test plans, nested suppression off

| class | answer correct (dataset gold) | box count = SVG count | recall | precision | mean IoU (matched) | missed | merged into bigger box | false box | partial box |
|---|---|---|---|---|---|---|---|---|---|
| door | 73.1% (n=688) | 67.3% | 94.4% | 95.4% | 0.926 | 437 | 57 | 366 | 37 |
| window | 53.8% (n=933) | 53.8% | 85.6% | 91.7% | 0.857 | 749 | 450 | 270 | 376 |
| toilet | 93.6% (n=933) | 93.6% | 93.8% | 95.2% | 0.861 | 73 | 10 | 57 | 6 |
| shower_tub | 76.6% (n=856) | 76.0% | 74.7% | 80.1% | 0.777 | 248 | 75 | 202 | 35 |

## all test plans, nested suppression ON

| class | answer correct (dataset gold) | box count = SVG count | recall | precision | mean IoU (matched) | missed | merged into bigger box | false box | partial box |
|---|---|---|---|---|---|---|---|---|---|
| door | 73.1% (n=688) | 67.3% | 94.4% | 95.4% | 0.926 | 437 | 57 | 366 | 37 |
| window | 57.2% (n=933) | 57.2% | 84.9% | 93.4% | 0.857 | 749 | 515 | 267 | 234 |
| toilet | 93.6% (n=933) | 93.6% | 93.8% | 95.2% | 0.861 | 73 | 10 | 57 | 6 |
| shower_tub | 82.1% (n=856) | 73.3% | 67.3% | 80.1% | 0.780 | 248 | 170 | 191 | 22 |

## fair subset, nested suppression off

| class | answer correct (dataset gold) | box count = SVG count | recall | precision | mean IoU (matched) | missed | merged into bigger box | false box | partial box |
|---|---|---|---|---|---|---|---|---|---|
| door | 79.3% (n=92) | 72.3% | 95.1% | 96.5% | 0.928 | 54 | 4 | 36 | 4 |
| window | 56.9% (n=130) | 56.9% | 83.4% | 90.0% | 0.845 | 115 | 77 | 55 | 52 |
| toilet | 93.1% (n=130) | 93.1% | 95.2% | 95.7% | 0.839 | 6 | 3 | 7 | 1 |
| shower_tub | 78.8% (n=118) | 78.5% | 71.8% | 78.1% | 0.765 | 34 | 15 | 27 | 8 |

## fair subset, nested suppression ON

| class | answer correct (dataset gold) | box count = SVG count | recall | precision | mean IoU (matched) | missed | merged into bigger box | false box | partial box |
|---|---|---|---|---|---|---|---|---|---|
| door | 79.3% (n=92) | 72.3% | 95.1% | 96.5% | 0.928 | 54 | 4 | 36 | 4 |
| window | 55.4% (n=130) | 55.4% | 82.0% | 91.1% | 0.845 | 115 | 94 | 55 | 38 |
| toilet | 93.1% (n=130) | 93.1% | 95.2% | 95.7% | 0.839 | 6 | 3 | 7 | 1 |
| shower_tub | 82.2% (n=118) | 74.6% | 66.7% | 77.3% | 0.767 | 34 | 24 | 26 | 8 |

## Reading this

- "answer correct" is what the challenge scores (dataset answer for the count question). "box count = SVG count" compares
  with the SVG annotation, which counts a shower and the tub drawn inside it as two objects; the dataset answer counts
  the combination once. That is why nested suppression lowers SVG-level recall for shower_tub but raises the answer
  accuracy (76.6 -> 82.1 % on 856 test plans, 78.8 -> 82.2 % on the fair subset).
- Windows: 53.8 -> 57.2 % on 933 test plans; on the 130-plan fair subset 56.9 -> 55.4 % (2 plans). Kept ON: thresholds
  were set on val, test is the larger independent sample; the fair-subset dip is within noise and is reported, not hidden.
- Doors and toilets are unaffected (suppression only runs for window and shower_tub).
- Box tightness: matched doors average IoU 0.93, windows 0.85-0.86, toilets 0.84-0.86, showers/tubs 0.77-0.78.
  Window errors are mostly adjacent windows merged into one box (515) and missed thin strips (749), not loose boxes,
  so box tightening would not move the count; splitting merged windows would.
- GT annotations are used only to measure. Stoa sample images were not used for any of this.
