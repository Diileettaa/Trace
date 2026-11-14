# 39 — 3D room views are broken because the code assumes Z-up. The scene is Y-up.

Measured in the running app (Duplex, debug hook `window.__traceRooms` added in IfcViewer.tsx):
```
Bedroom 2  size [3.71, 2.58, 6.25]   min [-1.6, 2.1, -1.5]     <- height 2.58 is on Y
Hallway    size [1.97, 2.88, 5.30]
Foyer      size [2.18, 2.58, 9.31]   min [-5.8, -1.0, -12.2]
```
That Open fragments load IFC into three.js **Y-up** world coordinates. The 36 commits use Z as vertical, so:
- FZK room "Besprechungsraum I": camera looks UP at a slab from below; after Fit only a thin sliver is left
- Duplex room "Bedroom 2": grey translucent mess, no cutaway, no floor dimension lines visible
- whole-building framing is small/odd (initial setLookAt puts height on Z)

## Fix (one commit per bullet, then screenshot FZK + Duplex + Tallinn room view and send them)
Replace every "Z is up" assumption with Y-up. Horizontal plane = X/Z, floor = box.min.y.
- `sectionBoxForRoom`: footprint on x/z (dims.L -> x, dims.B -> z), vertical min.y-0.05 .. min.y+2.0. Delete the "IFC uses Z as up" comment
- clipping planes: generic, OK once the box is right
- room camera (`setLookAt` ~L895): target.y = bounds.min.y + 0.8; offset horizontally in x/z (azimuth 35°), height in **+y**
- initial model framing (~L563) and `fit` (~L1025/1039): height on +y; plan view = camera straight above on +y looking down; fill ~80% of the viewport (`controls.fitToBox(box, true, {paddingTop..})` from camera-controls is fine)
- storey elevation fallback (storeyManager.ts L94: `storeyBox.min.z`) -> min.y; room->storey match (`centerZ`) -> center.y
- clearance/dimension lines (~L944-970): floor = room.box.min.y + 0.025; the "-1..1" NDC filters use .z of a projected vector — keep those, they are screen space
- walk: remove `camera.up.set(0,0,1)`; avatar/ring/chevrons stand on y; click-to-move plane = `new THREE.Plane(new THREE.Vector3(0,1,0), -(room.box.min.y + .02))`; follow camera offset +2 on y; yaw rotates around y
- placements (makePlaceholder, wall/ceiling mount, rotate 90°) same: vertical = y
- room picker and room card: show `roomEnglish(name)` (import from ../roomNames) — FZK shows German "Besprechungsraum", "Technikraum"

Acceptance (I will check each):
1. FZK, Duplex, Tallinn: pick a room → see it from above at ~45°, walls cut at 2 m, floor visible, nothing outside the room
2. Floor plan (LEVEL menu storey) → straight down, only that storey, chips at room centres
3. Whole building fills most of the frame on FZK, Duplex, Hitos, Clinic
4. Walk: click the floor → avatar walks there, camera behind it, cannot leave the room
Keep `window.__traceRooms` until I have checked, then remove it. Do not deploy.
