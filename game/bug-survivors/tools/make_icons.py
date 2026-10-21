"""Favicon, touch icon and the share image, made from the default art and a gameplay screenshot.

    uv run --with pillow --with fonttools --with brotli python game/bug-survivors/tools/make_icons.py [docs/gameplay.png]

docs/gameplay.png is a raw frame from scripts/screenshot.py (2400x1260). It gets the game's name in the bottom right corner, in the
guide's pixel font, and is written twice: docs/header.png for the README, and og.png (1200x630, the shape link previews use) for the site.
"""
import io
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

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

ROOT = KIT.parent.parent
FONT = OUT / "fonts/press-start-2p-400.woff2"  # the guide's font; OFL, see fonts/README.md
TITLE, SIZE, MARGIN, PAD, BORDER = "BUG SURVIVORS", 64, 72, 36, 8  # Press Start 2P is drawn on an 8px grid: keep the size a multiple of 8
GOLD, ORANGE, BLACK = (249, 189, 43), (245, 78, 0), (0, 0, 0)  # the game's own banner: black box, orange frame, gold text
ABOVE_HUD = 80  # keeps the box clear of the boss bar along the bottom edge


def titled(shot: Image.Image) -> Image.Image:
    from fontTools.ttLib import TTFont  # Pillow cannot read woff2: convert in memory

    ttf = io.BytesIO()
    f = TTFont(str(FONT))
    f.flavor = None
    f.save(ttf)
    ttf.seek(0)
    font = ImageFont.truetype(ttf, SIZE)
    draw = ImageDraw.Draw(shot)
    draw.fontmode = "1"  # no anti-aliasing: it is a pixel font
    w = round(draw.textlength(TITLE, font=font))
    box_w, box_h = w + 2 * (PAD + BORDER), SIZE + 2 * (PAD + BORDER)
    x1, y1 = shot.width - MARGIN, shot.height - MARGIN - ABOVE_HUD
    x0, y0 = x1 - box_w, y1 - box_h
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), fill=ORANGE)
    draw.rectangle((x0 + BORDER, y0 + BORDER, x1 - 1 - BORDER, y1 - 1 - BORDER), fill=BLACK)
    draw.text((x0 + BORDER + PAD, y0 + BORDER + PAD), TITLE, font=font, fill=GOLD)
    return shot


shot_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/gameplay.png"
shot = titled(Image.open(shot_path).convert("RGB"))
shot.save(ROOT / "docs/header.png", optimize=True)
ratio = 1200 / 630
w, h = shot.size
cw, ch = (w, round(w / ratio)) if w / h < ratio else (round(h * ratio), h)
left, top = (w - cw) // 2, (h - ch) // 2
shot.crop((left, top, left + cw, top + ch)).resize((1200, 630), Image.LANCZOS).save(OUT / "og.png", optimize=True)
print("icons and share image written")
