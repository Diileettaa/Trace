"""Production entry point: one process serves the built web app at / and the API at /api.

Locally the Vite dev server does the same split (web/vite.config.ts proxies /api to :8000).
Run: uvicorn agent.serve:app --host 0.0.0.0 --port 8080   (after `cd web && npm run build`)
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .app import app as api

DIST = Path(__file__).resolve().parent.parent / "web" / "dist"
logger = logging.getLogger("trace.serve")

# Default demo project when running in demo seed mode
if os.environ.get("SEED_DEMO") == "1":
    os.environ.setdefault("DOCS_PROJECT", "Demo project")

app = FastAPI(title="Trace")
app.mount("/api", api)


@app.on_event("startup")
def _prewarm_ifc():
    if os.environ.get("PREWARM_IFC", "1") == "1":
        import threading

        from .room_contents import prewarm_ifc_indexes

        threading.Thread(target=prewarm_ifc_indexes, daemon=True).start()

        def _sheetsets():
            try:
                from . import catalog, sheetset_api
                for p in catalog.tree().get("projects", []):
                    sheetset_api.catalogue(p["id"])
            except Exception as e:  # never block startup
                print("sheetset prewarm failed:", e)

        threading.Thread(target=_sheetsets, daemon=True).start()


@app.on_event("startup")
def _seed_on_startup():
    if os.environ.get("SEED_DEMO") == "1":
        try:
            from scripts.seed_demo import seed_demo_data

            logger.info("SEED_DEMO=1 detected: running seed_demo on startup...")
            res = seed_demo_data(reset=False, seed_docs=True)
            logger.info("SEED_DEMO=1 startup seed completed: %s", res)
        except Exception as e:
            logger.warning("SEED_DEMO=1 startup seed failed (continuing startup): %s", e, exc_info=True)


if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and DIST in f.parents and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
