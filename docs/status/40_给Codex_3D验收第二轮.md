# 40 — 3D check after 39 (Claude checked Duplex + FZK at 00:00). Big step forward. Remaining:

PASS: Duplex "Living Room" = real dollhouse cutaway from above, furniture visible, NO flicker (still for 5 s).
PASS: FZK room picker in English ("Meeting room I"), camera above.

Fix, one commit each, do not deploy:
1. Whole building too small: FZK and Duplex fill ~20% of the frame. Use `controls.fitToBox(modelBounds, true, {paddingLeft/Right/Top/Bottom ≈ 8% of size})` after load and on Fit/Reset; target ~75% fill.
2. Room framing: FZK "Meeting room I" is too close and off-centre, neighbour rooms visible. Frame with `fitToBox(sectionBox, true, padding)` from 45°/azimuth 35°, room centred. Section box footprint = the IfcSpace box ONLY (+0.4 m), ignore roomDims if they are larger than the space box.
3. Walls go pale/ghost ~1 s after the fly-to in Duplex (first frame: solid grey walls, then washed out). Keep the solid look: walls opaque light grey with thin dark edges; only the roof/upper storeys disappear (they are clipped anyway).
4. Floor dimension lines: not visible in either room. Room width + depth must be drawn on the floor (Line2 + end ticks + chip "3.42 m") whenever a room is selected, even without a question. Clearance lines (amber, ≈) only when an answer selected an element.
5. After the answer "What is in the Bedroom 2?", Whole Building 3D shows only a brown box (only the highlighted elements). Whole building must always show the whole building; highlighted elements in amber on top.
6. Remove `window.__traceRooms` debug hook when 1–5 pass.

Send screenshots: FZK + Duplex + Tallinn — whole building, one room, one storey plan.
