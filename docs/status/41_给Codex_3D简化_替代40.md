# 41 — 3D: SIMPLIFY. Replaces 40. Time box: 40 minutes. Do not deploy.

Decision (Diletta, 00:05): after a full day the fly-in / walk / cutaway features are still not reliable.
Show only what the model already contains. No extra effects. Stop working on 40.

## KEEP (must work on every IFC project)
1. **Whole building**: model loaded, IfcSite terrain hidden, `fitToBox(building, padding ~8%)` → fills ~75% of the frame. Orbit + zoom, camera can't go below ground or far away. Fit / Reset buttons.
2. **Floor from above**: LEVEL menu storey → clip at elevation + 1.2 m (Y-up), camera straight down, fit to that storey. This is the "plan view".
3. **Room = floor view zoomed to the room**: room picker / clicking a room chip / "Show in 3D" from an answer → open that room's storey in floor view (item 2) and `fitToBox(room box, padding 30%)` from straight above. Room outline in amber. NO section box, NO 45° fly, NO walk.
4. **Answer elements**: elements from the answer drawn amber on top of the model (whole building or floor view). Selecting one = zoom to it from above in its floor view.
5. **Layer toggles** keep working.
6. **No floating 3D text**. Room names only as small chips in floor view (max 12).
7. **Swiss / 2D-only projects**: keep the existing extruded plan (PlanRooms3D) and label it "3D generated from the drawing".

## REMOVE / HIDE (delete the buttons, keep code dead if faster)
- "Room Interior 3D" tab → rename the tabs to: `2D Plan · 3D Building · 3D Floor`
- Walk inside, avatar, click-to-move
- Explode / Peel
- section-box cutaway, clearance / dimension lines on the floor
- `window.__traceRooms`

## Acceptance (I check FZK, Duplex, Tallinn, Hitos, Clinic, Swiss)
Building fills the frame · LEVEL → floor from above · room picker → that room from above, outlined · Reset returns to the whole building with NOTHING clipped · no flicker, no white walls filling the screen.
One commit per item. Tell me when done (screenshots optional, I will check myself).
