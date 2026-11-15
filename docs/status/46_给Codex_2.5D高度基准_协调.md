# 46 — 2.5D: Tallinn walls float 14.3 m above the floors (fixed in backend) + coordination

Fixed by Claude in `agent/app.py` (`/geometry/scene` → `_one_height_datum`): Tallinn's IFC gives walls/openings at
absolute heights (site datum +14.30 m) but storeys/rooms relative (1.korrus = 0.0). Backend now shifts walls,
openings, objects and room label points by the median offset and adds a warning. No frontend change needed for that.
Tallinn really has 7 storeys (Vundament −1.2, 1.–5.korrus every 3.35 m, Katus +17.0).

Please (frontend only, do not deploy):
1. Re-check Tallinn after reload: walls must stand on their floor slabs; if vertical "spikes" above the roof remain, find which elements they are (id/name in the click details) and send them to me.
2. Walls render almost black. Use light warm grey walls (#d9d4c7) with thin dark edges, floor slabs lighter; amber only for answer elements.
3. Whole building must fill ~75% of the frame (fitToBox on the scene bounds).

Coordination rules (so we don't overwrite each other):
- Claude owns: `agent/*`, `web/vite.config.ts` proxy, `web/src/gigi/RealWorkspace.tsx` ask/sheet logic, `web/src/site/*`.
- Codex owns: `web/src/gigi/Real3D.tsx`, `web/src/components/GeometrySceneViewer*`, `web/src/viewer3d/*`.
- Do not add a second backend or proxy targets; everything goes through :8000 (`/api/geometry/scene`, `/api/rv/*`).
- Dev server is now on :5174 (your 623bafe) — keep it there.
