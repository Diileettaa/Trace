#!/usr/bin/env bash
# Fetch model weights that are not in git. RT-DETR-L (CubiCasa5k, public weights from
# github.com/OldDeLorean/rtdetr-floorplan-detector; that repo states no license, so we do not redistribute it).
# Without it the engine still works: windows fall back to the round-1 model (test 45.6% instead of 53.8%).
set -e; cd "$(dirname "$0")/../models"
[ -s rtdetr_l_cubi.pt ] || wget -O rtdetr_l_cubi.pt \
  "https://github.com/OldDeLorean/rtdetr-floorplan-detector/raw/main/weights/rtdetr_l_autoresearch_60ep.pt"
ls -lh rtdetr_l_cubi.pt
