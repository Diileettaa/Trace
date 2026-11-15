# 47 — 2.5D look: draw it like Gigi's isometric vector drawings (Diletta, 05:45). Time box 60 min. Do not deploy.

Reference (copy the visual language, not the hard-coded geometry):
`design/gigi/src/components/Detailed3DViewer.tsx` (+ `LargeExecutionPlan.tsx`). Diletta's two reference screenshots:
- Floor view: dark #202427 background with a faint grid, floor slab as a thin box, walls as translucent dark
  panels with light outlines, windows as blue-grey glass panels, selected room amber (fill #E9B949 ~0.55 + stroke #E9B949),
  chip "R 2.08 · Click to inspect interior 3D →", dimension text "38.40 m Wing Length", "21.60 m Depth · H 3.10 m".
- Room view: same style, bigger; fixtures drawn as simple vector icons (toilet bowl, 2× sink on a vanity, door leaf with
  amber knob, window with mullion, grab bars), label chips WC-208.1 (amber = verified), WC-208.2 (RED = issue),
  WC-208.3 (!), a red dashed clearance box with "450 mm · Unverified".

## Build `IsoSceneSvg` (new component, Codex owns it) — SVG, not WebGL
Input: the same `/api/geometry/scene` JSON (Y-up, metres; backend already fixed heights and gives ONE storey for a plan).
1. Projection: iso 30°: `X = (x - z)·cos30·s`, `Y = (x + z)·sin30·s - y·s` (x/z = plan, y = height). Fit `s` to the viewBox (≈ 80 % of it).
2. Draw order (painter's): slab → floor room fills → walls/openings sorted by depth (x + z of centre, far first) → objects → labels.
3. Slab: room union bbox as a 0.2 m box, stroke #A9AFB0 (0.55), fill #202427.
4. Walls: each wall footprint extruded to `height_m` (null → 3.0 m, marked assumed). Faces fill #2A2F33 opacity 0.85,
   edges stroke #F7F6F2 width 1, opacity 0.6. In "floor" view cut walls at 1.2 m so rooms stay readable.
5. Openings: windows = panel fill #3B4A5A stroke #A9AFB0 with a centre mullion; doors = panel fill #2B3A4D, amber knob dot.
6. Rooms: floor polygon fill #2E3338; selected room (or the answer's room) amber; hover shows chip with name (roomEnglish) + area.
7. Objects by kind: toilet, sink/washbasin, shower, bathtub, kitchen, generic → small vector icons in the same style
   (white #F8FAFC bowls, #A9AFB0 outlines). Unnamed symbols → a small grey square + "symbol" tooltip.
8. Answer elements: amber outline + chip with the item label; status colours as in the 2D plan
   (amber = checked, red = issue, grey = not checked). Clearance from `/api/rv/ifc/clearances` (IFC) as a red dashed box + "≈ 450 mm".
9. Dimensions: overall length/depth of the storey and of the selected room under the drawing (mono 12px #A9AFB0), "H x.xx m" when known.
10. Interaction: hover highlight; click a room → room view (crop + scale to that room, show its objects and labels);
    "← Floor" back. Mouse wheel zoom + drag pan on the SVG (viewBox), Reset. No camera, no WebGL, no walking.

Use it for both tabs: "2.5D Building" = all storeys stacked with an explode gap of 1 m (only for IFC-only projects),
"2.5D Floor" = the current sheet's storey. Remove the three.js GeometrySceneViewer from the workspace once this works.
Test: Tallinn level 04 plan, Duplex, FZK, Swiss floor, one CubiCasa scan. Send screenshots of floor + one room.

## ADD (research, 05:55): don't hand-roll the projection math if you are short on time
- `@elchininet/isometric` (MIT, TypeScript): isometric projections drawn as SVG — IsometricCanvas, rectangles/paths in plan
  coordinates, depth ordering. Good fit for walls (vertical rectangles), slabs (top rectangles), room polygons (paths).
- Or keep three.js but render with an OrthographicCamera at the true isometric angle + EdgesGeometry lines and flat
  materials (no lights): same look, reuses your loader. three-edge-projection (three-mesh-bvh) gives real hidden-line vector output if needed.
- Fixture icons: draw 6 tiny SVG symbols (toilet, sink, shower, bath, stove, door leaf) once and place them by `objects[].kind`.
Walls for plain PDF drawings are being completed on the engine side (doc 48, Xinran).
