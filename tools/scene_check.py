"""Write scene samples + top-view overlays for manual checking (handoff 42 deliverables 1-3).
python tools/scene_check.py <ifc_dir> [out_dir=eval/scenes]"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import scene_ifc as S
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon

D = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/work/junction-dataset/data/ifc_models")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "eval", "scenes")
os.makedirs(OUT, exist_ok=True)
PL = "bsc-duplex_duplex-plumbing-20121113.ifc"; AR = "bsc-duplex_duplex-a-20110907.ifc"
JOBS = [("duplex_bathroom1", dict(room="Bathroom 1")), ("duplex_bathroom2", dict(room="Bathroom 2")),
        ("duplex_level1", dict(storey="Level 1")), ("fzk_erdgeschoss", dict(storey="Erdgeschoss", fzk=True))]
COL = {"chair": "#dddddd", "table": "#cccccc", "desk": "#cccccc", "unnamed_symbol": "#eeeeee", "toilet": "tab:blue", "sink": "tab:cyan", "shower": "tab:purple", "bathtub": "tab:pink", "vanity": "tab:olive"}

def draw(sc, png, title):
    fig, ax = plt.subplots(figsize=(9, 9))
    for r in sc["rooms"]:
        if r["polygon"]:
            ax.add_patch(Polygon(r["polygon"], closed=True, fc="#f3efe2", ec="#b9a97a", lw=0.8))
            lp = r["label_point"]; ax.text(lp[0], lp[2], f"{r.get('number') or ''}\n{r['name']}", ha="center", va="center", fontsize=6)
    for w in sc["walls"]:
        ax.add_patch(Polygon(w["footprint"], closed=True, fc="#444", ec="#222", lw=0.3, alpha=0.85))
    for s in sc["systems"]:
        (x0, _, z0), (x1, _, z1) = s["points"]; ax.plot([x0, x1], [z0, z1], color="tab:green", lw=0.8, alpha=0.7)
    for o in sc["openings"]:
        x, _, z = o["position"]; r = math.radians(o["rotation_deg"] or 0); dx, dz = math.cos(r), -math.sin(r)
        if o["position"] is None: continue
        hw = (o["width_m"] or 0.8) / 2; c = "tab:red" if o["kind"] == "door" else "tab:orange"
        ax.plot([x - dx * hw, x + dx * hw], [z - dz * hw, z + dz * hw], color=c, lw=3)
    for o in sc["objects"]:
        if not o.get("footprint"): continue
        x, _, z = o["position"]; r = math.radians(o["rotation_deg"] or 0); ux, uz = math.cos(r), -math.sin(r)
        fx, fz = o.get("front_vector") or (math.sin(r), math.cos(r)); w, d = o["footprint"]["width_m"] / 2, o["footprint"]["depth_m"] / 2
        P = [(x + sx * w * ux + sy * d * fx, z + sx * w * uz + sy * d * fz) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ax.add_patch(Polygon(P, closed=True, fc=COL.get(o["category"], "gray"), ec="k", lw=0.5, alpha=0.8))
        ax.text(x, z, o["category"][:6], fontsize=5, ha="center")
    ax.set_aspect("equal"); ax.autoscale(); ax.invert_yaxis()          # Z = -plan_up: invert so plan-up is up
    ax.set_title(title + "\nX right, plan-up = -Z (axis inverted so the plan reads as drawn); grid 1 m", fontsize=8)
    ax.xaxis.set_major_locator(plt.MultipleLocator(1)); ax.yaxis.set_major_locator(plt.MultipleLocator(1)); ax.grid(lw=0.2)
    ax.tick_params(labelsize=5); fig.savefig(png, dpi=130, bbox_inches="tight"); plt.close(fig)

PDFS = [("school_pdf_L00", "eval/sheets/uk_dfe_sen-dfe-xx-00-d-x-0201-special_school_plan_level_00-a-c01_p001.pdf")]
from engine import scene_pdf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for name, rel in PDFS:
    sc = scene_pdf.scene(os.path.join(ROOT, rel), 1, rel_path=rel)
    json.dump(sc, open(os.path.join(OUT, name + ".json"), "w"), ensure_ascii=False, indent=1)
    draw(sc, os.path.join(OUT, name + ".png"), name)
    print(name, sc["quality"], {k: len(sc[k]) for k in ("rooms", "walls", "openings")}, sc["warnings"][:2])
from engine import scene_scan
for name, rel in [("school_scan_illustrative", "eval/scans_synth/school_L00_scan.jpg")]:
    sc = scene_scan.scene(os.path.join(ROOT, rel), 1, rel_path=rel)
    json.dump(sc, open(os.path.join(OUT, name + ".json"), "w"), ensure_ascii=False, indent=1)
    draw(sc, os.path.join(OUT, name + ".png"), name + " (units: 0-1000 of the image, not calibrated)")
    print(name, sc["quality"], {k: len(sc[k]) for k in ("rooms", "walls", "openings", "objects")})
if os.environ.get("PDF_ONLY"): sys.exit()

for name, kw in JOBS:
    fzk = kw.pop("fzk", False)
    if fzk:
        f = "kit-fzk-haus_ac20-fzk-haus.ifc"; sc = S.scene(os.path.join(D, f), rel_path="data/ifc_models/" + f, **kw)
    else:
        sc = S.scene(os.path.join(D, PL), space_model=os.path.join(D, AR), rel_path="data/ifc_models/" + PL,
                     rel_space_model="data/ifc_models/" + AR, **kw)
    if "error" in sc: print(name, sc); continue
    json.dump(sc, open(os.path.join(OUT, name + ".json"), "w"), ensure_ascii=False, indent=1)
    draw(sc, os.path.join(OUT, name + ".png"), name)
    print(name, {k: len(sc[k]) for k in ("storeys", "rooms", "walls", "openings", "objects", "systems")}, sc["warnings"][:3])
