# Demo script — Trace, "Make Blueprints Talk" (2 minutes)

The flow the judges see, in order. Each step names the file / route it uses, so the demo runs on real outputs.

| t | screen | say | uses |
|---|---|---|---|
| 0:00 | Upload a building: the school PDF set + one scan + the Duplex IFC | "A renovation team gets a mix: CAD PDFs, old scans, sometimes a model. Trace reads all of them." | `/docs` upload, `/project/sheets` (sheet classification by title block) |
| 0:15 | Ask: "How many doors are on level 00?" → **answer + boxes + confidence chip** | "Every number comes with its evidence on the drawing and an honest confidence. On held-out plans, 'high' is right 96 % of the time." | `/ask` → `confidence`, `items` boxes |
| 0:35 | Ask on the **scan**: "What is the kitchen floor area?" → "not printed: calibrate". Click the two ends of the scale bar → area appears | "We never invent a number. If the drawing doesn't say it, Trace asks you for one click and then measures." | `/calibrate`, `/measure`, `scan_scale` |
| 0:55 | Review panel: remove a wrong door box, add a missed one → value updates, chip turns **high / reviewed** | "A person stays in charge; corrections are logged and become training data." | `/review`, `corrections.jsonl` |
| 1:10 | Click "2.5D" → school sheet as an extruded plan: walls, doors, **WCs placed from the CAD blocks** | "The same reading becomes a measured 2.5D scene. These WCs are the drawing's own CAD symbols, found and placed exactly." | `/scene?path=…pdf` (`scene_pdf`, `symbols`) |
| 1:25 | Switch to the Duplex IFC bathroom: click the WC → distances to each wall with N/E/S/W | "For renovation, distances matter: this WC is 0.71 m from the side wall and touches the back wall, measured from the model geometry, not estimated." | `/scene?…ifc&room=Bathroom 1`, `/ifc/clearances` |
| 1:40 | Toggle the water layer (pipe runs) | "Pipe runs come from the plumbing model, in the same coordinates." | `systems` in the scene |
| 1:50 | Close: numbers slide | "99.97 % on Swiss plans, 99.3 % on IFC, 86 % on CubiCasa scans; own models trained on Verda; Gemini only where vision is needed; zero-API mode keeps drawings on site." | `eval/methods_for_submission.md` |

## Backup answers for judges' questions

- **What if a drawing has no scale?**
  - The answer stays null with a warning.
  - The scene is marked `illustrative`.
  - One calibration click makes it `measured`.
- **What fails today?**
  - Washbasins drawn as plain rectangles on vector sheets.
  - Rooms under 6 m² can merge on scans.
  - The door count on faint scans is flagged `uncertain`, with alternatives offered.
  - All of this is in `methods_for_submission.md` §4.
- **Why trust the confidence?** It is measured on held-out data: high 95.7 %, medium 81.1 %, low 56.7 % correct.
- **Data privacy?**
  - Zero-API mode (80.8 % on CubiCasa) runs fully on CPU with our own models.
  - The Stoa samples were never used for tuning.
