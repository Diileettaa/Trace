"""HTTP API for the web app.

POST /ask      {question, path?, role?} -> {answer_text, evidence, tool_calls}
GET  /drawing  ?path=...&page=1         -> PNG of that drawing page (bbox pixel space)
GET  /questions?source=...&limit=...    -> sample questions from questions.jsonl, for the demo picker
GET  /inventory?path=...&page=1         -> every element on a drawing, numbered per category (module 1)
GET  /collab?space_id=...               -> room status + message board (modules 3 & 4)
POST /collab/status  {space_id, status, author?}
POST /collab/message {space_id, text, author?, role?, notify?}
"""
from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import agent, collab, config, drawings, render as render_service, vision

app = FastAPI(title="Trace API")
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
            drawings.resolve(body.path)
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
    with f.open(encoding="utf-8") as fh:
        for line in fh:
            q = json.loads(line)
            if source and f"/{source}/" not in q["path"]:
                continue
            out.append(q)
            if len(out) >= limit:
                break
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
    try: return collab.book(body.space_id, body.trade, body.person, body.start, body.end, body.what)
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
        return collab.post_message(body.space_id, body.text, body.author, body.role, body.notify, body.attachment)
    except ValueError as e:
        raise HTTPException(400, str(e))


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
