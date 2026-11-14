# 3D stability smoke checklist

Run this list before accepting a 3D viewer change. The expected initial state is
whole building, all available trades visible, no explosion or peel, light
background, and a fitted camera.

| Model | Load + fit | Floor + room | Walk in/out | Explode + tour + reset | Switch away/back | Console |
| --- | --- | --- | --- | --- | --- | --- |
| `bsc-esplanades_1807-ep-ar-v18.ifc` | pass | pass | pass | pass | pass | no errors |
| `ac20_arc.ifc` | pass | pass | pass | pass | pass | no errors |
| `bsc-clinic_clinic-plumbing.ifc` | pass | n/a (no spaces) | n/a | pass | pass | no errors |

For each model, use the fixed **+**, **−**, **Fit**, and **Reset** camera
controls; select a floor and room where available; enter and leave Walk; then
explode, start/stop Tour, Reset, switch project, and return. Record failures
with the browser console message and model path.
