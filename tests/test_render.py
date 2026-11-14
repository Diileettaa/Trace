import base64
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from agent import render


class FakeModels:
    def __init__(self, png: bytes):
        self.png = png
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        part = SimpleNamespace(inline_data=SimpleNamespace(data=self.png, mime_type="image/png"))
        return SimpleNamespace(parts=[part])


class FakeClient:
    def __init__(self, png: bytes):
        self.models = FakeModels(png)


def test_missing_image_model_fails_before_client_creation(monkeypatch, tmp_path):
    monkeypatch.delenv("GEMINI_IMAGE_MODEL", raising=False)
    with pytest.raises(render.RenderModelNotConfigured, match="GEMINI_IMAGE_MODEL"):
        render.render_mood_image("aGVsbG8=", "Room", [], "Warm", cache_dir=tmp_path, client=object())
    assert list(tmp_path.iterdir()) == []


def test_mood_image_uses_fake_client_and_caches_png(monkeypatch, tmp_path):
    monkeypatch.setenv("GEMINI_IMAGE_MODEL", "configured-image-model")
    png = b"\x89PNG\r\n\x1a\nrendered-image"
    client = FakeClient(png)
    image = "data:image/png;base64," + base64.b64encode(b"source-image").decode("ascii")
    products = [{"name": "Oak table", "mount": "floor", "width_mm": 1400}]

    first = render.render_mood_image(image, "Living room", products, "Warm minimal", client=client, cache_dir=tmp_path)
    second = render.render_mood_image(image, "Living room", products, "Warm minimal", client=client, cache_dir=tmp_path)

    assert first == second and first.read_bytes() == png
    assert len(client.models.calls) == 1
    request = client.models.calls[0]
    assert request["model"] == "configured-image-model"
    prompt = request["contents"][1]
    assert "Preserve the room's existing geometry" in prompt
    assert "Do not add, remove, or invent furniture" in prompt
    assert "Oak table" in prompt
    assert request["config"].response_modalities == ["IMAGE"]


def test_render_endpoint_returns_clear_400_when_model_missing(monkeypatch):
    monkeypatch.delenv("GEMINI_IMAGE_MODEL", raising=False)
    from agent.app import RenderIn, render as render_endpoint

    request = RenderIn(image_base64="data:image/png;base64,aGVsbG8=",
                       room_name="Living room", products=[], style="Warm minimal")
    with pytest.raises(HTTPException) as exc_info:
        render_endpoint(request)
    assert exc_info.value.status_code == 400
    assert "GEMINI_IMAGE_MODEL is not configured" in exc_info.value.detail
