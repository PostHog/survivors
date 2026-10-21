#!/usr/bin/env python3
"""Pixel-art workbench for Claude: read, edit, render and lint sprites as text grids.

    uv run -q --with pillow python pixel.py <command> ...

  browse <png> [--cell 16] [--out sheet.png]     contact sheet of a tileset with cell indices, to pick a base
  grab <png> <out.sprite> --cell 16 --index N[,N2..] | --box x,y,w,h[;x,y,w,h..]
                                                  cut one or more frames out of a sheet into a .sprite text file
  render <in.sprite> <out.png> [--preview p.png]  sprite sheet (frames side by side) + zoomed review image
  lint <in.sprite> [--bg #000000]                 quality checks: size, palette, stray pixels, outline, contrast
  palette <in.sprite>                             print the legend with usage counts
  logo <logo.png|.svg> <out_dir> [--theme t.json] the prospect's real logo -> 4 pixel options for the splash screen
                                                  (logo-a..d.sprite, 128x48) + logo-options.png to choose from

.sprite format (plain text, edit it directly). A legend colour may be a brand token instead of hex:
@1 primary, @2 secondary, @3 accent, @4 dark primary, @5 light primary; add d or l for a shadow or
highlight step (@2d). Kit default art uses tokens so every prospect's game gets its own colours.


    size 16x16
    base tiny-dungeon/Tiles/tile_0110.png         # provenance, optional
    legend
      k #1a1423 outline
      a #3e2c5c navy dark
      ...
    frame
    ....kkkk........
    ...
    frame
    ...

'.' is transparent. Each legend entry is one character, a hex colour and an optional note.
"""
import argparse
import json
import os
import re
import string
import sys
import warnings
from collections import Counter

warnings.filterwarnings("ignore", category=DeprecationWarning)

from PIL import Image, ImageDraw, ImageFont

ASSETS = os.path.expanduser("~/games/assets")
CHARS = string.ascii_letters + string.digits + "#@$%&*+=?!~^"


def hexc(rgb):
    return "#%02x%02x%02x" % tuple(rgb[:3])


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def lum(c):
    r, g, b = c
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# ---------- .sprite io ----------

def load(path):
    legend, frames, meta, cur, mode = {}, [], {}, None, None
    for raw in open(path):
        line = raw.rstrip("\n")
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s == "legend":
            mode = "legend"
            continue
        if s == "frame":
            mode, cur = "frame", []
            frames.append(cur)
            continue
        if mode == "legend" and re.match(r"^\S\s+(#[0-9a-fA-F]{6}|@[1-5][dl]?)(\s|$)", s):
            ch, col, *note = s.split(None, 2)
            legend[ch] = (col.lower(), note[0] if note else "")
            continue
        if mode == "frame":
            cur.append(s)
            continue
        k, _, v = s.partition(" ")
        meta[k] = v
    w, h = map(int, meta.get("size", "0x0").split("x"))
    for i, f in enumerate(frames):
        if len(f) != h or any(len(r) != w for r in f):
            bad = [(y, len(r)) for y, r in enumerate(f) if len(r) != w]
            raise SystemExit(f"{path}: frame {i} is {len(f)} rows (want {h}); rows with wrong width: {bad[:5]}")
        for y, r in enumerate(f):
            for ch in r:
                if ch != "." and ch not in legend:
                    raise SystemExit(f"{path}: frame {i} row {y} uses {ch!r}, which is not in the legend")
    return {"w": w, "h": h, "legend": legend, "frames": frames, "meta": meta}


def save(path, spr):
    out = [f"size {spr['w']}x{spr['h']}"]
    for k, v in spr["meta"].items():
        if k != "size":
            out.append(f"{k} {v}")
    out.append("legend")
    for ch, (col, note) in spr["legend"].items():
        out.append(f"  {ch} {col} {note}".rstrip())
    for f in spr["frames"]:
        out.append("frame")
        out.extend(f)
    open(path, "w").write("\n".join(out) + "\n")


DEFAULT_BRAND = {"primary": "#f83800", "secondary": "#0000bc", "accent": "#f8b800"}


def brand_palette(theme=None):
    """Brand colours for '@' legend tokens: @1 primary, @2 secondary, @3 accent (exact theme hex, not snapped),
    @4 dark and @5 light versions of primary. Suffix d/l gives a shadow/highlight step of any of them."""
    p = {**DEFAULT_BRAND, **((theme or {}).get("palette") or {})}
    pal = {"1": p["primary"], "2": p["secondary"], "3": p["accent"]}
    pal["4"] = ramp(pal["1"], "d", 2)
    pal["5"] = ramp(pal["1"], "l", 2)
    return pal


def ramp(h, step, n=1):
    """Hue-shifted shade: shadows cooler/more saturated and darker, highlights warmer and lighter."""
    import colorsys
    r, g, b = (v / 255 for v in rgb(h))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    for _ in range(n):
        if step == "d":
            ll, ss = ll * 0.68, min(1, ss * 1.1 + 0.05)
            hh = hh + (0.66 - hh) * 0.08  # drift toward blue
        else:
            ll = ll + (0.95 - ll) * 0.42
            hh = hh + (0.14 - hh) * 0.08  # drift toward yellow
    return hexc([round(v * 255) for v in colorsys.hls_to_rgb(hh % 1, max(0, min(1, ll)), max(0, min(1, ss)))])


def colour(tok, pal=None):
    if not tok.startswith("@"):
        return tok
    pal = pal or brand_palette()
    base = pal[tok[1]]
    return ramp(base, tok[2]) if len(tok) > 2 else base


def to_images(spr, pal=None):
    ims = []
    for f in spr["frames"]:
        im = Image.new("RGBA", (spr["w"], spr["h"]), (0, 0, 0, 0))
        for y, row in enumerate(f):
            for x, ch in enumerate(row):
                if ch != ".":
                    im.putpixel((x, y), rgb(colour(spr["legend"][ch][0], pal)) + (255,))
        ims.append(im)
    return ims


def from_images(ims, meta):
    """Images -> sprite; legend letters assigned darkest-first so outlines come out as early letters."""
    cols = Counter()
    for im in ims:
        for p in im.getdata():
            if p[3] >= 128:
                cols[p[:3]] += 1
    order = sorted(cols, key=lum)
    if len(order) > len(CHARS):
        raise SystemExit(f"{len(order)} colours; reduce the palette first")
    legend = {CHARS[i]: (hexc(c), "") for i, c in enumerate(order)}
    back = {v[0]: k for k, v in legend.items()}
    frames = []
    for im in ims:
        rows = []
        for y in range(im.height):
            rows.append("".join(back[hexc(im.getpixel((x, y)))] if im.getpixel((x, y))[3] >= 128 else "."
                                for x in range(im.width)))
        frames.append(rows)
    w, h = ims[0].size
    return {"w": w, "h": h, "legend": legend, "frames": frames, "meta": meta}


# ---------- the splash-screen logo ----------
LOGO_W, LOGO_H = 128, 48


def rel_lum(h):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = rgb(h)
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a, b):
    la, lb = sorted((rel_lum(a), rel_lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def splash_bg(theme):
    """The splash background for a theme: the game's own UI background (deriveUi in shared/src/palette.ts)."""
    if not theme:
        return "#000000"
    sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
    import sprites  # noqa: E402 (shared/sprites.py: the master-palette snap)
    p = theme["palette"]
    pairs = [(p["primary"], sprites.snap(p["primary"])), (p["secondary"], sprites.snap(p["secondary"]))]
    orig, darker = sorted(pairs, key=lambda t: rel_lum(t[1]))[0]
    return darker if rel_lum(darker) <= 0.08 and sprites.dist(orig, darker) < 120 else "#000000"


def load_logo(path):
    """Any logo file -> RGBA, trimmed. SVGs are rasterised with Chromium (needs --with playwright). A logo on a flat
    opaque background (a JPG, a PNG without alpha) gets that background keyed out."""
    if path.lower().endswith(".svg"):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise SystemExit("an SVG logo needs Chromium: run with  uv run --with pillow --with playwright python pixel.py logo ...")
        import tempfile
        svg = open(path).read()
        out = tempfile.mktemp(suffix=".png")
        with sync_playwright() as pw:
            b = pw.chromium.launch(channel="chromium")
            pg = b.new_page(viewport={"width": 1200, "height": 1200})
            pg.set_content("<html><body style='margin:0;background:transparent'><div id=l style='width:1000px;display:inline-block'>"
                           + svg.replace("<svg ", "<svg width=\"100%\" ", 1) + "</div></body></html>")
            pg.locator("#l").screenshot(path=out, omit_background=True)
            b.close()
        path = out
    im = Image.open(path).convert("RGBA")
    px = im.load()
    corners = [px[0, 0], px[im.width - 1, 0], px[0, im.height - 1], px[im.width - 1, im.height - 1]]
    if all(c[3] > 250 for c in corners):  # opaque background: key out the corner colour
        bgc = max(set(corners), key=corners.count)[:3]
        data = [(r, g, b, 0) if abs(r - bgc[0]) + abs(g - bgc[1]) + abs(b - bgc[2]) < 40 else (r, g, b, a) for r, g, b, a in im.getdata()]
        im.putdata(data)
    box = im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    return im.crop(box) if box else im


def fit(im, w, h):
    k = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.BOX)


def flatten(im, colours):
    """Hard pixels: alpha in or out, at most `colours` colours."""
    # Quantize the true colours (not blended onto black: soft edges would turn into a dark fringe), opaque pixels only.
    a = im.getchannel("A")
    rgbim = im.convert("RGB")
    solid = [p for p, al in zip(rgbim.getdata(), a.getdata()) if al >= 128] or [(0, 0, 0)]
    probe = Image.new("RGB", (len(solid), 1)); probe.putdata(solid)
    pal_im = probe.quantize(colors=colours, method=Image.Quantize.MEDIANCUT)
    q = rgbim.quantize(palette=pal_im, dither=Image.Dither.NONE).convert("RGB")
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    for y in range(im.height):
        for x in range(im.width):
            if a.getpixel((x, y)) >= 128:
                out.putpixel((x, y), q.getpixel((x, y)) + (255,))
    return out


def recolour(im, fn):
    out = im.copy()
    for y in range(im.height):
        for x in range(im.width):
            p = im.getpixel((x, y))
            if p[3]:
                out.putpixel((x, y), rgb(fn(hexc(p[:3]))) + (255,))
    return out


def centred(im):
    c = Image.new("RGBA", (LOGO_W, LOGO_H), (0, 0, 0, 0))
    c.paste(im, ((LOGO_W - im.width) // 2, (LOGO_H - im.height) // 2))
    return c


def cmd_logo(a):
    theme = json.load(open(a.theme)) if a.theme else None
    bg = a.bg or splash_bg(theme)
    src = load_logo(a.logo)
    light = "#eeefe9"
    accent = (theme or {}).get("palette", {}).get("accent", light)
    mono = accent if contrast(accent, bg) >= 3 else light
    detailed = flatten(fit(src, LOGO_W - 4, LOGO_H - 4), 8)
    half = flatten(fit(src, (LOGO_W - 4) // 2, (LOGO_H - 4) // 2), 5)
    chunky = half.resize((half.width * 2, half.height * 2), Image.NEAREST)
    options = [
        ("a", "detailed", "own colours, full detail", detailed),
        ("b", "chunky", "half resolution, doubled", chunky),
        ("c", "light", "dark colours made light", recolour(detailed, lambda h: h if contrast(h, bg) >= 2.2 else light)),
        ("d", "one colour", f"silhouette in {mono}", recolour(detailed, lambda h: mono)),
    ]
    os.makedirs(a.out_dir, exist_ok=True)
    sheet = Image.new("RGBA", (LOGO_W * 2 * 2 + 48, (LOGO_H * 2 + 40) * 2 + 16), rgb(bg) + (255,))
    for i, (key, name, why, im) in enumerate(options):
        spr = from_images([centred(im)], {"concept": f"splash logo option {key.upper()} ({name}): {why}", "base": os.path.basename(a.logo)})
        save(os.path.join(a.out_dir, f"logo-{key}.sprite"), spr)
        x, y = 16 + (i % 2) * (LOGO_W * 2 + 16), 12 + (i // 2) * (LOGO_H * 2 + 40)
        sheet.alpha_composite(centred(im).resize((LOGO_W * 2, LOGO_H * 2), Image.NEAREST), (x, y))
        ImageDraw.Draw(sheet).text((x, y + LOGO_H * 2 + 6), f"{key.upper()}  {name}: {why}", fill=(200, 200, 200, 255))
    sheet_path = os.path.join(a.out_dir, "logo-options.png")
    sheet.convert("RGB").save(sheet_path)
    print(f"wrote logo-a..d.sprite and {sheet_path} (shown on the splash background {bg}, 2x).")
    print("Show the sheet to the person and let them choose; copy their choice to <art dir>/logo.sprite before building.")


# ---------- commands ----------

def cmd_browse(a):
    im = Image.open(a.png).convert("RGBA")
    c, s = a.cell, a.scale
    cols, rows = im.width // c, im.height // c
    pad = 12
    out = Image.new("RGBA", (cols * (c * s + 2) + 2, rows * (c * s + pad + 2) + 2), (40, 40, 56, 255))
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    for r in range(rows):
        for q in range(cols):
            tile = im.crop((q * c, r * c, q * c + c, r * c + c))
            if tile.getbbox() is None:
                continue
            x, y = 2 + q * (c * s + 2), 2 + r * (c * s + pad + 2)
            d.rectangle([x, y + pad, x + c * s - 1, y + pad + c * s - 1], fill=(60, 60, 80, 255))
            out.alpha_composite(tile.resize((c * s, c * s), Image.NEAREST), (x, y + pad))
            d.text((x + 1, y), str(r * cols + q), fill=(255, 220, 90, 255), font=font)
    path = a.out or os.path.splitext(os.path.basename(a.png))[0] + "-browse.png"
    out.save(path)
    print(f"{path}: {cols}x{rows} cells of {c}px; index = row*{cols}+col")


def cmd_grab(a):
    im = Image.open(a.png).convert("RGBA")
    boxes = []
    if a.index:
        cols = im.width // a.cell
        for n in map(int, a.index.split(",")):
            x, y = (n % cols) * a.cell, (n // cols) * a.cell
            boxes.append((x, y, a.cell, a.cell))
    else:
        boxes = [tuple(map(int, b.split(","))) for b in a.box.split(";")]
    ims = [im.crop((x, y, x + w, y + h)) for x, y, w, h in boxes]
    if a.pad:
        W, H = map(int, a.pad.split("x"))
        padded = []
        for t in ims:
            p = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            p.alpha_composite(t, ((W - t.width) // 2, H - t.height - (H - t.height) // 2))
            padded.append(p)
        ims = padded
    base = os.path.relpath(os.path.abspath(a.png), ASSETS) if os.path.abspath(a.png).startswith(ASSETS) else a.png
    spr = from_images(ims, {"base": f"{base} {a.index or a.box}"})
    save(a.out, spr)
    print(f"{a.out}: {spr['w']}x{spr['h']}, {len(ims)} frame(s), {len(spr['legend'])} colours")


def review_image(spr, scale=12, pal=None):
    """Zoomed frames with a pixel grid on checkerboard, the same frames at 1x/2x/3x on dark and light
    backgrounds (how they read in game), and the silhouette."""
    ims = to_images(spr, pal)
    w, h = spr["w"], spr["h"]
    gap = 10
    zoom_w = len(ims) * (w * scale + gap)
    small = [1, 2, 3]
    W = max(zoom_w, gap + 2 * len(ims) * w * 6 + 60) + gap
    Hh = gap + h * scale + gap * 2 + 3 * (h * 3 + gap) + h * 3 + gap * 2
    out = Image.new("RGBA", (W, Hh), (48, 48, 64, 255))
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default()
    y0 = gap
    for i, im in enumerate(ims):
        x0 = gap + i * (w * scale + gap)
        for yy in range(h):
            for xx in range(w):
                c = (70, 70, 90) if (xx + yy) % 2 else (90, 90, 112)
                d.rectangle([x0 + xx * scale, y0 + yy * scale, x0 + xx * scale + scale - 1, y0 + yy * scale + scale - 1], fill=c)
        out.alpha_composite(im.resize((w * scale, h * scale), Image.NEAREST), (x0, y0))
        for k in range(w + 1):
            d.line([(x0 + k * scale, y0), (x0 + k * scale, y0 + h * scale)], fill=(0, 0, 0, 60))
        for k in range(h + 1):
            d.line([(x0, y0 + k * scale), (x0 + w * scale, y0 + k * scale)], fill=(0, 0, 0, 60))
        d.text((x0, y0 + h * scale + 1), f"frame {i}", fill=(220, 220, 220), font=font)
    y = y0 + h * scale + gap * 2
    for bg in ((0, 0, 0), (0, 64, 88), (200, 200, 210)):
        x = gap
        d.rectangle([x - 4, y - 4, W - gap, y + h * 3 + 4], fill=bg)
        for s in small:
            for im in ims:
                out.alpha_composite(im.resize((w * s, h * s), Image.NEAREST), (x, y + (h * 3 - h * s)))
                x += w * s + 6
            x += 10
        y += h * 3 + gap
    x = gap
    for im in ims:
        sil = Image.new("RGBA", im.size, (0, 0, 0, 0))
        sil.paste((240, 240, 240, 255), mask=im.split()[3])
        out.alpha_composite(sil.resize((w * 3, h * 3), Image.NEAREST), (x, y))
        x += w * 3 + 6
    d.text((x + 6, y), "silhouette", fill=(200, 200, 200), font=font)
    return out


def theme_pal(a):
    import json
    return brand_palette(json.load(open(a.theme))) if getattr(a, "theme", None) else None


def cmd_render(a):
    spr = load(a.sprite)
    pal = theme_pal(a)
    ims = to_images(spr, pal)
    sheet = Image.new("RGBA", (spr["w"] * len(ims), spr["h"]), (0, 0, 0, 0))
    for i, im in enumerate(ims):
        sheet.paste(im, (i * spr["w"], 0))
    sheet.save(a.out)
    prev = a.preview or os.path.splitext(a.out)[0] + "-review.png"
    review_image(spr, a.scale or max(4, 192 // max(spr["w"], spr["h"])), pal).save(prev)
    print(f"{a.out} ({len(ims)} frames)  review: {prev}")


def cmd_palette(a):
    spr = load(a.sprite)
    use = Counter(ch for f in spr["frames"] for r in f for ch in r if ch != ".")
    for ch, (col, note) in spr["legend"].items():
        print(f"  {ch} {col} {use.get(ch, 0):4d}px  {note}")


def cmd_lint(a):
    spr = load(a.sprite)
    pal = theme_pal(a)
    w, h = spr["w"], spr["h"]
    legend = {ch: (colour(c, pal), n) for ch, (c, n) in spr["legend"].items()}
    probs, notes = [], []
    used = {ch for f in spr["frames"] for r in f for ch in r if ch != "."}
    unused = set(legend) - used
    if unused:
        notes.append(f"legend entries never used: {''.join(sorted(unused))}")
    ncol = len(used)
    limit = 10 if max(w, h) <= 16 else 14 if max(w, h) <= 32 else 20
    if ncol > limit:
        probs.append(f"{ncol} colours; keep a {w}x{h} sprite to about {limit} (merge near-duplicates)")
    bg = rgb(a.bg)
    for fi, f in enumerate(spr["frames"]):
        g = [[c for c in r] for r in f]
        filled = sum(c != "." for r in g for c in r)
        cov = filled / (w * h)
        if cov < 0.12:
            probs.append(f"frame {fi}: only {cov:.0%} of the canvas is filled; the sprite will read as tiny")
        # stray pixels: filled with no filled 4-neighbour
        strays = [(x, y) for y in range(h) for x in range(w) if g[y][x] != "." and
                  all(not (0 <= x + dx < w and 0 <= y + dy < h) or g[y + dy][x + dx] == "."
                      for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        if strays:
            probs.append(f"frame {fi}: isolated pixels at {strays[:6]} (remove, or connect them)")
        # outline: edge pixels (touching transparency) should be dark
        edge = [(x, y) for y in range(h) for x in range(w) if g[y][x] != "." and
                any(not (0 <= x + dx < w and 0 <= y + dy < h) or g[y + dy][x + dx] == "."
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        if edge and not a.tile:
            light_edge = [p for p in edge if lum(rgb(legend[g[p[1]][p[0]]][0])) > 110]
            share = len(light_edge) / len(edge)
            if share > 0.35:
                probs.append(f"frame {fi}: {share:.0%} of the outline is light; add a dark outline (or selective outline) so it reads on any floor")
        # contrast with the arena background: the fill (non-edge pixels) must stand off the floor;
        # dark outlines are expected and fine
        inner = [(x, y) for y in range(h) for x in range(w) if g[y][x] != "." and (x, y) not in set(edge)]
        if inner and not a.tile:
            gap_ = sum(abs(lum(rgb(legend[g[y][x]][0])) - lum(bg)) for x, y in inner) / len(inner)
            if gap_ < 45:
                probs.append(f"frame {fi}: fill colours are close to the background {a.bg} (avg luminance gap {gap_:.0f}); it will vanish")
    if len(spr["frames"]) > 1:
        a0, b0 = spr["frames"][0], spr["frames"][1]
        diff = sum(1 for y in range(h) for x in range(w) if a0[y][x] != b0[y][x])
        if diff == 0:
            probs.append("frames 0 and 1 are identical: no animation")
        elif diff > w * h * 0.5:
            notes.append(f"frames differ in {diff} pixels; big jumps can look jittery")
    for n in notes:
        print("note:", n)
    for p in probs:
        print("PROBLEM:", p)
    print("OK" if not probs else f"{len(probs)} problems")
    sys.exit(1 if probs else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("browse")
    b.add_argument("png")
    b.add_argument("--cell", type=int, default=16)
    b.add_argument("--scale", type=int, default=3)
    b.add_argument("--out")
    g = sub.add_parser("grab")
    g.add_argument("png")
    g.add_argument("out")
    g.add_argument("--cell", type=int, default=16)
    g.add_argument("--index")
    g.add_argument("--box")
    g.add_argument("--pad", help="WxH canvas to centre each frame in (bottom-aligned)")
    r = sub.add_parser("render")
    r.add_argument("sprite")
    r.add_argument("out")
    r.add_argument("--theme", help="theme.json whose palette fills the @1..@5 brand tokens")
    r.add_argument("--preview")
    r.add_argument("--scale", type=int, default=0, help="zoom for the review image (default: fit ~192px)")
    li = sub.add_parser("lint")
    li.add_argument("sprite")
    li.add_argument("--bg", default="#000000")
    li.add_argument("--theme")
    li.add_argument("--tile", action="store_true", help="floor/terrain tile: skip outline and floor-contrast checks")
    p = sub.add_parser("palette")
    p.add_argument("sprite")
    lo = sub.add_parser("logo")
    lo.add_argument("logo", help="the prospect's logo: png/jpg/webp, or svg (needs --with playwright)")
    lo.add_argument("out_dir")
    lo.add_argument("--theme", help="theme.json: the splash background and the one-colour option come from its palette")
    lo.add_argument("--bg", help="splash background colour to judge against (default: from --theme, else black)")
    a = ap.parse_args()
    {"browse": cmd_browse, "grab": cmd_grab, "render": cmd_render, "lint": cmd_lint, "palette": cmd_palette, "logo": cmd_logo}[a.cmd](a)


if __name__ == "__main__":
    main()
