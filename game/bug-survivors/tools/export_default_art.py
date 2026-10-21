#!/usr/bin/env python3
"""Export every slot's default art as editable .sprite text, plus the master palette, to bug-survivors/default-art.json.

    uv run -q --with pillow python bug-survivors/tools/export_default_art.py      (npm run art does this)

The Worker recolours these per prospect at request time (src/lib/sprite.ts), exactly as shared/sprites.py does when it builds
a game, so a prospect's brand colours reach all the art and not only the sprites someone redrew.

Two kinds of default art exist, and they recolour a little differently, so each slot records which:
  palette "brand"   a .sprite file (the kit's, or shared/sprites/): tokens @1..@5 (+d/l) resolve with pixel.brand_palette
  palette "master"  a letter grid from art.py: digits 1..5 resolve with sprites.brand (snapped to the 36-colour master palette);
                    converted here to .sprite text (digits become @1..@5 legend entries, letters their fixed hex)
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.dirname(HERE)
SHARED = os.path.join(os.path.dirname(KIT), "shared")
sys.path.insert(0, SHARED)
import sprites  # noqa: E402  (shared/sprites.py)

spec = importlib.util.spec_from_file_location("art", os.path.join(KIT, "art.py"))
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)

slots = json.load(open(os.path.join(KIT, "slots.json")))
out = {}
for s in slots:
    sid = s["id"]
    kit_file = os.path.join(KIT, "sprites", f"{sid}.sprite")
    shared_file = os.path.join(SHARED, "sprites", f"{sid}.sprite")
    if os.path.exists(kit_file) or os.path.exists(shared_file):  # a .sprite file wins over art.py (as in sprites.build)
        out[sid] = {"palette": "brand", "grid": open(kit_file if os.path.exists(kit_file) else shared_file).read()}
    elif sid in art.SPRITES:
        frames = art.SPRITES[sid]
        used = sorted({c for f in frames for r in f for c in r if c not in (".", " ")})
        lines = [f"size {s['w']}x{s['h']}", f"concept default {sid} (from art.py)", "legend"]
        for c in used:
            col = f"@{c}" if c.isdigit() else sprites.LEGEND[c]
            lines.append(f"  {c} {col}")
        for f in frames:
            lines.append("frame")
            lines.extend(r.replace(" ", ".") for r in f)
        out[sid] = {"palette": "master", "grid": "\n".join(lines) + "\n"}
    elif s.get("optional"):
        continue  # the prospect's logo has no default: the splash shows the PostHog logo
    else:
        sys.exit(f"slot {sid!r} has no default art")
    out[sid].update({k: s[k] for k in ("w", "h", "frames")})

dest = os.path.join(KIT, "default-art.json")
json.dump({"generated_by": "bug-survivors/tools/export_default_art.py: do not edit", "master": sprites.MASTER, "slots": out},
          open(dest, "w"), indent=1)
open(dest, "a").write("\n")
print(f"exported {len(out)} slots ({sum(1 for v in out.values() if v['palette'] == 'master')} from art.py) -> {os.path.relpath(dest)}")
