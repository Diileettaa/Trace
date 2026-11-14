"""Production entry point: one process serves the built web app at / and the API at /api.

Locally the Vite dev server does the same split (web/vite.config.ts proxies /api to :8000).
Run: uvicorn agent.serve:app --host 0.0.0.0 --port 8080   (after `cd web && npm run build`)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .app import app as api

DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

app = FastAPI(title="Trace")
app.mount("/api", api)

if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and DIST in f.parents and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
