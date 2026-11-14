# Engine Evaluation Results

- Generated (UTC): 2026-11-14T09:42:26+00:00
- Dataset directory: `junction-dataset-preview` (path omitted)
- Sample size: up to 50 questions per source; sampling is random.
- Random seed: `20261114`
- Scoring: counts must match exactly; area, length, and volume must be within 2% relative error. A zero expected measurement passes only on an exact zero.
- Network use: none; Gemini and NVIDIA vision credentials are disabled. Each sample calls the local `agent.engine_adapter.answer(path, question)` only.
- Bounding box: a result counts as boxed when at least one `sources` entry has a four-coordinate `bbox`.

## Results by source

| Source | Correct | Accuracy | With bbox | Bbox rate | Sampled / available |
| --- | ---: | ---: | ---: | ---: | ---: |
| `swiss_dwellings` | 49/50 | 98.0% | 49/50 | 98.0% | 50/2358 |
| `ifc_models` | 46/50 | 92.0% | 8/50 | 16.0% | 50/1049 |
| `cubicasa5k` | 2/50 | 4.0% | 1/50 | 2.0% | 50/4270 |

## Failed examples (up to five per source)

### swiss_dwellings

1. `data/swiss_dwellings/site892_bldg1902_floor8415.pdf` — What is the net floor area of apartment A in m², summing all its rooms except balconies, loggias, terraces and other outdoor spaces? Expected `25.54`, got `34.08`. Reason: measurement error exceeds 2%. Bbox: yes.

### ifc_models

1. `data/ifc_models/bsc-molio_molio-with-uris.ifc` — What is the total net floor area of all rooms (spaces) on '1. Sal', in m²? Expected `416.62`, got `452.286`. Reason: measurement error exceeds 2%. Bbox: no.
2. `data/ifc_models/kit-fzk-haus_ac20-fzk-haus_plan-02-dachgeschoss.pdf` — Wie viele Träger enthält das Modell „FZK-Haus (Simple Phantasy Building)“? Expected `4`, got `None`. Reason: engine returned no numeric value. Bbox: no.
3. `data/ifc_models/bsc-molio_molio-with-uris.ifc` — Hvad er nettoarealet af rummet 'Gang (Rum nr. 201)' på '2. Sal' i m²? Expected `179.23`, got `214.903`. Reason: measurement error exceeds 2%. Bbox: no.
4. `data/ifc_models/bsc-molio_molio-with-uris_plan-02-klder.pdf` — What is the total net floor area of all rooms (spaces) on 'Kælder', in m²? Expected `523.74`, got `559.575`. Reason: measurement error exceeds 2%. Bbox: yes.

### cubicasa5k

1. `data/cubicasa5k/high_quality_architectural-10000.png` — How many bedrooms (makuuhuone, usually marked MH) are on this floor plan? Expected `0`, got `None`. Reason: engine returned no numeric value. Bbox: no.
2. `data/cubicasa5k/high_quality_architectural-12684.png` — How many bathrooms or washrooms (e.g. KH, KPH, PH, PESUH, SH) are on this floor plan, not counting separate WC rooms? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
3. `data/cubicasa5k/high_quality_architectural-6405.png` — How many doors are shown on this floor plan? Count doorways fitted with a door; open doorways without a door leaf do not count. Expected `11`, got `None`. Reason: engine returned no numeric value. Bbox: no.
4. `data/cubicasa5k/high_quality_architectural-10368.png` — How many kitchens (including kitchenettes, open kitchens and utility kitchens) are on this floor plan? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
5. `data/cubicasa5k/high_quality_architectural-9787.png` — Kuinka monta keittiötä (myös keittokomerot, avo- ja tupakeittiöt sekä apukeittiöt) pohjapiirustuksessa on? Expected `1`, got `None`. Reason: engine returned no numeric value. Bbox: no.
