"""Favicon, touch icon and social-share image, made from the default art and a gameplay screenshot.

    uv run --with pillow python game/bug-survivors/tools/make_icons.py docs/header.png

The screenshot (2400x1260) comes from scripts/screenshot.py. It is cropped to the 1.91:1 shape link previews use and
written as og.png; docs/header.png is the same picture at full size for the README.
"""
import sys
from pathlib import Path
from PIL import Image

KIT = Path(__file__).resolve().parent.parent
OUT = KIT / "public"
BG = (29, 31, 39, 255)  # #1d1f27, the guide's dark colour

hog = Image.open(OUT / "assets/default/player.png").convert("RGBA").crop((0, 0, 24, 24))  # first frame of the sheet

def icon(size: int, pad: int, opaque: bool) -> Image.Image:
    inner = size - 2 * pad
    sprite = hog.resize((inner, inner), Image.NEAREST)
    canvas = Image.new("RGBA", (size, size), BG if opaque else (0, 0, 0, 0))
    canvas.alpha_composite(sprite, (pad, pad))
    return canvas

icon(48, 0, False).save(OUT / "favicon.png", optimize=True)
icon(180, 18, True).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)

if len(sys.argv) > 1:
    shot = Image.open(sys.argv[1]).convert("RGB")
    w, h = shot.size
    ratio = 1200 / 630
    cw, ch = (w, round(w / ratio)) if w / h < ratio else (round(h * ratio), h)
    left, top = (w - cw) // 2, (h - ch) // 2
    shot.crop((left, top, left + cw, top + ch)).resize((1200, 630), Image.LANCZOS).save(OUT / "og.png", optimize=True)
print("icons written to", OUT)
