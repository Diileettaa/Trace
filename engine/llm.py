"""Minimal Gemini client for the engine (standard library only). Key from GEMINI_API_KEY, model from GEMINI_MODEL
(default gemini-3.6-flash). The key is never logged or returned; errors are reported without it.
text_json(prompt) and vision_json(prompt, image_bytes, temperature) return parsed JSON dicts."""
import os, json, time, base64, urllib.request

def available():
    return bool(os.environ.get("GEMINI_API_KEY")) and os.environ.get("JUNCTION_NO_VLM") != "1"

def _call(parts, temperature=0.0, timeout=180):
    key = os.environ.get("GEMINI_API_KEY")
    if not key: raise RuntimeError("GEMINI_API_KEY not set")
    model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    body = {"contents": [{"parts": parts}], "generationConfig": {"responseMimeType": "application/json", "temperature": temperature}}
    err = ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r: res = json.loads(r.read())
            txt = res["candidates"][0]["content"]["parts"][0]["text"]
            out = json.loads(txt[txt.find("{"): txt.rfind("}") + 1]) if "{" in txt else {}
            out = out[0] if isinstance(out, list) and out else out
            if isinstance(out, dict): out["_tokens"] = (res.get("usageMetadata") or {}).get("totalTokenCount", 0)
            return out if isinstance(out, dict) else {}
        except Exception as e:
            err = (type(e).__name__ + ": " + str(e)[:160]).replace(key, "***"); time.sleep(2 * (attempt + 1))
    raise RuntimeError("vision/LLM call failed: " + err)

def text_json(prompt):
    return _call([{"text": prompt}])

def vision_json(prompt, image_bytes, temperature=0.0):
    mime = "image/png" if image_bytes[:8] == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return _call([{"text": prompt}, {"inline_data": {"mime_type": mime, "data": base64.b64encode(image_bytes).decode()}}], temperature)

def prepare_image(path, max_side=2400):
    """Image file -> bytes for the model: downscaled to max_side and JPEG-encoded when Pillow is available."""
    try:
        import io
        from PIL import Image
        Image.MAX_IMAGE_PIXELS = None
        im = Image.open(path); im.thumbnail((max_side, max_side))
        buf = io.BytesIO(); im.convert("RGB").save(buf, "JPEG", quality=88); return buf.getvalue()
    except ImportError:
        return open(path, "rb").read()
