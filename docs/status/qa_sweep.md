# QA sweep — 15 projects × 5 questions, 90 asks (local, 2026-11-15 00:05)

Questions: doors / toilets / total area of all rooms / windows / which rooms. Path = the project's plan and model.
Class: OK · ZERO (answer 0) · COULDNOT ("could not get a reliable answer") · HTTP error (none).

| question | IFC OK / 0 / could-not | PDF OK / 0 / could-not |
|---|---|---|
| doors | 7 / 2 / 1 | 4 / 3 / 1 |
| toilets | 1 / 5 / 4 | 4 / 3 / 1 |
| total area of all rooms | **1 / 1 / 8** | 2 / 0 / 6 |
| windows | 7 / 2 / 1 | 5 / 2 / 1 |
| which rooms | 7 / 1 / 2 | 3 / 0 / 5 |

## Problems, worst first (owner)
1. **Total room area on IFC = `engine:query:unsupported` on 8/10 models** (Tallinn, Digital Hub, Duplex, Fantasy Office, Hitos, Molio, resbim, 1810). The engine only does "storey total room area"; a whole-model question should sum IfcSpace net areas over all storeys (or answer per storey). — Xinran
2. **Toilets on IFC = 0 or unsupported** on 9/10 architecture models. Architecture models often model WCs as IfcBuildingElementProxy / IfcFurnishingElement / IfcFlowTerminal named "WC", "Toilet", "Closet", "Klosett", "Unitas". Count those by name/type (method e.g. `ifc:count_toilet_by_name`), say how they were found; 0 only if nothing matches. — Xinran
3. **1810 S Park IFC: every question `unsupported:.i…`** (engine cannot open it? path has spaces and '&'). — Xinran
4. **resbim-388: 0 doors, 0 windows, 0 rooms** — check whether the model really has none (then the project should be hidden) or the reader misses IFC4 types. — Xinran
5. **Tallinn plan PDF "How many toilets" → "0 toilets" from a visual scan.** The 4th-floor plan has WCs; this should come from the IFC (sanitary/proxies, see 2) or say it cannot. — Xinran
6. **Drawing-set PDFs (CTR, Sports Complex, Vacation Rental, 1810): doors/windows 0 or could-not.** Partly because the sweep asked the default sheet (site plan / structural); the workspace now opens an architectural plan and `sheetset.pick` chooses the sheet. Re-test with picked sheets after `pypdfium2` is installed locally. — Claude
7. "Which rooms" on Swiss / sets → could-not (`unrecognised_question`). Room list from `plan_rooms` exists for Swiss; route "which rooms / list rooms" there. — Claude (adapter) / Xinran (engine intent)

Raw rows are in the Trace tab's localStorage `trace.qa.rows` (Chrome, localhost:5173).
