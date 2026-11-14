"""Generate 512x512 product preview images for all catalog items using Gemini image generation.

Outputs images to web/public/catalog/<id>.png.
Prompts are formed from item name, material, color, and dimensions:
- Pure white background (#ffffff)
- Front 3/4 perspective view
- Commercial product photography style
- Absolutely no text, watermarks, or logos

Skips existing files for idempotent runs.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG_PATH = _ROOT / "web" / "src" / "catalog.json"
DEFAULT_OUTPUT_DIR = _ROOT / "web" / "public" / "catalog"


def build_prompt(item: dict[str, Any]) -> str:
    name = item.get("name", "Furniture")
    mat = item.get("material", "wood")
    color = item.get("color_hex", "#9a6b43")
    w = item.get("width_mm", 1000)
    d = item.get("depth_mm", 600)
    h = item.get("height_mm", 750)

    return (
        f"Professional commercial studio product photography of {name}, "
        f"crafted from {mat}, finished in color hex {color}, dimensions {w}mm W x {d}mm D x {h}mm H. "
        "Isolated furniture product centered on a seamless clean pure white background (#ffffff), "
        "sharp focus, front three-quarter (3/4) perspective view, soft neutral studio lighting, "
        "photorealistic commercial catalog shot. "
        "Crucial requirements: absolutely no text, no letters, no words, no numbers, no labels, no watermark, no logos, no branding."
    )


def fallback_render(item: dict[str, Any], output_path: Path) -> None:
    """Generate a clean 512x512 stylized product silhouette as offline fallback."""
    im = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
    draw = ImageDraw.Draw(im)

    hex_color = item.get("color_hex", "#888888").lstrip("#")
    try:
        r, g, b = tuple(int(hex_color[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        r, g, b = (150, 150, 150)

    # Draw soft shadow
    draw.ellipse([110, 410, 402, 460], fill=(235, 235, 235, 200))
    draw.ellipse([140, 420, 372, 450], fill=(215, 215, 215, 220))

    # Draw stylized isometric product block
    fill_color = (r, g, b, 255)
    light_color = (min(255, int(r * 1.25)), min(255, int(g * 1.25)), min(255, int(b * 1.25)), 255)
    dark_color = (int(r * 0.75), int(g * 0.75), int(b * 0.75), 255)

    mount = item.get("mount", "floor")
    if mount == "ceiling":
        # Draw cord
        draw.line([(256, 40), (256, 180)], fill=(70, 70, 70, 255), width=3)
        # Shade
        draw.polygon([(256, 180), (370, 310), (142, 310)], fill=fill_color)
        draw.ellipse([142, 290, 370, 330], fill=dark_color)
    elif mount == "wall":
        # Wall mount plate & fixture
        draw.rounded_rectangle([150, 140, 362, 380], radius=16, fill=fill_color, outline=(200, 200, 200, 255), width=2)
        draw.rounded_rectangle([165, 155, 347, 365], radius=10, fill=light_color)
    else:
        # Front, top, side faces
        draw.polygon([(160, 240), (256, 180), (380, 220), (280, 280)], fill=light_color)
        draw.polygon([(160, 240), (280, 280), (280, 420), (160, 370)], fill=fill_color)
        draw.polygon([(280, 280), (380, 220), (380, 350), (280, 420)], fill=dark_color)

    im.convert("RGB").save(output_path, format="PNG")


def generate_images(
    catalog_path: Path = DEFAULT_CATALOG_PATH,
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    force: bool = False,
    delay: float = 0.5,
    model_name: str | None = None,
) -> dict[str, int]:
    items = json.loads(catalog_path.read_text(encoding="utf-8"))
    output_dir.mkdir(parents=True, exist_ok=True)

    model = model_name or os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
    print(f"Loaded {len(items)} catalog products from {catalog_path}")
    print(f"Output directory: {output_dir}")
    print(f"Using image generation model: {model}")

    client = None
    if os.getenv("GEMINI_API_KEY"):
        try:
            from google import genai

            client = genai.Client()
        except Exception as e:
            print(f"Notice: Failed to initialize Gemini client ({e}); will use fallback rendering.")

    total = len(items)
    generated = 0
    skipped = 0
    failed = 0

    for i, item in enumerate(items, 1):
        item_id = item["id"]
        out_path = output_dir / f"{item_id}.png"

        if out_path.is_file() and not force:
            print(f"[{i:02d}/{total:02d}] - SKIP: {item_id}.png already exists")
            skipped += 1
            continue

        prompt = build_prompt(item)
        saved = False

        if client is not None:
            try:
                from google.genai import types

                resp = client.models.generate_content(
                    model=model,
                    contents=[prompt],
                    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
                )
                raw_bytes = None
                for candidate in getattr(resp, "candidates", []) or []:
                    content = getattr(candidate, "content", None)
                    for part in getattr(content, "parts", []) or []:
                        inline = getattr(part, "inline_data", None)
                        if inline and getattr(inline, "data", None):
                            raw_bytes = inline.data
                            break
                    if raw_bytes:
                        break

                if raw_bytes:
                    im = Image.open(io.BytesIO(raw_bytes))
                    im_512 = im.resize((512, 512), Image.Resampling.LANCZOS)
                    im_512.convert("RGB").save(out_path, format="PNG")
                    print(f"[{i:02d}/{total:02d}] ✓ Generated: {item_id}.png ({im.format} -> 512x512 PNG)")
                    generated += 1
                    saved = True
                    time.sleep(delay)
                else:
                    print(f"[{i:02d}/{total:02d}] ! Warning: Model returned no image data for {item_id}")
            except Exception as e:
                print(f"[{i:02d}/{total:02d}] ! Error calling Gemini for {item_id}: {e}")

        if not saved:
            try:
                fallback_render(item, out_path)
                print(f"[{i:02d}/{total:02d}] ✓ Generated fallback preview: {item_id}.png")
                generated += 1
            except Exception as fe:
                print(f"[{i:02d}/{total:02d}] ✗ Failed fallback rendering for {item_id}: {fe}")
                failed += 1

    print("\nGeneration summary:")
    print(f"  Total items:     {total}")
    print(f"  Newly generated: {generated}")
    print(f"  Skipped:         {skipped}")
    print(f"  Failed:          {failed}")

    return {"total": total, "generated": generated, "skipped": skipped, "failed": failed}


def main():
    parser = argparse.ArgumentParser(description="Generate 512x512 product images for catalog items.")
    parser.add_argument("--catalog", default=str(DEFAULT_CATALOG_PATH), help="Path to catalog.json")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT_DIR), help="Output directory for PNG images")
    parser.add_argument("--force", action="store_true", help="Overwrite existing PNG files")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between API requests in seconds")
    parser.add_argument("--model", default=None, help="Gemini image model name")
    args = parser.parse_args()

    generate_images(
        catalog_path=Path(args.catalog),
        output_dir=Path(args.out),
        force=args.force,
        delay=args.delay,
        model_name=args.model,
    )


if __name__ == "__main__":
    main()
