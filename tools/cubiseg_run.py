"""W4: run the official CubiCasa5K multi-task model (walls, rooms, icons) on floor-plan images -> one JSON per image.
Runs on any machine with PyTorch (CPU is fine). Output sidecar `<image>.cubiseg.json`, read by engine.scene_scan.

Setup (once, Windows cmd, inside the Downloads folder):
  git clone https://github.com/CubiCasa/CubiCasa5k.git
  pip install torch torchvision opencv-python scipy scikit-image shapely gdown
  gdown 1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK -O CubiCasa5k\\model_best_val_loss_var.pkl
Run (inside junction-stoa-engine):
  python tools\\cubiseg_run.py --repo ..\\CubiCasa5k --in eval\\cubiseg_in
  -> eval\\cubiseg_in\\*.cubiseg.json   (send these back / they sync automatically)

Coordinates in the JSON: 0-1000 of the original image (x right, y down), like the rest of the engine."""
import sys, os, json, time, argparse, glob

ROOM = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room", "Bed Room", "Bath", "Entry", "Railing", "Storage",
        "Garage", "Undefined"]
ICON = ["No Icon", "Window", "Door", "Closet", "Electrical Applience", "Toilet", "Sink", "Sauna Bench", "Fire Place",
        "Bathtub", "Chimney"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=os.path.join("..", "CubiCasa5k"))
    ap.add_argument("--weights", default=None, help="default: <repo>/model_best_val_loss_var.pkl")
    ap.add_argument("--in", dest="inp", default=os.path.join("eval", "cubiseg_in"))
    ap.add_argument("--max-side", type=int, default=1200, help="images are resized so the long side is at most this (model trained on ~1000 px)")
    ap.add_argument("--tta", action="store_true", help="average 4 rotations like the paper (4x slower)")
    a = ap.parse_args()
    sys.path.insert(0, os.path.abspath(a.repo))
    import numpy as np, cv2, torch, torch.nn.functional as F
    from floortrans.models.hg_furukawa_original import hg_furukawa_original
    from floortrans.post_prosessing import split_prediction, get_polygons
    torch.set_grad_enabled(False)
    model = hg_furukawa_original(n_classes=51)       # no init_weights(): its pose-net file is not needed, we load the full checkpoint
    n_classes, split = 44, [21, 12, 11]
    model.conv4_ = torch.nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
    model.upsample = torch.nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
    ck = torch.load(a.weights or os.path.join(a.repo, "model_best_val_loss_var.pkl"), map_location="cpu", weights_only=False)
    model.load_state_dict(ck["model_state"]); model.eval()
    files = sorted(f for e in ("*.png", "*.jpg", "*.jpeg") for f in glob.glob(os.path.join(a.inp, e)))
    print(f"{len(files)} images")
    for fp in files:
        out = fp + ".cubiseg.json"
        if os.path.exists(out): continue
        t = time.time()
        im = cv2.imread(fp, cv2.IMREAD_COLOR)
        if im is None: print("skip", fp); continue
        H0, W0 = im.shape[:2]; s = min(1.0, a.max_side / max(H0, W0))
        im = cv2.resize(im, (int(W0 * s), int(H0 * s)), interpolation=cv2.INTER_AREA) if s < 1 else im
        im = cv2.cvtColor(im, cv2.COLOR_BGR2RGB); H, W = im.shape[:2]
        x = torch.from_numpy((2 * (im.astype(np.float32) / 255.0) - 1).transpose(2, 0, 1))[None]
        Hp, Wp = -(-H // 64) * 64, -(-W // 64) * 64          # pad (white) so every hourglass level divides evenly
        x = F.pad(x, (0, Wp - W, 0, Hp - H), value=1.0)
        run = lambda t: F.interpolate(model(t), size=t.shape[2:], mode="bilinear", align_corners=True)
        pred = run(x)
        if a.tta:   # junction heatmaps are orientation-specific: average only the room / icon channels over rotations
            seg = [pred[:, 21:]]
            for k in (1, 2, 3):
                xr = torch.rot90(x, k, (2, 3))
                p = run(xr)
                seg.append(torch.rot90(p, -k, (2, 3))[:, 21:])
            pred = torch.cat([pred[:, :21], torch.mean(torch.cat(seg), 0, True)], 1)
        pred = pred[:, :, :H, :W]
        heat, rooms, icons = split_prediction(pred, (H, W), split)
        polys, types, room_polys, room_types = get_polygons((heat, rooms, icons), 0.2, [1, 2])
        n = lambda px, py: [round(float(px) * 1000 / W, 1), round(float(py) * 1000 / H, 1)]
        walls, icon_out, openings = [], [], []
        for P, T in zip(polys, types):
            pts = [n(p[0], p[1]) for p in np.asarray(P).reshape(-1, 2)]
            if T["type"] == "wall": walls.append({"polygon": pts})
            else:
                c = int(T["class"]); name = ICON[c] if 0 <= c < len(ICON) else str(c)
                (openings if name in ("Window", "Door") else icon_out).append({"class": name, "polygon": pts})
        room_out = []
        for P, T in zip(room_polys, room_types):
            c = int(T["class"])
            for part in (list(P.geoms) if hasattr(P, "geoms") else [P]):      # a room class can come back as a MultiPolygon
                if not hasattr(part, "exterior") or part.is_empty: continue
                xs, ys = part.exterior.coords.xy
                room_out.append({"class": ROOM[c] if 0 <= c < len(ROOM) else str(c), "polygon": [n(px, py) for px, py in zip(xs, ys)]})
        json.dump({"image": os.path.basename(fp), "image_size": [W0, H0], "model_input_size": [W, H],
                   "model": "CubiCasa5K hg_furukawa_original (official weights)", "tta": a.tta,
                   "walls": walls, "openings": openings, "icons": icon_out, "rooms": room_out}, open(out, "w"))
        print(f"{os.path.basename(fp)}: {len(walls)} walls, {len(openings)} openings, {len(icon_out)} icons, "
              f"{len(room_out)} rooms ({time.time() - t:.1f}s)")

if __name__ == "__main__":
    main()
