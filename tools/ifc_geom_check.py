"""Self-check for engine/ifc_geom: spaces / storeys / room_of / clearances on local IFC models.
python tools/ifc_geom_check.py <ifc_dir> [> eval/ifc_geom_check.md]"""
import sys, os, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine import ifc_geom as G, ifc

D = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/work/junction-dataset/data/ifc_models/")
MODELS = [("kit-fzk-haus_ac20-fzk-haus.ifc", None), ("bsc-duplex_duplex-a-20110907.ifc", None),
          ("bimspeed-warmond_ar.ifc", None),
          ("bsc-duplex_duplex-plumbing-20121113.ifc", "bsc-duplex_duplex-a-20110907.ifc")]
print("# IFC geometry self-check (engine/ifc_geom.py)\n")
print("Frame: web-ifc world (X, Y up, Z = -y_ifc), metres. Polygon = [X, Z] on the floor plane.\n")
for f, arch in MODELS:
    p = os.path.join(D, f)
    if not os.path.exists(p): print(f"## {f}\nmissing\n"); continue
    st = G.storeys(p); sp = G.spaces(p)
    inside = sum(1 for x in sp if x["polygon"] and x["label_point"] and G._inside((x["label_point"][0], x["label_point"][2]), x["polygon"]))
    withp = sum(1 for x in sp if x["polygon"])
    print(f"## {f}\n")
    print(f"- storeys: " + ", ".join(f"{x['name']} @ {x['elevation_m']} m (h {x['height_m']}, {x['space_count']} rooms)" for x in st))
    print(f"- spaces: {len(sp)}; outline {dict(collections.Counter(x['outline'] for x in sp))}")
    print(f"- label_point inside polygon: {inside}/{withp}")
    M = ifc.load(p)
    fx = [e for e in M["elements"] if e["cls"] in ("IFCFLOWTERMINAL", "IFCSANITARYTERMINAL")]
    if fx:
        A = os.path.join(D, arch) if arch else None
        rows = []
        for e in fx[:16]:
            r = G.room_of(p, [e["guid"]], space_model=A)[e["guid"]]
            c = G.clearances(p, e["guid"], space_model=A)
            rows.append((str(e["name"])[:40], r.get("space_name"), r.get("method"), c["exact"],
                         ", ".join(f"{s['compass']} {s['distance_m']} ({s['dir']})" for s in c["sides"][:4])))
        print(f"\nfixtures ({len(fx)}, first 16; rooms from {arch or 'same file'}; north: {G.north(p)[1]} in fixture model, {G.north(A or p)[1]} in room model):\n")
        print("| fixture | room | method | exact | nearest walls: compass m (local dir) |\n|---|---|---|---|---|")
        for r in rows: print("| " + " | ".join(str(x) for x in r) + " |")
    print()
print("""## Notes
- Distance 0.0 = the fixture's mesh touches the wall face (WC tank, shower tray, tub in an alcove). Cross-checked against
  the room outline: footprint-to-outline distance equals the minimum wall distance on every duplex fixture tested.
- Direction: `compass` N/E/S/W is the one common direction, from the model's TrueNorth when stated, else model +Y
  (project north = plan-up, flagged `north_basis: project_north`). `dir` front/back/left/right is the element's own
  local axes, reference only (Revit families usually face +Y, not guaranteed). The distance is the fact.
- Outlines are convex hulls in plan; an L-shaped wall body could read too close. `exact=False` whenever any geometry
  item was unsupported.
- Not checked here: Tallinn, Hitos (files not available to us). web-ifc COORDINATE_TO_ORIGIN shift is not applied.""")
