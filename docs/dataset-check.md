# Dataset Health & Readiness Report

- **Date**: 2026-11-14 18:22:47 UTC
- **Dataset Path**: `E:/Download/junction-dataset-preview`
- **Total Files Verified**: 883
- **Parse Success**: 883 / 883 (100.0%)

## 1. Summary by Source Directory

| Source | Files | Parse Pass Rate | Total Rooms Detected | No Crash | Has Answer | Avg Latency (ms) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `cubicasa5k` | 241 | 100.0% (241/241) | 0 | 100.0% | 100.0% | 12 ms |
| `europeana` | 61 | 100.0% (61/61) | 0 | 100.0% | 100.0% | 24 ms |
| `finna` | 96 | 100.0% (96/96) | 0 | 100.0% | 100.0% | 52 ms |
| `habs` | 92 | 100.0% (92/92) | 0 | 100.0% | 100.0% | 42 ms |
| `ifc_bench` | 5 | 100.0% (5/5) | 497 | 100.0% | 100.0% | 4 ms |
| `ifc_models` | 7 | 100.0% (7/7) | 477 | 100.0% | 71.4% | 22 ms |
| `opening_design` | 61 | 100.0% (61/61) | 0 | 100.0% | 91.8% | 101 ms |
| `swiss_dwellings` | 195 | 100.0% (195/195) | 4854 | 100.0% | 100.0% | 47 ms |
| `wikimedia` | 125 | 100.0% (125/125) | 0 | 100.0% | 100.0% | 18 ms |

## 2. Benchmark IFC Models (`ifc_bench`)

| Model File | Size | Parse | Spaces (Rooms) | Door Count Q&A | Latency |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `ac20_arc.ifc` | 10678 KB | PASS | 82 | 77 count | 12 ms |
| `digital_hub_arc.ifc` | 8811 KB | PASS | 64 | 64 count | 2 ms |
| `duplex_arc.ifc` | 1617 KB | PASS | 21 | 14 count | 1 ms |
| `fantasy_office_building_3_arc.ifc` | 9430 KB | PASS | 87 | 75 count | 1 ms |
| `hitos_arc.ifc` | 62593 KB | PASS | 243 | 198 count | 4 ms |

## 3. Real Architecture Projects (`opening_design`)

- Total drawing sheets and models: **61** (IFC models: 5, PDF drawings: 55)
- Parse pass rate: **100.0%**

Sample verified models & drawing sheets from `opening_design`:
| File Path | Type | Parse | Result | Latency |
| :--- | :---: | :---: | :---: | :---: |
| `opening_design/Aalseth_Residence/Models & CAD/BIM/stairs.blend.ifc` | `.ifc` | PASS | 0 count | 0 ms |
| `opening_design/Facilities_Building/Transfer/20181108 - to structure & MBM - for pricing/1810 S Park.ifc` | `.ifc` | PASS | 17 count | 1 ms |
| `opening_design/Sports_Complex/IFC Roundtrip/FreeCAD Detail/colored_shapes.ifc` | `.ifc` | PASS | 0 count | 0 ms |
| `opening_design/Sports_Complex/IFC Roundtrip/FreeCAD Detail/detail_Yorik_FreeCAD_materials.ifc` | `.ifc` | PASS | 0 count | 1 ms |
| `opening_design/ULI-44_E_Mifflin-Suite_802/Models/bad IFC models - for autopsy only/base model with wrong placements and extrusions - FreeCAD export.ifc` | `.ifc` | PASS | 0 count | 2 ms |
| `opening_design/3_Offices/Transfer/20160912 - prepermit markup/layout 02-markups.pdf` | `.pdf` | PASS | Document parsed | 168 ms |
| `opening_design/Aalseth_Residence/Transfer/20180905 - from civil - markups/Restoration Text.pdf` | `.pdf` | PASS | Document parsed | 15 ms |
| `opening_design/Aalseth_Residence/Transfer/20181003 - to LWRD - followup documenation/Neighbor re-grading Permssion.pdf` | `.pdf` | PASS | Document parsed | 15 ms |
| `opening_design/Aalseth_Residence/Transfer/20190321 - to lumber yard - latest plans with door and window schedule/Sheet A600 - 3196 Aalseth Lane - Schedules.pdf` | `.pdf` | PASS | Document parsed | 105 ms |
| `opening_design/Aalseth_Residence/Transfer/20191013 - from STRUCT - stair details/2019-022- Aalseth Residence  - Revised Framing.pdf` | `.pdf` | PASS | Document parsed | 14 ms |
| `opening_design/Asbuilts_for_Small_Apartment/Transfer/20170906 - Land Use Application/30 day waiver - Sara Eskrich - 13th District.pdf` | `.pdf` | PASS | Document parsed | 14 ms |
| `opening_design/Crema_Cafe/Models/pdfs/A-101 - Elevations v2.pdf` | `.pdf` | PASS | Document parsed | 192 ms |
| `opening_design/Crema_Cafe/Models/pdfs/Print crema cafe HL 03.pdf` | `.pdf` | PASS | Document parsed | 25 ms |

## 4. Failure Manifest & Edge Cases

No parse or execution failures recorded across the entire dataset! All files ready for evaluation.
