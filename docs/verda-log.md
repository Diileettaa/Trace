# Verda Usage Log – Team Trace

This document records the work, training pipelines, compute usage, and benchmark evaluations for the **Verda Compute Track** in Junction 2026 (Stoa challenge: "Make Blueprints Talk").

---

## 1. Idea: Why Specialized GPU Compute is Needed

Answering natural language questions about construction drawings requires reliably counting and locating physical building components (doors, windows, plumbing fixtures, room types) across raster floor plans.

General-purpose vision-language models (VLMs, e.g., Gemini 3.6 Flash) struggle with small, dense, repetitive CAD symbols on floor plans:
- On the full held-out test set, general vision LLMs achieved only **37%** exact accuracy on door counts and **29%** on window counts.
- While LLMs are effective at identifying broader spatial areas (e.g. 98% on floor count, 97% on separate WC rooms), relying on remote frontier APIs for high-resolution symbol scanning introduces high per-plan latency (~20 s) and substantial API costs.

To solve this, we trained specialized domain-specific object detection models (YOLO11m) on high-resolution plans (**1280×1280** px). Training modern vision architectures on thousands of high-resolution blueprint images requires dedicated high-VRAM GPU compute.

---

## 2. Why Verda

- **High-VRAM GPU Hardware**: An NVIDIA A100 with **80 GB VRAM** enabled training YOLO11m with batch size 8 directly at native $1280 \times 1280$ resolution (`imgsz=1280`) without downsampling small symbols (e.g., washbasins or door swings).
- **Turnaround Time**: The full symbol detector (60 epochs on 3,604 CubiCasa5k training plans) completed in **~1 hour**. The room polygon detector (40 epochs) finished in **2,484.07 s** (~41.4 minutes).
- **Flexible On-Demand Instances**: Verda's hourly GPU billing permitted spin-up for training, checkpoint export, and rapid evaluation without long-term commitment.
- **Inference & Cross-Checking Hosting**: Deployed a container running Nemotron 3.5 Super VL to serve as an independent consistency check against the local engine's counts.
- **Other reasons**: Not recorded.

---

## 3. Process Log

| Date / Time | Action / Task | Verda Product | Duration / Cost | Issues & Resolution |
| --- | --- | --- | --- | --- |
| 2026-11-14 (morning) | Environment setup via `train/setup.sh`; downloaded CubiCasa5k dataset (5.5 GB zip, verified md5 `0ce0b203d1e3c125b51087b219bd23b9`); parsed SVG annotations to YOLO format via `train/cubicasa_to_yolo.py` (3,604 train/val plans, 975 held-out test plans with `md5(path) % 5 == 0`) | Verda GPU Instance (A100 80GB, Ubuntu) | Duration: not recorded / Cost: not recorded | Kept held-out split (`split.json["junction_test"]`) strictly isolated from training/validation to prevent data leakage. |
| 2026-11-14 | Trained symbol detector `cubicasa_yolo11m_1280.pt` on 3,604 plans for 60 epochs (`imgsz=1280`, `batch=8`, `close_mosaic=10`, `patience=20`) covering doors, windows, toilets, sinks, showers, and bathtubs | Verda GPU Instance (A100 80GB) | Duration: ~1 hour / Cost: not recorded | Managed long-running execution via `train.sh` background process (`nohup yolo detect train ...`). |
| 2026-11-14 | Trained room polygon detector `cubicasa_rooms_yolo11m.pt` for 40 epochs on room polygons and WC/SS text labels (`imgsz=1280`) | Verda GPU Instance (A100 80GB) | Duration: 2,484.07 s (~41.4 min) / Cost: not recorded | The sauna class had only 8 training/validation instances, making pure bounding box prediction unreliable; resolved by combining 'SS' text label detection with space polygons. |
| 2026-11-14 14:10 | Evaluated models on 975 held-out plans (16,694 questions); tuned per-class thresholds on validation plans (`models/detector.json`, `models/rooms.json`); established routing table | Verda GPU Instance & Local Evaluation | Duration: not recorded / Cost: not recorded | When general VLM and YOLO disagreed, YOLO was correct 3–8x more often on fixtures and doors; configured engine to route fixtures/doors directly to YOLO. |
| 2026-11-14 | Deployed Nemotron 3.5 Super VL endpoint on Verda container to provide automated cross-verification badges | Verda Container (Nemotron 3.5 Super VL) | Duration: not recorded / Cost: not recorded | Reasoning models output JSON after internal thought tokens; updated parser in `agent/vision.py` to inspect both reasoning content and final message text. |

---

## 4. Results

### 4.1 Symbol Detector (`cubicasa_yolo11m_1280.pt`)
Trained on one Verda A100 80GB for 60 epochs at 1280 resolution. Evaluated on 975 held-out CubiCasa5k plans:

| Category | Statistical Prior | Gemini 3.6 Flash | YOLO11m Detector (Verda A100) | Selected Engine Source |
| --- | :---: | :---: | :---: | :---: |
| **Door** | 12% | 37% | **73%** (72.8%, threshold 0.3) | **YOLO** |
| **Window** | 13% | 29% | **46%** (45.6%, threshold 0.45) | **YOLO** |
| **Toilet** | 59% | 84% | **94%** (94.0%, threshold 0.4) | **YOLO** |
| **Sink** | 50% | 69% | **83%** (82.7%, threshold 0.5) | **YOLO** |
| **Shower / Bathtub** | 76% | 65% | **77–81%** (76.9%, threshold 0.3) | **YOLO** |

- **Inference Speed**: **~7 ms** per plan on GPU, with exact bounding box pixel coordinates returned for every detected item.
- When the detector and Gemini agreed, combined answer accuracy was **86–97%**. When they disagreed, YOLO was correct **3–8x** more often than Gemini.

### 4.2 Room Detector (`cubicasa_rooms_yolo11m.pt`)
Trained on one Verda A100 80GB for 40 epochs (2,484.07 s) at 1280 resolution on CubiCasa5k room polygons and text annotations (`train/report_rooms/results.csv`):
- Final epoch metrics: mAP50 = **0.6598** (66.0%), mAP50-95 = **0.4897** (49.0%), Precision = **0.5678**, Recall = **0.7183**.
- Held-out test exact-count accuracy:
  - **Bedroom**: **87.5%** (threshold 0.5) vs Gemini 86.0%
  - **Balcony**: **88.5%** (threshold 0.3) vs Gemini 88.9%
  - **Floors**: **92.8%** (threshold 0.45) vs Gemini 97.9%
  - **WC Room**: **82.0%** (threshold 0.2) vs Gemini 96.5%
  - **Kitchen**: **89.7%** (threshold 0.35); statistical prior achieves **95.6%**
  - **Sauna**: 8 train-val instances; combining space polygons and 'SS' labels achieves **63.4%** without VLM.

### 4.3 Full Dataset Accuracy & Zero-API Mode
Tested across the full benchmark (Xinran full test split):

| Dataset Source | Questions | Accuracy | Methodology |
| --- | ---: | :---: | --- |
| **swiss_dwellings** | 37,584 | **99.2%** | Exact geometry calculated from DXF layers (0 tokens) |
| **ifc_models** | 3,062 | **99.1%** | Exact geometry & quantity sets from IFC models (0 tokens) |
| **cubicasa5k (with Gemini VLM)** | 16,694 | **83.57%** | YOLO detector for fixtures/doors/windows + Gemini for rooms + prior for kitchens |
| **cubicasa5k (Zero-API Mode)** | 16,694 | **79.90%** | Local YOLO models + room detector + statistical priors only (**0 tokens**, $0 API cost) |

Setting `JUNCTION_NO_VLM=1` activates **Zero-API mode**, answering every blueprint question locally with **0 tokens** while retaining **79.90%** accuracy across held-out plans.

---

## 5. Scaling to Real Users

1. **Ingestion-Time Batch Detection**:
   In commercial architectural workflows, drawings are uploaded in sets of dozens or hundreds of pages. Verda GPU workers can run batch inference at ingestion time (~7 ms/plan for YOLO), pre-indexing symbol coordinates, element counts, and room boundaries so user queries return instantly.
2. **Predictable Cost with Zero-Token Baseline**:
   Because 78% of all blueprint queries on the preview set (and 100% in Zero-API mode) are served entirely by geometry solvers and local models, infrastructure costs scale with fixed, low-cost compute rather than open-ended frontier LLM token charges.
3. **Decoupled Asynchronous Processing**:
   High-resolution drawing vectorization (150 DPI rendering) and model execution can be offloaded to worker queues (e.g. Celery / Cloud Tasks) with dead-letter retries and health-checked GPU pools.
4. **Data Privacy and On-Premise Compliance**:
   Construction blueprints frequently contain confidential client data, security layouts, or proprietary structural engineering. Operating fine-tuned open-weights models (YOLO11, Nemotron) on dedicated Verda instances ensures blueprints never leave the secure customer perimeter.

---

## 6. Links

- **Full Write-Up**: https://claude.ai/artifact/2EKd9Jn2BSyC1GqcNs7t9r
- **Verda Discord Post**:
```
Team Trace (Stoa "Make Blueprints Talk") – how we used Verda
We trained a YOLO11 floor-plan symbol detector on one A100 80GB in ~1 hour (60 epochs, 3,604 CubiCasa5k plans). On 975 held-out plans it lifted exact door counts from 37% (general vision LLM, full test) to 73%, answers in ~7 ms per plan with a box for every counted item, and Nemotron 3.5 Super VL on a Verda container cross-checks it.
Write-up: https://claude.ai/artifact/2EKd9Jn2BSyC1GqcNs7t9r
```
