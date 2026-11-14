# Evaluation Results

Updated 2026-11-14 15:15 (Helsinki), engine = Xinran `main@9197898` merged in `7af0045`, routing `ba4c21c`.

## Headline numbers (report these)

Full dataset, run by Xinran with `eval/run.py` (engine only; cubicasa on the 20% held-out test split, never used to train YOLO):

| Source | Questions | Accuracy | How |
| --- | ---: | ---: | --- |
| swiss_dwellings | 37,584 | **98.6%** | exact from DXF geometry |
| ifc_models | 3,062 | **98.0%** | exact from IFC geometry / quantity sets |
| cubicasa5k (held-out test) | 16,694 | **83.5%** | YOLO detector for fixtures/doors/windows, Gemini for rooms, prior for kitchens |

## Re-run here on the preview dataset (all questions, no sampling)

Through the live app path `agent.engine_adapter.answer()` (routing included), **no LLM keys**, so no Gemini/Nemotron calls and 0 tokens.
Scoring: counts exact, measurements within 2%.

| Source | Correct | Accuracy | With evidence box | Notes |
| --- | ---: | ---: | ---: | --- |
| swiss_dwellings | 2320/2358 | **98.4%** | 99.2% | |
| ifc_models | 997/1049 | **95.0%** | 17.3% | 24 questions point at an IFC model missing from the preview set; on the 1025 with a model: **97.3%**. IFC evidence is GUIDs (3D highlight), not PNG boxes |
| cubicasa5k | 2154/4270 | 50.4% | 50.5% | room questions need Gemini (no key in this run) -> see breakdown |

### cubicasa5k by category, held-out test split only (preview images with md5(path) % 5 == 0)

| Category | Source | Correct | Accuracy | Xinran full test |
| --- | --- | ---: | ---: | ---: |
| toilet | detector (YOLO) | 82/84 | **97.6%** | 94% |
| kitchen | prior | 50/54 | **92.6%** | 96% |
| sink | detector (YOLO) | 72/82 | **87.8%** | 83% |
| shower + bathtub | detector (YOLO) | 66/80 | **82.5%** | 77-81% |
| door | detector (YOLO) | 44/58 | **75.9%** | 73% |
| window | detector (YOLO) | 44/84 | **52.4%** | 46% |
| floors, sauna, bedroom, bathroom, WC room, balcony | Gemini (vision) | not run | - | 86-98% |

Fixture/door/window/kitchen answers cost **0 LLM tokens** (detector ~1-2 s per new plan on CPU, then cached).
The room categories need one Gemini call per plan (all six categories come back from that one cached call).

Reproduce:
```bash
DATA_DIR=<dataset> JUNCTION_DATA=<dataset> GEMINI_API_KEY= NVIDIA_API_KEY= python scripts/eval_engine.py --n 100000 --seed 20261114
```

## Failed examples (up to five per source)

### swiss_dwellings

1. `data/swiss_dwellings/site892_bldg1902_floor8415.pdf` — What is the net floor area of apartment A in m², summing all its rooms except balconies, loggias, terraces and other outdoor spaces? Expected `25.54`, got `34.08`. Reason: measurement error exceeds 2%. Bbox: yes.
2. `data/swiss_dwellings/site1689_bldg2841_floor13117.pdf` — How many rooms labelled 'Cucina' are there on this floor? Expected `2`, got `3`. Reason: count mismatch. Bbox: yes.
3. `data/swiss_dwellings/site261_bldg473_floor1873.pdf` — How many rooms labelled 'Couloir' are there on this floor? Expected `8`, got `9`. Reason: count mismatch. Bbox: yes.
4. `data/swiss_dwellings/site157_bldg323_floor1313.pdf` — Quelle est la surface nette de l'appartement D en m² (somme de toutes ses pièces, hors balcons, loggias, terrasses et autres espaces extérieurs) ? Expected `72.5`, got `77.1`. Reason: measurement error exceeds 2%. Bbox: yes.
5. `data/swiss_dwellings/site157_bldg323_floor1313.pdf` — What is the net floor area of apartment B in m², summing all its rooms except balconies, loggias, terraces and other outdoor spaces? Expected `72.66`, got `76.26`. Reason: measurement error exceeds 2%. Bbox: yes.

### ifc_models

1. `data/ifc_models/kit-fzk-haus_ac20-fzk-haus_plan-02-dachgeschoss.pdf` — How many windows are there in the model 'FZK-Haus (Simple Phantasy Building)'? Expected `11`, got `None`. Reason: engine returned no numeric value. Bbox: no.
2. `data/ifc_models/kit-fzk-haus_ac20-fzk-haus_plan-02-dachgeschoss.pdf` — Wie lang sind alle Wände im Geschoss „Dachgeschoss“ zusammen, in Metern? Expected `42.8`, got `None`. Reason: engine returned no numeric value. Bbox: no.
3. `data/ifc_models/bsc-molio_molio-with-uris.ifc` — What is the total net floor area of all rooms (spaces) on '4. Sal', in m²? Expected `530.03`, got `565.696`. Reason: measurement error exceeds 2%. Bbox: no.
4. `data/ifc_models/kit-fzk-haus_ac20-fzk-haus_plan-02-dachgeschoss.pdf` — Wie viele Räume enthält das Modell „FZK-Haus (Simple Phantasy Building)“? Expected `7`, got `None`. Reason: engine returned no numeric value. Bbox: no.
5. `data/ifc_models/kit-fzk-haus_ac20-fzk-haus_plan-02-dachgeschoss.pdf` — Wie viele Türen enthält das Modell „FZK-Haus (Simple Phantasy Building)“? Expected `5`, got `None`. Reason: engine returned no numeric value. Bbox: no.

### cubicasa5k

1. `data/cubicasa5k/high_quality_architectural-3919.png` — How many separate WC rooms (toilet rooms marked WC) are on this floor plan? Expected `2`, got `None`. Reason: engine returned no numeric value. Bbox: no.
2. `data/cubicasa5k/high_quality_architectural-12085.png` — How many separate WC rooms (toilet rooms marked WC) are on this floor plan? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
3. `data/cubicasa5k/high_quality_architectural-5028.png` — How many bedrooms (makuuhuone, usually marked MH) are on this floor plan? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
4. `data/cubicasa5k/high_quality_architectural-7041.png` — Kuinka monta kerrosta pohjapiirustuksessa on esitetty? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
5. `data/cubicasa5k/high_quality_architectural-8638.png` — How many bedrooms (makuuhuone, usually marked MH) are on this floor plan? Expected `3`, got `None`. Reason: engine returned no numeric value. Bbox: no.
