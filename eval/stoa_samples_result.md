# Stoa example sheets: engine results

Run: `python tools/stoa_samples_run.py` (needs GEMINI_API_KEY). Sheets are low-resolution JPEGs; not used for tuning.

| # | sheet | question | expected (where known) | answer | method | evidence boxes | warnings | s |
|---|---|---|---|---|---|---|---|---|
| 0 | school_L00.jpg | How many doors are shown on this floor plan? | 107 door sets / 129 leaves (vector) | 126 count | `scan:doors+vlm:tiled:uncertain` | 145 | image analysis found only 45 door swings (faint arcs?); the vision model counted 126 tile by tile; answer = 126 (145 boxes merged from both); please review | 44.2 |
| 1 | school_L00.jpg | How many windows are shown on this floor plan? | 66 (vector) | 62 count | `scan:windows+vlm` | 61 |  | 5.1 |
| 2 | school_L00.jpg | What is the floor area of the Kitchen? | not printed: expect warning to calibrate; traced ~34 m2 | None  | `scan:vlm` | 0 | not shown on this drawing; no room areas / lengths printed for this; calibrate the scale and measure (POST /calibrate, /measure) | 10.4 |
| 3 | school_L00.jpg | What is the baseboard length in the Library? | not printed: expect warning to calibrate | None  | `scan:vlm` | 0 | not shown on this drawing; no room areas / lengths printed for this; calibrate the scale and measure (POST /calibrate, /measure) | 8.9 |
| 4 | school_L00.jpg | How many group rooms are there? | 10 | 13 count | `scan:vlm:tiled2x2:uncertain` | 13 | uncertain: tile-by-tile count 13, whole-sheet count 5; please review the boxes | 28.9 |
| 5 | slab_S100F.jpg | How many different slab types (thickness and reinforcement) are shown? | 3 | 3 count | `scan:vlm` | 3 |  | 20.2 |
| 6 | slab_S100F.jpg | What is the area of the 150 mm slab-on-grade with D13 @ 300? | ~61.7 m2 (6200 x 9950), hand reading | 61.69 m2 | `scan:vlm+dims` | 2 | area = 6200 x 9950 read from dimension strings (rectangle assumed); check the outline | 20.0 |
| 7 | slab_S100F.jpg | What is the top of slab elevation of the 300 slab with D16 bars? | 9400 | 9400  | `scan:vlm` | 1 |  | 13.7 |
| 8 | slab_S100F.jpg | What is the motor control center trench length? | 4275 | 4275  | `scan:vlm` | 1 |  | 10.7 |
| 9 | slab_S100F.jpg | How many doors are shown on this plan? | none drawn (slab plan) | 0 count | `scan:vlm` | 0 |  | 26.1 |
| 10 | dorm_A2.jpg | How many dorms are on the second floor? | 48 | 48 count | `scan:vlm` | 1 |  | 15.0 |
| 11 | dorm_A2.jpg | What is the total second floor area? | 26,562 SF | 26,562 SF  | `scan:vlm` | 1 |  | 11.5 |
| 12 | dorm_A2.jpg | What is the area of the west wing dormitory? | 6,095 SF | 6,095 SF  | `scan:vlm` | 1 |  | 8.3 |
| 13 | dorm_A2.jpg | What is the overall length of the building? | 323'-4" | 323'-4"  | `scan:vlm` | 1 |  | 9.6 |
| 14 | dorm_A2.jpg | How many accessible (ABA) dormitory rooms are shown? | unknown (count green rooms) | 2 count | `scan:vlm:tiled2x2` | 2 |  | 13.6 |
| 15 | piping_M101A.jpg | The large filled dots on piping indicate pipe support locations. How many pipe supports are shown? | 46 | 48 count | `scan:marks+vlm` | 48 |  | 8.8 |
| 16 | piping_M101A.jpg | How many fueling pumps are shown? | 5 | 5 count | `scan:vlm` | 5 |  | 22.5 |
| 17 | piping_M101A.jpg | How many filter separators are shown? | 7 | 7 count | `scan:vlm` | 7 |  | 27.9 |
| 18 | piping_M101A.jpg | How many non-surge check valves are there? | 5 | 5 count | `scan:vlm` | 5 |  | 22.6 |
| 19 | piping_M101A.jpg | What is the size of the suction header? | 16" | 16"  | `scan:vlm` | 1 |  | 7.6 |
