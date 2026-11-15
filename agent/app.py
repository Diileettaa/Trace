"""HTTP API for the web app.

POST /ask      {question, path?, role?} -> {answer_text, evidence, tool_calls}
POST /upload   ?filename=x.pdf, raw file bytes as body -> {path, kind, pages}
GET  /drawing  ?path=...&page=1         -> PNG of that drawing page (bbox pixel space)
GET  /questions?source=...&limit=...    -> sample questions from questions.jsonl, for the demo picker
GET  /inventory?path=...&page=1         -> every element on a drawing, numbered per category (module 1)
GET  /plan/rooms?path=...&page=1        -> room outlines with bbox, polygon, status and media count
GET  /collab?space_id=...               -> room status + message board (modules 3 & 4)
POST /collab/status  {space_id, status, author?}
POST /collab/message {space_id, text, author?, role?, notify?}
POST /collab/media   ?space_id=&author=&role=&note=&filename= -> record {id, space_id, author, role, note, file, kind, created_at}
GET  /collab/media   ?space_id=                               -> list of media records (newest first)
GET  /collab/media/file ?id=                                  -> raw media file
POST /files          ?author=&role=&title=&tags=&filename=    -> record {id, title, filename, author, role, tags, size, kind, created_at}
GET  /files          ?tag=&q=                                 -> list of files matching tag / title / filename (newest first)
GET  /files/file     ?id=                                     -> raw file download with Content-Type and filename
DELETE /files        ?id=&author=                             -> delete file (only author permitted)
GET  /scene          ?model=&since_version=                   -> whole scene or {"changed": false, "version": n}
POST /scene/placement {model?, instanceId, catalogId, ...}    -> add or update placement (version +1)
DELETE /scene/placement ?model=&instanceId=&author=           -> delete placement (version +1)
GET  /scene/history  ?model=&limit=50                         -> recent placement history
"""
from __future__ import annotations

import re

import json

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import (
    agent,
    collab,
    config,
    drawings,
    files,
    media,
    plan_rooms,
    recommend,
    render as render_service,
    room_contents,
    scene,
    uploads,
    vision,
    workflow,
)

app = FastAPI(title="Trace API", docs_url="/swagger", redoc_url=None)  # /docs is the project document store
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class AskIn(BaseModel):
    question: str
    path: str | None = None
    role: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "data_dir": str(config.DATA_DIR), "data_found": config.DATA_DIR.exists(),
            "gemini_key": bool(config.GEMINI_API_KEY), "nemotron": bool(config.NVIDIA_API_KEY and config.NEMOTRON_MODEL)}


@app.post("/ask")
def ask(body: AskIn, fresh: bool = False):
    if body.path:
        try:
            drawings.resolve(re.sub(r"#p\d+$", "", body.path))
        except drawings.DrawingError as e:
            raise HTTPException(404, str(e))
    import hashlib

    key = hashlib.sha256(json.dumps([body.question.strip(), body.path, body.role, config.GEMINI_MODEL]).encode()).hexdigest()[:32]
    f = config.CACHE_DIR / "answers" / f"{key}.json"
    if f.exists() and not fresh:
        out = json.loads(f.read_text(encoding="utf-8"))
        out["from_cache"] = True
        return out
    try:
        out = agent.ask(body.question, body.path, body.role)
        if not any(e.get("tool") == "number_check" for e in out["evidence"]):
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
        return out
    except Exception as e:  # surface the real error to the UI instead of a bare 500
        import traceback

        traceback.print_exc()
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@app.post("/upload")
async def upload(
    request: Request,
    filename: str | None = None,
    file: UploadFile | None = File(None),
):
    """Upload your own drawing (PDF/PNG/JPG/DXF/IFC, max 50 MB). Accepts raw file bytes or multipart."""
    size = int(request.headers.get("content-length") or 0)
    if size > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 50 MB)")

    data = None
    fname = ""
    if file is not None:
        data = await file.read()
        fname = file.filename or filename or ""
    else:
        ctype = request.headers.get("content-type", "")
        if "multipart/form-data" in ctype:
            try:
                form = await request.form()
                for v in form.values():
                    if isinstance(v, UploadFile):
                        data = await v.read()
                        fname = v.filename or filename or ""
                        break
            except Exception:
                pass
        if data is None:
            data = await request.body()
            fname = filename or request.headers.get("x-filename") or ""
            if not fname:
                import re

                cd = request.headers.get("content-disposition", "")
                m = re.search(r'filename=["\']?([^"\';]+)["\']?', cd)
                if m:
                    fname = m.group(1)

    if not fname:
        raise HTTPException(400, "filename is required (via ?filename=, multipart upload, or X-Filename header)")

    if len(data) > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, "file too large (max 50 MB)")

    try:
        return uploads.save(fname, data)
    except uploads.UploadError as e:
        raise HTTPException(400, str(e))


@app.get("/drawing")
def drawing(path: str, page: int = 1):
    try:
        return FileResponse(drawings.page_png(path, page), media_type="image/png")
    except drawings.DrawingError as e:
        raise HTTPException(404, str(e))


@app.get("/file")
def raw_file(path: str):
    """Raw dataset file, e.g. an .ifc model for the browser 3D viewer."""
    try:
        return FileResponse(drawings.resolve(path))
    except drawings.DrawingError as e:
        raise HTTPException(404, str(e))


@app.get("/questions")
def questions(source: str | None = None, limit: int = 50):
    f = config.DATA_DIR / "questions.jsonl"
    if not f.exists():
        raise HTTPException(404, "questions.jsonl not found in DATA_DIR")
    out = []
    match_str = f"/{source}/" if source else None
    with f.open(encoding="utf-8") as fh:
        for line in fh:
            if match_str and match_str not in line:
                continue
            try:
                q = json.loads(line)
                out.append(q)
                if len(out) >= limit:
                    break
            except Exception:
                pass
    return out

@app.get("/models")
def models():
    """Gemini model names this key can call with generateContent (to pick GEMINI_MODEL)."""
    from google import genai

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    out = []
    for m in client.models.list():
        actions = getattr(m, "supported_actions", None) or []
        if "gemini" in m.name and (not actions or "generateContent" in actions):
            out.append(m.name)
    return {"current": config.GEMINI_MODEL, "models": out}


@app.get("/inventory")
def inventory(path: str, page: int = 1):
    try:
        return vision.scan_drawing_inventory(path, page)
    except drawings.DrawingError as e:
        raise HTTPException(404, str(e))


@app.get("/plan/rooms")
def plan_rooms_route(path: str, page: int = 1):
    try:
        return plan_rooms.get_plan_rooms(path, page=page)
    except drawings.DrawingError as e:
        raise HTTPException(404, str(e))


class StatusIn(BaseModel):
    space_id: str
    status: str
    author: str = ""


class MessageIn(BaseModel):
    space_id: str
    text: str
    author: str = ""
    role: str = ""
    notify: list[str] = []
    attachment: str = ""

class PersonIn(BaseModel):
    name: str
    trade: str
    email: str
    phone: str

class DirectIn(BaseModel):
    recipient: str
    text: str = ""
    author: str = ""
    attachment: str = ""

class BookingIn(BaseModel):
    space_id: str
    trade: str
    person: str
    start: float
    end: float
    what: str


@app.get("/collab")
def collab_get(space_id: str | None = None, viewer: str | None = None):
    return {"statuses": collab.STATUSES, **collab.for_space(space_id, viewer)}

@app.get("/collab/people")
def collab_people():
    return collab.people()

@app.post("/collab/people")
def collab_register(body: PersonIn):
    try: return collab.register_person(body.name, body.trade, body.email, body.phone)
    except ValueError as exc: raise HTTPException(400, str(exc))

@app.get("/collab/direct")
def collab_direct_get(person: str, with_person: str):
    data = collab.for_space(None, person)
    return [m for m in data["messages"] if m.get("thread") == "direct" and {m.get("author"), m.get("recipient")} == {person, with_person}]

@app.post("/collab/direct")
def collab_direct(body: DirectIn):
    try:
        collab.post_direct(body.recipient, body.text, body.author, body.attachment)
        return collab.for_space(None, body.author)
    except ValueError as exc: raise HTTPException(400, str(exc))

@app.get("/collab/bookings")
def collab_bookings():
    return collab.for_space(None)["bookings"]

@app.post("/collab/bookings")
def collab_booking(body: BookingIn):
    try:
        collab.book(body.space_id, body.trade, body.person, body.start, body.end, body.what)
        return collab.for_space(None)
    except ValueError as exc: raise HTTPException(400, str(exc))


@app.post("/collab/status")
def collab_status(body: StatusIn):
    try:
        return collab.set_status(body.space_id, body.status, body.author)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/collab/message")
def collab_message(body: MessageIn):
    try:
        collab.post_message(body.space_id, body.text, body.author, body.role, body.notify, body.attachment)
        return collab.for_space(None, body.author)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.post("/collab/media")
async def collab_media_post(
    request: Request,
    space_id: str = "",
    item_id: str = "",
    status: str = "",
    author: str = "",
    role: str = "",
    note: str = "",
    filename: str = "",
):
    size = int(request.headers.get("content-length") or 0)
    if size > media.MAX_MEDIA_BYTES:
        raise HTTPException(413, f"file too large (max {media.MAX_MEDIA_BYTES // (1024 * 1024)} MB)")

    ctype = request.headers.get("content-type", "")
    data = None
    fname = filename or ""
    item_id_val = item_id or ""
    status_val = status or ""
    if "multipart/form-data" in ctype:
        try:
            form = await request.form()
            if "item_id" in form and not item_id_val:
                item_id_val = str(form.get("item_id") or "")
            if "status" in form and not status_val:
                status_val = str(form.get("status") or "")
            for v in form.values():
                if isinstance(v, UploadFile):
                    data = await v.read()
                    fname = fname or v.filename or ""
                    break
        except Exception:
            pass

    if data is None:
        data = await request.body()

    if not fname:
        fname = request.headers.get("x-filename") or ""
        if not fname:
            import re

            cd = request.headers.get("content-disposition", "")
            m = re.search(r'filename=["\']?([^"\';]+)["\']?', cd)
            if m:
                fname = m.group(1)

    if not fname:
        raise HTTPException(400, "filename is required")

    if not data:
        raise HTTPException(400, "empty file")

    if len(data) > media.MAX_MEDIA_BYTES:
        raise HTTPException(413, f"file too large (max {media.MAX_MEDIA_BYTES // (1024 * 1024)} MB)")

    try:
        return media.save_media(
            filename=fname,
            data=data,
            space_id=space_id,
            item_id=item_id_val,
            author=author,
            role=role,
            note=note,
            status=status_val,
        )
    except media.MediaError as e:
        raise HTTPException(400, str(e))


class VerifyItemIn(BaseModel):
    path: str = ""
    item_id: str
    space_id: str = ""
    status: str
    note: str = ""
    author: str = ""


@app.post("/verify/item")
def verify_item_post(body: VerifyItemIn):
    try:
        return media.update_item_status(
            item_id=body.item_id,
            status=body.status,
            path=body.path,
            space_id=body.space_id,
            note=body.note,
            author=body.author,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/verify/status")
def verify_status_get(path: str = "", ids: str = ""):
    try:
        id_list = [x.strip() for x in ids.split(",") if x.strip()] if ids else []
        return media.get_verify_status(path=path, ids=id_list)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/element/info")
def element_info_get(path: str, id: str):
    from . import element_info

    try:
        return element_info.get_element_info(path=path, element_id=id)
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/collab/media")
def collab_media_list(space_id: str | None = None):
    return media.list_media(space_id=space_id)


@app.get("/collab/media/file")
def collab_media_file(id: str = ""):
    if not id:
        raise HTTPException(400, "id is required")
    try:
        file_path = media.resolve_file(id)
    except media.MediaSecurityError as e:
        raise HTTPException(400, str(e))
    except media.MediaNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    import mimetypes

    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".pdf": "application/pdf",
    }
    ctype = (
        mime_map.get(file_path.suffix.lower())
        or mimetypes.guess_type(file_path.name)[0]
        or "application/octet-stream"
    )
    return FileResponse(file_path, media_type=ctype)


@app.post("/files")
async def files_post(
    request: Request,
    author: str = "",
    role: str = "",
    title: str = "",
    tags: str | None = None,
    filename: str = "",
):
    size = int(request.headers.get("content-length") or 0)
    if size > files.MAX_FILE_BYTES:
        raise HTTPException(413, f"file too large (max {files.MAX_FILE_BYTES // (1024 * 1024)} MB)")

    ctype = request.headers.get("content-type", "")
    data = None
    fname = filename or ""
    if "multipart/form-data" in ctype:
        try:
            form = await request.form()
            for v in form.values():
                if isinstance(v, UploadFile):
                    data = await v.read()
                    fname = fname or v.filename or ""
                    break
        except Exception:
            pass

    if data is None:
        data = await request.body()

    if not fname:
        fname = request.headers.get("x-filename") or ""
        if not fname:
            import re

            cd = request.headers.get("content-disposition", "")
            m = re.search(r'filename=["\']?([^"\';]+)["\']?', cd)
            if m:
                fname = m.group(1)

    if not fname:
        raise HTTPException(400, "filename is required")

    if not data:
        raise HTTPException(400, "empty file")

    if len(data) > files.MAX_FILE_BYTES:
        raise HTTPException(413, f"file too large (max {files.MAX_FILE_BYTES // (1024 * 1024)} MB)")

    raw_tags = request.query_params.getlist("tags")
    parsed_tags = files.parse_tags(raw_tags if len(raw_tags) > 1 else (tags or ""))

    try:
        return files.save_file(
            filename=fname,
            data=data,
            author=author,
            role=role,
            title=title,
            tags=parsed_tags,
        )
    except files.FileError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/files")
def files_list(tag: str | None = None, q: str | None = None):
    return files.list_files(tag=tag, q=q)


@app.get("/files/file")
def files_download(id: str = ""):
    if not id:
        raise HTTPException(400, "id is required")
    try:
        file_path, rec = files.resolve_file(id)
    except files.FileSecurityError as e:
        raise HTTPException(400, str(e))
    except (files.FileItemNotFoundError, files.FileNotFoundError) as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    ctype = files.MIME_MAP.get(file_path.suffix.lower()) or "application/octet-stream"
    fname = rec.get("filename") if rec and rec.get("filename") else file_path.name
    return FileResponse(file_path, media_type=ctype, filename=fname)


@app.delete("/files")
def files_delete(id: str = "", author: str = ""):
    if not id:
        raise HTTPException(400, "id is required")
    try:
        deleted = files.delete_file(id=id, author=author)
        return {"ok": True, "id": id, "deleted": deleted}
    except files.FilePermissionError as e:
        raise HTTPException(403, str(e))
    except (files.FileItemNotFoundError, files.FileNotFoundError) as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/scene")
def scene_get(model: str = "", since_version: int | None = None):
    if not model:
        raise HTTPException(400, "model is required")
    try:
        return scene.get_scene(model=model, since_version=since_version)
    except scene.SceneValidationError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/scene/placement")
def scene_placement_post(body: dict, model: str = ""):
    target_model = model or body.get("model") or ""
    if not target_model:
        raise HTTPException(400, "model is required (via ?model= or body.model)")
    try:
        placement, ver = scene.save_placement(model=target_model, data=body)
        return {**placement, "version": ver}
    except scene.SceneValidationError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/scene/placement")
def scene_placement_delete(model: str = "", instanceId: str = "", author: str = ""):
    if not model:
        raise HTTPException(400, "model is required")
    if not instanceId:
        raise HTTPException(400, "instanceId is required")
    try:
        deleted, ver = scene.delete_placement(model=model, instance_id=instanceId, author=author)
        return {"ok": True, "instanceId": instanceId, "version": ver, "deleted": deleted}
    except scene.SceneValidationError as e:
        raise HTTPException(400, str(e))
    except scene.SceneNotFoundError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/scene/history")
def scene_history_get(model: str = "", limit: int = 50):
    if not model:
        raise HTTPException(400, "model is required")
    try:
        return scene.get_history(model=model, limit=limit)
    except scene.SceneValidationError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


class RenderIn(BaseModel):
    image_base64: str
    room_name: str
    products: list[dict]
    style: str


@app.post("/render")
def render(body: RenderIn):
    try:
        output = render_service.render_mood_image(
            body.image_base64, body.room_name, body.products, body.style,
            cache_dir=config.CACHE_DIR / "renders",
        )
    except render_service.RenderModelNotConfigured as exc:
        raise HTTPException(400, str(exc))
    except render_service.RenderInputError as exc:
        raise HTTPException(400, str(exc))
    except render_service.RenderGenerationError as exc:
        raise HTTPException(502, str(exc))
    return FileResponse(output, media_type="image/png", filename="trace-mood-render.png")


# Project document store + e-mail intake (Xinran, agent/docs_api.py): /docs, /docs/file, /docs/versions, ...
@app.api_route("/docs", methods=["GET", "POST"], include_in_schema=False)
@app.api_route("/docs/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
async def docs_store(request: Request, rest: str = ""):
    from fastapi import Response
    from starlette.concurrency import run_in_threadpool

    from . import docs_api

    body = await request.body()
    path = "/docs" + (f"/{rest}" if rest else "")
    status, headers, data = await run_in_threadpool(docs_api.handle, request.method, path, request.url.query,
                                                    dict(request.headers), body)
    return Response(content=data, status_code=status, headers=headers)


@app.get("/catalog")
def drawing_catalog(kind: str | None = None):
    """Dataset drawings and models as a folder tree: source -> group (building / model / project) -> files.
    Featured demo files first. kind=3d (IFC models) or kind=plan (PDF/PNG/JPG plans) filters the files."""
    from . import catalog

    return catalog.catalog(kind)


@app.get("/sheetset")
def sheetset_catalogue(project: str):
    """Every drawing of a project grouped by discipline and level (engine.sheetset, rules only)."""
    from . import sheetset_api
    return sheetset_api.catalogue(project)


@app.get("/sheetset/pick")
def sheetset_pick(project: str, q: str, current: str | None = None):
    """Best sheet(s) for a question, with the reasons."""
    from . import sheetset_api
    return sheetset_api.pick(project, q, current)


@app.get("/catalog/projects")
def catalog_projects(q: str = "", offset: int = 0, limit: int = 20):
    """Search and paginate across all project cards (featured, auto, and uploaded)."""
    from . import catalog

    return catalog.search_projects(q=q, offset=offset, limit=limit)



# ---------------------------------------------------------------------
# Workflow, Ordering, Change Orders, Budget, and Project Settings (Modules 3, 7, 9)
# ---------------------------------------------------------------------

class OrderIn(BaseModel):
    model: str
    items: list[str] | str
    supplier: str
    delivery_date: str
    deliver_to_space_id: str
    notify_trades: list[str] = []
    author: str = ""


class OrderStatusIn(BaseModel):
    id: str
    status: str


class NotificationReadIn(BaseModel):
    id: str


class ChangeOrderIn(BaseModel):
    space_id: str
    trade: str
    author: str
    description: str
    amount_eur: float


class ChangeOrderDecideIn(BaseModel):
    id: str
    decision: str  # approve | reject
    by: str = ""
    role: str = ""


class ProjectSettingsIn(BaseModel):
    owner_view: str = "everything"
    building_type: str = "historic"
    status_note: str = ""


@app.get("/workflow/check")
def workflow_check(space_id: str, trade: str, start: str = "", end: str = ""):
    try:
        return workflow.check_workflow(space_id=space_id, trade=trade, start=start, end=end)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/workflow/blockers")
def workflow_blockers():
    try:
        return {"blockers": workflow.get_all_blockers()}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/orders")
def orders_post(body: OrderIn):
    try:
        return workflow.create_order(
            model=body.model,
            items=body.items,
            supplier=body.supplier,
            delivery_date=body.delivery_date,
            deliver_to_space_id=body.deliver_to_space_id,
            notify_trades=body.notify_trades,
            author=body.author,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/orders")
def orders_get(model: str = "", status: str = ""):
    return {"orders": workflow.list_orders(model=model, status=status)}


@app.post("/orders/status")
def orders_status_post(body: OrderStatusIn):
    try:
        return workflow.update_order_status(order_id=body.id, new_status=body.status)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/calendar")
def calendar_get(from_date: str = Query("", alias="from"), to_date: str = Query("", alias="to")):
    return {"events": workflow.get_calendar(from_date=from_date, to_date=to_date)}


@app.get("/notifications")
def notifications_get(trade: str = ""):
    return {"notifications": workflow.list_notifications(trade=trade)}


@app.post("/notifications/read")
def notifications_read_post(body: NotificationReadIn):
    found = workflow.mark_notification_read(body.id)
    if not found:
        raise HTTPException(404, f"Notification '{body.id}' not found")
    return {"ok": True, "id": body.id}


@app.post("/change-orders")
def change_orders_post(body: ChangeOrderIn):
    try:
        return workflow.create_change_order(
            space_id=body.space_id,
            trade=body.trade,
            author=body.author,
            description=body.description,
            amount_eur=body.amount_eur,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/change-orders/decide")
def change_orders_decide_post(body: ChangeOrderDecideIn):
    try:
        return workflow.decide_change_order(
            order_id=body.id,
            decision=body.decision,
            by=body.by,
            role=body.role,
        )
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/change-orders")
def change_orders_get(space_id: str = "", status: str = ""):
    return {"change_orders": workflow.list_change_orders(space_id=space_id, status=status)}


@app.get("/budget")
def budget_get():
    return workflow.get_budget()


@app.get("/project/settings")
def project_settings_get():
    return workflow.get_project_settings()


@app.post("/project/settings")
def project_settings_post(body: ProjectSettingsIn):
    try:
        return workflow.update_project_settings(body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


# ---------------------------------------------------------------------
# Recommendations (Modules 7, 9)
# ---------------------------------------------------------------------

@app.get("/recommend/products")
def recommend_products_get(
    space_id: str = "",
    need: str = "",
    model: str = "",
    budget_eur: float | None = None,
):
    try:
        return recommend.recommend_products(
            need=need,
            space_id=space_id,
            model=model,
            budget_eur=budget_eur,
        )
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/recommend/people")
def recommend_people_get(trade: str = "", space_id: str = ""):
    try:
        return {"people": recommend.recommend_people(trade=trade, space_id=space_id)}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/room/contents")
def room_contents_route(path: str, room: str):
    try:
        return room_contents.get_room_contents(path=path, room=room)
    except drawings.DrawingError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(400, str(e))





# Xinran's interactive review (engine/review.py via agent/docs_api.py), by dataset/upload path:
# POST /rv/ask {path, question} -> answer_id, items with ids, alternatives; POST /rv/review, /rv/calibrate, /rv/measure; GET /rv/answer?id=
@app.api_route("/rv/{rest:path}", methods=["GET", "POST"], include_in_schema=False)
async def review_api(request: Request, rest: str = ""):
    from fastapi import Response
    from starlette.concurrency import run_in_threadpool

    from . import docs_api

    body = await request.body()
    status, headers, data = await run_in_threadpool(docs_api.handle, request.method, "/" + rest, request.url.query,
                                                    dict(request.headers), body)
    return Response(content=data, status_code=status, headers=headers)


@app.get("/room/walls")
def room_walls_get(path: str = "", space_id: str = ""):
    """Walls bounding one IfcSpace (Xinran's engine.ifc.room_walls; sizes from the model's quantities, never estimated)."""
    if not path or not space_id:
        raise HTTPException(400, "path and space_id are required")
    from engine import ifc as engine_ifc

    full = drawings.resolve(path)
    ifc_file = full if full.suffix.lower() == ".ifc" else full.with_suffix(".ifc")
    if not ifc_file.is_file():
        cand = config.DATA_DIR / "data" / "ifc_models" / f"{full.stem.split('_plan-')[0]}.ifc"
        ifc_file = cand if cand.is_file() else ifc_file
    if not ifc_file.is_file():
        return {"walls": [], "room": None, "method": "none", "warnings": ["no IFC model for this drawing"]}
    try:
        return engine_ifc.room_walls(str(ifc_file), space_id)
    except Exception as e:  # never fail the page because one model is odd
        return {"walls": [], "room": None, "method": "error", "warnings": [f"{type(e).__name__}: {e}"]}
