#!/usr/bin/env python3
"""Render kit default sprites from text grids, recoloured with a theme palette.

A kit slot's default art is <kit>/sprites/<slot>.sprite when that file exists (see pixel.py; '@' legend
tokens take the theme's brand colours), else shared/sprites/<slot>.sprite (art every kit shares, like the PostHog
logo), else <kit>/art.py. An "optional" slot (the prospect's logo) may have no default at all.
Kits describe their older default art in <kit>/art.py as SPRITES = {slot_id: [frame_rows, ...]} (each
frame a list of equal-length strings) plus optional PROCEDURAL = {slot_id: fn(pal) -> [Image]}.
Letters map to fixed master-palette colours (LEGEND); the digits 1-5 are brand colours from the
theme, so fallback art still carries the prospect's colours.

    python3 sprites.py <kit_dir> <out_dir> [--theme theme.json] [--only id,id] [--preview sheet.png]
"""
import argparse
import importlib.util
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MASTER = json.load(open(os.path.join(HERE, "palette.json")))

LEGEND = {
    "k": "#000000", "g": "#7c7c7c", "l": "#bcbcbc", "w": "#fcfcfc",
    "b": "#503000", "o": "#ac7c00", "t": "#f0d0b0", "O": "#e45c10", "a": "#fca044",
    "r": "#a81000", "R": "#f83800", "m": "#a80020", "y": "#f8b800", "Y": "#f8d878",
    "n": "#0000bc", "B": "#0058f8", "c": "#3cbcfc", "C": "#a4e4fc",
    "d": "#007800", "G": "#00b800", "e": "#58d854", "E": "#b8f818",
    "p": "#940084", "P": "#d800cc", "v": "#9878f8", "V": "#6844fc", "i": "#f85898", "I": "#f878f8",
    "q": "#008888", "Q": "#00e8d8", "s": "#f87858",
}


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def dist(a, b):
    (r1, g1, b1), (r2, g2, b2) = rgb(a), rgb(b)
    rm = (r1 + r2) / 2
    return ((2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2) ** 0.5


def snap(h):
    return min(MASTER, key=lambda c: dist(h, c))


def lum(h):
    r, g, b = rgb(h)
    return 0.299 * r + 0.587 * g + 0.114 * b


def shade(h, f):
    """Snap a darker (f<1) or lighter (f>1: blend to white) version of h to the master palette."""
    r, g, b = rgb(h)
    if f < 1:
        r, g, b = r * f, g * f, b * f
    else:
        k = f - 1
        r, g, b = r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k
    c = "#%02x%02x%02x" % (int(r), int(g), int(b))
    out = snap(c)
    if out == snap(h):  # make sure the shade actually differs
        others = sorted(MASTER, key=lambda m: dist(c, m))
        out = next(m for m in others if (lum(m) < lum(h)) == (f < 1) and m != snap(h))
    return out


def brand(theme):
    p = theme.get("palette", {}) if theme else {}
    prim = snap(p.get("primary", "#f83800"))
    sec = snap(p.get("secondary", "#0000bc"))
    acc = snap(p.get("accent", "#f8b800"))
    return {"1": prim, "2": sec, "3": acc, "4": shade(prim, 0.55), "5": shade(prim, 1.45)}


def render(rows, pal):
    h, w = len(rows), len(rows[0])
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        if len(row) != w:
            raise SystemExit(f"row {y} is {len(row)} wide, expected {w}: {row!r}")
        for x, ch in enumerate(row):
            if ch in (".", " "):
                continue
            col = pal.get(ch) or LEGEND.get(ch)
            if not col:
                raise SystemExit(f"unknown colour letter {ch!r}")
            im.putpixel((x, y), rgb(col) + (255,))
    return im


def sheet(frames):
    w, h = frames[0].size
    out = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        out.paste(f, (i * w, 0))
    return out


def load_art(kit_dir):
    spec = importlib.util.spec_from_file_location("art", os.path.join(kit_dir, "art.py"))
    mod = importlib.util.module_from_spec(spec)
    sys.path.insert(0, HERE)
    spec.loader.exec_module(mod)
    return mod


def build(kit_dir, out_dir, theme=None, only=None):
    """Write <out_dir>/<slot>.png for every slot with default art. Returns {slot: path}."""
    art = load_art(kit_dir)
    slots = {s["id"]: s for s in json.load(open(os.path.join(kit_dir, "slots.json")))}
    pal = brand(theme)
    os.makedirs(out_dir, exist_ok=True)
    written = {}
    for sid, slot in slots.items():
        if only and sid not in only:
            continue
        sprite_file = os.path.join(kit_dir, "sprites", f"{sid}.sprite")
        if not os.path.exists(sprite_file):  # art every kit shares (the PostHog logo for the splash screen)
            sprite_file = os.path.join(HERE, "sprites", f"{sid}.sprite")
        if slot.get("optional") and not os.path.exists(sprite_file):
            continue  # an optional slot (the prospect's logo) has no default: the game does without it
        if os.path.exists(sprite_file):  # Claude-drawn art (CC0 base + edits) wins over art.py
            import pixel
            frames = pixel.to_images(pixel.load(sprite_file), pixel.brand_palette(theme))
        elif sid in getattr(art, "SPRITES", {}):
            frames = [render(f, pal) for f in art.SPRITES[sid]]
        elif sid in getattr(art, "PROCEDURAL", {}):
            frames = art.PROCEDURAL[sid](pal)
        else:
            raise SystemExit(f"slot {sid} has no default art")
        if len(frames) != slot["frames"] or frames[0].size != (slot["w"], slot["h"]):
            raise SystemExit(f"slot {sid}: art is {len(frames)}x{frames[0].size}, slots.json says "
                             f"{slot['frames']}x{(slot['w'], slot['h'])}")
        path = os.path.join(out_dir, f"{sid}.png")
        sheet(frames).save(path)
        written[sid] = path
    return written


def preview(paths, out, scale=4, bg=(40, 40, 60, 255)):
    ims = [Image.open(p) for p in paths.values()]
    W = max(i.width for i in ims) * scale + 8
    Ht = sum(i.height * scale + 8 for i in ims)
    sheet_im = Image.new("RGBA", (W, Ht), bg)
    y = 0
    for i in ims:
        sheet_im.alpha_composite(i.resize((i.width * scale, i.height * scale), Image.NEAREST), (4, y + 4))
        y += i.height * scale + 8
    sheet_im.save(out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("kit_dir")
    ap.add_argument("out_dir")
    ap.add_argument("--theme")
    ap.add_argument("--only")
    ap.add_argument("--preview")
    a = ap.parse_args()
    theme = json.load(open(a.theme)) if a.theme else json.load(open(os.path.join(a.kit_dir, "themes/default.json")))
    w = build(a.kit_dir, a.out_dir, theme, set(a.only.split(",")) if a.only else None)
    if a.preview:
        preview(w, a.preview)
    print(json.dumps(sorted(w)))
