# Handoff 10 — 2.5D measured scene (reply to status/42), 15 Nov 2026

From Xinran (A side) to Diletta and the B-side agents.

- **Repo:** `13032585789-spec/Trace`, branch `main`.
- **Code commit:** `f3b28da`. This doc is in the commit after it.
- **Pull:**
  ```
  git checkout xinran/main -- engine agent/docs_api.py tools/scene_check.py eval/scenes docs
  ```
- No new dependencies. The PDF scene uses `pdfplumber`, `pypdfium2` and `opencv`, which are already in use.

## 1. Answers to your questions

- **`COORDINATE_TO_ORIGIN`:** you do not set it, so the offset is **0**. Our coordinates are the raw web-ifc world:
  `X = x_ifc`, `Y = z_ifc` (up), `Z = -y_ifc`, in metres. They match web-ifc loaded without that flag. If you ever turn it on, tell us; we will add the model origin to the response.
- **Axes:** the same frame as the `spaces` / `storeys` / `clearances` output you accepted.
  - Plan polygons are `[X, Z]`; 3D points are `[X, Y, Z]`.
  - **Plan-up (project north) is −Z**, because a right-handed Y-up frame with X to the right puts +Z toward the viewer. Every scene states this in `plan_up_vector: [0, -1]`.
  - `north_vector` is true north as `[X, Z]` when the model states it, else plan-up with `north_basis: "project_north"`.
  - If you need "Z = north", flip Z once at load time (`z' = -z`). Do not mix the two.
- **Rotation:** `rotation_deg` is the rotation about +Y in three.js convention, counter-clockwise seen from above. The element's local +X maps to `(cos r, 0, -sin r)`.
  - `footprint.width_m` is along local +X; `footprint.depth_m` is along `front_vector`, which is local +Y as `[X, Z]`.
  - IFC does not say which side is the "user side" of a family. Place icons by `rotation_deg` + `footprint`, and treat `front_vector` as a hint.
- **`plan_rooms`:** noted that it lives in `agent/plan_rooms.py` and belongs to the backend owner of `agent/`. We did not touch it.
  - `engine/sheet.py` `rooms()` now also returns `polygon` (PDF points) and `label_box` per room.
  - They can fill `polygon_norm1000` / `label_norm1000` directly from that: `x / page_width * 1000`.

## 2. The route

```
GET /scene?path=<data/... or uploads/...>[&storey=<name|guid>][&room=<name|number|guid>][&space_model=<ifc>][&page=<1-based>]
```

| `path` type | module | quality |
|---|---|---|
| `.ifc` | `engine.scene_ifc.scene(path, storey, room, space_model)` | `measured` |
| vector `.pdf` | `engine.scene_pdf.scene(path, page)` | `measured` when a scale is printed, else `illustrative` (unit `pt`) |
| scan / photo / raster `.pdf` | `engine.scene_scan.scene(path, page)` | `measured` only after `/calibrate` on that file; else `illustrative` (unit `norm1000`) |

`space_model` is the IFC that holds rooms, walls, doors and windows, when the fixtures live in another model (Duplex: fixtures in the plumbing model, rooms in the architectural one). The response follows your schema: `project_id, source_kind, unit, coordinate_system, quality, warnings, sources, storeys, rooms, walls, openings, objects, systems`. Fields we added are listed in section 4; nothing in your schema is renamed.

CLI, each runnable on its own:

```
python -m engine.scene_ifc plumbing.ifc --room "Bathroom 1" --space-model arch.ifc > scene.json
python -m engine.scene_pdf sheet.pdf --page 1 > scene.json
python -m engine.scene_scan plan.jpg > scene.json
python tools/scene_check.py      # rewrites eval/scenes/*.json + top-view overlay PNGs
```

## 3. Deliverables in `eval/scenes/` (JSON + overlay PNG each)

| file | what | counts |
|---|---|---|
| `duplex_bathroom1.json` | **Deliverable 1**: Duplex B104 Bathroom 1, Level 1 | 1 room, 4 walls, 1 door, WC + lavatory + shower, 73 water segments |
| `duplex_bathroom2.json` | Duplex B204 Bathroom 2, Level 2 | 1 room, 4 walls, 2 doors, WC, 2 lavatories, 2 vanities, bathtub, 62 water segments |
| `duplex_level1.json` | **Deliverable 2**: Duplex Level 1, whole floor | 10 rooms, 21 walls, 10 doors/windows, 9 fixtures, 158 water segments |
| `fzk_erdgeschoss.json` | FZK-Haus ground floor (no fixtures in that model) | 6 rooms, 9 walls, 14 doors/windows |
| `school_pdf_L00.json` | Stoa vector PDF (UK special school L00, 1:200) | 50 rooms, 202 wall pieces, 195 doors/windows, `measured` |
| `school_scan_illustrative.json` | the same plan as a scan, not calibrated | 178 door/window candidates, `illustrative`, unit `norm1000` |

The Duplex bathroom has **no window**; it is an interior room. Windows are in `duplex_level1.json` and `fzk_erdgeschoss.json`.

**Manual check of Deliverable 1** (`duplex_bathroom1.png`). The wall faces computed from the wall centre line ± half the thickness coincide with the room outline from IfcSpace, to the millimetre:

| wall | centre | faces | room edge |
|---|---|---|---|
| west partition | x 2.512 | 2.450 / **2.574** | x 2.574 |
| east furring | x 4.106 | **4.030** / 4.182 | x 4.030 |
| north partition | z 7.492 | 7.430 / **7.554** | z 7.554 |
| south party wall | z 10.000 | **9.725** / 10.275 | z 9.725 |

Further checks on the same room:
- The door sits on the west wall (x 2.512) with `wall_id` set from IfcRelFillsElement / IfcRelVoidsElement.
- WC, lavatory and shower all sit against the east wall, inside the room. They were matched to the room by position, 16/16 on Duplex.
- The overlays show the same for Bathroom 2, Level 1 and FZK.

## 4. Fields per element (beyond your schema)

- **All elements:**
  - `id` = IFC GlobalId; on sheets a stable id `p<page>-<kind>-<n>`;
  - `confidence` from 0 to 1;
  - `source` = `{file, page, guid}` for IFC, `{file, page, bbox_pt, bbox_norm1000}` for PDFs, `{file, page, bbox_norm1000}` for scans. `bbox_norm1000` is 0–1000 of the page, so it maps onto your `/drawing` PNG at any render size;
  - optional `warnings`.
- **walls:**
  - `points` is the centre line `[[X,Z],[X,Z]]`; `footprint` is the exact plan outline (use it for non-straight walls);
  - also `thickness_m`, `length_m`, `base_y_m`, `height_m`.
- **openings:** `kind` (`door` | `window`), `wall_id`, `position` (bottom centre), `rotation_deg`, `front_vector`, `width_m`, `height_m`, `sill_y_m`, `depth_m`, `size_from`.
  - PDF doors also carry `hinge`, `swing_ends` and `placement`, which says how the closed leaf was found.
  - PDF windows carry `panes`.
- **objects:** `category` (`toilet` | `sink` | `shower` | `bathtub` | `vanity`), `room_id`, `room_method`, `position` (floor centre), `rotation_deg`, `front_vector`, `footprint {width_m, depth_m}`, `height_m`, `ifc_class`.
- **systems:** `kind` (`water` | `electrical` | `hvac` | `unknown`), `points` (two-point axis per segment, from its body), `ifc_class`, `confidence` 0.7.
  - Only IFC pipe / duct / cable segments for now.
  - `from_id` / `to_id` are not filled yet.
- **storeys:** `outline` (convex hull of the storey's walls; page border for sheets), `outline_from`.
- **rooms:** `polygon`, `label_point`, `area_m2`, `outline` (`"profile"` = exact; otherwise a hull, `confidence` 0.7). Sheets add `baseboard_m`.

## 5. Limits (all are also stated in `warnings`)

- **IFC:**
  - wall centre lines assume straight walls; `confidence` is 0.6 and `footprint` is the truth when not;
  - pipe segments are straight two-point axes;
  - Tallinn was not checked, because we do not have the file. Please send it.
- **Vector PDF:**
  - walls only where they are drawn as solid black fills; outline-drawn walls are not traced yet;
  - no fixtures, which need symbol recognition;
  - no heights, which are not on a plan;
  - no north arrow, so the frame is the page as drawn;
  - two labels in one traced region get `confidence` 0.5.
- **Scans:**
  - door and window candidates only, `rotation_deg` null for doors;
  - rooms and walls are not traced;
  - fixtures only where the CubiCasa detector (ultralytics) is installed;
  - **never metric without a calibration.**

## 6. Suggested acceptance order for you

1. Load `duplex_bathroom1.json` next to the Duplex IFC in your viewer without `COORDINATE_TO_ORIGIN`. Walls, door and fixtures should sit on the IFC geometry.
2. Then `duplex_level1.json` (whole floor plus water layer), then `school_pdf_L00.json` (sheet-based).
3. Tell us any element that is off, with its `id`, and we fix it at the source.
