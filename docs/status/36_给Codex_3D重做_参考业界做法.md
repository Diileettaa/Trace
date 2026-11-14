# 36 — 3D: make it usable (based on how real BIM viewers do it)

Owner: Codex (IfcViewer.tsx / Real3D wiring). Do NOT deploy. Do NOT touch engine/.
Order = priority. Commit each item separately. After each item: test on ALL models listed at the bottom, not only Tallinn.

## Why the current room view fails
User videos: grey ambiguous close-up, camera inside walls, labels floating, walk stuck.
Root cause: we "isolate" a room by hiding/ghosting elements and putting the camera inside. Real viewers
(PlanRadar, BIMcollab, Autodesk, xeokit, That Open) do NOT do this. They use a **section box** and keep the
camera OUTSIDE, looking down into the cut room ("dollhouse"/cutaway). Copy that.

## 1. Room = section box + outside camera (replaces current interior mode)
- Room bbox = IfcSpace bbox (or roomDims). Expand by 0.4 m horizontally; bottom = floor - 0.05 m; top = floor + 2.0 m (cut BELOW ceiling so we see in).
- Clip with 6 THREE.Plane on renderer (`renderer.localClippingEnabled = true`, or That Open `OBC.Clipper` / global `renderer.clippingPlanes`). Everything outside the box disappears; walls get cut showing their thickness.
- Optional cap: dark fill on cut faces (That Open `ClipStyler` / stencil caps). If too slow, skip — edges are enough.
- Neighbouring rooms: NOT visible (box handles it). No ghosting needed.
- Camera: OrbitControls target = room center at floor+0.8 m. Start position = 45° elevation, azimuth 35°, distance = 1.6 × room diagonal. Never inside.
- Animate with the existing fly-to (600 ms). Clicking a room label/chip/list item = same function.
- Exit room → remove planes, fly back to building.

## 2. Bounded camera (no flying away / through walls)
- OrbitControls: `minDistance = 0.6×diag`, `maxDistance = 3×diag` in room mode; building mode min 2 m, max 2.5×model diag.
- `minPolarAngle = 0.15`, `maxPolarAngle = Math.PI/2 - 0.08` (never below the floor).
- On `change`: clamp `controls.target` into the (expanded) room box / model box.
- `enablePan` true but target clamped, so it can't leave.
- Zoom-to-cursor off in room mode.

## 3. Floor-by-floor plan view (the "from above" view)
Reference: That Open `Views`/floor plans = clip plane at storey elevation + 1.2 m + top-down orthographic camera; xeokit StoreyViewsPlugin does the same.
- LEVEL menu storey selected → hide storeys above (or clip plane at elevation+1.2 m), camera straight down (polar 0.01), ortho if OrthoPerspectiveCamera available, fit to that storey bbox.
- Room names as small HTML chips at room centroids (CSS2DRenderer), English via `roomEnglish`. Click chip → item 1.
- Button "3D / Plan" pill (small) toggles between top-down and 45°.

## 4. Fit + site clutter (seen on other models)
- FZK: huge brown terrain slab dominates, building tiny. Hide IfcSite / IfcGeographicElement geometry by default; fit camera to IfcBuilding elements only (bbox of walls/slabs), fill ~80% of the viewport.
- Duplex / Hitos: model tiny in lower part of the frame → same fit fix; center vertically.
- Clinic (plumbing only): pipes very faint → for models without walls, use strong system colours (cold=blue, hot=red, waste=brown) and thicker look; no ghost material.

## 5. Labels: only chips, never floating white 3D text
- Remove all sprite/troika text. One CSS2D chip style (Gigi dark pill, 11px). Max 12 visible, hide chips whose anchor is occluded or off-screen. Building mode: no room labels unless hovering (hideRoomLabels already exists — default it ON for building mode).

## 6. Dimensions on the floor
- In room mode: draw the room width/depth as dimension lines on the floor plane (Line2 + end ticks + chip "3.42 m"), 5 cm above floor so not z-fighting. Clearances (props.clearances) the same style, amber, prefixed "≈".
- Reference: That Open `LengthMeasurement` look (line + end markers + label).

## 7. Walk = click-to-move third person (not WASD)
Keyboard walk is unusable for judges. Do it like Matterport / Google Maps "click floor to go":
- Avatar: simple capsule (r 0.25 m, h 1.7 m), Gigi amber, with a small ring + 4 arrow chevrons on the floor around its feet.
- Click on the floor (raycast against IfcSlab/IfcSpace floor or plane y=floor) inside the room polygon → avatar tweens there (1.2 m/s). Clicking an arrow chevron moves 1 m that way.
- Camera follows behind/above (offset 3 m back, 2.2 m up), still bounded per item 2. Section box stays on.
- Stays inside the room box; clicks outside are ignored with a small toast "Stay inside this room".
- Exit Walk button in the same small pill as the other controls.

## 8. Layer Guide affects 3D
- visibleLayers prop: Architecture = walls/slabs/doors/windows/stairs; Sanitary = IfcSanitaryTerminal/IfcFlow* plumbing; HVAC = IfcDuct*/IfcAirTerminal; Electrical = IfcLightFixture/IfcCable*/IfcElectric*; Dimension Chains = item 6 lines. OFF → hide those categories.

## 9. Room Interior with no room selected
- FZK etc: clicking "Room Interior 3D" with no question does nothing. Show a compact room list (from IfcSpace, English names, area) to pick; first pick → item 1.

## 10. Rendering
- Light: HemisphereLight(0xffffff, 0xd8d2c4, 0.9) + one DirectionalLight with soft shadows only in room mode.
- Edges: EdgesGeometry thin dark lines (opacity .35) on walls/slabs → reads like an architectural model.
- Background Gigi off-white #f5f3ee, floor of cut room light warm grey.
- Selected fixtures: amber outline (OutlinePass or emissive), not colour swap.

## Test matrix (screenshots for each, both building + room + plan)
Tallinn (esplanades), fzk (ac20_arc), duplex, digital_hub, fantasy_office, hitos (Norwegian names — Claude added translations in roomNames.ts), molio, resbim-388, 1810 S Park, clinic (plumbing only), Swiss (PlanRooms3D extrusion).
Also test at narrow window (780 px wide): currently the 3D canvas becomes a 190-px-wide portrait strip. In 3D mode let the canvas take the centre+left columns (collapse the left sidebar) when width < 1100 px.

## References used
- Section box = 6 clipping planes around the selection; only what's inside stays visible (PlanRadar BIM viewer, BIMcollab).
- That Open Components: Clipper + ClipStyler (styled cut edges/fill), Views/floor plans (clip + top-down camera), OrthoPerspectiveCamera (orbit / first-person / plan modes).
- three.js examples: webgl_clipping, webgl_clipping_stencil (caps).
- xeokit SectionPlanesPlugin / StoreyViewsPlugin.

## API reference to READ FIRST (MIT, OpenAEC-Foundation, written for @thatopen/components 3.3; we have 3.6)
docs/refs/thatopen-skills/
- thatopen-impl-clipping-plans → item 1 (section box via Clipper / raw THREE.Plane), item 3 (Views = floor plan per storey), ClipStyler for cut edges/fill
- thatopen-impl-navigation → item 2/3/7 (OrthoPerspectiveCamera Orbit/Plan/FirstPerson, fit(), camera-controls limits)
- thatopen-impl-measurements → item 6 (dimension lines)
- thatopen-impl-highlighting → item 10 (selected fixtures outline)
- thatopen-impl-viewer → world/renderer setup
Use the built-in components instead of hand-rolling where they fit. Check names against the installed 3.6 types (node_modules/@thatopen/components) — the docs say 3.3.
